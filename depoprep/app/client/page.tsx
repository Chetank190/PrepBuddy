"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { BookOpen, Mic, CheckCircle, Clock, ArrowRight, Lock } from "lucide-react";

export default function ClientDashboard() {
  const { user } = useAuth();
  const modules = useQuery(api.basicModules.list);
  const progress = useQuery(api.moduleProgress.getForClient, user ? { clientId: user._id } : "skip");
  const allDone = useQuery(api.moduleProgress.allModulesCompleted, user ? { clientId: user._id } : "skip");
  const matters = useQuery(api.matters.getMattersForClient, user ? { clientId: user._id } : "skip");
  const sessions = useQuery(api.simSessions.listByClient, user ? { clientId: user._id } : "skip");

  const progressMap = new Map(progress?.map((p) => [p.moduleId.toString(), p]));

  const completedModules = progress?.filter((p) => p.status === "completed" && (p.score ?? 0) >= 80).length ?? 0;
  const totalModules = modules?.length ?? 0;
  const overallProgress = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;

  const completedSessions = sessions?.filter((s) => s.status === "completed").length ?? 0;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Welcome, {user?.name?.split(" ")[0]}</h1>
        <p className="text-muted-foreground mt-1">Track your deposition preparation progress.</p>
      </div>

      {/* Progress Overview */}
      <Card className="mb-6 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-lg">Training Progress</h2>
              <p className="text-sm text-muted-foreground">{completedModules} of {totalModules} modules completed</p>
            </div>
            <div className="text-3xl font-bold text-primary">{overallProgress}%</div>
          </div>
          <Progress value={overallProgress} className="h-3" />
          {allDone && (
            <div className="mt-3 flex items-center gap-2 text-green-700 text-sm font-medium">
              <CheckCircle className="w-4 h-4" />
              All training complete — simulation unlocked!
            </div>
          )}
          {!allDone && (
            <div className="mt-3 flex items-center gap-2 text-amber-700 text-sm">
              <Lock className="w-4 h-4" />
              Complete all modules with ≥80% to unlock simulation
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mb-3">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-semibold">Basic Training</h3>
                <p className="text-sm text-muted-foreground mt-1">{completedModules}/{totalModules} modules done</p>
              </div>
              <Link href="/client/training">
                <Button variant="outline" size="sm">
                  {completedModules === 0 ? "Start" : "Continue"} <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className={!allDone ? "opacity-60" : ""}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${allDone ? "bg-purple-100" : "bg-muted"}`}>
                  <Mic className={`w-5 h-5 ${allDone ? "text-purple-600" : "text-muted-foreground"}`} />
                </div>
                <h3 className="font-semibold">Practice Simulation</h3>
                <p className="text-sm text-muted-foreground mt-1">{completedSessions} sessions completed</p>
              </div>
              {allDone ? (
                <Link href="/client/simulation">
                  <Button variant="outline" size="sm">
                    Practice <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              ) : (
                <div className="flex items-center text-xs text-muted-foreground">
                  <Lock className="w-3 h-3 mr-1" /> Locked
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Module List */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Training Modules</h2>
        <div className="grid gap-3">
          {modules?.map((mod) => {
            const prog = progressMap.get(mod._id.toString());
            const status = prog?.status ?? "not_started";
            const score = prog?.score;
            const passed = status === "completed" && (score ?? 0) >= 80;

            return (
              <Card key={mod._id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${passed ? "bg-green-100 text-green-700" : status === "in_progress" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                      {passed ? <CheckCircle className="w-5 h-5" /> : mod.order}
                    </div>
                    <div>
                      <p className="font-medium">{mod.title}</p>
                      <p className="text-sm text-muted-foreground">{mod.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {score !== undefined && (
                      <span className={`text-sm font-semibold ${passed ? "text-green-600" : "text-red-600"}`}>
                        {score}%
                      </span>
                    )}
                    <Badge variant={passed ? "default" : status === "in_progress" ? "secondary" : "outline"}>
                      {passed ? "Passed" : status === "in_progress" ? "In Progress" : "Not Started"}
                    </Badge>
                    <Link href={`/client/training/${mod._id}`}>
                      <Button variant="outline" size="sm">
                        {passed ? "Review" : status === "in_progress" ? "Continue" : "Start"}
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
