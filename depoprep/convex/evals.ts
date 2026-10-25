import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { evalCaseResult } from "./schema";
import { EVAL_CASES } from "./evalCases";

export const listRuns = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("eval_runs").withIndex("by_started").order("desc").take(20);
  },
});

export const listCases = query({
  args: {},
  handler: async () => {
    return EVAL_CASES.map(({ id, title, band, weak, strong }) => ({ id, title, band, weak, strong }));
  },
});

// On a public deployment anyone can press "Run eval"; this keeps free-tier quota for the live demo.
const EVAL_COOLDOWN_MS = 2 * 60 * 1000;

/** Returns why a new run can't start yet, or null. */
export const blockedReason = internalQuery({
  args: {},
  handler: async (ctx) => {
    const latest = await ctx.db.query("eval_runs").withIndex("by_started").order("desc").first();
    if (!latest) return null;
    const age = Date.now() - new Date(latest.startedAt).getTime();
    // A run older than 15 minutes that never finished is treated as dead.
    if (latest.status === "running" && age < 15 * 60 * 1000) {
      return "An eval is already running. Wait for it to finish.";
    }
    if (age < EVAL_COOLDOWN_MS) {
      return `Evals are rate-limited to protect free-tier quota. Try again in ${Math.ceil((EVAL_COOLDOWN_MS - age) / 1000)} s.`;
    }
    return null;
  },
});

export const start = internalMutation({
  args: { provider: v.string(), rag: v.boolean(), repeats: v.number(), totalCases: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("eval_runs", {
      ...args,
      status: "running",
      startedAt: new Date().toISOString(),
      results: [],
    });
  },
});

export const appendResult = internalMutation({
  args: { runId: v.id("eval_runs"), result: evalCaseResult, model: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return;
    await ctx.db.patch(args.runId, {
      results: [...run.results, args.result],
      model: run.model ?? args.model,
    });
  },
});

export const finish = internalMutation({
  args: { runId: v.id("eval_runs"), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: args.error ? "error" : "done",
      error: args.error,
    });
  },
});

// Maintenance: `npx convex run evals:deleteRun '{"runId":"..."}'` removes a broken run.
export const deleteRun = internalMutation({
  args: { runId: v.id("eval_runs") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.runId);
  },
});
