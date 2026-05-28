import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { TRAINING_MODULES } from "./trainingContent";

function moduleToRecord(mod: (typeof TRAINING_MODULES)[number]) {
  return {
    slug: mod.slug,
    title: mod.title,
    description: mod.description,
    order: mod.order,
    content: JSON.stringify({
      flashcards: mod.flashcards,
      isChecklist: mod.isChecklist ?? false,
      items: mod.checklistItems ?? [],
    }),
    quizQuestions: mod.quizQuestions,
  };
}

async function insertTrainingModules(ctx: { db: { insert: Function; query: Function } }) {
  for (const mod of TRAINING_MODULES) {
    await ctx.db.insert("basic_modules", moduleToRecord(mod));
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("basic_modules").order("asc").collect();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("basic_modules")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

export const getById = query({
  args: { id: v.id("basic_modules") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const ensureSeeded = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("basic_modules").first();
    if (existing) return "already seeded";
    await insertTrainingModules(ctx);
    return "seeded";
  },
});

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("basic_modules").first();
    if (existing) return "already seeded";
    await insertTrainingModules(ctx);
    return "seeded";
  },
});

/** @deprecated Use ensureSeeded — EFD content is included in the main training seed. */
export const seedEFD = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("basic_modules").first();
    if (existing) return "EFD modules already seeded";
    await insertTrainingModules(ctx);
    return "EFD modules seeded";
  },
});
