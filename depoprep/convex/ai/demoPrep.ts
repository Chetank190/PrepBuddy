"use node";

import { action } from "../_generated/server";
import { ConvexError } from "convex/values";
import { api, internal } from "../_generated/api";

// The disciplined answers to the live-demo matter's five questions.
const DISCIPLINED_ANSWERS = [
  "Alex Doe, registered nurse.",
  "To work.",
  "I don't recall the exact speed.",
  "No.",
  "No.",
];

/**
 * Pre-talk warm-up: runs and grades a disciplined session for the demo witness, so the live chatty run
 * has earlier statements to contradict ("Changed since last time") and the providers are warm.
 */
export const runDisciplinedSession = action({
  args: {},
  handler: async (ctx): Promise<number> => {
    const ids = await ctx.runQuery(internal.demoSeed.demoIds, {});
    if (!ids) throw new ConvexError("Run Demo Data first.");
    const sessionId = await ctx.runMutation(api.simSessions.create, ids);
    for (const answer of DISCIPLINED_ANSWERS) {
      await ctx.runMutation(api.simSessions.postNextQuestion, { sessionId });
      await ctx.runMutation(api.simSessions.addMessage, { sessionId, role: "client", content: answer });
    }
    await ctx.runMutation(api.simSessions.postNextQuestion, { sessionId });
    await ctx.runMutation(api.simSessions.complete, { sessionId });
    await ctx.runAction(api.ai.feedbackEvaluator.generateFeedback, { sessionId });
    const feedback = await ctx.runQuery(api.simFeedback.getBySession, { sessionId });
    return feedback?.readinessScore ?? 0;
  },
});
