/** Shared training module definitions (flashcards + quizzes). */

export type Flashcard = { id: string; question: string; answer: string };

export type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type TrainingModuleSeed = {
  slug: string;
  title: string;
  description: string;
  order: number;
  flashcards: Flashcard[];
  quizQuestions: QuizQuestion[];
  isChecklist?: boolean;
  checklistItems?: { id: string; text: string }[];
};

export const TRAINING_MODULES: TrainingModuleSeed[] = [
  {
    slug: "efd_what_is",
    title: "What is an Examination for Discovery?",
    description:
      "Understand the purpose, process, and your role as a defendant.",
    order: 1,
    flashcards: [
      {
        id: "f1",
        question: "What is an Examination for Discovery?",
        answer:
          "A pre-trial step in a civil lawsuit where one party questions the other party, under oath or affirmation, before trial. You are required to tell the truth.",
      },
      {
        id: "f2",
        question: "What is the purpose of an examination for discovery?",
        answer:
          "To let each side: find out the other side's version of the facts; identify documents and evidence; narrow the issues in dispute; assess the strength of the case; and obtain admissions that may be used later at trial.",
      },
      {
        id: "f3",
        question: "What does the court reporter do?",
        answer:
          "Records every question and answer to provide a transcript of the evidence given. This transcript can be used later at trial.",
      },
      {
        id: "f4",
        question: "As a Defendant, what is the opposing lawyer trying to establish?",
        answer:
          "That you caused or contributed to the accident (or incident at issue in the lawsuit).",
      },
      {
        id: "f5",
        question: "Can an examination for discovery be held virtually?",
        answer:
          "Yes. It can be in person (court reporter's office or courtroom setting) or virtually — you are still under oath and the process is official either way.",
      },
    ],
    quizQuestions: [
      {
        id: "q1",
        question: "What is the main purpose of an examination for discovery?",
        options: [
          "To determine the final verdict",
          "To learn each side's facts and identify evidence before trial",
          "To give the judge a preview of trial",
          "To negotiate settlement only",
        ],
        correctIndex: 1,
        explanation:
          "An EFD is a discovery tool — both sides learn facts and evidence before trial. No verdict is decided at the examination.",
      },
      {
        id: "q2",
        question: "Are you required to tell the truth during an EFD?",
        options: [
          "Only if a judge is present",
          "Yes — you are under oath or affirmation",
          "No — it is only a preliminary interview",
          "Only if you choose to swear in",
        ],
        correctIndex: 1,
        explanation: "You are sworn in before an EFD. You must tell the truth, just as at trial.",
      },
      {
        id: "q3",
        question: "What does the court reporter produce?",
        options: [
          "A summary for the judge only",
          "A verbatim transcript that can be used at trial",
          "Notes shared only with your lawyer",
          "A video with no written record",
        ],
        correctIndex: 1,
        explanation:
          "The court reporter creates a word-for-word transcript of everything said.",
      },
      {
        id: "q4",
        question: "As a Defendant, the opposing lawyer is trying to show that you:",
        options: [
          "Deserve compensation",
          "Caused or contributed to the accident",
          "Should be dismissed from the case",
          "Are not a credible person in general",
        ],
        correctIndex: 1,
        explanation:
          "Plaintiff's counsel will try to build a record that you are responsible for what happened.",
      },
      {
        id: "q5",
        question: "A virtual examination for discovery is:",
        options: [
          "Less official than in person",
          "Only for small claims",
          "Equally official — you are still under oath with a court reporter",
          "Not transcribed",
        ],
        correctIndex: 2,
        explanation:
          "Virtual EFDs are fully official. The oath, court reporter, and transcript apply the same way.",
      },
    ],
  },
  {
    slug: "pre_event_checklist",
    title: "Pre-Event Checklist",
    description: "What to wear, what to bring, and how to prepare the day before.",
    order: 2,
    flashcards: [
      {
        id: "f1",
        question: "What should you wear?",
        answer: "Business casual.",
      },
      {
        id: "f2",
        question: "What should you bring (case-related)?",
        answer:
          "Nothing case-related — your lawyer already has copies of all your documents.",
      },
      {
        id: "f3",
        question: "What else should you bring?",
        answer:
          "Anything you may personally require for the day (e.g. medication, water, etc.).",
      },
      {
        id: "f4",
        question: "Should you bring your own copies of documents to help you answer?",
        answer:
          "No — do not bring case documents. Your lawyer has what is needed. Extra copies can create complications.",
      },
      {
        id: "f5",
        question: "Why is business casual recommended?",
        answer:
          "You want to appear respectful and serious. Professional dress supports your credibility on the record.",
      },
    ],
    isChecklist: true,
    checklistItems: [
      { id: "c1", text: "Plan business casual attire" },
      { id: "c2", text: "Do not bring case documents — your lawyer has copies" },
      { id: "c3", text: "Bring personal necessities (medication, water, etc.)" },
      { id: "c4", text: "Confirm time, location, and login details with your lawyer" },
      { id: "c5", text: "Get a full night's sleep before the examination" },
    ],
    quizQuestions: [
      {
        id: "q1",
        question: "What is the recommended dress code?",
        options: ["Casual streetwear", "Business casual", "Formal black tie", "Athletic wear"],
        correctIndex: 1,
        explanation: "Business casual is appropriate — professional but not overly formal.",
      },
      {
        id: "q2",
        question: "Regarding case documents, you should:",
        options: [
          "Bring all originals in case you need them",
          "Bring nothing case-related — your lawyer has copies",
          "Bring only documents you want to show opposing counsel",
          "Email documents to yourself during breaks",
        ],
        correctIndex: 1,
        explanation:
          "Your lawyer already has document copies. Do not bring case materials to the examination.",
      },
      {
        id: "q3",
        question: "You should bring:",
        options: [
          "A prepared written statement to read from",
          "Personal items you need for the day",
          "Notes summarizing your version of events",
          "Your phone to text during breaks",
        ],
        correctIndex: 1,
        explanation:
          "Bring personal necessities only — medication, water, etc. Not case materials or notes.",
      },
      {
        id: "q4",
        question: "Why should you avoid bringing case documents?",
        options: [
          "They are not allowed in the building",
          "Your lawyer has copies; extra documents can create complications",
          "The court reporter will confiscate them",
          "Documents are only for trial, never discovery",
        ],
        correctIndex: 1,
        explanation:
          "Your lawyer manages documents. Bringing your own copies is unnecessary and can cause issues.",
      },
      {
        id: "q5",
        question: "Before the day of the examination, you should:",
        options: [
          "Memorize a script of answers",
          "Confirm logistics with your lawyer and rest well",
          "Research opposing counsel online during the exam",
          "Practice guessing when you are unsure",
        ],
        correctIndex: 1,
        explanation:
          "Confirm time, place, and virtual setup with your lawyer. Rest helps memory and composure.",
      },
    ],
  },
  {
    slug: "procedural_environment",
    title: "Procedural Environment",
    description: "In person vs. virtual setup, equipment, and who is in the room.",
    order: 3,
    flashcards: [
      {
        id: "f1",
        question: "Where can an examination for discovery take place in person?",
        answer:
          "Typically at a court reporter's office, or in a courtroom-style setting. There is no judge in the room.",
      },
      {
        id: "f2",
        question: "Who is typically in the room?",
        answer:
          "Court Reporter; your lawyer; Plaintiff's counsel; and if applicable, lawyers for co-defendants (other parties in the litigation).",
      },
      {
        id: "f3",
        question: "Virtual examination — what should you check beforehand?",
        answer:
          "Stable internet connection; working microphone; video camera; headset or headphones; quiet private location with good lighting.",
      },
      {
        id: "f4",
        question: "Is there a judge present at an examination for discovery?",
        answer:
          "No. There is no judge in the room. Questions and objections are handled between counsel, with the court reporter recording.",
      },
      {
        id: "f5",
        question: "When can you request a break?",
        answer:
          "At any time for personal needs — but not while a question is still pending (unanswered). Answer first, then request a break.",
      },
    ],
    quizQuestions: [
      {
        id: "q1",
        question: "Is a judge present during an examination for discovery?",
        options: [
          "Yes, always",
          "Only if requested",
          "No — there is no judge in the room",
          "Only in virtual examinations",
        ],
        correctIndex: 2,
        explanation:
          "There is no judge at an EFD. Counsel and the court reporter conduct the examination.",
      },
      {
        id: "q2",
        question: "Who records the examination?",
        options: [
          "Your lawyer",
          "The court reporter",
          "Plaintiff's counsel",
          "The judge",
        ],
        correctIndex: 1,
        explanation: "The court reporter creates the official verbatim transcript.",
      },
      {
        id: "q3",
        question: "For a virtual EFD, you should test before the day:",
        options: [
          "Only your email",
          "Internet, microphone, camera, and headphones",
          "Nothing — technology always works",
          "Only your phone's mobile data",
        ],
        correctIndex: 1,
        explanation:
          "Test all equipment the day before so technical problems do not disrupt the examination.",
      },
      {
        id: "q4",
        question: "Plaintiff's counsel is in the room to:",
        options: [
          "Represent you",
          "Ask you questions on behalf of the plaintiff",
          "Act as the court reporter",
          "Decide the outcome of the case",
        ],
        correctIndex: 1,
        explanation:
          "Plaintiff's counsel asks the questions. Your lawyer represents you and may object.",
      },
      {
        id: "q5",
        question: "You need an urgent break while a question is pending. You should:",
        options: [
          "Leave without answering",
          "Finish answering the question, then request a break",
          "Interrupt mid-answer and walk away",
          "Ask the court reporter to delete the question",
        ],
        correctIndex: 1,
        explanation:
          "You cannot take a break while a question remains unanswered. Answer first, then ask for a break.",
      },
    ],
  },
  {
    slug: "legal_words",
      title: "Legal Word Training",
      description: "Key terms you will hear — especially Undertaking and Off the Record.",
      order: 4,
      flashcards: [
        {
          id: "f1",
          question: "What is an Undertaking?",
          answer:
            'A "promise" to do something (e.g. provide an answer later, give a document). Your lawyer will address undertakings — do NOT respond if you hear this word. Wait for your lawyer\'s instruction.',
        },
        {
          id: "f2",
          question: 'What does "Off the Record" mean?',
          answer:
            "The court reporter has stopped recording, so whatever is said during that break is NOT part of the official examination transcript. Only when all parties agree and recording stops.",
        },
        {
          id: "f3",
          question: "If you hear the word 'undertaking,' what should you do?",
          answer:
            "Stop and wait. Do not agree or promise anything. Your lawyer handles undertakings on your behalf.",
        },
        {
          id: "f4",
          question: "Can you assume a sidebar conversation is off the record?",
          answer:
            "No. Never assume you are off the record unless it is explicitly confirmed and the court reporter has stopped recording.",
        },
        {
          id: "f5",
          question: "What happens when your lawyer says 'Objection'?",
          answer:
            "Stop speaking immediately. Your lawyer states the reason. In most cases you will still answer after the objection is noted — unless your lawyer tells you not to.",
        },
      ],
      quizQuestions: [
        {
          id: "q1",
          question: "An undertaking is:",
          options: [
            "A type of court order",
            "A formal promise to do something, handled by your lawyer",
            "When you are excused from answering",
            "A break in the examination",
          ],
          correctIndex: 1,
          explanation:
            "An undertaking is a promise (e.g. to provide info later). Your lawyer addresses it — do not respond yourself.",
        },
        {
          id: "q2",
          question: "When you hear 'undertaking,' you should:",
          options: [
            "Agree to provide whatever is asked",
            "Wait — do not respond until your lawyer instructs you",
            "Ask opposing counsel to explain",
            "Leave the room",
          ],
          correctIndex: 1,
          explanation:
            "Do not respond to undertakings directly. Wait for your lawyer's instruction.",
        },
        {
          id: "q3",
          question: '"Off the record" means:',
          options: [
            "You can speak quietly",
            "The court reporter has stopped recording — not part of the official transcript",
            "Only your lawyer can hear you",
            "The examination has ended",
          ],
          correctIndex: 1,
          explanation:
            "Off the record means the reporter is not transcribing. It requires agreement by all parties.",
        },
        {
          id: "q4",
          question: "You are off the record when:",
          options: [
            "You whisper",
            "Opposing counsel steps out",
            "All parties agree and the court reporter stops recording",
            "Your lawyer asks you a question",
          ],
          correctIndex: 2,
          explanation:
            "Everyone must agree and the reporter must stop. Never assume you are off the record.",
        },
        {
          id: "q5",
          question: "Your lawyer says 'Objection.' You should:",
          options: [
            "Keep answering",
            "Stop speaking and wait for instruction",
            "Argue with opposing counsel",
            "Refuse all further questions",
          ],
          correctIndex: 1,
          explanation:
            "Stop when you hear 'Objection.' You will usually answer after it is noted — unless told otherwise.",
        },
      ],
  },
  {
    slug: "how_to_answer",
    title: "How to Answer Questions",
    description:
      "Rules for listening, brevity, truthfulness, and staying calm under pressure.",
    order: 5,
    flashcards: [
      {
        id: "f1",
        question: "What is the first rule when answering questions?",
        answer:
          "Be respectful at all times. Stay calm. Do not get mad — even if questions feel unfair.",
      },
      {
        id: "f2",
        question: "How carefully should you listen?",
        answer:
          "Listen to the question very carefully, and only answer what is being asked. Do not volunteer extra information.",
      },
      {
        id: "f3",
        question: "How long should your answers be?",
        answer:
          "Answer with yes or no when possible. If not possible, use one short sentence.",
      },
      {
        id: "f4",
        question: "What if you do not know or do not remember?",
        answer:
          "Only answer with facts you know. Say 'I don't know' or 'I don't recall.' Never guess.",
      },
      {
        id: "f5",
        question: "What words should you avoid?",
        answer:
          "Avoid absolutes such as 'always' and 'never' unless you are completely certain. They are easy to disprove.",
      },
      {
        id: "f6",
        question: "What if you realize you misspoke earlier?",
        answer:
          "Correct it immediately on the record: 'I need to correct something I said earlier…' Do not let errors stand in the transcript.",
      },
    ],
    quizQuestions: [
      {
        id: "q1",
        question: "Counsel asks 'Were you there?' and you were. Best answer:",
        options: [
          "'Yes, and let me explain everything that happened…'",
          "'Yes.'",
          "'I think so, probably yes'",
          "'Why do you want to know?'",
        ],
        correctIndex: 1,
        explanation:
          "'Yes.' is complete. Do not volunteer explanations you were not asked for.",
      },
      {
        id: "q2",
        question: "You cannot recall a detail. You should say:",
        options: [
          "Your best guess",
          "'I don't recall.'",
          "Refuse to answer",
          "Ask them to skip the question",
        ],
        correctIndex: 1,
        explanation:
          "'I don't recall' is honest and complete. Guessing creates a harmful record.",
      },
      {
        id: "q3",
        question: "You should avoid words like:",
        options: [
          "'Yes' and 'No'",
          "'Always' and 'Never'",
          "'I don't recall'",
          "'I don't know'",
        ],
        correctIndex: 1,
        explanation:
          "Absolutes are easy to disprove. Use precise, typical descriptions instead.",
      },
      {
        id: "q4",
        question: "Opposing counsel becomes aggressive. You should:",
        options: [
          "Match their tone",
          "Stay calm and answer in a measured way",
          "Stop answering until they calm down",
          "End the examination",
        ],
        correctIndex: 1,
        explanation:
          "Stay calm. Emotional reactions are on the transcript and can hurt credibility.",
      },
      {
        id: "q5",
        question: "The golden rule of volunteering information is:",
        options: [
          "Always explain fully to seem cooperative",
          "Never volunteer — only answer what was asked",
          "Volunteer if you think it helps your case",
          "Volunteer at the end of the examination",
        ],
        correctIndex: 1,
        explanation:
          "Extra details open new lines of questioning. Answer only what was asked.",
      },
    ],
  },
];
