// Labelled transcripts for the grader eval (`convex/ai/evals.ts`).
// Labels are deliberately coarse so they are defensible without a lawyer:
//   band   — the readiness score range a reasonable grader should land in
//   weak   — dimensions with an obvious, planted problem (expected score < 70)
//   strong — dimensions with no problem at all (expected score >= 70)
// They were written for this project, not labelled by practising lawyers.

import type { CoachingDimension } from "./coachingContent";

export type EvalCase = {
  id: string;
  title: string;
  transcript: Array<{ role: "ai" | "client"; content: string }>;
  band: [number, number];
  weak: CoachingDimension[];
  strong: CoachingDimension[];
};

const OPEN = "I represent the plaintiff in the matter. I will be asking you questions related to an accident.";

function qa(pairs: Array<[string, string]>): EvalCase["transcript"] {
  return pairs.flatMap(([q, a], i) => [
    { role: "ai" as const, content: i === 0 ? `${OPEN}\n\n${q}` : q },
    { role: "client" as const, content: a },
  ]);
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: "tight-collision",
    title: "Disciplined witness, rear-end collision",
    transcript: qa([
      ["Please state your name and occupation.", "Jordan Lee, electrician."],
      ["Where were you driving from?", "From home."],
      ["How fast were you going?", "I don't recall the exact speed."],
      ["Did you look at your phone during the drive?", "No."],
      ["Did you see the other vehicle before impact?", "Yes, in my mirror, a moment before."],
    ]),
    band: [70, 100],
    weak: [],
    strong: ["volunteering", "speculation", "consistency", "brevity", "composure"],
  },
  {
    id: "chatty-collision",
    title: "Chatty witness volunteers, guesses and contradicts",
    transcript: qa([
      ["Please state your name and occupation.", "Sam Ortiz, I'm a teacher at Unionville High, been there twelve years, best job in the world honestly."],
      ["Where were you going?", "To school, I was running late actually because my car wouldn't start at first so I was in a bit of a hurry."],
      ["How fast were you driving?", "Maybe 70? Could've been 80, everybody speeds on that road, I was just going with the flow I think."],
      ["Were you on your phone?", "No. Well, I did check a text at the light but I wasn't typing or anything."],
      ["Anything else about that morning?", "I'd only slept about four hours because of marking papers, but that's not really relevant."],
    ]),
    band: [0, 60],
    weak: ["volunteering", "speculation", "consistency", "brevity"],
    strong: [],
  },
  {
    id: "speculation-only",
    title: "Short answers, but guesses at facts and other people's minds",
    transcript: qa([
      ["What time did the meeting start?", "Probably around 2, maybe 2:30."],
      ["Who called the meeting?", "I think it was Dana, or maybe her assistant."],
      ["Why did the supplier cancel?", "They were probably out of stock, I'd guess."],
      ["How many people attended?", "Maybe eight? Ten?"],
      ["Did anyone object to the proposal?", "Not that I recall."],
    ]),
    band: [25, 75],
    weak: ["speculation"],
    strong: ["volunteering", "brevity"],
  },
  {
    id: "contradiction-only",
    title: "Concise, but contradicts itself twice",
    transcript: qa([
      ["Had you been to the warehouse before?", "Never. Actually, yes, once last spring."],
      ["Was the floor wet when you entered?", "No."],
      ["Did you see any warning signs?", "No signs at all."],
      ["What did you slip on?", "The wet patch near the door."],
      ["Were you carrying anything?", "No. Well, a box, but a small one."],
    ]),
    band: [20, 70],
    weak: ["consistency"],
    strong: ["brevity", "speculation"],
  },
  {
    id: "hostile-composure",
    title: "Accurate facts, combative tone",
    transcript: qa([
      ["Isn't it true you ran the red light?", "Absolutely not, that's ridiculous, why would you even say that?"],
      ["You were in a hurry, weren't you?", "Come on, everyone's in a hurry, that's not a crime."],
      ["Did you brake?", "Of course I braked, what do you think I did?"],
      ["How far were you from the intersection when it turned yellow?", "I don't know."],
      ["Have you discussed this accident with anyone?", "Only my lawyer."],
    ]),
    band: [20, 70],
    weak: ["composure"],
    strong: ["speculation"],
  },
  {
    id: "volunteer-slip",
    title: "Slip and fall, volunteers damaging background",
    transcript: qa([
      ["Where did the fall happen?", "In the grocery store on Main, in aisle six by the freezers, I go there every Saturday."],
      ["What were you wearing on your feet?", "Sandals, I know, probably not the best choice, my sister always tells me that."],
      ["Did you have any prior knee problems?", "I had surgery on that knee in 2019 but it had mostly healed, mostly."],
      ["Did you report the fall?", "Yes, to the manager, who was rude about it, and I told him I'd be calling a lawyer."],
    ]),
    band: [0, 60],
    weak: ["volunteering", "brevity"],
    strong: ["consistency"],
  },
  {
    id: "contract-tight",
    title: "Contract dispute, careful and precise",
    transcript: qa([
      ["Did you sign the agreement dated March 3rd?", "Yes."],
      ["Did you read it before signing?", "Yes."],
      ["Did anyone explain clause 7 to you?", "Not that I recall."],
      ["When did you first learn of the late delivery?", "From the email on April 10th."],
      ["Did you respond to that email?", "Yes, the same day."],
    ]),
    band: [70, 100],
    weak: [],
    strong: ["volunteering", "speculation", "consistency", "brevity", "composure"],
  },
  {
    id: "rambling-honest",
    title: "Honest and consistent, but long-winded",
    transcript: qa([
      ["What is your job?", "I'm a site supervisor, which means I'm responsible for scheduling the crews, checking deliveries, signing off on safety checklists every morning, and dealing with the inspectors when they come by."],
      ["Were you on site on June 2nd?", "Yes, I was there from about 6:30 in the morning because we had a concrete pour, and those always start early because of the heat, and I stayed until the crew finished around four."],
      ["Did you sign the safety checklist that day?", "Yes, I signed it at the start of the shift like I do every day, I keep a copy in the trailer and the original goes to the office."],
    ]),
    band: [30, 75],
    weak: ["brevity", "volunteering"],
    strong: ["consistency", "composure"],
  },
  {
    id: "adopts-framing",
    title: "Gives in to counsel's characterisation",
    transcript: qa([
      ["You were distracted, weren't you?", "I guess, maybe a little, if you put it that way."],
      ["So it was your fault?", "I suppose it could have been, partly."],
      ["You should have seen the cyclist?", "Yeah, probably, I should have."],
      ["Did you stop after the collision?", "Yes."],
    ]),
    band: [0, 60],
    weak: ["composure", "speculation"],
    strong: [],
  },
  {
    id: "medical-other-minds",
    title: "Speculates about what the doctor thought",
    transcript: qa([
      ["What did the doctor tell you?", "That I had a sprain."],
      ["Why didn't she order an X-ray?", "She probably thought it wasn't serious, or maybe the machine was busy."],
      ["Did she say when you could return to work?", "In two weeks."],
      ["Did you follow her instructions?", "Yes."],
    ]),
    band: [40, 85],
    weak: ["speculation"],
    strong: ["volunteering", "brevity", "consistency"],
  },
];
