"use node";

import { action } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { api, internal } from "../_generated/api";
import {
  buildEvaluatorPrompt,
  gradeWithChain,
  promptGetsReferences,
  ragMode,
  retrieveCoaching,
  type CoachingReference,
  type GradeResult,
} from "./grader";

export const generateFeedback = action({
  args: { sessionId: v.id("sim_sessions") },
  handler: async (ctx, args): Promise<string> => {
    const session = await ctx.runQuery(api.simSessions.getById, {
      id: args.sessionId,
    });
    if (!session) throw new Error("Session not found");

    await ctx.runMutation(internal.simSessions.setGradingError, { sessionId: args.sessionId });

    // Retrieval is best-effort: if embeddings or the library are unavailable, grade without references.
    // The references are shown to the witness; ragMode decides which graders also see them.
    const mode = ragMode();
    let references: CoachingReference[] = [];
    if (mode !== "off") {
      try {
        const answers = session.transcript.filter((t) => t.role === "client").map((t) => t.content);
        references = await retrieveCoaching(ctx, answers);
      } catch (err) {
        console.warn(`Coaching retrieval skipped: ${err instanceof Error ? err.message : err}`);
      }
    }

    let result: GradeResult;
    try {
      result = await gradeWithChain((provider) =>
        buildEvaluatorPrompt(session.transcript, promptGetsReferences(mode, provider) ? references : []),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.simSessions.setGradingError, {
        sessionId: args.sessionId,
        error: message,
      });
      // ConvexError keeps the message visible to the client instead of a generic "Server Error".
      throw new ConvexError(message);
    }

    const feedbackId = await ctx.runMutation(internal.simFeedback.save, {
      sessionId: args.sessionId,
      clientId: session.clientId,
      matterId: session.matterId,
      ...result.feedback,
      gradedBy: result.model,
      gradingMs: result.ms,
      fallbacks: result.fallbacks,
      references,
      rawJson: result.rawText,
    });

    await ctx.runMutation(api.simSessions.complete, {
      sessionId: args.sessionId,
    });

    return feedbackId;
  },
});
