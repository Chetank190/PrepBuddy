"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import Anthropic from "@anthropic-ai/sdk";

export const sendMessage = action({
  args: {
    sessionId: v.id("sim_sessions"),
    messages: v.array(v.object({ role: v.string(), content: v.string() })),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set in Convex. Run: npx convex env set ANTHROPIC_API_KEY <your-key>",
      );
    }
    const anthropic = new Anthropic({ apiKey });

    // Anthropic requires system prompt as a top-level param, not a message
    const systemMsg = args.messages.find((m) => m.role === "system");
    const conversationMsgs = args.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // Anthropic requires at least one user message
    if (conversationMsgs.length === 0) {
      conversationMsgs.push({ role: "user", content: "[BEGIN SESSION]" });
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      temperature: 0.7,
      system: systemMsg?.content,
      messages: conversationMsgs,
    });

    const aiMessage =
      response.content[0].type === "text" ? response.content[0].text : "";

    await ctx.runMutation(api.simSessions.addMessage, {
      sessionId: args.sessionId,
      role: "ai",
      content: aiMessage,
    });

    return aiMessage;
  },
});
