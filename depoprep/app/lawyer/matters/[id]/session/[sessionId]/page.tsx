"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SessionFeedbackPanel } from "@/components/simulation/SessionFeedbackPanel";
import { highlightRisks } from "@/components/simulation/highlightRisks";
import Link from "next/link";
import { ArrowLeft, Bot, User, AlertTriangle } from "lucide-react";

export default function SessionTranscriptPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = use(params);
  const session = useQuery(api.simSessions.getById, {
    id: sessionId as Id<"sim_sessions">,
  });
  const feedback = useQuery(api.simFeedback.getBySession, {
    sessionId: sessionId as Id<"sim_sessions">,
  });

  if (!session) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link
        href={`/lawyer/matters/${id}`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to Matter
      </Link>

      <div className="flex items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold">Session Transcript</h1>
          <p className="text-muted-foreground mt-1">
            {new Date(session.startedAt).toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            {session.endedAt &&
              ` · ${Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60000)} min`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transcript */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Conversation</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-4">
                  {session.transcript.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex gap-3 ${msg.role === "client" ? "flex-row-reverse" : ""}`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          msg.role === "ai" ? "bg-primary/10" : "bg-secondary"
                        }`}
                      >
                        {msg.role === "ai" ? (
                          <Bot className="w-4 h-4 text-primary" />
                        ) : (
                          <User className="w-4 h-4" />
                        )}
                      </div>
                      <div className={`max-w-[80%] ${msg.role === "client" ? "items-end" : ""} flex flex-col gap-1`}>
                        <div
                          className={`rounded-2xl px-4 py-3 text-base leading-relaxed ${
                            msg.role === "ai"
                              ? "bg-muted text-foreground"
                              : "bg-primary text-primary-foreground"
                          }`}
                        >
                          {msg.role === "client" && feedback
                            ? highlightRisks(msg.content, feedback.riskHighlights)
                            : msg.content}
                        </div>
                        {msg.flags && msg.flags.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {msg.flags.map((flag) => (
                              <span
                                key={flag}
                                className="flex items-center gap-0.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"
                              >
                                <AlertTriangle className="w-3 h-3" />
                                {flag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Feedback */}
        <div className="space-y-4">
          {feedback ? (
            <>
              <SessionFeedbackPanel feedback={feedback} audience="lawyer" />
              {feedback.rawJson && (
                <details className="rounded-xl border bg-card p-4">
                  <summary className="cursor-pointer text-sm font-medium">Raw grader output (JSON)</summary>
                  <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(feedback.rawJson), null, 2);
                      } catch {
                        return feedback.rawJson;
                      }
                    })()}
                  </pre>
                </details>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                Feedback not yet generated for this session.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
