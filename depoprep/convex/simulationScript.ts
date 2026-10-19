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
