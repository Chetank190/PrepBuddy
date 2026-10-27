import { describe, expect, it } from "vitest";
import { pickCounselVoice, rankVoices, scoreVoice } from "../lib/counselVoice";

const v = (name: string, lang = "en-US") => ({ name, lang });

describe("counsel voice", () => {
  it("prefers premium and neural voices over the defaults", () => {
    const voices = [v("Samantha"), v("Google US English"), v("Ava (Premium)"), v("Microsoft Aria Online (Natural) - English (United States)")];
    expect(rankVoices(voices).map((x) => x.name)).toEqual([
      "Ava (Premium)",
      "Microsoft Aria Online (Natural) - English (United States)",
      "Google US English",
      "Samantha",
    ]);
  });

  it("never offers novelty or non-English voices", () => {
    expect(scoreVoice(v("Zarvox"))).toBe(-1);
    expect(scoreVoice(v("Bad News"))).toBe(-1);
    expect(scoreVoice(v("Amélie", "fr-CA"))).toBe(-1);
    expect(rankVoices([v("Albert"), v("Thomas", "fr-FR")])).toEqual([]);
  });

  it("nudges towards a Canadian or US accent", () => {
    expect(scoreVoice(v("Daniel", "en-GB"))).toBeLessThan(scoreVoice(v("Samantha", "en-US")));
    expect(rankVoices([v("Samantha (Enhanced)", "en-US"), v("Nathan (Enhanced)", "en-CA")])[0].name).toBe("Nathan (Enhanced)");
  });

  it("keeps a saved choice if it still exists, else picks the best", () => {
    const voices = [v("Samantha"), v("Ava (Premium)")];
    expect(pickCounselVoice(voices, "Samantha")?.name).toBe("Samantha");
    expect(pickCounselVoice(voices, "Gone (Premium)")?.name).toBe("Ava (Premium)");
    expect(pickCounselVoice([v("Zarvox")], null)?.name).toBe("Zarvox"); // nothing better: today's behaviour
  });
});
