import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  formatQuestionMessage,
  getSessionClosingMessage,
} from "./simulationScript";

export const create = mutation({
  args: {
    clientId: v.id("users"),
    matterId: v.id("matters"),
  },
  handler: async (ctx, args) => {
    const matter = await ctx.db.get(args.matterId);
    if (!matter) throw new Error("Matter not found");
    if (!matter.customQuestions?.length) {
      throw new Error(
        "This matter has no practice questions. Ask your lawyer to add custom questions.",
      );
    }

    return await ctx.db.insert("sim_sessions", {
      clientId: args.clientId,
      matterId: args.matterId,
      status: "active",
      transcript: [],
      currentQuestionIndex: 0,
      startedAt: new Date().toISOString(),
    });
  },
});

export const getById = query({
  args: { id: v.id("sim_sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listByClient = query({
  args: { clientId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sim_sessions")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
  },
});

export const listByMatter = query({
  args: { matterId: v.id("matters") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sim_sessions")
      .withIndex("by_matter", (q) => q.eq("matterId", args.matterId))
      .collect();
  },
});

export const addMessage = mutation({
  args: {
    sessionId: v.id("sim_sessions"),
    role: v.union(v.literal("ai"), v.literal("client")),
    content: v.string(),
    flags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const newMessage = {
      role: args.role,
      content: args.content,
      timestamp: new Date().toISOString(),
      flags: args.flags,
    };

    await ctx.db.patch(args.sessionId, {
      transcript: [...session.transcript, newMessage],
    });
  },
});

/** Posts the next lawyer-defined question (or closing) — no improvised AI questions. */
export const postNextQuestion = mutation({
  args: { sessionId: v.id("sim_sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "active") {
      return { done: true, posted: false };
    }

    const matter = await ctx.db.get(session.matterId);
    if (!matter) throw new Error("Matter not found");

    const questions = matter.customQuestions ?? [];
    if (questions.length === 0) {
      throw new Error("No custom questions configured for this matter.");
    }

    const index = session.currentQuestionIndex ?? 0;

    if (index >= questions.length) {
      const closing = getSessionClosingMessage();
      const alreadyClosed = session.transcript.some((t) => t.content === closing);
      if (!alreadyClosed) {
        await ctx.db.patch(args.sessionId, {
          transcript: [
            ...session.transcript,
            {
              role: "ai" as const,
              content: closing,
              timestamp: new Date().toISOString(),
            },
          ],
        });
      }
      return { done: true, posted: !alreadyClosed };
    }

    const content = formatQuestionMessage(questions[index], {
      isFirst: index === 0,
      persona: matter.persona,
    });

    await ctx.db.patch(args.sessionId, {
      transcript: [
        ...session.transcript,
        {
          role: "ai" as const,
          content,
          timestamp: new Date().toISOString(),
        },
      ],
      currentQuestionIndex: index + 1,
    });

    return { done: false, posted: true, questionIndex: index };
  },
});

export const complete = mutation({
  args: { sessionId: v.id("sim_sessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      status: "completed",
      endedAt: new Date().toISOString(),
    });
  },
});
