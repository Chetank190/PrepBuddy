import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getByIds = internalQuery({
  args: { ids: v.array(v.id("answer_memories")) },
  handler: async (ctx, args) => {
    const docs = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    // Embeddings are large and never needed downstream.
    return docs
      .filter((d) => d !== null)
      .map(({ _id, sessionId, question, answer, answeredAt }) => ({ _id, sessionId, question, answer, answeredAt }));
  },
});

export const insertMany = internalMutation({
  args: {
    memories: v.array(
      v.object({
        clientId: v.id("users"),
        matterId: v.id("matters"),
        sessionId: v.id("sim_sessions"),
        question: v.string(),
        answer: v.string(),
        answeredAt: v.string(),
        embedding: v.array(v.float64()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const memory of args.memories) await ctx.db.insert("answer_memories", memory);
  },
});
