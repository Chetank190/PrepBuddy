import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getForClient = query({
  args: { clientId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("module_progress")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
  },
});

export const getForClientModule = query({
  args: { clientId: v.id("users"), moduleId: v.id("basic_modules") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("module_progress")
      .withIndex("by_client_module", (q) =>
        q.eq("clientId", args.clientId).eq("moduleId", args.moduleId)
      )
      .first();
  },
});

export const upsertProgress = mutation({
  args: {
    clientId: v.id("users"),
    moduleId: v.id("basic_modules"),
    status: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("completed")
    ),
    score: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("module_progress")
      .withIndex("by_client_module", (q) =>
        q.eq("clientId", args.clientId).eq("moduleId", args.moduleId)
      )
      .first();

    const completedAt =
      args.status === "completed" ? new Date().toISOString() : undefined;

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        score: args.score,
        completedAt,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("module_progress", {
        clientId: args.clientId,
        moduleId: args.moduleId,
        status: args.status,
        score: args.score,
        completedAt,
      });
    }
  },
});

export const allModulesCompleted = query({
  args: { clientId: v.id("users") },
  handler: async (ctx, args) => {
    const allModules = await ctx.db.query("basic_modules").collect();
    const progress = await ctx.db
      .query("module_progress")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    const completedIds = new Set(
      progress
        .filter((p) => p.status === "completed" && (p.score ?? 0) >= 80)
        .map((p) => p.moduleId.toString())
    );

    return allModules.every((m) => completedIds.has(m._id.toString()));
  },
});

/** Training unlock status for simulation — scores read from DB, no re-testing required. */
export const getTrainingUnlockStatus = query({
  args: { clientId: v.id("users") },
  handler: async (ctx, args) => {
    const allModules = await ctx.db.query("basic_modules").order("asc").collect();
    const progress = await ctx.db
      .query("module_progress")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    const progressByModule = new Map(progress.map((p) => [p.moduleId.toString(), p]));

    const modules = allModules.map((mod) => {
      const prog = progressByModule.get(mod._id.toString());
      const score = prog?.score;
      const passed =
        prog?.status === "completed" && (score ?? 0) >= 80;
      return {
        moduleId: mod._id,
        title: mod.title,
        order: mod.order,
        score,
        passed,
        status: prog?.status ?? ("not_started" as const),
      };
    });

    const passedCount = modules.filter((m) => m.passed).length;

    return {
      allModulesPassed: modules.length > 0 && passedCount === modules.length,
      passedCount,
      totalCount: modules.length,
      modules,
    };
  },
});
