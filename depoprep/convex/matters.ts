import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { toPublicUser } from "./users";

export const create = mutation({
  args: {
    lawyerId: v.id("users"),
    title: v.string(),
    eventType: v.union(
      v.literal("deposition"),
      v.literal("trial_testimony"),
      v.literal("settlement_conference")
    ),
    eventDate: v.string(),
    caseSummary: v.string(),
    riskTags: v.array(v.string()),
    customQuestions: v.optional(v.array(v.string())),
    persona: v.union(
      v.literal("calm_precise"),
      v.literal("aggressive"),
      v.literal("friendly_manipulative")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("matters", args);
  },
});

export const listByLawyer = query({
  args: { lawyerId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("matters")
      .withIndex("by_lawyerId", (q) => q.eq("lawyerId", args.lawyerId))
      .collect();
  },
});

export const getDashboardStats = query({
  args: { lawyerId: v.id("users") },
  handler: async (ctx, args) => {
    const matters = await ctx.db
      .query("matters")
      .withIndex("by_lawyerId", (q) => q.eq("lawyerId", args.lawyerId))
      .collect();

    const clientIds = new Set<string>();
    const readinessScores: number[] = [];

    for (const matter of matters) {
      const links = await ctx.db
        .query("matter_clients")
        .withIndex("by_matter", (q) => q.eq("matterId", matter._id))
        .collect();
      for (const link of links) {
        clientIds.add(link.clientId);
      }

      const feedbackList = await ctx.db
        .query("sim_feedback")
        .withIndex("by_matter", (q) => q.eq("matterId", matter._id))
        .collect();
      for (const feedback of feedbackList) {
        readinessScores.push(feedback.readinessScore);
      }
    }

    const avgReadiness =
      readinessScores.length > 0
        ? Math.round(
            readinessScores.reduce((sum, score) => sum + score, 0) /
              readinessScores.length
          )
        : null;

    return {
      activeMatters: matters.length,
      clientsEnrolled: clientIds.size,
      avgReadiness,
    };
  },
});

export const getById = query({
  args: { id: v.id("matters") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const addClient = mutation({
  args: { matterId: v.id("matters"), clientId: v.id("users") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("matter_clients")
      .withIndex("by_matter", (q) => q.eq("matterId", args.matterId))
      .filter((q) => q.eq(q.field("clientId"), args.clientId))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("matter_clients", args);
  },
});

export const removeClient = mutation({
  args: { matterId: v.id("matters"), clientId: v.id("users") },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("matter_clients")
      .withIndex("by_matter", (q) => q.eq("matterId", args.matterId))
      .filter((q) => q.eq(q.field("clientId"), args.clientId))
      .first();
    if (link) await ctx.db.delete(link._id);
  },
});

export const getClientsForMatter = query({
  args: { matterId: v.id("matters") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("matter_clients")
      .withIndex("by_matter", (q) => q.eq("matterId", args.matterId))
      .collect();
    const clients = await Promise.all(links.map((l) => ctx.db.get(l.clientId)));
    return clients.filter((c) => c !== null).map(toPublicUser);
  },
});

export const getMattersForClient = query({
  args: { clientId: v.id("users") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("matter_clients")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    const matters = await Promise.all(links.map((l) => ctx.db.get(l.matterId)));
    return matters.filter(Boolean);
  },
});

export const update = mutation({
  args: {
    matterId: v.id("matters"),
    lawyerId: v.id("users"),
    title: v.string(),
    eventType: v.union(
      v.literal("deposition"),
      v.literal("trial_testimony"),
      v.literal("settlement_conference")
    ),
    eventDate: v.string(),
    caseSummary: v.string(),
    riskTags: v.array(v.string()),
    customQuestions: v.optional(v.array(v.string())),
    persona: v.union(
      v.literal("calm_precise"),
      v.literal("aggressive"),
      v.literal("friendly_manipulative")
    ),
  },
  handler: async (ctx, args) => {
    const matter = await ctx.db.get(args.matterId);
    if (!matter) throw new Error("Matter not found");
    if (matter.lawyerId !== args.lawyerId) {
      throw new Error("Not authorized to update this matter");
    }

    const { matterId, lawyerId, ...fields } = args;
    await ctx.db.patch(matterId, {
      ...fields,
      customQuestions:
        fields.customQuestions && fields.customQuestions.length > 0
          ? fields.customQuestions
          : undefined,
    });
  },
});

export const remove = mutation({
  args: { matterId: v.id("matters"), lawyerId: v.id("users") },
  handler: async (ctx, args) => {
    const matter = await ctx.db.get(args.matterId);
    if (!matter) throw new Error("Matter not found");
    if (matter.lawyerId !== args.lawyerId) {
      throw new Error("Not authorized to remove this matter");
    }

    const clientLinks = await ctx.db
      .query("matter_clients")
      .withIndex("by_matter", (q) => q.eq("matterId", args.matterId))
      .collect();
    for (const link of clientLinks) {
      await ctx.db.delete(link._id);
    }

    const sessions = await ctx.db
      .query("sim_sessions")
      .withIndex("by_matter", (q) => q.eq("matterId", args.matterId))
      .collect();
    for (const session of sessions) {
      const feedback = await ctx.db
        .query("sim_feedback")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .first();
      if (feedback) await ctx.db.delete(feedback._id);
      await ctx.db.delete(session._id);
    }

    await ctx.db.delete(args.matterId);
  },
});
