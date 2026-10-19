// Coaching library for the grader's retrieval step (RAG). Each example pairs a typical
// deposition mistake with a better answer. Seeded with embeddings into `coaching_examples`;
// the grader retrieves the closest examples to the witness's answers and includes them
// in the prompt as calibration references.

export type CoachingDimension =
  | "volunteering"
  | "speculation"
  | "consistency"
  | "brevity"
  | "composure";

export type CoachingExample = {
  dimension: CoachingDimension;
  question: string;
  badAnswer: string;
  betterAnswer: string;
  why: string;
};

export const COACHING_EXAMPLES: CoachingExample[] = [
  // Volunteering
  {
    dimension: "volunteering",
    question: "Where were you going that morning?",
    badAnswer: "To work, but I was late because I had to go back home for my son's lunch, so I was rushing a bit.",
    betterAnswer: "To work.",
    why: "Being late and rushing are facts opposing counsel did not ask for and can use to suggest carelessness.",
  },
  {
    dimension: "volunteering",
    question: "Did you have any injuries before the accident?",
    badAnswer: "Not really, I mean I had some back pain from lifting patients but it was nothing serious.",
    betterAnswer: "I had occasional back pain from work before the accident.",
    why: "Minimising a pre-existing condition and adding detail invites follow-up; state the fact plainly.",
  },
  {
    dimension: "volunteering",
    question: "Is there anything you haven't told your lawyer?",
    badAnswer: "Well, there's one thing, I'd had a glass of wine at lunch but that was hours earlier.",
    betterAnswer: "No.",
    why: "Privileged discussions with your lawyer are not for the deposition; raise concerns with your lawyer before testifying.",
  },
  {
    dimension: "volunteering",
    question: "What is your occupation?",
    badAnswer: "I'm a nurse, I've been at the hospital eight years, I work night shifts mostly, it's exhausting honestly.",
    betterAnswer: "I'm a registered nurse.",
    why: "Night shifts and exhaustion open a fatigue line of questioning nobody asked about.",
  },
  // Speculation
  {
    dimension: "speculation",
    question: "How fast were you driving?",
    badAnswer: "Probably around 60, maybe 65, I'm not sure.",
    betterAnswer: "I don't recall the exact speed.",
    why: "A guessed range becomes a number in the record; say what you actually know.",
  },
  {
    dimension: "speculation",
    question: "Why do you think the other driver didn't stop?",
    badAnswer: "He was probably on his phone or something, people always are.",
    betterAnswer: "I don't know why he didn't stop.",
    why: "Guessing another person's state of mind is speculation and can undermine your credibility.",
  },
  {
    dimension: "speculation",
    question: "How long were you stopped at the light?",
    badAnswer: "Maybe a minute? Could have been thirty seconds, I'd guess around there.",
    betterAnswer: "I don't know exactly. I was stopped when the light was red.",
    why: "Offering several guesses invites counsel to pick the one that suits them.",
  },
  {
    dimension: "speculation",
    question: "What time did you leave the house?",
    badAnswer: "I think around 7:40, or it might have been closer to 8, I usually leave around then.",
    betterAnswer: "I don't remember the exact time. My shift started at 8:30.",
    why: "Anchor on facts you know rather than habits or estimates.",
  },
  // Consistency
  {
    dimension: "consistency",
    question: "Were you using your phone while driving?",
    badAnswer: "No. Well, I looked at it once for directions.",
    betterAnswer: "I looked at the map on my phone once while stopped.",
    why: "A flat denial followed by an admission is a contradiction counsel will replay; give the accurate answer the first time.",
  },
  {
    dimension: "consistency",
    question: "Did you see the other car before the impact?",
    badAnswer: "I didn't see it at all. I mean, I saw it in the mirror just before.",
    betterAnswer: "I saw it in my mirror just before the impact.",
    why: "Correcting yourself mid-answer creates two versions of the same fact.",
  },
  {
    dimension: "consistency",
    question: "Were you wearing your seatbelt?",
    badAnswer: "Always, yes. Well, I'd just unbuckled to grab something from the back.",
    betterAnswer: "I had unbuckled shortly before the impact.",
    why: "'Always' is a promise the next sentence breaks.",
  },
  {
    dimension: "consistency",
    question: "Had you been to that intersection before?",
    badAnswer: "Never. Actually I drive through it most weeks.",
    betterAnswer: "Yes, I drive through it most weeks.",
    why: "Pause and answer accurately rather than reflexively.",
  },
  // Brevity
  {
    dimension: "brevity",
    question: "Did you call the police?",
    badAnswer: "Yes, I called them right away, and then I called my husband, and then I sat in the car waiting because I was shaking.",
    betterAnswer: "Yes.",
    why: "A yes/no question deserves yes or no; extra narrative is extra material.",
  },
  {
    dimension: "brevity",
    question: "What colour was your car?",
    badAnswer: "It's a silver Honda, a 2019 Civic, I bought it used about two years ago from a dealer.",
    betterAnswer: "Silver.",
    why: "Answer the question asked; let counsel ask the next one.",
  },
  {
    dimension: "brevity",
    question: "Did you go to the hospital that day?",
    badAnswer: "Yes, well, I work at one, so I went to my own ER, and the staff knew me, which was awkward.",
    betterAnswer: "Yes.",
    why: "Commentary adds nothing to the record and gives counsel threads to pull.",
  },
  {
    dimension: "brevity",
    question: "Do you understand the question?",
    badAnswer: "I think so, you're asking about whether I was distracted, right? Because I wasn't, not really.",
    betterAnswer: "Could you repeat the question?",
    why: "If unsure, ask for the question again instead of answering a question you have guessed at.",
  },
  // Composure
  {
    dimension: "composure",
    question: "Isn't it true you were speeding?",
    badAnswer: "Everyone drives that speed there, you'd have been going the same, so no.",
    betterAnswer: "No.",
    why: "Defensive justifications and arguing with counsel read as evasive.",
  },
  {
    dimension: "composure",
    question: "You've told different stories about this, haven't you?",
    badAnswer: "That's ridiculous, I've been completely honest, I don't know why you'd say that.",
    betterAnswer: "No. I've described it the same way each time.",
    why: "Stay calm and factual; indignation is what aggressive questioning is designed to provoke.",
  },
  {
    dimension: "composure",
    question: "So you admit you were distracted?",
    badAnswer: "Um, I guess, I mean, maybe a little, if you put it that way.",
    betterAnswer: "No, I don't agree with that.",
    why: "Don't adopt counsel's characterisation; it's fine to disagree plainly.",
  },
  {
    dimension: "composure",
    question: "Why didn't you brake earlier?",
    badAnswer: "Oh come on, it happened in a second, what was I supposed to do?",
    betterAnswer: "I braked as soon as I saw the car stopping.",
    why: "Rhetorical questions back at counsel sound combative; describe what you did.",
  },
];
