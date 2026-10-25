# PrepBuddy — a mock deposition that teaches witnesses to say less

PrepBuddy prepares legal witnesses for depositions. Witnesses pass short training modules, sit a mock deposition built from **their lawyer's own questions** (by text or voice), and an **LLM judge** grades the transcript in about three seconds — quoting the riskiest answers word for word so the lawyer can check every grade.

Built for a legal hackathon; presented at **AI Tinkerers Markham (Oct 27 2026)**. The app lives in [`depoprep/`](depoprep).

## The AI design

**Let the LLM judge, not drive.** The first version had an LLM play opposing counsel. It was replaced by lawyer-scripted questions: the questions are the lawyer's strategy, every witness gets the same test (so scores are comparable), and LLM calls dropped from ~16 per session to **one**.

```
Witness answers (text / Web Speech API)          ──►  Convex DB (reactive)
        │                                                   ▲
        ▼                                                   │ ctx.runMutation
"End & Get Feedback" ──► Convex action: generateFeedback ───┘
                           1. embed answers (gemini-embedding-001, 768d)
                           2. vector search coaching_examples (Convex vector index)
                           3. grade: Gemini 3.1 Flash-Lite → Groq gpt-oss-120b → Claude Sonnet
                              (schema-enforced JSON, strict validation, 10 s live timeout each)
                           4. save score, rubric, verbatim risk quotes, model, latency
                           5. (optional) export the run as an OpenTelemetry trace to Langfuse
```

- **Rubric:** volunteering, speculation, consistency, brevity, composure (0–100 each, with explanations), readiness score, tips, verbatim risk quotes.
- **No invented grades:** an invalid reply counts as a failure and falls through to the next provider; if all fail, the UI shows the error and a Retry button.
- **Visible chain:** each result shows which model graded it, how long it took, and which providers failed first.
- **Bounded follow-ups (agentic step):** after each scripted answer the LLM may ask **one** follow-up, only about words the witness volunteered or guessed. Code enforces the bounds: the quoted phrase must appear in the answer, and a follow-up is never followed up. Disciplined answers get none.
- **Prior-statement memory:** every graded answer is embedded into a Convex vector index; the next session's answers are matched against earlier ones (cosine ≥ 0.85) and an LLM checks which pairs contradict — "Changed since last time".
- **Voice delivery in the grade:** filler words, delay before answering and pauses (Web Speech API) are passed to the grader for composure.
- **Lawyer-in-the-loop drafting:** "Suggest questions with AI" drafts opposing counsel's likely questions from the case summary and risk areas; the lawyer edits before saving.
- **Retrieval (RAG):** 20 coaching examples (weak answer → better answer) are embedded and stored in a Convex vector index. Retrieved examples are always shown to the witness as "Similar mistakes, better answers"; they go into the grader prompt only for the fallback models (see the eval below). A similarity floor (0.72) removes "hub" examples that matched every short answer.
- **Tracing (optional):** with Langfuse keys set, every AI action (grading, follow-ups, prior-statement checks, question drafts, eval cases) is exported as a trace. See [Tracing](#tracing-langfuse) below.

## Tracing (Langfuse)

Each AI action records a trace: the retrieval step (with every answer's best similarity score), each embedding call, and **every provider attempt in the fallback chain**, including the prompt, the reply, token usage, latency and the error when one failed. A Gemini 503 that falls back to Groq shows up as a red span followed by a green one.

A real trace (Oct 25 2026, Gemini deliberately broken with `GEMINI_MODEL=does-not-exist`):

```
grade-session                 2.80 s  output: score 95, gradedBy openai/gpt-oss-120b
├─ retrieve-coaching          0.45 s  top scores 0.687, 0.652, 0.80, 0.615, 0.615
│  └─ embed                   0.44 s  gemini-embedding-001
├─ prior-statement-check      1.59 s  (runs in parallel with the grade)
│  ├─ embed                   0.30 s
│  └─ contradiction-check     1.23 s
│     ├─ Gemini  ✗ ERROR      0.13 s  does-not-exist returned 404
│     └─ Groq    ✓            1.11 s  openai/gpt-oss-120b, 515 → 345 tokens
└─ grade                      2.33 s
   ├─ Gemini  ✗ ERROR         0.23 s  does-not-exist returned 404
   └─ Groq    ✓               2.10 s  openai/gpt-oss-120b, 698 → 796 tokens
```

With Gemini working, the same session graded in 3.2 s on `gemini-3.1-flash-lite` (548 → 300 tokens). Langfuse also works out the cost per call from the model name.

**What the first traces showed:** the disciplined answer *"I don't recall the exact speed"* retrieved the *speculation* example *"Probably around 60, maybe 65"* at cosine 0.80, above the 0.72 floor. The embedding matched the **topic** (speed), not the **mistake**, so a clean answer got a "similar mistake" card. The similarity floor can't tell those apart; fixing it needs a different approach (for example, retrieving only for answers the grader flags). The results page showed the card but not why; the trace showed which answer pulled it in and at what score.

How it's built (`depoprep/convex/ai/tracing.ts`, about 230 lines, no SDK):

- **OpenTelemetry, by hand.** Spans are collected in memory and sent as OTLP/HTTP JSON to Langfuse's OpenTelemetry endpoint. The payload is standard OTel, so any OTLP backend (Jaeger, Honeycomb, Grafana Tempo) accepts it; only the `langfuse.*` attribute names are Langfuse-specific.
- **Never in the way.** The action hands the spans to a scheduled Convex action (`ctx.scheduler.runAfter(0, …)`), which makes the HTTP call. Grading doesn't wait on Langfuse, and a Langfuse outage only logs a warning.
- **Grouped by deposition.** Follow-up traces and the grading trace share the sim session id, so Langfuse's *Sessions* view shows one deposition end to end. Eval cases are grouped by eval run and tagged `eval`, provider and `rag`/`no-rag`.
- **Off by default.** Nothing is recorded or sent unless `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set in Convex.

**Why not LiteLLM?** LiteLLM is a Python SDK and proxy server. Using it here would mean hosting an extra service next to Convex and Vercel, and its fallbacks trigger on API errors, not on our own JSON validation. The fallback chain in `grader.ts` already does what we need in ~150 readable lines. Tracing gives the visibility a gateway would, without a new hop.

## Evals

`/evals` runs 10 labelled transcripts (different case types from the demo) through one provider at a time and reports, live:

| Grader | Valid JSON | Score in band | Weak caught | Clean kept | Quotes grounded | Median time |
|---|---|---|---|---|---|---|
| Gemini Flash-Lite | 100% | 100% | 93% | 90% | 100% | 2.0 s |
| Gemini Flash-Lite + RAG | 100% | 100% | 86% | 90% | 100% | 2.2 s |
| Groq gpt-oss-120b | 100% | 80% | 86% | 81% | 100% | 2.9 s |
| Groq gpt-oss-120b + RAG | 100% | 100% | 100% | 90% | 100% | 12.8 s* |

One run each, Oct 19 2026, free tiers. *Includes waits for Groq's free-tier limit of 8,000 tokens/minute.
**Quotes grounded** checks every quoted "risky answer" really appears in the transcript — a hallucination check that needs no labels.
**Consistency:** grading every case 3 times with Gemini 3.1 Flash-Lite gave identical scores 29 times out of 30 (average spread ±0.3 points).
Labels were written for this project, not by practising lawyers; treat the numbers as directional.

**What we learned:** retrieval helped the weaker model (Groq) but not the stronger one, so references go into the prompt only for fallbacks. The "bigger" Gemini Flash took **106–122 s** per grade on the free tier versus **~2.8 s** for Flash-Lite, with no accuracy gain on the planted mistakes. And the `gemini-flash-lite-latest` alias later moved to an overloaded model (503s, 20–30 s replies), so the default is now pinned to `gemini-3.1-flash-lite`, which scored 100% weak caught on the eval at 2.4 s median.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Convex (database, reactive queries, Node actions, vector search) · Google Gemini (grader + embeddings) · Groq · Anthropic Claude · Langfuse via OpenTelemetry (optional tracing) · Web Speech API · Tailwind 4 + shadcn/ui (Base UI).

## Run locally

```bash
cd depoprep
npm install
npx convex dev                                   # terminal 1 — creates/links a Convex deployment
npx convex env set GEMINI_API_KEY <key>          # free: https://aistudio.google.com → Get API key
npx convex env set GROQ_API_KEY <key>            # optional free fallback: https://console.groq.com
npm run dev                                      # terminal 2 — http://localhost:3000
```

Open `http://localhost:3000/seed` and click **Demo Data** (creates `demo-lawyer@prepbuddy.dev` / `demo-witness@prepbuddy.dev`, password `demo1234`, a matter with 5 questions, and the coaching vectors). AI keys go in **Convex**, not `.env.local`.

**Optional tracing:** create a free project at [cloud.langfuse.com](https://cloud.langfuse.com) → *Settings → API Keys*, then:

```bash
npx convex env set LANGFUSE_PUBLIC_KEY pk-lf-...
npx convex env set LANGFUSE_SECRET_KEY sk-lf-...
npx convex env set LANGFUSE_BASE_URL https://us.cloud.langfuse.com   # only if your project is in the US region (default: EU)
```

Langfuse Cloud regions are US, EU, Japan and HIPAA; there is no Canada region, and US is the closest to Ontario. Accounts are per region, so sign up at the URL you set.

Grade a session, then open *Tracing* (or *Sessions*) in Langfuse; traces appear within seconds. If nothing appears, check the Convex logs for `Langfuse export failed` (a `401` usually means the wrong region URL).

## Deploy (Vercel + Convex, both free tiers)

1. **Convex cloud:** `cd depoprep && npx convex login`, then `npx convex dev` once to create a cloud project. In the [Convex dashboard](https://dashboard.convex.dev), open the project → **Settings → Deploy keys → Generate production deploy key**.
2. **Production AI keys:** `npx convex env set --prod GEMINI_API_KEY <key>` (and `GROQ_API_KEY`, optionally `ANTHROPIC_API_KEY` and the `LANGFUSE_*` keys).
3. **Vercel:** import this GitHub repo, set **Root Directory = `depoprep`**, and add the environment variable `CONVEX_DEPLOY_KEY` (the production key). `depoprep/vercel.json` already sets the build command `npx convex deploy --cmd 'npm run build'`, which deploys the Convex functions and builds Next.js with the right `NEXT_PUBLIC_CONVEX_URL`.
4. After the first deploy, open `https://<your-app>.vercel.app/seed` and click **Demo Data**.

## Free hosting

Everything runs on free tiers with no custom domain: the app is served at `https://<project>.vercel.app`, the backend on a `*.convex.cloud` URL, the AI on free Gemini and Groq keys, and tracing on Langfuse Cloud's free Hobby plan. Vercel's free Hobby plan is for non-commercial use, which fits a demo. Usage for a talk (a few dozen sessions and evals) is far below the free quotas.

## Caveats

- Hackathon auth: passwords are SHA-256 hashed in the browser and sessions live in localStorage. The hash is compared on the server and never returned to clients, but this is not production auth.
- Write paths the browser doesn't need are internal Convex functions (saving feedback, grading errors, the unused v1 opponent), so a public deployment can't be used as an open LLM proxy.
- `/seed` and `/evals` are public on a deployed site: anyone can reset the demo witness or start an eval. Evals are limited to one every 2 minutes to protect free-tier quota.
- Free-tier providers may use prompts to improve their models — use demo transcripts only, never real client data.
- With tracing on, full transcripts and prompts are stored in Langfuse. That's useful for debugging, but it's one more place client data would live.

## What's next

Ideas that fit the same stack (TypeScript, Convex, Vercel) and teach a production pattern:

- **Evals in CI:** run the 10 eval cases in a GitHub Action on every PR and fail if "weak caught" or "quotes grounded" drops: regression tests for prompts.
- **Convex components:** `@convex-dev/rate-limiter` (per-user grading limits), `@convex-dev/workflow` (grading as durable, individually retried steps).
- **One schema in Zod:** the rubric shape is written three times (Gemini schema, `parseFeedback`, Convex validator); derive all three from one Zod schema.
- **Langfuse scores:** attach eval results and lawyer thumbs-up/down to traces as Langfuse scores, so grader quality is tracked over time.
- **Streaming tips** with Convex's persistent-text-streaming component.
- **Retrieval that matches mistakes, not topics:** see the finding under [Tracing](#tracing-langfuse).
