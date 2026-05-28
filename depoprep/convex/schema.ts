import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("lawyer"), v.literal("client")),
    passwordHash: v.string(),
  }).index("by_email", ["email"]),

  matters: defineTable({
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
  }).index("by_lawyerId", ["lawyerId"]),

  matter_clients: defineTable({
    matterId: v.id("matters"),
    clientId: v.id("users"),
  })
    .index("by_matter", ["matterId"])
    .index("by_client", ["clientId"]),

  basic_modules: defineTable({
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    order: v.number(),
    content: v.string(),
    quizQuestions: v.array(
      v.object({
        id: v.string(),
        question: v.string(),
        options: v.array(v.string()),
        correctIndex: v.number(),
        explanation: v.string(),
      })
    ),
  }).index("by_slug", ["slug"]),

  module_progress: defineTable({
    clientId: v.id("users"),
    moduleId: v.id("basic_modules"),
    status: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("completed")
    ),
    score: v.optional(v.number()),
    completedAt: v.optional(v.string()),
  })
    .index("by_client", ["clientId"])
    .index("by_client_module", ["clientId", "moduleId"]),

  sim_sessions: defineTable({
    clientId: v.id("users"),
    matterId: v.id("matters"),
    status: v.union(v.literal("active"), v.literal("completed")),
    currentQuestionIndex: v.optional(v.number()),
    transcript: v.array(
      v.object({
        role: v.union(v.literal("ai"), v.literal("client")),
        content: v.string(),
        timestamp: v.string(),
        flags: v.optional(v.array(v.string())),
      })
    ),
    startedAt: v.string(),
    endedAt: v.optional(v.string()),
  })
    .index("by_client", ["clientId"])
    .index("by_matter", ["matterId"]),

  sim_feedback: defineTable({
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
  })
    .index("by_session", ["sessionId"])
    .index("by_client", ["clientId"])
    .index("by_matter", ["matterId"]),
});
