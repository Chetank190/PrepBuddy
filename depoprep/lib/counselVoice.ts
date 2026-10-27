// Picks the most natural English voice the browser offers for opposing counsel. No API: the best voices
// (macOS Premium/Enhanced, Edge "Natural", Chrome's Google voices) are already on the laptop or in the browser.

type VoiceLike = Pick<SpeechSynthesisVoice, "name" | "lang">;

// macOS ships novelty voices that make counsel sound like a toy; never pick them by default.
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|pipe organ|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley)\b/i;

// Ordinary macOS voices that sound reasonable when no premium voice is installed.
const DECENT = /\b(samantha|daniel|karen|moira|tessa|ava|zoe|evan|tom|allison|susan|serena|alex|nathan|joelle|noelle)\b/i;

/** Higher is more natural; -1 means "don't offer it". */
export function scoreVoice(voice: VoiceLike): number {
  if (!voice.lang.toLowerCase().startsWith("en") || NOVELTY.test(voice.name)) return -1;
  let score = 10;
  if (/premium/i.test(voice.name)) score = 100;
  else if (/natural/i.test(voice.name)) score = 95; // Edge's neural "Microsoft … Online (Natural)" voices
  else if (/enhanced|siri/i.test(voice.name)) score = 90;
  else if (/^google (us|uk) english/i.test(voice.name)) score = 70;
  else if (DECENT.test(voice.name)) score = 50;
  // Small nudge towards a North American accent for a Canadian/US courtroom.
  const lang = voice.lang.toLowerCase();
  if (lang === "en-ca" || lang === "en_ca") score += 6;
  else if (lang === "en-us" || lang === "en_us") score += 5;
  else if (lang === "en-gb" || lang === "en_gb") score += 3;
  return score;
}

/** English voices, most natural first. */
export function rankVoices<T extends VoiceLike>(voices: T[]): T[] {
  return voices
    .map((voice) => ({ voice, score: scoreVoice(voice) }))
    .filter((v) => v.score >= 0)
    .sort((a, b) => b.score - a.score || a.voice.name.localeCompare(b.voice.name))
    .map((v) => v.voice);
}

/** The saved choice if it still exists, otherwise the most natural voice. */
export function pickCounselVoice<T extends VoiceLike>(voices: T[], savedName?: string | null): T | undefined {
  return voices.find((v) => v.name === savedName) ?? rankVoices(voices)[0] ?? voices[0];
}

export const COUNSEL_VOICE_KEY = "prepbuddy.counselVoice";
