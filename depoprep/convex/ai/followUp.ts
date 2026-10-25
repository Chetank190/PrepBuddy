"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { getSessionClosingMessage, isFollowUp } from "../simulationScript";
import { EVENT_LABELS, chainJson, normalizeText, parseJson } from "./grader";
import { Trace } from "./tracing";

const FOLLOW_UP_SCHEMA = {
  type: "OBJECT",
  properties: {
    followUp: { type: "BOOLEAN" },
    quote: { type: "STRING" },
    question: { type: "STRING" },
  },
  required: ["followUp"],
};

// The follow-up sits between two scripted questions, so it must be quick or not happen at all.
const FOLLOW_UP_TIMEOUT_MS = 6_000;
// Speed matters more than nuance here: Groq answered in ~1–2 s with clean verbatim quotes, while
// Gemini's free tier was intermittently slow or looping. Grading keeps Gemini first.
const FOLLOW_UP_ORDER = ["groq", "gemini", "claude"] as const;

/**
 * Models sometimes append commentary to the quote. Keep the longest run of the quote's leading
 * words that really appears in the answer; reject if fewer than three words survive.
 */
function trimToAnswer(quote: string, answer: string): string | null {
  const words = quote.trim().split(/\s+/);
  const haystack = normalizeText(answer);
  for (let n = words.length; n >= 3; n--) {
    const candidate = words.slice(0, n).join(" ");
    if (haystack.includes(normalizeText(candidate))) return candidate.replace(/[\s.,;:]+$/, "");
  }
  return null;
}

type FollowUp = { quote: string; question: string } | null;

/**
 * Bounded agentic step: after an answer to a scripted question, the model may ask ONE follow-up,
 * and only about words the witness actually volunteered or guessed. Code enforces the bounds:
 * the quote must appear in the answer, it must be at least three words, and a follow-up is never
 * followed up. Anything else means no follow-up.
 */
export const maybeAsk = action({
  args: { sessionId: v.id("sim_sessions") },
  handler: async (
    ctx,
    args,
  ): Promise<{ asked: boolean; quote?: string; model?: string; ms?: number; skipped?: string }> => {
    if (process.env.FOLLOW_UPS === "off") return { asked: false };
    const session = await ctx.runQuery(api.simSessions.getById, { id: args.sessionId });
    if (!session || session.status !== "active") return { asked: false };

    const t = session.transcript;
    const answer = t[t.length - 1];
    const asked = t[t.length - 2];
    if (answer?.role !== "client" || asked?.role !== "ai") return { asked: false };
    if (isFollowUp(asked) || asked.content === getSessionClosingMessage()) return { asked: false };

    const matter = await ctx.runQuery(api.matters.getById, { id: session.matterId });
    if (!matter) return { asked: false };
    const question = asked.content.split("\n\n").pop() ?? asked.content;

    const prompt = `You are opposing counsel in a ${EVENT_LABELS[matter.eventType]}.
CASE: ${matter.caseSummary}
RISK AREAS: ${matter.riskTags.join(", ") || "none listed"}

QUESTION YOU ASKED: "${question}"
WITNESS ANSWER: "${answer.content}"

Did the answer volunteer information the question did not ask for, or offer a guess or estimate, that you would immediately pursue?
- If the answer simply answers the question (including "Yes", "No", "I don't recall", or a short factual reply), return {"followUp": false}.
- Otherwise pick the SINGLE most damaging detail (prefer admissions, prior injuries, guesses about key facts and the risk areas over harmless background) and return {"followUp": true, "quote": "<3 to 15 words copied exactly from the answer, nothing else>", "question": "<one short follow-up question, at most 25 words, that pursues that quote>"}.
Return JSON only.`;

    let followUp: FollowUp = null;
    let skipped = "model saw nothing to pursue";
    const started = Date.now();
    let model: string | undefined;
    // Same session id as the grading trace, so Langfuse shows a deposition's follow-ups and grade together.
    const trace = new Trace("follow-up", {
      sessionId: args.sessionId,
      userId: session.clientId,
      tags: ["live"],
      input: { question, answer: answer.content },
    });
    try {
      const result = await chainJson<FollowUp>({
        prompt,
        schema: FOLLOW_UP_SCHEMA,
        order: [...FOLLOW_UP_ORDER],
        timeoutMs: FOLLOW_UP_TIMEOUT_MS,
        maxTokens: 1000,
        trace,
        name: "follow-up",
        parse: (raw) => {
          const data = parseJson(raw) as { followUp?: boolean; quote?: string; question?: string };
          if (!data.followUp) return null;
          const rawQuote = (data.quote ?? "").trim();
          let q = (data.question ?? "").trim();
          // The bounds: a real quote from the answer (at least three words) and a real question.
          const quote = trimToAnswer(rawQuote, answer.content);
          if (!quote) {
            skipped = `quote not in the answer: "${rawQuote.slice(0, 80)}"`;
            return null;
          }
          if (q.length < 5 || q.length > 300) {
            skipped = "unusable question";
            return null;
          }
          if (!q.endsWith("?")) q += "?";
          return { quote, question: q };
        },
      });
      followUp = result.value;
      model = result.model;
    } catch (err) {
      // A follow-up is optional: on any provider failure, carry on with the script.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Follow-up skipped: ${message}`);
      await trace.flush(ctx, err);
      return { asked: false, ms: Date.now() - started, skipped: message.slice(0, 200) };
    }

    const ms = Date.now() - started;
    // A skipped follow-up is a normal outcome, so it is recorded as output, not as an error.
    await trace.set({ output: followUp ?? { skipped } }).flush(ctx);
    if (!followUp) return { asked: false, model, ms, skipped };
    await ctx.runMutation(internal.simSessions.appendFollowUp, {
      sessionId: args.sessionId,
      question: followUp.question,
      quote: followUp.quote,
    });
    return { asked: true, quote: followUp.quote, model, ms };
  },
});
