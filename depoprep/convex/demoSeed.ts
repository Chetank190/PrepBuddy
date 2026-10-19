import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { insertTrainingModules } from "./basicModules";

// Fixed demo accounts so a live demo can skip registration, matter setup and training.
export const DEMO_LAWYER_EMAIL = "demo-lawyer@prepbuddy.dev";
export const DEMO_CLIENT_EMAIL = "demo-witness@prepbuddy.dev";

type DemoMatter = {
  title: string;
  eventType: "deposition" | "trial_testimony" | "settlement_conference";
  daysFromNow: number;
  caseSummary: string;
  riskTags: string[];
  persona: "calm_precise" | "aggressive" | "friendly_manipulative";
  customQuestions: string[];
};

// One matter per event type, built on common civil claims. The first is the scripted live-demo matter.
const DEMO_MATTERS: DemoMatter[] = [
  {
    title: "Demo — Rear-end collision on Highway 7",
    eventType: "deposition",
    daysFromNow: 14,
    caseSummary:
      "Client was rear-ended at a red light. Opposing counsel will probe speed, phone use and prior injuries.",
    riskTags: ["phone use", "speed", "prior injuries"],
    persona: "calm_precise",
    customQuestions: [
      "Please state your full name and your occupation for the record.",
      "Where were you going on the morning of the accident?",
      "How fast were you driving just before the collision?",
      "Were you using your phone at any point during that drive?",
      "Is there anything about that morning you haven't told your lawyer?",
    ],
  },
  {
    title: "Grocery store slip and fall — premises liability",
    eventType: "deposition",
    daysFromNow: 23,
    caseSummary:
      "Client slipped on a wet floor near the produce section of a FreshCo store and fractured a wrist. The store says a warning sign was posted and the spill had been there under five minutes. Client had a prior wrist sprain in 2022 and was wearing sandals.",
    riskTags: ["footwear", "warning signs", "prior injury", "distraction"],
    persona: "aggressive",
    customQuestions: [
      "What time did you arrive at the store that day?",
      "What were you wearing on your feet?",
      "Did you see any warning sign before you fell?",
      "Were you looking at your phone or your shopping list when you fell?",
      "Have you ever injured that wrist before?",
      "How long had the liquid been on the floor before you fell?",
    ],
  },
  {
    title: "Wrongful dismissal — warehouse supervisor",
    eventType: "trial_testimony",
    daysFromNow: 41,
    caseSummary:
      "Client was dismissed after nine years as a warehouse supervisor, two weeks after reporting a safety violation. The employer alleges poor performance and cites a written warning from last year. The claim is for wrongful dismissal and reprisal.",
    riskTags: ["written warning", "performance reviews", "timing of complaint", "mitigation / job search"],
    persona: "friendly_manipulative",
    customQuestions: [
      "You received a written warning in March of last year, correct?",
      "Did you agree with that warning when you signed it?",
      "When did you first report the safety issue, and to whom?",
      "Isn't it true your team missed its targets three months in a row?",
      "How many jobs have you applied for since you were let go?",
    ],
  },
  {
    title: "Kitchen renovation contract — breach and deficiencies",
    eventType: "settlement_conference",
    daysFromNow: 9,
    caseSummary:
      "Client hired a contractor for a $48,000 kitchen renovation. The work finished six weeks late with cabinet and electrical deficiencies, and client withheld the final $12,000 payment. The contractor claims the balance plus interest; client counterclaims for repair costs.",
    riskTags: ["change orders", "payment withheld", "written notice of defects", "repair estimates"],
    persona: "calm_precise",
    customQuestions: [
      "Did you approve any changes to the original design in writing?",
      "When did you first tell the contractor about the deficiencies?",
      "Why did you withhold the final payment rather than pay and claim back?",
      "Have you obtained a written estimate for the repairs?",
      "What amount would you accept to resolve this today?",
    ],
  },
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
    for (const { daysFromNow, ...matter } of DEMO_MATTERS) {
      const fields = {
        ...matter,
        eventDate: new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      };
      let matterId = matters.find((m) => m.title === matter.title)?._id;
      if (matterId) await ctx.db.patch(matterId, fields);
      else matterId = await ctx.db.insert("matters", { lawyerId, ...fields });

      const link = await ctx.db
        .query("matter_clients")
        .withIndex("by_matter", (q) => q.eq("matterId", matterId))
        .filter((q) => q.eq(q.field("clientId"), clientId))
        .first();
      if (!link) await ctx.db.insert("matter_clients", { matterId, clientId });
    }

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
