"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FlaskConical, Loader2, Play } from "lucide-react";
import { toast } from "sonner";

type Provider = "gemini" | "groq" | "claude";

const PROVIDERS: Array<{ value: Provider; label: string }> = [
  { value: "gemini", label: "Gemini Flash-Lite" },
  { value: "groq", label: "Groq gpt-oss-120b" },
  { value: "claude", label: "Claude Sonnet" },
];

function pct(hits: number, total: number) {
  return total === 0 ? "—" : `${Math.round((100 * hits) / total)}%`;
}

function summarize(run: Doc<"eval_runs">) {
  const ok = run.results.filter((r) => r.ok);
  const sum = (f: (r: (typeof run.results)[number]) => number) => run.results.reduce((a, r) => a + f(r), 0);
  const times = ok.map((r) => r.ms).sort((a, b) => a - b);
  // Consistency: how far apart repeated grades of the same transcript landed (max − min), averaged.
  const spreads = ok.filter((r) => r.scores && r.scores.length > 1).map((r) => Math.max(...r.scores!) - Math.min(...r.scores!));
  return {
    spread: spreads.length ? `±${(spreads.reduce((a, b) => a + b, 0) / spreads.length / 2).toFixed(1)}` : "—",
    valid: pct(ok.length, run.results.length),
    band: pct(ok.filter((r) => r.inBand).length, ok.length),
    weak: pct(sum((r) => r.weakHits), sum((r) => r.weakTotal)),
    strong: pct(sum((r) => r.strongHits), sum((r) => r.strongTotal)),
    grounded: pct(sum((r) => r.quotesGrounded), sum((r) => r.quotesTotal)),
    median: times.length ? `${(times[Math.floor(times.length / 2)] / 1000).toFixed(1)} s` : "—",
  };
}

const METRICS = [
  { key: "valid", label: "Valid JSON", help: "Reply passed schema validation" },
  { key: "band", label: "Score in band", help: "Readiness score inside the labelled range" },
  { key: "weak", label: "Weak caught", help: "Planted problems scored below 70" },
  { key: "strong", label: "Clean kept", help: "Problem-free dimensions scored 70+" },
  { key: "grounded", label: "Quotes grounded", help: "Quoted risky answers that really appear in the transcript" },
  { key: "spread", label: "Consistency", help: "Half the average gap between repeated grades of the same case (needs ×3 repeats)" },
  { key: "median", label: "Median time", help: "Per case, including retrieval" },
] as const;

export default function EvalsPage() {
  const runs = useQuery(api.evals.listRuns, {});
  const cases = useQuery(api.evals.listCases, {});
  const runEval = useAction(api.ai.evals.run);
  const [provider, setProvider] = useState<Provider>("gemini");
  const [rag, setRag] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [starting, setStarting] = useState(false);
  const [openRun, setOpenRun] = useState<Id<"eval_runs"> | null>(null);

  const running = runs?.some((r) => r.status === "running") ?? false;

  const handleRun = async () => {
    setStarting(true);
    // The action runs for ~30–90 s; progress arrives through the reactive listRuns query.
    runEval({ provider, rag, repeats: repeat ? 3 : 1 })
      .catch((err) => toast.error(err instanceof ConvexError ? String(err.data) : "Eval failed"))
      .finally(() => setStarting(false));
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <Link href="/lawyer" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to app
        </Link>

        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FlaskConical className="w-7 h-7 text-primary" />
            Grader Evals
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl">
            {cases?.length ?? 10}{" "}labelled deposition transcripts, graded by one provider at a time (no fallback).
            &ldquo;RAG&rdquo; adds coaching examples retrieved by vector search to the prompt. Labels were written for
            this project, not by practising lawyers.
          </p>
        </div>

        <Card>
          <CardContent className="p-6 flex flex-wrap items-center gap-4">
            <div className="flex gap-2">
              {PROVIDERS.map((p) => (
                <Button
                  key={p.value}
                  variant={provider === p.value ? "default" : "outline"}
                  onClick={() => setProvider(p.value)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-base cursor-pointer">
              <input type="checkbox" checked={rag} onChange={(e) => setRag(e.target.checked)} className="w-4 h-4" />
              RAG (coaching references in prompt)
            </label>
            <label className="flex items-center gap-2 text-base cursor-pointer">
              <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="w-4 h-4" />
              Grade each case ×3 (consistency)
            </label>
            <Button size="lg" className="ml-auto" onClick={() => void handleRun()} disabled={running || starting}>
              {running || starting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              {running ? "Eval running…" : "Run eval"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Runs</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {!runs ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : runs.length === 0 ? (
              <p className="text-muted-foreground">No runs yet. Pick a provider and click Run eval.</p>
            ) : (
              <table className="w-full text-base">
                <thead>
                  <tr className="text-left text-sm text-muted-foreground border-b">
                    <th className="py-2 pr-4 font-medium">Grader</th>
                    {METRICS.map((m) => (
                      <th key={m.key} className="py-2 pr-4 font-medium text-right" title={m.help}>
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const s = summarize(run);
                    return (
                      <Fragment key={run._id}>
                        <tr
                          className="border-b cursor-pointer hover:bg-muted/50"
                          onClick={() => setOpenRun(openRun === run._id ? null : run._id)}
                        >
                          <td className="py-3 pr-4">
                            <div className="font-medium flex items-center gap-2">
                              {run.model ?? run.provider}
                              {run.rag && <Badge variant="secondary">RAG</Badge>}
                              {(run.repeats ?? 1) > 1 && <Badge variant="secondary">×{run.repeats}</Badge>}
                              {run.status === "running" && (
                                <Badge variant="outline" className="gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  {run.results.length}/{run.totalCases}
                                </Badge>
                              )}
                              {run.status === "error" && <Badge variant="destructive">error</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(run.startedAt).toLocaleString()}
                            </div>
                          </td>
                          {METRICS.map((m) => (
                            <td key={m.key} className="py-3 pr-4 text-right font-mono">
                              {s[m.key]}
                            </td>
                          ))}
                        </tr>
                        {openRun === run._id && (
                          <tr className="border-b bg-muted/30">
                            <td colSpan={METRICS.length + 1} className="p-4">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-muted-foreground">
                                    <th className="pb-2 font-medium">Case</th>
                                    <th className="pb-2 font-medium text-right">Score</th>
                                    <th className="pb-2 font-medium text-right">Weak</th>
                                    <th className="pb-2 font-medium text-right">Clean</th>
                                    <th className="pb-2 font-medium text-right">Quotes</th>
                                    <th className="pb-2 font-medium text-right">Refs</th>
                                    <th className="pb-2 font-medium text-right">Time</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {run.results.map((r) => (
                                    <tr key={r.caseId} className="border-t">
                                      <td className="py-1.5 pr-4">
                                        {r.title}
                                        {r.error && <div className="text-xs text-red-600 truncate max-w-xl">{r.error}</div>}
                                      </td>
                                      <td className={`py-1.5 text-right font-mono ${r.inBand === false ? "text-red-600" : ""}`}>
                                        {r.scores ? r.scores.join(" / ") : (r.readinessScore ?? "—")}
                                      </td>
                                      <td className="py-1.5 text-right font-mono">{r.weakHits}/{r.weakTotal}</td>
                                      <td className="py-1.5 text-right font-mono">{r.strongHits}/{r.strongTotal}</td>
                                      <td className="py-1.5 text-right font-mono">{r.quotesGrounded}/{r.quotesTotal}</td>
                                      <td className="py-1.5 text-right font-mono">{r.referencesUsed}</td>
                                      <td className="py-1.5 text-right font-mono">{(r.ms / 1000).toFixed(1)} s</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {cases && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Test cases</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {cases.map((c) => (
                <div key={c.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{c.title}</p>
                  <p className="text-muted-foreground">
                    Band {c.band[0]}–{c.band[1]}
                    {c.weak.length > 0 && ` · weak: ${c.weak.join(", ")}`}
                    {c.strong.length > 0 && ` · clean: ${c.strong.join(", ")}`}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
