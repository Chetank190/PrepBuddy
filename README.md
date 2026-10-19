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
```

- **Rubric:** volunteering, speculation, consistency, brevity, composure (0–100 each, with explanations), readiness score, tips, verbatim risk quotes.
- **No invented grades:** an invalid reply counts as a failure and falls through to the next provider; if all fail, the UI shows the error and a Retry button.
- **Visible chain:** each result shows which model graded it, how long it took, and which providers failed first.
- **Retrieval (RAG):** 20 coaching examples (weak answer → better answer) are embedded and stored in a Convex vector index. Retrieved examples are always shown to the witness as "Similar mistakes, better answers"; they go into the grader prompt only for the fallback models (see the eval below).

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
Labels were written for this project, not by practising lawyers; treat the numbers as directional.

**What we learned:** retrieval helped the weaker model (Groq) but not the stronger one, so references go into the prompt only for fallbacks. The "bigger" Gemini Flash took **106–122 s** per grade on the free tier versus **~2.8 s** for Flash-Lite, with no accuracy gain on the planted mistakes. And the `gemini-flash-lite-latest` alias later moved to an overloaded model (503s, 20–30 s replies), so the default is now pinned to `gemini-3.1-flash-lite`, which scored 100% weak caught on the eval at 2.4 s median.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Convex (database, reactive queries, Node actions, vector search) · Google Gemini (grader + embeddings) · Groq · Anthropic Claude · Web Speech API · Tailwind 4 + shadcn/ui (Base UI).

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

## Deploy (Vercel + Convex, both free tiers)

1. **Convex cloud:** `cd depoprep && npx convex login`, then `npx convex dev` once to create a cloud project. In the [Convex dashboard](https://dashboard.convex.dev), open the project → **Settings → Deploy keys → Generate production deploy key**.
2. **Production AI keys:** `npx convex env set --prod GEMINI_API_KEY <key>` (and `GROQ_API_KEY`, optionally `ANTHROPIC_API_KEY`).
3. **Vercel:** import this GitHub repo, set **Root Directory = `depoprep`**, and add the environment variable `CONVEX_DEPLOY_KEY` (the production key). `depoprep/vercel.json` already sets the build command `npx convex deploy --cmd 'npm run build'`, which deploys the Convex functions and builds Next.js with the right `NEXT_PUBLIC_CONVEX_URL`.
4. After the first deploy, open `https://<your-app>.vercel.app/seed` and click **Demo Data**.

## Free hosting

Everything runs on free tiers with no custom domain: the app is served at `https://<project>.vercel.app`, the backend on a `*.convex.cloud` URL, and the AI on free Gemini and Groq keys. Vercel's free Hobby plan is for non-commercial use, which fits a demo. Usage for a talk (a few dozen sessions and evals) is far below the free quotas.

## Caveats

- Hackathon auth: passwords are SHA-256 hashed in the browser and sessions live in localStorage. The hash is compared on the server and never returned to clients, but this is not production auth.
- Write paths the browser doesn't need are internal Convex functions (saving feedback, grading errors, the unused v1 opponent), so a public deployment can't be used as an open LLM proxy.
- `/seed` and `/evals` are public on a deployed site: anyone can reset the demo witness or start an eval. Evals are limited to one every 2 minutes to protect free-tier quota.
- Free-tier providers may use prompts to improve their models — use demo transcripts only, never real client data.
