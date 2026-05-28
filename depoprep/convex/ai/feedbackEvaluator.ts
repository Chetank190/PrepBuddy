"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import Anthropic from "@anthropic-ai/sdk";

function buildEvaluatorPrompt(
  transcript: Array<{ role: string; content: string }>
): string {
  const formatted = transcript
    .map((t) => `[${t.role.toUpperCase()}]: ${t.content}`)
    .join("\n");

  return `You are a legal witness preparation coach. Analyze this deposition practice transcript and return a JSON object.

TRANSCRIPT:
${formatted}

Return ONLY valid JSON (no markdown fences, no explanation text before or after):
{
  "readinessScore": <0-100 overall score>,
  "rubric": {
    "volunteering": { "score": <0-100>, "explanation": "<1-2 sentences>" },
    "speculation":  { "score": <0-100>, "explanation": "<1-2 sentences>" },
    "consistency":  { "score": <0-100>, "explanation": "<1-2 sentences>" },
    "brevity":      { "score": <0-100>, "explanation": "<1-2 sentences>" },
    "composure":    { "score": <0-100>, "explanation": "<1-2 sentences>" }
  },
  "tips": ["<concrete tip 1>", "<concrete tip 2>", "<concrete tip 3>"],
  "riskHighlights": ["<risky answer excerpt 1>", "<risky answer excerpt 2>"]
}

Scoring guide:
- 80-100: Excellent — minimal issues
- 60-79: Good — some patterns to watch
- 40-59: Needs work — clear recurring problems
- 0-39: Significant preparation needed`;
}

export const generateFeedback = action({
  args: { sessionId: v.id("sim_sessions") },
  handler: async (ctx, args): Promise<string> => {
    const session = await ctx.runQuery(api.simSessions.getById, {
      id: args.sessionId,
    });
    if (!session) throw new Error("Session not found");

    const prompt = buildEvaluatorPrompt(session.transcript);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set in Convex. Run: npx convex env set ANTHROPIC_API_KEY <your-key>",
      );
    }
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    const raw =
      response.content[0].type === "text" ? response.content[0].text : "{}";

    // Strip any accidental markdown fences Claude might add
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feedback: any = JSON.parse(cleaned);

    const feedbackId = await ctx.runMutation(api.simFeedback.save, {
      sessionId: args.sessionId,
      clientId: session.clientId,
      matterId: session.matterId,
      readinessScore: feedback.readinessScore ?? 50,
      rubric: {
        volunteering: feedback.rubric?.volunteering ?? { score: 50, explanation: "" },
        speculation: feedback.rubric?.speculation ?? { score: 50, explanation: "" },
        consistency: feedback.rubric?.consistency ?? { score: 50, explanation: "" },
        brevity: feedback.rubric?.brevity ?? { score: 50, explanation: "" },
        composure: feedback.rubric?.composure ?? { score: 50, explanation: "" },
      },
      tips: feedback.tips ?? [],
      riskHighlights: feedback.riskHighlights ?? [],
    });

    await ctx.runMutation(api.simSessions.complete, {
      sessionId: args.sessionId,
    });

    return feedbackId;
  },
});
