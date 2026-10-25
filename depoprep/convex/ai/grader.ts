"use node";

// Shared grading core: prompt, providers, validation and retrieval. Used by the live grader
// (`feedbackEvaluator.ts`) and the eval runner (`evals.ts`), so both measure the same code.

import Anthropic from "@anthropic-ai/sdk";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { CoachingDimension } from "../coachingContent";
import { isFollowUp } from "../simulationScript";
import type { TraceParent, Usage } from "./tracing";

export const RUBRIC_KEYS = ["volunteering", "speculation", "consistency", "brevity", "composure"] as const;

type RubricEntry = { score: number; explanation: string };
export type Feedback = {
  readinessScore: number;
  rubric: Record<(typeof RUBRIC_KEYS)[number], RubricEntry>;
  tips: string[];
  riskHighlights: string[];
};

export type CoachingReference = {
  dimension: CoachingDimension;
  question: string;
  badAnswer: string;
  betterAnswer: string;
  why: string;
};

export const EVENT_LABELS = {
  deposition: "deposition",
  trial_testimony: "trial cross-examination",
  settlement_conference: "settlement conference",
} as const;

export type TranscriptEntry = {
  role: string;
  content: string;
  flags?: string[];
  voice?: { fillerCount: number; fillerWords: string[]; responseDelayMs: number; pauseCount: number };
};

/** Lowercase, collapse whitespace and trim quotes/punctuation, for "does this quote appear in the answer" checks. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/^[\s"'.,?!]+|[\s"'.,?!]+$/g, "");
}

function formatEntry(t: TranscriptEntry): string {
  if (t.role === "ai") return `[${isFollowUp(t) ? "AI FOLLOW-UP" : "AI"}]: ${t.content}`;
  if (!t.voice) return `[CLIENT]: ${t.content}`;
  const v = t.voice;
  const fillers = v.fillerCount > 0 ? `${v.fillerCount} filler words (${v.fillerWords.join(", ")})` : "no filler words";
  return `[CLIENT] (spoken: ${(v.responseDelayMs / 1000).toFixed(1)} s before first word, ${fillers}, ${v.pauseCount} mid-answer pauses): ${t.content}`;
}

export function buildEvaluatorPrompt(
  transcript: TranscriptEntry[],
  references: CoachingReference[] = [],
  eventType: keyof typeof EVENT_LABELS = "deposition",
): string {
  const formatted = transcript.map(formatEntry).join("\n");
  const hasFollowUps = transcript.some(isFollowUp);
  const hasVoice = transcript.some((t) => t.voice);
  const contextNotes = [
    hasFollowUps &&
      "[AI FOLLOW-UP] lines are counsel pursuing something the witness volunteered or guessed; needing a follow-up is evidence of volunteering or speculation.",
    hasVoice &&
      "Spoken answers include delivery metrics measured in the browser. Use them for composure: many filler words or mid-answer pauses suggest nervousness. A short pause before answering (up to about 3 s) is good practice, not a weakness.",
  ]
    .filter(Boolean)
    .join("\n");

  const referenceBlock =
    references.length === 0
      ? ""
      : `
REFERENCE EXAMPLES (from a coaching library, retrieved because they resemble answers in this transcript).
Use them only to calibrate your scoring. They are NOT the witness's words: never quote them in riskHighlights.
${references
  .map((r) => `- [${r.dimension}] Q: "${r.question}" Weak: "${r.badAnswer}" Better: "${r.betterAnswer}" Why: ${r.why}`)
  .join("\n")}
`;

  return `You are a legal witness preparation coach. Analyze this ${EVENT_LABELS[eventType]} practice transcript and return a JSON object.

TRANSCRIPT:
${formatted}
${contextNotes ? `\n${contextNotes}\n` : ""}${referenceBlock}
Return ONLY valid JSON (no markdown fences, no explanation text before or after):
{
  "readinessScore": <0-100 overall score>,
  "rubric": {
    "volunteering": { "score": <0-100>, "explanation": "<1-2 sentences>" },
    "speculation":  { "score": <0-100>, "explanation": "<1-2 sentences>" },
    "consistency":  { "score": <0-100>, "explanation": "<1-2 sentences>" },
    "brevity":      { "score": <0-100>, "explanation": "<1-2 sentences>" },
    "composure":    { "score": <0-100>, "explanation": "<1-2 sentences>" }
  },
  "tips": ["<concrete tip 1>", "<concrete tip 2>", "<concrete tip 3>"],
  "riskHighlights": ["<risky answer excerpt 1>", "<risky answer excerpt 2>"]
}

riskHighlights must be verbatim excerpts copied from the CLIENT's answers, and only answers that create real risk (volunteering, guessing, contradicting, arguing). If no answer is risky, return an empty array.
Write every explanation and tip directly to the witness as "you". Never refer to the witness as "the client" and never assume their gender.

Scoring guide:
- 80-100: Excellent — minimal issues
- 60-79: Good — some patterns to watch
- 40-59: Needs work — clear recurring problems
- 0-39: Significant preparation needed`;
}

// Gemini enforces this schema server-side, so the response is always parseable JSON.
const RUBRIC_ENTRY_SCHEMA = {
  type: "OBJECT",
  properties: { score: { type: "INTEGER" }, explanation: { type: "STRING" } },
  required: ["score", "explanation"],
};
const FEEDBACK_SCHEMA = {
  type: "OBJECT",
  properties: {
    readinessScore: { type: "INTEGER" },
    rubric: {
      type: "OBJECT",
      properties: Object.fromEntries(RUBRIC_KEYS.map((k) => [k, RUBRIC_ENTRY_SCHEMA])),
      required: [...RUBRIC_KEYS],
    },
    tips: { type: "ARRAY", items: { type: "STRING" } },
    riskHighlights: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["readinessScore", "rubric", "tips", "riskHighlights"],
};

// Flash-Lite grades in ~3s on the free tier; full Flash took 50-120s in testing, too slow for a live demo.
// Free-tier models also return 503/429 under load, so retry once before handing off to the next provider.
const RETRYABLE_STATUSES = [429, 500, 503];
// A provider slower than this is treated as failed, so the next one in the chain takes over.
// Live grading hands off quickly; the eval (a pinned provider) can afford to wait.
const LIVE_TIMEOUT_MS = 10_000;
const EVAL_TIMEOUT_MS = 30_000;
// Pinned, not "gemini-flash-lite-latest": the alias moved to an overloaded model mid-testing
// (503s, 20–30 s replies) while 3.1 Flash-Lite answered in 1–3 s with equal or better eval scores.
const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

class ProviderHttpError extends Error {
  constructor(message: string, public status: number, public retryAfterMs?: number) {
    super(message);
  }
}

// Groq says "Please try again in 10.395s"; honour it when the caller can afford to wait (the eval).
function retryAfterFrom(res: Response, detail: string): number | undefined {
  const header = Number(res.headers.get("retry-after"));
  if (header > 0) return header * 1000;
  const match = detail.match(/try again in ([\d.]+)s/i);
  return match ? Math.ceil(Number(match[1]) * 1000) : undefined;
}

async function httpError(res: Response, label: string): Promise<ProviderHttpError> {
  const body = await res.text();
  let detail = body.slice(0, 300);
  try {
    detail = JSON.parse(body).error?.message ?? detail;
  } catch {}
  return new ProviderHttpError(`${label} returned ${res.status}: ${detail}`, res.status, retryAfterFrom(res, detail));
}

type ModelReply = { text: string; model: string; usage?: Usage };
type CallOptions = { timeoutMs: number; schema: object; maxTokens: number };

const geminiModel = () => process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
const groqModel = () => process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

async function callGemini(apiKey: string, prompt: string, opts: CallOptions): Promise<ModelReply> {
  const model = geminiModel();
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return { ...(await callGeminiModel(apiKey, model, prompt, opts)), model };
    } catch (err) {
      lastError = err;
      if (!(err instanceof ProviderHttpError) || !RETRYABLE_STATUSES.includes(err.status)) throw err;
      console.warn(`${err.message} (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function callGeminiModel(
  apiKey: string,
  model: string,
  prompt: string,
  opts: CallOptions,
): Promise<{ text: string; usage?: Usage }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(opts.timeoutMs),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          // Without a cap, a degraded model can loop (repeating a string) for minutes before stopping.
          maxOutputTokens: opts.maxTokens,
          responseMimeType: "application/json",
          responseSchema: opts.schema,
        },
      }),
    },
  );
  if (!res.ok) throw await httpError(res, `Gemini (${model})`);
  const data = await res.json();
  const parts: Array<{ text?: string }> = data.candidates?.[0]?.content?.parts ?? [];
  const usage = data.usageMetadata;
  return {
    text: parts.map((p) => p.text ?? "").join(""),
    usage: usage && {
      input: usage.promptTokenCount ?? 0,
      output: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    },
  };
}

// Groq speaks the OpenAI chat-completions format. JSON mode guarantees valid JSON; parseFeedback checks the shape.
async function callGroq(apiKey: string, prompt: string, opts: CallOptions): Promise<ModelReply> {
  const model = groqModel();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(opts.timeoutMs),
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: opts.maxTokens,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw await httpError(res, `Groq (${model})`);
  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    model,
    usage: data.usage && { input: data.usage.prompt_tokens, output: data.usage.completion_tokens },
  };
}

const CLAUDE_MODEL = "claude-sonnet-4-6";

async function callClaude(apiKey: string, prompt: string, opts: CallOptions): Promise<ModelReply> {
  const anthropic = new Anthropic({ apiKey, timeout: opts.timeoutMs });
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens,
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return {
    text,
    model: CLAUDE_MODEL,
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
  };
}

export function parseJson(raw: string): unknown {
  // Strip any accidental markdown fences the model might add
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error("The model returned invalid JSON.");
  }
}

// Rejects incomplete responses instead of filling gaps, so a broken reply never shows up as a real-looking grade.
export function parseFeedback(raw: string): Feedback {
  const data = parseJson(raw);

  const isScore = (n: unknown): n is number => typeof n === "number" && n >= 0 && n <= 100;
  const isStringArray = (a: unknown): a is string[] =>
    Array.isArray(a) && a.every((s) => typeof s === "string");

  const f = data as Partial<Feedback>;
  if (!isScore(f.readinessScore)) throw new Error("The grader's response is missing readinessScore.");
  for (const key of RUBRIC_KEYS) {
    const entry = f.rubric?.[key];
    if (!entry || !isScore(entry.score) || typeof entry.explanation !== "string") {
      throw new Error(`The grader's response is missing the "${key}" rubric score.`);
    }
  }
  if (!isStringArray(f.tips) || !isStringArray(f.riskHighlights)) {
    throw new Error("The grader's response is missing tips or riskHighlights.");
  }
  // Copy only the validated fields; Convex validators reject any extra keys the model adds.
  return {
    readinessScore: f.readinessScore,
    rubric: Object.fromEntries(
      RUBRIC_KEYS.map((k) => [k, { score: f.rubric![k].score, explanation: f.rubric![k].explanation }]),
    ) as Feedback["rubric"],
    tips: f.tips,
    riskHighlights: f.riskHighlights,
  };
}

export type ProviderName = "gemini" | "groq" | "claude";

const PROVIDERS: Array<{
  name: ProviderName;
  label: string;
  key: () => string | undefined;
  /** The model this provider will call; recorded in traces even when the call fails. */
  model: () => string;
  call: (key: string, prompt: string, opts: CallOptions) => Promise<ModelReply>;
}> = [
  { name: "gemini", label: "Gemini", key: () => process.env.GEMINI_API_KEY, model: geminiModel, call: callGemini },
  { name: "groq", label: "Groq", key: () => process.env.GROQ_API_KEY, model: groqModel, call: callGroq },
  { name: "claude", label: "Claude", key: () => process.env.ANTHROPIC_API_KEY, model: () => CLAUDE_MODEL, call: callClaude },
];

export type ChainResult<T> = {
  value: T;
  model: string;
  rawText: string;
  ms: number;
  fallbacks: string[]; // one entry per provider that failed before the one that answered
};

/**
 * Fallback chain for any JSON task: each provider runs only if its key is set in Convex. A reply that
 * fails `parse` counts as a failure too, so the next provider gets a chance. `only` pins a single
 * provider (the eval measures each provider on its own and can afford to wait out rate limits).
 * With `trace`, the chain is one span and each provider attempt a generation inside it.
 */
export async function chainJson<T>(opts: {
  prompt: string | ((provider: ProviderName) => string);
  schema: object;
  parse: (raw: string) => T;
  only?: ProviderName;
  /** Provider order; defaults to Gemini → Groq → Claude. */
  order?: ProviderName[];
  timeoutMs?: number;
  maxTokens?: number;
  trace?: TraceParent;
  /** Span name for the chain in the trace. */
  name?: string;
}): Promise<ChainResult<T>> {
  const { only, schema, parse } = opts;
  const promptFor = typeof opts.prompt === "string" ? () => opts.prompt as string : opts.prompt;
  const maxRateLimitWaits = only ? 3 : 0;
  const callOptions: CallOptions = {
    timeoutMs: opts.timeoutMs ?? (only ? EVAL_TIMEOUT_MS : LIVE_TIMEOUT_MS),
    schema,
    maxTokens: opts.maxTokens ?? 1024,
  };
  const order = opts.order ?? PROVIDERS.map((p) => p.name);
  const enabled = order
    .map((name) => PROVIDERS.find((p) => p.name === name)!)
    .filter((p) => (only ? p.name === only : true) && p.key());
  if (enabled.length === 0) {
    throw new Error(
      only
        ? `No API key set for ${only}.`
        : "No AI key is set in Convex. Run: npx convex env set GEMINI_API_KEY <your-key>",
    );
  }
  const started = Date.now();
  const fallbacks: string[] = [];
  const chain = opts.trace?.start(opts.name ?? "llm-chain", "chain", {
    metadata: { providers: enabled.map((p) => p.name).join(" → "), maxTokens: callOptions.maxTokens },
  });
  for (const provider of enabled) {
    const prompt = promptFor(provider.name);
    const generation = chain?.start(provider.label, "generation", {
      model: provider.model(),
      input: prompt,
      metadata: { timeoutMs: callOptions.timeoutMs },
    });
    try {
      let reply: ModelReply | undefined;
      for (let wait = 0; !reply; wait++) {
        try {
          reply = await provider.call(provider.key()!, prompt, callOptions);
        } catch (err) {
          const waitMs = err instanceof ProviderHttpError && err.status === 429 ? (err.retryAfterMs ?? 10_000) : 0;
          if (!waitMs || wait >= maxRateLimitWaits || waitMs > 30_000) throw err;
          console.warn(`${provider.label} rate-limited; waiting ${waitMs} ms`);
          generation?.set({ metadata: { rateLimitWaits: wait + 1 } });
          await new Promise((r) => setTimeout(r, waitMs + 250));
        }
      }
      generation?.set({ model: reply.model, output: reply.text, usage: reply.usage });
      const value = parse(reply.text);
      generation?.end();
      chain?.set({ output: { answeredBy: reply.model, fallbacks } }).end();
      return {
        value,
        model: reply.model,
        rawText: reply.text,
        ms: Date.now() - started,
        fallbacks,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`${provider.label} failed: ${message}`);
      fallbacks.push(`${provider.label}: ${message}`);
      generation?.end(err);
    }
  }
  const error = new Error(fallbacks.join(" | "));
  chain?.end(error);
  throw error;
}

export type GradeResult = Omit<ChainResult<Feedback>, "value"> & { feedback: Feedback };

export async function gradeWithChain(
  prompt: string | ((provider: ProviderName) => string),
  opts: { only?: ProviderName; trace?: TraceParent } = {},
): Promise<GradeResult> {
  // gpt-oss models spend part of max_tokens on reasoning, so leave headroom for the rubric JSON.
  const { value, ...rest } = await chainJson({
    prompt,
    schema: FEEDBACK_SCHEMA,
    parse: parseFeedback,
    only: opts.only,
    trace: opts.trace,
    name: "grade",
    maxTokens: 4096,
  });
  return { feedback: value, ...rest };
}

// ---------------------------------------------------------------------------
// Retrieval (RAG): Gemini embeddings + Convex vector search over coaching_examples
// ---------------------------------------------------------------------------

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_TIMEOUT_MS = 6_000;

export async function embedTexts(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY",
  trace?: TraceParent,
): Promise<number[][]> {
  const span = trace?.start("embed", "embedding", {
    model: EMBEDDING_MODEL,
    input: texts,
    metadata: { taskType, count: texts.length, dimensions: EMBEDDING_DIMENSIONS },
  });
  try {
    const vectors = await embedWithRetry(texts, taskType);
    span?.end();
    return vectors;
  } catch (err) {
    span?.end(err);
    throw err;
  }
}

async function embedWithRetry(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY",
): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Embeddings need GEMINI_API_KEY.");
  // The free embedding endpoint usually answers in < 1 s but occasionally stalls; retry once, quickly.
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
          body: JSON.stringify({
            requests: texts.map((text) => ({
              model: `models/${EMBEDDING_MODEL}`,
              content: { parts: [{ text }] },
              outputDimensionality: EMBEDDING_DIMENSIONS,
              taskType,
            })),
          }),
        },
      );
      if (!res.ok) throw await httpError(res, `Embeddings (${EMBEDDING_MODEL})`);
      const data = await res.json();
      return (data.embeddings as Array<{ values: number[] }>).map((e) => e.values);
    } catch (err) {
      lastError = err;
      console.warn(`Embeddings attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  throw lastError;
}

/**
 * GRADER_RAG controls retrieval in the live grader. Retrieved coaching examples are always shown
 * to the witness as better answers; the mode decides which graders also see them in the prompt:
 *   "auto" (default) — fallback graders only (Groq, Claude)
 *   "prompt"         — every grader
 *   "display"        — none; display only
 *   "off"            — no retrieval at all
 * Why "auto": in the eval (10 cases, one run each) references lifted Groq from 80% to 100% band
 * accuracy and 86% to 100% weak-dimension recall, but gave Gemini Flash-Lite no gain.
 * Retrieval needs GEMINI_API_KEY for embeddings.
 */
export type RagMode = "off" | "display" | "prompt" | "auto";

export function ragMode(): RagMode {
  if (!process.env.GEMINI_API_KEY) return "off";
  const mode = process.env.GRADER_RAG;
  return mode === "off" || mode === "prompt" || mode === "display" ? mode : "auto";
}

export function promptGetsReferences(mode: RagMode, provider: ProviderName): boolean {
  return mode === "prompt" || (mode === "auto" && provider !== "gemini");
}

// Cosine similarity floor for coaching retrieval (gemini-embedding-001, RETRIEVAL_QUERY vs DOCUMENT).
// Measured: real matches (same mistake) scored 0.73–0.83; short clean answers like "No." or "To work."
// scored 0.61–0.66 against generic examples — the "hubness" that put the same example in every result.
export const COACHING_MIN_SCORE = 0.72;

/**
 * Embeds each witness answer, keeps its best coaching example if it clears COACHING_MIN_SCORE, and
 * returns up to `limit` distinct examples ranked by similarity. Returns [] if nothing is close enough.
 */
export async function retrieveCoaching(
  ctx: ActionCtx,
  answers: string[],
  opts: { limit?: number; trace?: TraceParent } = {},
): Promise<CoachingReference[]> {
  if (answers.length === 0) return [];
  const span = opts.trace?.start("retrieve-coaching", "retriever", {
    input: answers,
    metadata: { minScore: COACHING_MIN_SCORE },
  });
  try {
    const vectors = await embedTexts(answers, "RETRIEVAL_QUERY", span);
    const best = new Map<Id<"coaching_examples">, number>();
    const topScores: number[] = [];
    for (const vector of vectors) {
      const [top] = await ctx.vectorSearch("coaching_examples", "by_embedding", { vector, limit: 1 });
      if (top) topScores.push(Number(top._score.toFixed(3)));
      if (top && top._score >= COACHING_MIN_SCORE) {
        best.set(top._id, Math.max(best.get(top._id) ?? 0, top._score));
      }
    }
    const ids = [...best.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, opts.limit ?? 4)
      .map(([id]) => id);
    const references = ids.length === 0 ? [] : await ctx.runQuery(internal.coaching.getByIds, { ids });
    // Every answer's best score, kept or not, so the similarity floor can be tuned from the trace.
    span?.set({ output: references.map((r) => `[${r.dimension}] ${r.badAnswer}`), metadata: { topScores: topScores.join(", ") } }).end();
    return references;
  } catch (err) {
    span?.end(err);
    throw err;
  }
}
