import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { insertTrainingModules } from "./basicModules";

// Fixed demo accounts so a live demo can skip registration, matter setup and training.
export const DEMO_LAWYER_EMAIL = "demo-lawyer@prepbuddy.dev";
export const DEMO_CLIENT_EMAIL = "demo-witness@prepbuddy.dev";
const DEMO_MATTER_TITLE = "Demo — Rear-end collision on Highway 7";

const DEMO_QUESTIONS = [
  "Please state your full name and your occupation for the record.",
  "Where were you going on the morning of the accident?",
  "How fast were you driving just before the collision?",
  "Were you using your phone at any point during that drive?",
  "Is there anything about that morning you haven't told your lawyer?",
];

export const seedDemo = mutation({
  args: { passwordHash: v.string() },
  handler: async (ctx, args) => {
    // Training modules must exist before progress can be marked.
    if (!(await ctx.db.query("basic_modules").first())) {
      await insertTrainingModules(ctx);
    }

    const upsertUser = async (email: string, name: string, role: "lawyer" | "client") => {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { passwordHash: args.passwordHash });
        return existing._id;
      }
      return await ctx.db.insert("users", { email, name, role, passwordHash: args.passwordHash });
    };

    const lawyerId = await upsertUser(DEMO_LAWYER_EMAIL, "Demo Lawyer", "lawyer");
    const clientId = await upsertUser(DEMO_CLIENT_EMAIL, "Demo Witness", "client");

    const matters = await ctx.db
      .query("matters")
      .withIndex("by_lawyerId", (q) => q.eq("lawyerId", lawyerId))
      .collect();
    let matterId = matters.find((m) => m.title === DEMO_MATTER_TITLE)?._id;
    if (!matterId) {
      matterId = await ctx.db.insert("matters", {
        lawyerId,
        title: DEMO_MATTER_TITLE,
        eventType: "deposition",
        eventDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        caseSummary:
          "Client was rear-ended at a red light. Opposing counsel will probe speed, phone use and prior injuries.",
        riskTags: ["phone use", "speed", "prior injuries"],
        customQuestions: DEMO_QUESTIONS,
        persona: "calm_precise",
      });
    } else {
      await ctx.db.patch(matterId, { customQuestions: DEMO_QUESTIONS });
    }

    const link = await ctx.db
      .query("matter_clients")
      .withIndex("by_matter", (q) => q.eq("matterId", matterId))
      .filter((q) => q.eq(q.field("clientId"), clientId))
      .first();
    if (!link) await ctx.db.insert("matter_clients", { matterId, clientId });

    // Re-seeding resets the demo witness to a clean slate before a talk.
    const oldSessions = await ctx.db
      .query("sim_sessions")
      .withIndex("by_client", (q) => q.eq("clientId", clientId))
      .collect();
    for (const s of oldSessions) await ctx.db.delete(s._id);
    const oldFeedback = await ctx.db
      .query("sim_feedback")
      .withIndex("by_client", (q) => q.eq("clientId", clientId))
      .collect();
    for (const f of oldFeedback) await ctx.db.delete(f._id);

    // Mark every module passed so the simulation is unlocked.
    const modules = await ctx.db.query("basic_modules").collect();
    for (const mod of modules) {
      const progress = await ctx.db
        .query("module_progress")
        .withIndex("by_client_module", (q) => q.eq("clientId", clientId).eq("moduleId", mod._id))
        .first();
      const passed = {
        status: "completed" as const,
        score: 100,
        completedAt: new Date().toISOString(),
      };
      if (progress) await ctx.db.patch(progress._id, passed);
      else await ctx.db.insert("module_progress", { clientId, moduleId: mod._id, ...passed });
    }

    return { lawyerEmail: DEMO_LAWYER_EMAIL, clientEmail: DEMO_CLIENT_EMAIL };
  },
});
