"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, BookOpen } from "lucide-react";

export function ClientTrainingProgress({ clientId }: { clientId: Id<"users"> }) {
  const unlock = useQuery(api.moduleProgress.getTrainingUnlockStatus, { clientId });

  if (unlock === undefined) {
    return (
      <p className="text-xs text-muted-foreground mt-3">Loading basic training scores…</p>
    );
  }

  if (unlock.totalCount === 0) {
    return (
      <p className="text-xs text-muted-foreground mt-3">
        No basic training modules in the database yet.
      </p>
    );
  }

  const overallPct =
    unlock.totalCount > 0
      ? Math.round((unlock.passedCount / unlock.totalCount) * 100)
      : 0;

  return (
    <div className="mt-4 pt-4 border-t">
      <div className="flex items-center gap-2 mb-2">
        <BookOpen className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Basic Training</span>
        {unlock.allModulesPassed ? (
          <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
            Complete
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs">
            {unlock.passedCount}/{unlock.totalCount} passed
          </Badge>
        )}
      </div>
      <Progress value={overallPct} className="h-1.5 mb-3" />
      <ul className="space-y-1.5">
        {unlock.modules.map((mod) => (
          <li
            key={mod.moduleId}
            className="flex items-center justify-between text-xs gap-2"
          >
            <span className="text-muted-foreground truncate">{mod.title}</span>
            <span className="flex items-center gap-1.5 flex-shrink-0">
              {mod.score !== undefined ? (
                <span
                  className={
                    mod.passed
                      ? "font-semibold text-green-600"
                      : "font-semibold text-red-600"
                  }
                >
                  {mod.score}%
                </span>
              ) : (
                <span className="text-muted-foreground capitalize">
                  {mod.status.replace("_", " ")}
                </span>
              )}
              {mod.passed && <CheckCircle className="w-3.5 h-3.5 text-green-600" />}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
