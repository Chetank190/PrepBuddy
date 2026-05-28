"use client";

import { use } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Play, RotateCcw } from "lucide-react";
import {
  READINESS_REPEAT_THRESHOLD,
  SessionFeedbackPanel,
} from "@/components/simulation/SessionFeedbackPanel";
import { toast } from "sonner";

export default function SimulationResultsPage({
  params,
}: {
  params: Promise<{ matterId: string; sessionId: string }>;
}) {
  const { matterId, sessionId } = use(params);
  const { user } = useAuth();
  const router = useRouter();

  const matter = useQuery(api.matters.getById, { id: matterId as Id<"matters"> });
  const session = useQuery(api.simSessions.getById, {
    id: sessionId as Id<"sim_sessions">,
  });
  const feedback = useQuery(api.simFeedback.getBySession, {
    sessionId: sessionId as Id<"sim_sessions">,
  });
  const createSession = useMutation(api.simSessions.create);

  const handleRepeat = async () => {
    if (!user || !matter) return;
    try {
      await createSession({ clientId: user._id, matterId: matter._id });
      router.push(`/client/simulation/${matterId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start new session");
    }
  };

  if (matter === undefined || session === undefined || feedback === undefined) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session || (user && session.clientId !== user._id)) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center text-muted-foreground">
        Session not found.
      </div>
    );
  }

  const needsRepeat = feedback && feedback.readinessScore < READINESS_REPEAT_THRESHOLD;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link
        href="/client/simulation"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to Simulation
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Practice Session Results</h1>
        <p className="text-muted-foreground mt-1">
          {matter?.title ?? "Simulation"} ·{" "}
          {new Date(session.startedAt).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {!feedback ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Generating your feedback…</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <SessionFeedbackPanel feedback={feedback} />

          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            {needsRepeat ? (
              <Button className="flex-1" onClick={() => void handleRepeat()}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Repeat Practice Session
              </Button>
            ) : (
              <Button className="flex-1" variant="outline" onClick={() => void handleRepeat()}>
                <Play className="w-4 h-4 mr-2" />
                Practice Again
              </Button>
            )}
            <Link href="/client/simulation" className="flex-1">
              <Button variant={needsRepeat ? "outline" : "default"} className="w-full">
                Back to Simulation
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
