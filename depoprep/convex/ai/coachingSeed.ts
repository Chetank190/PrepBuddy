"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { COACHING_EXAMPLES } from "../coachingContent";
import { embedTexts } from "./grader";

// Embeds the coaching library and replaces the coaching_examples table. Safe to re-run.
export const seed = action({
  args: {},
  handler: async (ctx): Promise<number> => {
    // Embed the weak answer with its question: retrieval queries are the witness's answers.
    const vectors = await embedTexts(
      COACHING_EXAMPLES.map((e) => `Question: ${e.question}\nAnswer: ${e.badAnswer}`),
      "RETRIEVAL_DOCUMENT",
    );
    return await ctx.runMutation(internal.coaching.replaceAll, {
      examples: COACHING_EXAMPLES.map((e, i) => ({ ...e, embedding: vectors[i] })),
    });
  },
});

/** Debug: top coaching matches and cosine scores for each answer. Used to pick COACHING_MIN_SCORE. */
export const debugRetrieval = internalAction({
  args: { answers: v.array(v.string()) },
  handler: async (ctx, args): Promise<Array<{ answer: string; hits: Array<{ score: number; badAnswer?: string }> }>> => {
    const vectors = await embedTexts(args.answers, "RETRIEVAL_QUERY");
    const out: Array<{ answer: string; hits: Array<{ score: number; badAnswer?: string }> }> = [];
    for (const [i, vector] of vectors.entries()) {
      const hits = await ctx.vectorSearch("coaching_examples", "by_embedding", { vector, limit: 3 });
      const docs = await ctx.runQuery(internal.coaching.getByIds, { ids: hits.map((h) => h._id) });
      out.push({
        answer: args.answers[i],
        hits: hits.map((h, j) => ({ score: Number(h._score.toFixed(3)), badAnswer: docs[j]?.badAnswer.slice(0, 50) })),
      });
    }
    return out;
  },
});
