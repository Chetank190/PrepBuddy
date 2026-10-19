"use node";

// Shared grading core: prompt, providers, validation and retrieval. Used by the live grader
// (`feedbackEvaluator.ts`) and the eval runner (`evals.ts`), so both measure the same code.

import Anthropic from "@anthropic-ai/sdk";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { CoachingDimension } from "../coachingContent";

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

const EVENT_LABELS = {
  deposition: "deposition",
  trial_testimony: "trial cross-examination",
  settlement_conference: "settlement conference",
} as const;

export function buildEvaluatorPrompt(
  transcript: Array<{ role: string; content: string }>,
  references: CoachingReference[] = [],
  eventType: keyof typeof EVENT_LABELS = "deposition",
): string {
  const formatted = transcript
    .map((t) => `[${t.role.toUpperCase()}]: ${t.content}`)
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
${referenceBlock}
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

riskHighlights must be verbatim excerpts copied from the CLIENT's answers.
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

type ModelReply = { text: string; model: string };

async function callGemini(apiKey: string, prompt: string, timeoutMs: number): Promise<ModelReply> {
  const model = process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return { text: await callGeminiModel(apiKey, model, prompt, timeoutMs), model };
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
  timeoutMs: number,
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
          responseSchema: FEEDBACK_SCHEMA,
        },
      }),
    },
  );
  if (!res.ok) throw await httpError(res, `Gemini (${model})`);
  const data = await res.json();
  const parts: Array<{ text?: string }> = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

// Groq speaks the OpenAI chat-completions format. JSON mode guarantees valid JSON; parseFeedback checks the shape.
async function callGroq(apiKey: string, prompt: string, timeoutMs: number): Promise<ModelReply> {
  const model = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw await httpError(res, `Groq (${model})`);
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? "", model };
}

const CLAUDE_MODEL = "claude-sonnet-4-6";

async function callClaude(apiKey: string, prompt: string, timeoutMs: number): Promise<ModelReply> {
  const anthropic = new Anthropic({ apiKey, timeout: timeoutMs });
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return { text, model: CLAUDE_MODEL };
}

// Rejects incomplete responses instead of filling gaps, so a broken reply never shows up as a real-looking grade.
export function parseFeedback(raw: string): Feedback {
  // Strip any accidental markdown fences the model might add
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();

  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    throw new Error("The grader returned invalid JSON.");
  }

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
  call: (key: string, prompt: string, timeoutMs: number) => Promise<ModelReply>;
}> = [
  { name: "gemini", label: "Gemini", key: () => process.env.GEMINI_API_KEY, call: callGemini },
  { name: "groq", label: "Groq", key: () => process.env.GROQ_API_KEY, call: callGroq },
  { name: "claude", label: "Claude", key: () => process.env.ANTHROPIC_API_KEY, call: callClaude },
];

export type GradeResult = {
  feedback: Feedback;
  model: string;
  rawText: string;
  ms: number;
  fallbacks: string[]; // one entry per provider that failed before the one that graded
};

/**
 * Fallback chain: each provider runs only if its key is set in Convex. A provider whose reply fails
 * validation counts as failed too, so the next one gets a chance. `only` pins a single provider
 * (used by the eval, which measures each provider on its own).
 */
export async function gradeWithChain(
  prompt: string | ((provider: ProviderName) => string),
  only?: ProviderName,
): Promise<GradeResult> {
  const promptFor = typeof prompt === "string" ? () => prompt : prompt;
  // Live grading fails over fast; a pinned provider (the eval) waits out rate limits instead.
  const maxRateLimitWaits = only ? 3 : 0;
  const timeoutMs = only ? EVAL_TIMEOUT_MS : LIVE_TIMEOUT_MS;
  const enabled = PROVIDERS.filter((p) => (only ? p.name === only : true) && p.key());
  if (enabled.length === 0) {
    throw new Error(
      only
        ? `No API key set for ${only}.`
        : "No AI key is set in Convex. Run: npx convex env set GEMINI_API_KEY <your-key>",
    );
  }
  const started = Date.now();
  const fallbacks: string[] = [];
  for (const provider of enabled) {
    try {
      let reply: ModelReply | undefined;
      for (let wait = 0; !reply; wait++) {
        try {
          reply = await provider.call(provider.key()!, promptFor(provider.name), timeoutMs);
        } catch (err) {
          const waitMs = err instanceof ProviderHttpError && err.status === 429 ? (err.retryAfterMs ?? 10_000) : 0;
          if (!waitMs || wait >= maxRateLimitWaits || waitMs > 30_000) throw err;
          console.warn(`${provider.label} rate-limited; waiting ${waitMs} ms`);
          await new Promise((r) => setTimeout(r, waitMs + 250));
        }
      }
      return {
        feedback: parseFeedback(reply.text),
        model: reply.model,
        rawText: reply.text,
        ms: Date.now() - started,
        fallbacks,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`${provider.label} failed: ${message}`);
      fallbacks.push(`${provider.label}: ${message}`);
    }
  }
  throw new Error(fallbacks.join(" | "));
}

// ---------------------------------------------------------------------------
// Retrieval (RAG): Gemini embeddings + Convex vector search over coaching_examples
// ---------------------------------------------------------------------------

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

export async function embedTexts(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Embeddings need GEMINI_API_KEY.");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
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

/**
 * Embeds each witness answer, finds the closest coaching examples, and returns up to `limit`
 * distinct ones ranked by similarity. Returns [] if the library is empty.
 */
export async function retrieveCoaching(
  ctx: ActionCtx,
  answers: string[],
  limit = 4,
): Promise<CoachingReference[]> {
  if (answers.length === 0) return [];
  const vectors = await embedTexts(answers, "RETRIEVAL_QUERY");
  const best = new Map<Id<"coaching_examples">, number>();
  for (const vector of vectors) {
    const hits = await ctx.vectorSearch("coaching_examples", "by_embedding", { vector, limit: 2 });
    for (const hit of hits) {
      best.set(hit._id, Math.max(best.get(hit._id) ?? 0, hit._score));
    }
  }
  const ids = [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
  if (ids.length === 0) return [];
  return await ctx.runQuery(internal.coaching.getByIds, { ids });
}
