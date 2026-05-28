"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { CheckCircle, BookOpen, Mic, Lock } from "lucide-react";

export default function TrainingPage() {
  const { user } = useAuth();
  const modules = useQuery(api.basicModules.list);
  const ensureSeeded = useMutation(api.basicModules.ensureSeeded);
  const [seeding, setSeeding] = useState(false);
  const progress = useQuery(api.moduleProgress.getForClient, user ? { clientId: user._id } : "skip");
  const unlock = useQuery(
    api.moduleProgress.getTrainingUnlockStatus,
    user ? { clientId: user._id } : "skip"
  );

  useEffect(() => {
    if (modules === undefined || modules.length > 0 || seeding) return;
    setSeeding(true);
    ensureSeeded({}).finally(() => setSeeding(false));
  }, [modules, seeding, ensureSeeded]);

  const progressMap = new Map(progress?.map((p) => [p.moduleId.toString(), p]));
  const completedCount = progress?.filter((p) => p.status === "completed" && (p.score ?? 0) >= 80).length ?? 0;
  const totalCount = modules?.length ?? 0;
  const overallPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Basic Training</h1>
        <p className="text-muted-foreground mt-1">
          Complete all modules with ≥80% quiz score to unlock the AI simulation.
        </p>
      </div>

      <div className="mb-6 p-5 bg-muted/50 rounded-xl">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium">Overall Progress</span>
          <span className="text-primary font-semibold">{completedCount}/{totalCount} completed</span>
        </div>
        <Progress value={overallPct} className="h-2" />
      </div>

      {unlock?.allModulesPassed ? (
        <Card className="mb-6 border-green-200 bg-green-50">
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Training complete — simulation unlocked</p>
                <p className="text-sm text-green-700">
                  Your scores are saved. Practice with your lawyer&apos;s custom questions.
                </p>
              </div>
            </div>
            <Link href="/client/simulation">
              <Button>
                <Mic className="w-4 h-4 mr-2" />
                Go to Simulation
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6 border-amber-200/80 bg-amber-50/50">
          <CardContent className="p-4 flex items-center gap-3 text-sm text-amber-800">
            <Lock className="w-4 h-4 flex-shrink-0" />
            <span>
              Pass all modules (≥80%) to unlock custom simulation. Completed modules stay passed — no
              need to redo them.
            </span>
          </CardContent>
        </Card>
      )}

      {seeding || (modules !== undefined && modules.length === 0) ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="font-medium">Loading training modules…</p>
          <p className="text-sm mt-1">Setting up flashcards and quizzes.</p>
        </div>
      ) : null}

      <div className="grid gap-4">
        {modules?.map((mod, idx) => {
          const prog = progressMap.get(mod._id.toString());
          const status = prog?.status ?? "not_started";
          const score = prog?.score;
          const passed = status === "completed" && (score ?? 0) >= 80;

          const isLocked = idx > 0 && (() => {
            const prevMod = modules[idx - 1];
            const prevProg = progressMap.get(prevMod._id.toString());
            return !prevProg || prevProg.status !== "completed" || (prevProg.score ?? 0) < 80;
          })();

          return (
            <Card key={mod._id} className={`transition-all ${isLocked ? "opacity-50" : "hover:shadow-md"}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0 ${passed ? "bg-green-100 text-green-700" : status === "in_progress" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                      {passed ? <CheckCircle className="w-6 h-6" /> : <span>{mod.order}</span>}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold">{mod.title}</h3>
                        {passed && <Badge className="bg-green-100 text-green-700 border-green-200">Passed</Badge>}
                        {status === "in_progress" && <Badge variant="secondary">In Progress</Badge>}
                        {status === "not_started" && !isLocked && <Badge variant="outline">Not Started</Badge>}
                        {isLocked && <Badge variant="outline" className="text-muted-foreground">Locked</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{mod.description}</p>
                      {score !== undefined && (
                        <p className={`text-sm font-medium mt-1 ${passed ? "text-green-600" : "text-red-600"}`}>
                          Last score: {score}% {passed ? "✓" : "— need 80% to pass"}
                        </p>
                      )}
                    </div>
                  </div>
                  {!isLocked && (
                    <Link href={`/client/training/${mod._id}`}>
                      <Button size="sm" variant={passed ? "outline" : "default"}>
                        {passed ? "Review" : status === "in_progress" ? "Continue" : "Start"}
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
