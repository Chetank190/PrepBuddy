export type Persona = "calm_precise" | "aggressive" | "friendly_manipulative";

export type EventType = "deposition" | "trial_testimony" | "settlement_conference";

/** Fixed opening for each simulation session, worded for the matter's event type. */
const SESSION_OPENINGS: Record<EventType, string> = {
  deposition: "I represent the opposing party in this matter. I will be asking you some questions today.",
  trial_testimony: "I am counsel for the opposing party. I will now begin my cross-examination.",
  settlement_conference:
    "I represent the other side. Before we discuss terms, I have a few questions about your position.",
};

export function getSessionOpening(eventType: EventType = "deposition"): string {
  return SESSION_OPENINGS[eventType];
}

export function getSessionClosingMessage(): string {
  return "Those are all my questions for now. Thank you.";
}

export function formatQuestionMessage(
  question: string,
  opts: { isFirst: boolean; persona?: Persona; eventType?: EventType }
): string {
  if (opts.isFirst) {
    return `${getSessionOpening(opts.eventType)}\n\n${question}`;
  }
  return question;
}

/** Marks an AI follow-up in transcript `flags`; the rest of the flag is the volunteered phrase. */
export const FOLLOW_UP_FLAG_PREFIX = "Follow-up on: ";

export function isFollowUp(entry: { role: string; flags?: string[] }): boolean {
  return entry.role === "ai" && (entry.flags ?? []).some((f) => f.startsWith(FOLLOW_UP_FLAG_PREFIX));
}

/** Pairs each client answer with the AI question just before it (opening line stripped). */
export function questionAnswerPairs(
  transcript: Array<{ role: string; content: string }>,
): Array<{ question: string; answer: string }> {
  const pairs: Array<{ question: string; answer: string }> = [];
  transcript.forEach((entry, i) => {
    const previous = transcript[i - 1];
    if (entry.role !== "client" || previous?.role !== "ai") return;
    const question = previous.content.split("\n\n").pop() ?? previous.content;
    pairs.push({ question, answer: entry.content });
  });
  return pairs;
}
