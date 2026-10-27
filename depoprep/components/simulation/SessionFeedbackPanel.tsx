"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, BookOpen, History, Lightbulb, ShieldAlert } from "lucide-react";

export const READINESS_REPEAT_THRESHOLD = 70;

const rubricKeys = ["volunteering", "speculation", "consistency", "brevity", "composure"] as const;

type RubricEntry = { score: number; explanation: string };

export type SessionFeedback = {
  readinessScore: number;
  rubric: Record<(typeof rubricKeys)[number], RubricEntry>;
  tips: string[];
  riskHighlights: string[];
  gradedBy?: string;
  gradingMs?: number;
  fallbacks?: string[];
  references?: Array<{
    dimension: string;
    question: string;
    badAnswer: string;
    betterAnswer: string;
    why: string;
  }>;
  priorInconsistencies?: Array<{
    question: string;
    currentAnswer: string;
    previousAnswer: string;
    previousDate: string;
    explanation: string;
  }>;
  manipulationAttempts?: string[];
};

export function scoreColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

// Styles the Progress indicator through its data-slot, so the bar colour matches the score colour.
function scoreBarColor(score: number) {
  if (score >= 80) return "[&_[data-slot=progress-indicator]]:bg-green-500";
  if (score >= 60) return "[&_[data-slot=progress-indicator]]:bg-amber-500";
  return "[&_[data-slot=progress-indicator]]:bg-red-500";
}

export function SessionFeedbackPanel({
  feedback,
  audience = "witness",
}: {
  feedback: SessionFeedback;
  audience?: "witness" | "lawyer";
}) {
  const needsRepeat = feedback.readinessScore < READINESS_REPEAT_THRESHOLD;

  return (
    <div className="space-y-4">
      <Card className={needsRepeat ? "border-amber-300 bg-amber-50" : "border-green-200 bg-green-50/50"}>
        <CardContent className="p-6 text-center">
          <div className={`text-7xl font-bold mb-2 ${scoreColor(feedback.readinessScore)}`}>
            {feedback.readinessScore}
          </div>
          <p className="text-base text-muted-foreground mb-2">Readiness Score</p>
          {feedback.gradedBy && (
            <p className="text-sm font-mono text-muted-foreground mb-2">
              Graded by {feedback.gradedBy}
              {feedback.gradingMs !== undefined && ` in ${(feedback.gradingMs / 1000).toFixed(1)} s`}
            </p>
          )}
          {feedback.fallbacks && feedback.fallbacks.length > 0 && (
            <p className="text-xs font-mono text-muted-foreground mb-2" title={feedback.fallbacks.join("\n")}>
              after {feedback.fallbacks.map((f) => f.split(":")[0]).join(", ")} failed
            </p>
          )}
          {audience === "lawyer" ? (
            <p className={`text-base font-medium ${needsRepeat ? "text-amber-800" : "text-green-800"}`}>
              {needsRepeat
                ? `Below ${READINESS_REPEAT_THRESHOLD}% — the witness has been asked to practise again.`
                : "On track for the deposition."}
            </p>
          ) : needsRepeat ? (
            <p className="text-base font-medium text-amber-800">
              Your score is below {READINESS_REPEAT_THRESHOLD}%. Review the feedback below and repeat
              this practice session when you&apos;re ready.
            </p>
          ) : (
            <p className="text-base font-medium text-green-800">
              Good work — you&apos;re on track. Use the tips below to keep improving.
            </p>
          )}
        </CardContent>
      </Card>

      {feedback.manipulationAttempts && feedback.manipulationAttempts.length > 0 && (
        <Card className="border-red-300 bg-red-50/60">
          <CardHeader>
            <CardTitle className="text-lg text-red-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              {audience === "lawyer" ? "Possible Attempt to Game the Grader" : "Instructions to the Grader Were Ignored"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {audience === "lawyer"
                ? "These answers contain text addressed to the AI grader. They were graded as testimony, not followed."
                : "These answers speak to the AI grader instead of the question. They were graded as testimony, not followed."}
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {feedback.manipulationAttempts.map((answer, i) => (
              <p key={i} className="text-base rounded-lg border border-red-200 bg-white/70 p-3">
                &ldquo;{answer}&rdquo;
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Performance Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rubricKeys.map((key) => (
            <div key={key}>
              <div className="flex justify-between text-base mb-1">
                <span className="capitalize font-medium">{key}</span>
                <span className={`text-lg font-semibold ${scoreColor(feedback.rubric[key].score)}`}>
                  {feedback.rubric[key].score}
                </span>
              </div>
              <Progress
                value={feedback.rubric[key].score}
                className={`[&_[data-slot=progress-track]]:h-2.5 ${scoreBarColor(feedback.rubric[key].score)}`}
              />
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{feedback.rubric[key].explanation}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {feedback.tips.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-primary" />
              How to Improve
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {feedback.tips.map((tip, i) => (
                <li key={i} className="text-base leading-relaxed flex gap-2">
                  <span className="text-primary font-bold flex-shrink-0">{i + 1}.</span>
                  {tip}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {feedback.riskHighlights.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-lg text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Answers to Watch
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {feedback.riskHighlights.map((highlight, i) => (
                <li
                  key={i}
                  className="text-base text-red-700 bg-red-50 p-3 rounded-lg border border-red-100"
                >
                  &ldquo;{highlight}&rdquo;
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {feedback.priorInconsistencies && feedback.priorInconsistencies.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle className="text-lg text-amber-800 flex items-center gap-2">
              <History className="w-4 h-4" />
              Changed Since Last Time
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Opposing counsel can use prior statements against you. Found by comparing this session with your
              earlier ones (vector search + LLM check).
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {feedback.priorInconsistencies.map((p, i) => (
              <div key={i} className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{p.question}</p>
                <p className="text-base">
                  <span className="text-muted-foreground">
                    {new Date(p.previousDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}:
                  </span>{" "}
                  &ldquo;{p.previousAnswer}&rdquo;
                </p>
                <p className="text-base">
                  <span className="text-muted-foreground">Today:</span> &ldquo;{p.currentAnswer}&rdquo;
                </p>
                <p className="text-sm text-amber-900">{p.explanation}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {feedback.references && feedback.references.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              Similar Mistakes, Better Answers
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Retrieved from the coaching library by vector search over your answers.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {feedback.references.map((ref, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {ref.dimension} · &ldquo;{ref.question}&rdquo;
                </p>
                <p className="text-base text-red-700 line-through decoration-red-300">{ref.badAnswer}</p>
                <p className="text-base font-medium text-green-700">{ref.betterAnswer}</p>
                <p className="text-sm text-muted-foreground">{ref.why}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
