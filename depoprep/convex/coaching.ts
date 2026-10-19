import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { coachingReference } from "./schema";

export const count = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query("coaching_examples").collect()).length;
  },
});

export const getByIds = internalQuery({
  args: { ids: v.array(v.id("coaching_examples")) },
  handler: async (ctx, args) => {
    const docs = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    // Return only the reference fields; embeddings are large and never needed downstream.
    return docs
      .filter((d) => d !== null)
      .map(({ dimension, question, badAnswer, betterAnswer, why }) => ({
        dimension,
        question,
        badAnswer,
        betterAnswer,
        why,
      }));
  },
});

export const replaceAll = internalMutation({
  args: {
    examples: v.array(
      v.object({ ...coachingReference.fields, embedding: v.array(v.float64()) }),
    ),
  },
  handler: async (ctx, args) => {
    for (const doc of await ctx.db.query("coaching_examples").collect()) {
      await ctx.db.delete(doc._id);
    }
    for (const example of args.examples) {
      await ctx.db.insert("coaching_examples", example);
    }
    return args.examples.length;
  },
});
