import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { coachingReference } from "./schema";

// Internal: only the grader action writes feedback.
export const save = internalMutation({
  args: {
    sessionId: v.id("sim_sessions"),
    clientId: v.id("users"),
    matterId: v.id("matters"),
    readinessScore: v.number(),
    rubric: v.object({
      volunteering: v.object({ score: v.number(), explanation: v.string() }),
      speculation: v.object({ score: v.number(), explanation: v.string() }),
      consistency: v.object({ score: v.number(), explanation: v.string() }),
      brevity: v.object({ score: v.number(), explanation: v.string() }),
      composure: v.object({ score: v.number(), explanation: v.string() }),
    }),
    tips: v.array(v.string()),
    riskHighlights: v.array(v.string()),
    gradedBy: v.optional(v.string()),
    gradingMs: v.optional(v.number()),
    fallbacks: v.optional(v.array(v.string())),
    references: v.optional(v.array(coachingReference)),
    rawJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sim_feedback", args);
  },
});

export const getBySession = query({
  args: { sessionId: v.id("sim_sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sim_feedback")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
  },
});

export const listByMatter = query({
  args: { matterId: v.id("matters") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sim_feedback")
      .withIndex("by_matter", (q) => q.eq("matterId", args.matterId))
      .collect();
  },
});

export const listByClient = query({
  args: { clientId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sim_feedback")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
  },
});
