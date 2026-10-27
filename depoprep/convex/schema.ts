import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const dimension = v.union(
  v.literal("volunteering"),
  v.literal("speculation"),
  v.literal("consistency"),
  v.literal("brevity"),
  v.literal("composure"),
);

export const coachingReference = v.object({
  dimension,
  question: v.string(),
  badAnswer: v.string(),
  betterAnswer: v.string(),
  why: v.string(),
});

// Delivery metrics measured in the browser (Web Speech API) for a spoken answer.
export const voiceMetrics = v.object({
  fillerCount: v.number(),
  fillerWords: v.array(v.string()),
  confidence: v.number(),
  responseDelayMs: v.number(),
  wordCount: v.number(),
  pauseCount: v.number(),
});

// A statement in this session that conflicts with something the witness said in an earlier session.
export const priorInconsistency = v.object({
  question: v.string(),
  currentAnswer: v.string(),
  previousQuestion: v.string(),
  previousAnswer: v.string(),
  previousDate: v.string(),
  explanation: v.string(),
});

export const evalCaseResult = v.object({
  caseId: v.string(),
  title: v.string(),
  ok: v.boolean(),
  error: v.optional(v.string()),
  ms: v.number(),
  readinessScore: v.optional(v.number()),
  inBand: v.optional(v.boolean()),
  weakHits: v.number(),
  weakTotal: v.number(),
  strongHits: v.number(),
  strongTotal: v.number(),
  quotesGrounded: v.number(),
  quotesTotal: v.number(),
  referencesUsed: v.number(),
  scores: v.optional(v.array(v.number())), // readiness score of every repeat, when repeats > 1
});

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
        voice: v.optional(voiceMetrics),
      })
    ),
    startedAt: v.string(),
    endedAt: v.optional(v.string()),
    gradingError: v.optional(v.string()),
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
    gradedBy: v.optional(v.string()),
    gradingMs: v.optional(v.number()),
    fallbacks: v.optional(v.array(v.string())),
    references: v.optional(v.array(coachingReference)),
    priorInconsistencies: v.optional(v.array(priorInconsistency)),
    // Answers addressed to the AI grader (prompt-injection attempts); graded as testimony, never followed.
    manipulationAttempts: v.optional(v.array(v.string())),
    rawJson: v.optional(v.string()),
  })
    .index("by_session", ["sessionId"])
    .index("by_client", ["clientId"])
    .index("by_matter", ["matterId"]),

  // Coaching library for retrieval (RAG). Embeddings: gemini-embedding-001, 768 dims.
  coaching_examples: defineTable({
    ...coachingReference.fields,
    embedding: v.array(v.float64()),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 768,
    filterFields: ["dimension"],
  }),

  // Every graded answer, embedded, so later sessions can be checked against prior statements.
  answer_memories: defineTable({
    clientId: v.id("users"),
    matterId: v.id("matters"),
    sessionId: v.id("sim_sessions"),
    question: v.string(),
    answer: v.string(),
    answeredAt: v.string(),
    embedding: v.array(v.float64()),
  })
    .index("by_client", ["clientId"])
    .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 768, filterFields: ["clientId"] }),

  // One row per eval run; the /evals page subscribes and shows progress live.
  eval_runs: defineTable({
    provider: v.string(),
    model: v.optional(v.string()),
    rag: v.boolean(),
    repeats: v.optional(v.number()),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
    startedAt: v.string(),
    totalCases: v.number(),
    results: v.array(evalCaseResult),
    error: v.optional(v.string()),
  }).index("by_started", ["startedAt"]),
});
