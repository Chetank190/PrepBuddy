# PrepBuddy app (`depoprep`)

See the [repository README](../README.md) for the overview, AI design, tracing, eval results and deploy steps.

```bash
npm install
npx convex dev     # terminal 1
npm run dev        # terminal 2 → http://localhost:3000, then /seed → Demo Data
```

AI keys live in Convex: `npx convex env set GEMINI_API_KEY <key>` (required), `GROQ_API_KEY` and `ANTHROPIC_API_KEY` (fallbacks), and optionally `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` for tracing.

Where the AI code lives: `convex/ai/grader.ts` (prompt, provider fallback chain, retrieval), `convex/ai/tracing.ts` (Langfuse/OpenTelemetry export), and one file per action (`feedbackEvaluator`, `followUp`, `memory`, `questionDrafts`, `evals`).
