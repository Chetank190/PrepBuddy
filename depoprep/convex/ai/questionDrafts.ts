"use node";

import { action } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { EVENT_LABELS, chainJson, parseJson } from "./grader";
import { Trace } from "./tracing";

const DRAFT_SCHEMA = {
  type: "OBJECT",
  properties: { questions: { type: "ARRAY", items: { type: "STRING" } } },
  required: ["questions"],
};

/**
 * Human-in-the-loop drafting: the LLM proposes questions opposing counsel is likely to ask; the lawyer
 * edits and saves them. Nothing reaches a witness until the lawyer approves it.
 */
export const suggest = action({
  args: {
    eventType: v.union(v.literal("deposition"), v.literal("trial_testimony"), v.literal("settlement_conference")),
    caseSummary: v.string(),
    riskTags: v.array(v.string()),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<string[]> => {
    const summary = args.caseSummary.trim().slice(0, 4000);
    if (summary.length < 20) throw new ConvexError("Write a case summary first (a couple of sentences).");
    const count = Math.min(Math.max(args.count ?? 5, 3), 8);
    const prompt = `You are helping a lawyer prepare their own client for a ${EVENT_LABELS[args.eventType]}.
Write ${count} questions that OPPOSING counsel is likely to ask this witness.

CASE SUMMARY: ${summary}
RISK AREAS: ${args.riskTags.slice(0, 10).join(", ") || "none listed"}

Rules:
- Cover the risk areas first, one question each where possible.
- One fact per question, at most 20 words, no compound questions.
- Neutral or leading wording, as opposing counsel would phrase it.
- Never invent facts that are not in the case summary.
Return JSON: {"questions": ["...", "..."]}`;
    const trace = new Trace("draft-questions", {
      tags: ["live"],
      metadata: { eventType: args.eventType, count },
      input: { caseSummary: summary, riskTags: args.riskTags },
    });
    try {
      const { value } = await chainJson({
        prompt,
        schema: DRAFT_SCHEMA,
        maxTokens: 1500,
        trace,
        name: "draft",
        parse: (raw) => {
          const data = parseJson(raw) as { questions?: unknown };
          const questions = (Array.isArray(data.questions) ? data.questions : [])
            .filter((q): q is string => typeof q === "string")
            .map((q) => q.trim())
            .filter((q) => q.length >= 8 && q.length <= 220)
            .map((q) => (q.endsWith("?") ? q : `${q}?`));
          if (questions.length < 3) throw new Error("Too few usable questions.");
          return questions.slice(0, count);
        },
      });
      await trace.set({ output: value }).flush(ctx);
      return value;
    } catch (err) {
      await trace.flush(ctx, err);
      throw new ConvexError(`Couldn't draft questions: ${err instanceof Error ? err.message : err}`);
    }
  },
});
