"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Lightbulb } from "lucide-react";

export const READINESS_REPEAT_THRESHOLD = 70;

const rubricKeys = ["volunteering", "speculation", "consistency", "brevity", "composure"] as const;

type RubricEntry = { score: number; explanation: string };

export type SessionFeedback = {
  readinessScore: number;
  rubric: Record<(typeof rubricKeys)[number], RubricEntry>;
  tips: string[];
  riskHighlights: string[];
};

function scoreColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

export function SessionFeedbackPanel({ feedback }: { feedback: SessionFeedback }) {
  const needsRepeat = feedback.readinessScore < READINESS_REPEAT_THRESHOLD;

  return (
    <div className="space-y-4">
      <Card className={needsRepeat ? "border-amber-300 bg-amber-50" : "border-green-200 bg-green-50/50"}>
        <CardContent className="p-6 text-center">
          <div className={`text-5xl font-bold mb-1 ${scoreColor(feedback.readinessScore)}`}>
            {feedback.readinessScore}
          </div>
          <p className="text-sm text-muted-foreground mb-2">Readiness Score</p>
          {needsRepeat ? (
            <p className="text-sm font-medium text-amber-800">
              Your score is below {READINESS_REPEAT_THRESHOLD}%. Review the feedback below and repeat
              this practice session when you&apos;re ready.
            </p>
          ) : (
            <p className="text-sm font-medium text-green-800">
              Good work — you&apos;re on track. Use the tips below to keep improving.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performance Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rubricKeys.map((key) => (
            <div key={key}>
              <div className="flex justify-between text-sm mb-1">
                <span className="capitalize font-medium">{key}</span>
                <span className={`font-semibold ${scoreColor(feedback.rubric[key].score)}`}>
                  {feedback.rubric[key].score}
                </span>
              </div>
              <Progress value={feedback.rubric[key].score} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">{feedback.rubric[key].explanation}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {feedback.tips.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-primary" />
              How to Improve
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {feedback.tips.map((tip, i) => (
                <li key={i} className="text-sm flex gap-2">
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
            <CardTitle className="text-base text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Answers to Watch
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {feedback.riskHighlights.map((highlight, i) => (
                <li
                  key={i}
                  className="text-sm text-red-700 bg-red-50 p-2 rounded-lg border border-red-100"
                >
                  &ldquo;{highlight}&rdquo;
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
