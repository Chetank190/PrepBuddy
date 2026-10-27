"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle, Database, Loader2, Stethoscope } from "lucide-react";
import { hashPassword } from "@/lib/hash";

const DEMO_PASSWORD = "demo1234";

type SeedStatus = "idle" | "loading" | "done" | "error";

function SeedCard({
  title,
  description,
  items,
  onSeed,
  status,
  message,
}: {
  title: string;
  description: string;
  items: string[];
  onSeed: () => void;
  status: SeedStatus;
  message: string;
}) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <Database className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm text-muted-foreground">
          {items.map((item) => (
            <p key={item}>✓ {item}</p>
          ))}
        </div>
        {status === "done" && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            <CheckCircle className="w-4 h-4" />
            {message}
          </div>
        )}
        {status === "error" && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            Error: {message}
          </div>
        )}
        <Button className="w-full" onClick={onSeed} disabled={status === "loading"}>
          {status === "loading" ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Seeding...</>
          ) : status === "done" ? (
            <><CheckCircle className="w-4 h-4 mr-2" />Done — Seed Again</>
          ) : (
            <><Database className="w-4 h-4 mr-2" />Seed</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

type PreflightCheck = { name: string; status: "ok" | "warn" | "fail"; detail: string };

const CHECK_STYLES: Record<PreflightCheck["status"], string> = {
  ok: "bg-green-50 border-green-200 text-green-800",
  warn: "bg-amber-50 border-amber-200 text-amber-900",
  fail: "bg-red-50 border-red-200 text-red-800",
};

// One tiny call per AI provider, plus embeddings, Langfuse, demo data and leftover test overrides.
function PreflightCard() {
  const preflight = useAction(api.ai.demoPrep.preflight);
  const [checks, setChecks] = useState<PreflightCheck[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setRunning(true);
    setError("");
    try {
      setChecks(await preflight({}));
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Preflight Check</CardTitle>
            <CardDescription>Before presenting: are the AI providers and tracing up?</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {checks?.map((c) => (
          <div key={c.name} className={`p-3 border rounded-lg text-sm ${CHECK_STYLES[c.status]}`}>
            <p className="font-medium">
              {c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "✗"} {c.name}
            </p>
            <p className="text-xs mt-0.5 break-words">{c.detail}</p>
          </div>
        ))}
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">Error: {error}</div>}
        <Button className="w-full" onClick={run} disabled={running}>
          {running ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Checking (up to 30 s)...</>
          ) : (
            <><Stethoscope className="w-4 h-4 mr-2" />{checks ? "Check Again" : "Run Checks"}</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SeedPage() {
  const seedModules = useMutation(api.basicModules.seed);
  const seedEFD = useMutation(api.basicModules.seedEFD);
  const seedDemo = useMutation(api.demoSeed.seedDemo);
  const seedCoaching = useAction(api.ai.coachingSeed.seed);
  const coachingCount = useQuery(api.coaching.count, {});
  const warmUp = useAction(api.ai.demoPrep.runDisciplinedSession);
  const [warmStatus, setWarmStatus] = useState<SeedStatus>("idle");
  const [warmMsg, setWarmMsg] = useState("");

  const handleWarmUp = async () => {
    setWarmStatus("loading");
    try {
      const score = await warmUp({});
      setWarmMsg(`Disciplined session graded ${score}. The live chatty run will be compared with it.`);
      setWarmStatus("done");
    } catch (e) {
      setWarmMsg(String(e));
      setWarmStatus("error");
    }
  };

  const [baseStatus, setBaseStatus] = useState<SeedStatus>("idle");
  const [baseMsg, setBaseMsg] = useState("");
  const [efdStatus, setEfdStatus] = useState<SeedStatus>("idle");
  const [efdMsg, setEfdMsg] = useState("");
  const [demoStatus, setDemoStatus] = useState<SeedStatus>("idle");
  const [demoMsg, setDemoMsg] = useState("");
  const [coachStatus, setCoachStatus] = useState<SeedStatus>("idle");
  const [coachMsg, setCoachMsg] = useState("");

  const handleCoaching = async () => {
    setCoachStatus("loading");
    try {
      const count = await seedCoaching({});
      setCoachMsg(`${count} coaching examples embedded and indexed.`);
      setCoachStatus("done");
    } catch (e) {
      setCoachMsg(String(e));
      setCoachStatus("error");
    }
  };

  const handleBase = async () => {
    setBaseStatus("loading");
    try {
      const result = await seedModules({});
      setBaseMsg(result === "already seeded" ? "Already seeded!" : "5 training modules seeded.");
      setBaseStatus("done");
    } catch (e) {
      setBaseMsg(String(e));
      setBaseStatus("error");
    }
  };

  const handleEFD = async () => {
    setEfdStatus("loading");
    try {
      const result = await seedEFD({});
      setEfdMsg(result === "EFD modules already seeded" ? "Already seeded!" : "4 EFD modules seeded.");
      setEfdStatus("done");
    } catch (e) {
      setEfdMsg(String(e));
      setEfdStatus("error");
    }
  };

  const handleDemo = async () => {
    setDemoStatus("loading");
    try {
      const result = await seedDemo({ passwordHash: await hashPassword(DEMO_PASSWORD) });
      // The coaching library needs embeddings (an action); build it once if it's empty.
      if (coachingCount === 0) await seedCoaching({});
      setDemoMsg(`Log in as ${result.lawyerEmail} or ${result.clientEmail} (password: ${DEMO_PASSWORD}).`);
      setDemoStatus("done");
    } catch (e) {
      setDemoMsg(String(e));
      setDemoStatus("error");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 p-4">
      <div className="text-center mb-2">
        <h1 className="text-2xl font-bold">Database Seed</h1>
        <p className="text-muted-foreground text-sm mt-1">Run both seeds once to initialize all training content.</p>
      </div>

      <SeedCard
        title="Basic Training Modules"
        description="Examination for Discovery flashcards + quizzes (5 modules)"
        items={[
          "What is an Examination for Discovery?",
          "Pre-Event Checklist",
          "Procedural Environment",
          "Legal Word Training",
          "How to Answer Questions",
        ]}
        onSeed={handleBase}
        status={baseStatus}
        message={baseMsg}
      />

      <SeedCard
        title="Re-run Seed (same content)"
        description="Only needed if the database was cleared — skips if already seeded"
        items={[
          "Same 5 modules as Basic Training",
          "Use only when training list is empty",
        ]}
        onSeed={handleEFD}
        status={efdStatus}
        message={efdMsg}
      />

      <SeedCard
        title="Demo Data"
        description="Ready-to-present lawyer, witness and matter"
        items={[
          "Demo lawyer and demo witness accounts",
          "A deposition matter with 5 scripted questions",
          "Witness assigned and all training passed",
        ]}
        onSeed={handleDemo}
        status={demoStatus}
        message={demoMsg}
      />

      <PreflightCard />

      <SeedCard
        title="Pre-talk Warm-up"
        description="Run after Demo Data, right before presenting"
        items={[
          "Runs and grades a disciplined session for the demo witness",
          "Gives the live chatty run earlier answers to contradict",
          "Warms up the AI providers",
        ]}
        onSeed={handleWarmUp}
        status={warmStatus}
        message={warmMsg}
      />

      <SeedCard
        title="Coaching Library (vectors)"
        description={`Gemini embeddings + Convex vector index · ${coachingCount ?? "…"} examples stored`}
        items={[
          "20 weak-answer → better-answer pairs",
          "Embedded with gemini-embedding-001 (768 dims)",
          "Needs GEMINI_API_KEY in Convex",
        ]}
        onSeed={handleCoaching}
        status={coachStatus}
        message={coachMsg}
      />

      <p className="text-xs text-center text-muted-foreground">
        After seeding, <a href="/register" className="text-primary underline">create an account</a> to get started.
      </p>
    </div>
  );
}
