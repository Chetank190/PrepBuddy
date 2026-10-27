"use node";

import { action } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  buildEvaluatorPrompt,
  findGraderDirectedAnswers,
  gradeWithChain,
  promptGetsReferences,
  ragMode,
  retrieveCoaching,
  type CoachingReference,
  type GradeResult,
} from "./grader";
import { checkAndRememberAnswers, type PriorInconsistency } from "./memory";
import { Trace } from "./tracing";

export const generateFeedback = action({
  args: { sessionId: v.id("sim_sessions") },
  handler: async (ctx, args): Promise<string> => {
    const session = await ctx.runQuery(api.simSessions.getById, {
      id: args.sessionId,
    });
    if (!session) throw new Error("Session not found");
    const matter = await ctx.runQuery(api.matters.getById, { id: session.matterId });

    await ctx.runMutation(internal.simSessions.setGradingError, { sessionId: args.sessionId });

    const mode = ragMode();
    // Answers that talk to the grader (prompt injection); shown to the lawyer and used to reject obeyed grades.
    const manipulationAttempts = findGraderDirectedAnswers(session.transcript);
    // One trace per grading: retrieval, the prior-statement check and every grader attempt.
    const trace = new Trace("grade-session", {
      sessionId: args.sessionId,
      userId: session.clientId,
      tags: manipulationAttempts.length > 0 ? ["live", "injection-suspected"] : ["live"],
      metadata: { matterId: session.matterId, ragMode: mode, manipulationAttempts: manipulationAttempts.length },
      input: session.transcript,
    });

    // Retrieval is best-effort: if embeddings or the library are unavailable, grade without references.
    // The references are shown to the witness; ragMode decides which graders also see them.
    let references: CoachingReference[] = [];
    if (mode !== "off") {
      try {
        const answers = session.transcript.filter((t) => t.role === "client").map((t) => t.content);
        references = await retrieveCoaching(ctx, answers, { trace });
      } catch (err) {
        console.warn(`Coaching retrieval skipped: ${err instanceof Error ? err.message : err}`);
      }
    }

    // The prior-statement check runs alongside grading; it is best-effort and never delays the grade.
    const priorCheck: Promise<PriorInconsistency[]> = process.env.GEMINI_API_KEY
      ? checkAndRememberAnswers(ctx, session, trace).catch((err) => {
          console.warn(`Prior-statement check skipped: ${err instanceof Error ? err.message : err}`);
          return [];
        })
      : Promise.resolve([]);

    let result: GradeResult;
    try {
      result = await gradeWithChain(
        (provider) =>
          buildEvaluatorPrompt(
            session.transcript,
            promptGetsReferences(mode, provider) ? references : [],
            matter?.eventType,
          ),
        { trace, suspectAnswers: manipulationAttempts },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.simSessions.setGradingError, {
        sessionId: args.sessionId,
        error: message,
      });
      await trace.flush(ctx, err);
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
      manipulationAttempts: manipulationAttempts.length > 0 ? manipulationAttempts : undefined,
      rawJson: result.rawText,
    });

    // Show the grade immediately; the prior-statement card appears when its check finishes
    // (the results page is subscribed to this feedback row).
    const priorInconsistencies = await priorCheck;
    if (priorInconsistencies.length > 0) {
      await ctx.runMutation(internal.simFeedback.setPriorInconsistencies, {
        feedbackId: feedbackId as Id<"sim_feedback">,
        priorInconsistencies,
      });
    }

    await ctx.runMutation(api.simSessions.complete, {
      sessionId: args.sessionId,
    });

    trace.set({
      output: {
        readinessScore: result.feedback.readinessScore,
        gradedBy: result.model,
        fallbacks: result.fallbacks,
        priorInconsistencies: priorInconsistencies.length,
      },
    });
    await trace.flush(ctx);
    return feedbackId;
  },
});
