import type { ReactNode } from "react";

// Wraps each verbatim risk quote from the grader in a <mark>, so the evidence is visible in the transcript.
export function highlightRisks(text: string, highlights: string[]): ReactNode {
  const matches = highlights
    .map((h) => h.trim())
    .filter((h) => h.length > 0)
    .flatMap((h) => {
      const start = text.toLowerCase().indexOf(h.toLowerCase());
      return start === -1 ? [] : [{ start, end: start + h.length }];
    })
    .sort((a, b) => a.start - b.start);

  if (matches.length === 0) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const { start, end } of matches) {
    if (start < cursor) continue; // skip overlapping quotes
    parts.push(text.slice(cursor, start));
    parts.push(
      <mark
        key={start}
        className="bg-red-200 text-red-950 rounded px-0.5 underline decoration-red-600 decoration-2"
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  parts.push(text.slice(cursor));
  return parts;
}
