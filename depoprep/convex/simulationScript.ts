export type Persona = "calm_precise" | "aggressive" | "friendly_manipulative";

/** Fixed opening for every simulation session (persona affects counsel style in feedback, not this intro). */
export const SESSION_OPENING =
  "I represent the plaintiff in the matter. I will be asking you questions related to an accident.";

export function getSessionOpening(): string {
  return SESSION_OPENING;
}

export function getSessionClosingMessage(): string {
  return "Those are all my questions for now. Thank you.";
}

export function formatQuestionMessage(
  question: string,
  opts: { isFirst: boolean; persona?: Persona }
): string {
  if (opts.isFirst) {
    return `${getSessionOpening()}\n\n${question}`;
  }
  return question;
}
