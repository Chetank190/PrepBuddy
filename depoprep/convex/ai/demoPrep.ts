"use node";

import { action } from "../_generated/server";
import { ConvexError } from "convex/values";
import { api, internal } from "../_generated/api";
import { chainJson, embedTexts, parseJson, type ProviderName } from "./grader";
import { tracingEnabled } from "./tracing";

// The disciplined answers to the live-demo matter's five questions.
const DISCIPLINED_ANSWERS = [
  "Alex Doe, registered nurse.",
  "To work.",
  "I don't recall the exact speed.",
  "No.",
  "No.",
];

/**
 * Pre-talk warm-up: runs and grades a disciplined session for the demo witness, so the live chatty run
 * has earlier statements to contradict ("Changed since last time") and the providers are warm.
 */
export const runDisciplinedSession = action({
  args: {},
  handler: async (ctx): Promise<number> => {
    const ids = await ctx.runQuery(internal.demoSeed.demoIds, {});
    if (!ids) throw new ConvexError("Run Demo Data first.");
    const sessionId = await ctx.runMutation(api.simSessions.create, ids);
    for (const answer of DISCIPLINED_ANSWERS) {
      await ctx.runMutation(api.simSessions.postNextQuestion, { sessionId });
      await ctx.runMutation(api.simSessions.addMessage, { sessionId, role: "client", content: answer });
    }
    await ctx.runMutation(api.simSessions.postNextQuestion, { sessionId });
    await ctx.runMutation(api.simSessions.complete, { sessionId });
    await ctx.runAction(api.ai.feedbackEvaluator.generateFeedback, { sessionId });
    const feedback = await ctx.runQuery(api.simFeedback.getBySession, { sessionId });
    return feedback?.readinessScore ?? 0;
  },
});

export type PreflightCheck = { name: string; status: "ok" | "warn" | "fail"; detail: string };

const PING_SCHEMA = { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] };

/**
 * Pre-talk preflight: one tiny call per provider through the real chain code (so Claude's structured
 * output and Gemini's schema are exercised too), the embedding model, Langfuse auth, demo data, and
 * leftover test overrides such as GEMINI_MODEL from the "break the provider" trick. Costs well under a cent.
 */
export const preflight = action({
  args: {},
  handler: async (ctx): Promise<PreflightCheck[]> => {
    const checks: PreflightCheck[] = [];
    const add = (name: string, status: PreflightCheck["status"], detail: string) =>
      checks.push({ name, status, detail });

    for (const name of ["GEMINI_MODEL", "GROQ_MODEL", "CLAUDE_MODEL", "GRADER_ORDER", "GRADER_RAG", "FOLLOW_UPS"]) {
      const value = process.env[name];
      if (value) add(`${name} override`, "warn", `Set to "${value}". If it's left over from a test, remove it: npx convex env remove ${name}`);
    }

    const providers: Array<{ name: ProviderName; label: string; key: string }> = [
      { name: "gemini", label: "Gemini (grader 1)", key: "GEMINI_API_KEY" },
      { name: "claude", label: "Claude (grader 2)", key: "ANTHROPIC_API_KEY" },
      { name: "groq", label: "Groq (grader 3, follow-ups 1)", key: "GROQ_API_KEY" },
    ];
    await Promise.all(
      providers.map(async (p) => {
        if (!process.env[p.key]) {
          add(p.label, p.name === "gemini" ? "fail" : "warn", `${p.key} is not set`);
          return;
        }
        // Gemini's free tier fails intermittently (503s, hung requests), so one ping can't tell flaky from down.
        const pings = p.name === "gemini" ? 3 : 1;
        const times: string[] = [];
        const errors: string[] = [];
        let model = "";
        let slow = false;
        for (let i = 0; i < pings; i++) {
          try {
            const result = await chainJson({
              prompt: 'Health check. Return the JSON object {"ok": true}.',
              schema: PING_SCHEMA,
              parse: (raw) => {
                if ((parseJson(raw) as { ok?: unknown }).ok !== true) throw new Error("Unexpected reply.");
                return true;
              },
              only: p.name,
              timeoutMs: 10_000,
              maxTokens: 200,
            });
            model = result.model;
            times.push(`${(result.ms / 1000).toFixed(1)} s`);
            // A ping is far smaller than a grade; slow here means a grade may hit the 10 s timeout.
            slow ||= result.ms > 5_000;
          } catch (err) {
            // First sentence only: "Gemini (…) returned 503: This model is currently experiencing high demand."
            const message = (err instanceof Error ? err.message : String(err)).replace(/^\w+: /, "");
            errors.push(message.split(/(?<=\.)\s/)[0].slice(0, 160));
          }
        }
        // Advice for the day of a demo: an unreliable Gemini makes every grade wait out its timeout first.
        const advice =
          p.name === "gemini" && (errors.length > 0 || slow) && !process.env.GRADER_ORDER
            ? " To grade with Claude first: npx convex env set GRADER_ORDER claude,gemini,groq"
            : "";
        if (times.length === 0) {
          add(p.label, p.name === "gemini" ? "warn" : "fail", `${errors[0].replace(/\.?$/, ".")}${advice}`);
        } else {
          const counted = pings > 1 ? `${times.length}/${pings} answered` : "answered";
          const failed = errors.length ? `; failed: ${errors[0].replace(/\.?$/, ".")}` : ".";
          add(p.label, errors.length || slow ? "warn" : "ok", `${model} ${counted} in ${times.join(", ")}${failed}${advice}`);
        }
      }),
    );

    if (process.env.GEMINI_API_KEY) {
      const started = Date.now();
      try {
        await embedTexts(["health check"], "SEMANTIC_SIMILARITY");
        add("Embeddings (RAG, memory)", "ok", `gemini-embedding-001 in ${((Date.now() - started) / 1000).toFixed(1)} s`);
      } catch (err) {
        add("Embeddings (RAG, memory)", "fail", (err instanceof Error ? err.message : String(err)).slice(0, 200));
      }
    }

    if (!tracingEnabled()) {
      add("Langfuse tracing", "warn", "LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not set: no traces to show");
    } else {
      const baseUrl = (process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com").replace(/\/+$/, "");
      const auth = Buffer.from(`${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`).toString("base64");
      try {
        const res = await fetch(`${baseUrl}/api/public/projects`, {
          headers: { Authorization: `Basic ${auth}` },
          signal: AbortSignal.timeout(8_000),
        });
        add(
          "Langfuse tracing",
          res.ok ? "ok" : "fail",
          res.ok ? `Keys accepted by ${baseUrl}` : `${baseUrl} returned ${res.status} (401 usually means the wrong region URL)`,
        );
      } catch (err) {
        add("Langfuse tracing", "fail", `${baseUrl} unreachable: ${err instanceof Error ? err.message : err}`);
      }
    }

    const ids = await ctx.runQuery(internal.demoSeed.demoIds, {});
    add("Demo data", ids ? "ok" : "fail", ids ? "Demo lawyer, witness and matter exist" : "Missing: click Demo Data on /seed");

    const order = ["fail", "warn", "ok"];
    return checks.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  },
});
