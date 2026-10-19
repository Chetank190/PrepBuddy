"use node";

import { action } from "../_generated/server";
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
