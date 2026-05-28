"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Play, Mic, ArrowRight, BookOpen, CheckCircle } from "lucide-react";

export default function SimulationLobbyPage() {
  const { user } = useAuth();
  const router = useRouter();
  const matters = useQuery(api.matters.getMattersForClient, user ? { clientId: user._id } : "skip");
  const unlock = useQuery(
    api.moduleProgress.getTrainingUnlockStatus,
    user ? { clientId: user._id } : "skip"
  );
  const createSession = useMutation(api.simSessions.create);

  const handleStartSession = async (matterId: string) => {
    if (!user) return;
    try {
      const sessionId = await createSession({
        clientId: user._id,
        matterId: matterId as Parameters<typeof createSession>[0]["matterId"],
      });
      router.push(`/client/simulation/${matterId}?session=${sessionId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start session");
    }
  };

  if (unlock === undefined) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-muted-foreground">Loading…</div>
    );
  }

  if (!unlock.allModulesPassed) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Custom Practice Simulation</h1>
          <p className="text-muted-foreground mt-1">
            Lawyer-prepared questions — unlocked after basic training.
          </p>
        </div>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-8">
            <div className="flex items-start gap-4">
              <Lock className="w-10 h-10 text-amber-600 flex-shrink-0" />
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-amber-800 mb-2">Complete Basic Training First</h2>
                <p className="text-amber-700 mb-4">
                  Pass all {unlock.totalCount} modules with ≥80%. Your scores are saved in the database —
                  you only need to finish modules you have not passed yet.
                </p>
                <p className="text-sm font-medium text-amber-800 mb-3">
                  {unlock.passedCount}/{unlock.totalCount} modules passed
                </p>
                <ul className="text-sm text-amber-700 space-y-1 mb-4">
                  {unlock.modules.map((m) => (
                    <li key={m.moduleId} className="flex items-center gap-2">
                      {m.passed ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-amber-400" />
                      )}
                      {m.title}
                      {m.score !== undefined && (
                        <span className={m.passed ? "text-green-700" : "text-red-700"}>
                          ({m.score}%)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <Link href="/client/training">
                  <Button variant="outline">
                    <BookOpen className="w-4 h-4 mr-2" />
                    Continue Training
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Custom Practice Simulation</h1>
          <p className="text-muted-foreground mt-1">
            Practice with your lawyer&apos;s planned questions and counsel persona. Training complete —
            scores on file ({unlock.passedCount}/{unlock.totalCount} modules).
          </p>
        </div>
        <Link href="/client/training">
          <Button variant="outline" size="sm">
            <BookOpen className="w-4 h-4 mr-2" />
            Review Training
          </Button>
        </Link>
      </div>

      <Card className="mb-6 border-green-200 bg-green-50">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <p className="text-sm text-green-800">
            Basic training complete. Simulation uses only questions and persona set by your lawyer for
            each matter.
          </p>
        </CardContent>
      </Card>

      {!matters || matters.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Mic className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Matters Assigned</h2>
            <p className="text-muted-foreground">
              Your lawyer hasn&apos;t assigned you to any matters yet. Contact your attorney.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {matters.map((matter) => {
            if (!matter) return null;
            const questionCount = matter.customQuestions?.length ?? 0;
            const canStart = questionCount > 0;

            return (
              <Card key={matter._id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="font-semibold text-lg">{matter.title}</h3>
                        <Badge variant="secondary" className="capitalize">
                          {matter.eventType.replace("_", " ")}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            matter.persona === "aggressive"
                              ? "border-red-200 text-red-700"
                              : matter.persona === "friendly_manipulative"
                                ? "border-amber-200 text-amber-700"
                                : "border-blue-200 text-blue-700"
                          }
                        >
                          {matter.persona.replace("_", " ")}
                        </Badge>
                        <Badge variant="outline">
                          {questionCount} planned question{questionCount !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Event date: {matter.eventDate}</p>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{matter.caseSummary}</p>
                      {!canStart && (
                        <p className="text-sm text-amber-700 mt-2">
                          Waiting for your lawyer to add practice questions.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        onClick={() => handleStartSession(matter._id)}
                        disabled={!canStart}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Start Session
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/client/simulation/${matter._id}`)}
                      >
                        Resume / View <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
