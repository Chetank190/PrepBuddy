"use node";

import { action } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { EVAL_CASES } from "../evalCases";
import { isEvalAdmin } from "../evalAuth";
import {
  buildEvaluatorPrompt,
  findGraderDirectedAnswers,
  gradeWithChain,
  retrieveCoaching,
  normalizeText as normalize,
  RUBRIC_KEYS,
  type CoachingReference,
} from "./grader";
import { Trace } from "./tracing";

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
    // Grade each case this many times (1–3) to measure how consistent the judge is.
    repeats: v.optional(v.number()),
    adminKey: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"eval_runs">> => {
    if (!isEvalAdmin(args.adminKey)) throw new ConvexError("Invalid eval admin key.");
    const blocked = await ctx.runQuery(internal.evals.blockedReason, {});
    if (blocked) throw new ConvexError(blocked);
    const repeats = Math.min(Math.max(Math.round(args.repeats ?? 1), 1), 3);
    const runId = await ctx.runMutation(internal.evals.start, {
      provider: args.provider,
      rag: args.rag,
      repeats,
      totalCases: EVAL_CASES.length,
    });

    try {
      for (const [i, testCase] of EVAL_CASES.entries()) {
        // Free tiers rate-limit by requests per minute; a short pause keeps the run inside them.
        if (i > 0) await new Promise((r) => setTimeout(r, 1500));

        const answers = testCase.transcript.filter((t) => t.role === "client").map((t) => t.content);
        const started = Date.now();
        let references: CoachingReference[] = [];
        // One trace per case, grouped by run in Langfuse's Sessions view.
        const trace = new Trace("eval-case", {
          sessionId: runId,
          tags: ["eval", args.provider, args.rag ? "rag" : "no-rag"],
          metadata: { caseId: testCase.id, band: testCase.band.join("–") },
          input: testCase.transcript,
        });
        try {
          if (args.rag) references = await retrieveCoaching(ctx, answers, { trace });
          const prompt = buildEvaluatorPrompt(testCase.transcript, references);
          // Same injection defence as the live grader, so the eval measures what witnesses get.
          const gradeOpts = {
            only: args.provider,
            trace,
            suspectAnswers: findGraderDirectedAnswers(testCase.transcript),
          };
          const { feedback, model } = await gradeWithChain(prompt, gradeOpts);
          const ms = Date.now() - started;
          // Extra repeats only feed the consistency measure; all other metrics use the first grade.
          const scores = [feedback.readinessScore];
          for (let r = 1; r < repeats; r++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            scores.push((await gradeWithChain(prompt, gradeOpts)).feedback.readinessScore);
          }
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
              scores: repeats > 1 ? scores : undefined,
            },
          });
          await trace.set({ output: { scores, rubric: feedback.rubric, riskHighlights: feedback.riskHighlights } }).flush(ctx);
        } catch (err) {
          await trace.flush(ctx, err);
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
