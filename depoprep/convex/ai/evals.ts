"use node";

import { action } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { EVAL_CASES } from "../evalCases";
import {
  buildEvaluatorPrompt,
  gradeWithChain,
  retrieveCoaching,
  RUBRIC_KEYS,
  type CoachingReference,
} from "./grader";

// Lowercase, collapse whitespace and trim quotes/punctuation so "Maybe 70?" matches maybe 70.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/^[\s"'.,?!]+|[\s"'.,?!]+$/g, "");
}

/**
 * Runs every labelled case through one provider (no fallback) and records, per case:
 * valid JSON, readiness in the expected band, planted weaknesses caught (score < 70),
 * clean dimensions left alone (score >= 70), and whether each quoted "risky answer"
 * really appears in the witness's answers (a hallucination check that needs no labels).
 */
export const run = action({
  args: {
    provider: v.union(v.literal("gemini"), v.literal("groq"), v.literal("claude")),
    rag: v.boolean(),
  },
  handler: async (ctx, args): Promise<Id<"eval_runs">> => {
    const blocked = await ctx.runQuery(internal.evals.blockedReason, {});
    if (blocked) throw new ConvexError(blocked);
    const runId = await ctx.runMutation(internal.evals.start, {
      provider: args.provider,
      rag: args.rag,
      totalCases: EVAL_CASES.length,
    });

    try {
      for (const [i, testCase] of EVAL_CASES.entries()) {
        // Free tiers rate-limit by requests per minute; a short pause keeps the run inside them.
        if (i > 0) await new Promise((r) => setTimeout(r, 1500));

        const answers = testCase.transcript.filter((t) => t.role === "client").map((t) => t.content);
        const started = Date.now();
        let references: CoachingReference[] = [];
        try {
          if (args.rag) references = await retrieveCoaching(ctx, answers);
          const { feedback, model } = await gradeWithChain(
            buildEvaluatorPrompt(testCase.transcript, references),
            args.provider,
          );
          const ms = Date.now() - started;
          const score = (k: (typeof RUBRIC_KEYS)[number]) => feedback.rubric[k].score;
          const answerText = answers.map(normalize).join("\n");
          const grounded = feedback.riskHighlights.filter((q) => {
            const n = normalize(q);
            return n.length > 0 && answerText.includes(n);
          }).length;

          await ctx.runMutation(internal.evals.appendResult, {
            runId,
            model,
            result: {
              caseId: testCase.id,
              title: testCase.title,
              ok: true,
              ms,
              readinessScore: feedback.readinessScore,
              inBand:
                feedback.readinessScore >= testCase.band[0] && feedback.readinessScore <= testCase.band[1],
              weakHits: testCase.weak.filter((k) => score(k) < 70).length,
              weakTotal: testCase.weak.length,
              strongHits: testCase.strong.filter((k) => score(k) >= 70).length,
              strongTotal: testCase.strong.length,
              quotesGrounded: grounded,
              quotesTotal: feedback.riskHighlights.length,
              referencesUsed: references.length,
            },
          });
        } catch (err) {
          await ctx.runMutation(internal.evals.appendResult, {
            runId,
            result: {
              caseId: testCase.id,
              title: testCase.title,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
              ms: Date.now() - started,
              weakHits: 0,
              weakTotal: testCase.weak.length,
              strongHits: 0,
              strongTotal: testCase.strong.length,
              quotesGrounded: 0,
              quotesTotal: 0,
              referencesUsed: references.length,
            },
          });
        }
      }
      await ctx.runMutation(internal.evals.finish, { runId });
    } catch (err) {
      await ctx.runMutation(internal.evals.finish, {
        runId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    return runId;
  },
});
