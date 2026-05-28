"use client";

import { use, useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  User,
  Send,
  StopCircle,
  Loader2,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Lock,
  BookOpen,
  Mic,
  Keyboard,
  Volume2,
  VolumeX,
} from "lucide-react";
import { VoiceInput, AnswerMetricBadge } from "@/components/simulation/VoiceInput";
import type { VoiceMetrics } from "@/components/simulation/VoiceInput";

const CONFIDENCE_QUESTIONS = [
  {
    id: "recall",
    question: "How clearly do you remember the details of the incident?",
    options: [
      "Very clearly — I remember everything",
      "Fairly well — I have the main points",
      "Somewhat — some gaps",
      "Not very well",
    ],
  },
  {
    id: "prepared",
    question: "How prepared do you feel to answer questions about the case?",
    options: ["Very prepared", "Somewhat prepared", "A little nervous", "Not prepared at all"],
  },
  {
    id: "rules",
    question:
      "How confident are you in the answering rules (don't volunteer, don't guess, stay brief)?",
    options: [
      "Very confident — I know them well",
      "Fairly confident",
      "I know them but may slip",
      "Not confident",
    ],
  },
];

type ConfidenceAnswers = Record<string, number>;

function ConfidenceCheck({
  matterTitle,
  questionCount,
  persona,
  onComplete,
}: {
  matterTitle: string;
  questionCount: number;
  persona: string;
  onComplete: (answers: ConfidenceAnswers) => void;
}) {
  const [answers, setAnswers] = useState<ConfidenceAnswers>({});
  const [step, setStep] = useState(0);

  const current = CONFIDENCE_QUESTIONS[step];
  const isLast = step === CONFIDENCE_QUESTIONS.length - 1;
  const allAnswered = CONFIDENCE_QUESTIONS.every((q) => answers[q.id] !== undefined);

  const handleAnswer = (idx: number) => {
    const next = { ...answers, [current.id]: idx };
    setAnswers(next);
    if (!isLast) {
      setTimeout(() => setStep(step + 1), 300);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8 text-center">
        <p className="text-sm text-muted-foreground mb-1">Custom practice — lawyer-prepared questions</p>
        <h1 className="text-2xl font-bold">{matterTitle}</h1>
        <p className="text-sm text-muted-foreground mt-2 capitalize">
          {persona.replace("_", " ")} counsel · {questionCount} planned question
          {questionCount !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Check-in {step + 1} of {CONFIDENCE_QUESTIONS.length}
        </span>
      </div>
      <Progress
        value={
          ((step + (answers[current.id] !== undefined ? 1 : 0)) / CONFIDENCE_QUESTIONS.length) * 100
        }
        className="h-1.5 mb-8"
      />

      <Card>
        <CardContent className="p-8">
          <h2 className="text-lg font-semibold mb-6">{current.question}</h2>
          <div className="space-y-3">
            {current.options.map((opt, idx) => (
              <button
                key={idx}
                onClick={() => handleAnswer(idx)}
                className={`w-full text-left p-4 rounded-xl border-2 text-sm font-medium transition-all ${
                  answers[current.id] === idx
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs flex-shrink-0">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  {opt}
                  {answers[current.id] === idx && <CheckCircle className="w-4 h-4 ml-auto" />}
                </span>
              </button>
            ))}
          </div>

          {isLast && allAnswered && (
            <Button className="w-full mt-6" onClick={() => onComplete(answers)}>
              Begin Custom Simulation <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}

          {!isLast && answers[current.id] !== undefined && (
            <Button variant="outline" className="w-full mt-4" onClick={() => setStep(step + 1)}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SimulationPage({ params }: { params: Promise<{ matterId: string }> }) {
  const { matterId } = use(params);
  const { user } = useAuth();
  const router = useRouter();

  const matter = useQuery(api.matters.getById, { id: matterId as Id<"matters"> });
  const unlock = useQuery(
    api.moduleProgress.getTrainingUnlockStatus,
    user ? { clientId: user._id } : "skip"
  );
  const sessions = useQuery(api.simSessions.listByClient, user ? { clientId: user._id } : "skip");

  const activeSession = sessions
    ?.filter((s) => s.matterId === matterId && s.status === "active")
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];

  const createSession = useMutation(api.simSessions.create);
  const addMessage = useMutation(api.simSessions.addMessage);
  const postNextQuestion = useMutation(api.simSessions.postNextQuestion);
  const completeSession = useMutation(api.simSessions.complete);
  const generateFeedback = useAction(api.ai.feedbackEvaluator.generateFeedback);

  const [phase, setPhase] = useState<"confidence" | "chat">("confidence");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<Id<"sim_sessions"> | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [questionAppearedAt, setQuestionAppearedAt] = useState<number | null>(null);
  const [answerMetrics, setAnswerMetrics] = useState<Map<number, VoiceMetrics>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasAutoStarted = useRef(false);
  const lastSpokenIndex = useRef(-1);

  const plannedQuestions = matter?.customQuestions ?? [];
  const maxQuestions = plannedQuestions.length;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeSession?.transcript]);

  // TTS: speak new AI messages aloud when voice mode + TTS are on
  useEffect(() => {
    if (!ttsEnabled || !voiceMode || !activeSession) return;
    const transcript = activeSession.transcript;
    const aiMessages = transcript.filter((t) => t.role === "ai");
    const newIdx = aiMessages.length - 1;

    if (newIdx > lastSpokenIndex.current && aiMessages[newIdx]) {
      lastSpokenIndex.current = newIdx;
      setQuestionAppearedAt(Date.now());
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(aiMessages[newIdx].content);
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        // Pick a voice — prefer a female English voice for "opposing counsel"
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find((v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("female"))
          ?? voices.find((v) => v.lang.startsWith("en"))
          ?? voices[0];
        if (preferred) utterance.voice = preferred;
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [activeSession?.transcript, ttsEnabled, voiceMode]);

  useEffect(() => {
    if (
      activeSession &&
      activeSession.transcript.length === 0 &&
      !isSending &&
      !hasAutoStarted.current &&
      matter &&
      maxQuestions > 0 &&
      unlock?.allModulesPassed
    ) {
      hasAutoStarted.current = true;
      setCurrentSessionId(activeSession._id);
      setPhase("chat");
      void postFirstQuestion(activeSession._id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?._id, matter?._id, unlock?.allModulesPassed]);

  const postFirstQuestion = async (sessionId: Id<"sim_sessions">) => {
    setIsSending(true);
    try {
      await postNextQuestion({ sessionId });
    } catch {
      toast.error("Failed to load the first question");
    } finally {
      setIsSending(false);
    }
  };

  const handleConfidenceComplete = async () => {
    if (!user || !matter) return;
    try {
      const sessionId = await createSession({ clientId: user._id, matterId: matter._id });
      setCurrentSessionId(sessionId);
      setPhase("chat");
      await postFirstQuestion(sessionId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start session");
    }
  };

  const handleSend = async (overrideText?: string, metrics?: VoiceMetrics) => {
    const sessionId = currentSessionId ?? activeSession?._id;
    const content = overrideText ?? message.trim();
    if (!content || !sessionId || isSending) return;

    const msgIdx = (activeSession?.transcript ?? []).filter((t) => t.role === "client").length;

    if (!overrideText) setMessage("");
    setIsSending(true);

    if (metrics) {
      setAnswerMetrics((prev) => new Map(prev).set(msgIdx, metrics));
    }

    // Stop TTS when client starts answering
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();

    try {
      await addMessage({ sessionId, role: "client", content });
      const result = await postNextQuestion({ sessionId });
      if (result.done) {
        toast.success("All planned questions complete. End the session for feedback.");
      }
    } catch {
      toast.error("Failed to send — please try again");
    } finally {
      setIsSending(false);
    }
  };

  const handleEndSession = async () => {
    const sessionId = currentSessionId ?? activeSession?._id;
    if (!sessionId) return;
    setIsEnding(true);
    try {
      await completeSession({ sessionId });
      await generateFeedback({ sessionId });
      toast.success("Session complete! View your feedback below.");
      router.push(`/client/simulation/${matterId}/results/${sessionId}`);
    } catch {
      toast.error("Failed to generate feedback — try again");
    } finally {
      setIsEnding(false);
    }
  };

  if (!matter || unlock === undefined) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!unlock.allModulesPassed) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-8 text-center">
            <Lock className="w-12 h-12 text-amber-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-amber-800 mb-2">Complete Basic Training First</h2>
            <p className="text-amber-700 mb-2">
              Custom simulation unlocks after all modules are passed (≥80%). Your saved scores count — you
              do not need to retake modules you already passed.
            </p>
            <p className="text-sm text-amber-600 mb-4">
              Progress: {unlock.passedCount}/{unlock.totalCount} modules passed
            </p>
            <Link href="/client/training">
              <Button variant="outline">
                <BookOpen className="w-4 h-4 mr-2" />
                Go to Training
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (maxQuestions === 0) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-semibold mb-2">No Practice Questions Yet</h2>
            <p className="text-muted-foreground mb-4">
              Your lawyer has not added custom questions for this matter. Simulation uses only
              lawyer-defined questions.
            </p>
            <Link href="/client/simulation">
              <Button variant="outline">Back to Simulation</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "confidence" && !activeSession) {
    return (
      <ConfidenceCheck
        matterTitle={matter.title}
        questionCount={maxQuestions}
        persona={matter.persona}
        onComplete={handleConfidenceComplete}
      />
    );
  }

  const sessionId = currentSessionId ?? activeSession?._id;
  const transcript = activeSession?.transcript ?? [];
  const aiQuestionsAsked = Math.min(
    activeSession?.currentQuestionIndex ?? 0,
    maxQuestions
  );
  const sessionComplete =
    (activeSession?.currentQuestionIndex ?? 0) >= maxQuestions &&
    transcript.some((t) => t.role === "ai" && t.content.includes("Those are all my questions"));

  return (
    <div className="flex flex-col h-screen max-h-screen">
      <div className="border-b px-6 py-4 flex items-center justify-between bg-card flex-shrink-0">
        <div>
          <h2 className="font-semibold">{matter.title}</h2>
          <p className="text-xs text-muted-foreground capitalize">
            {matter.persona.replace("_", " ")} counsel · {maxQuestions} lawyer-planned questions
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              {aiQuestionsAsked}/{maxQuestions} questions asked
            </p>
            <Progress value={(aiQuestionsAsked / maxQuestions) * 100} className="h-1.5 w-32 mt-1" />
          </div>
          <div className="flex items-center gap-2">
            {voiceMode && ttsEnabled && (
              <span className="text-xs text-primary flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5" /> AI voice
              </span>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={handleEndSession}
              disabled={isEnding || !sessionId || transcript.length < 2}
            >
              {isEnding ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4 mr-1" />}
              End & Get Feedback
            </Button>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {transcript.length === 0 && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
              <p className="text-muted-foreground text-sm">Loading the first planned question…</p>
            </div>
          )}

          {transcript.map((msg, i) => {
            const clientMsgIdx = transcript.slice(0, i + 1).filter((t) => t.role === "client").length - 1;
            const metrics = msg.role === "client" ? answerMetrics.get(clientMsgIdx) : undefined;

            return (
            <div key={i} className={`flex gap-3 ${msg.role === "client" ? "flex-row-reverse" : ""}`}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === "ai" ? "bg-primary/10" : "bg-secondary"
                }`}
              >
                {msg.role === "ai" ? <Bot className="w-4 h-4 text-primary" /> : <User className="w-4 h-4" />}
              </div>
              <div className={`max-w-[75%] flex flex-col gap-1 ${msg.role === "client" ? "items-end" : ""}`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "ai" ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
                  }`}
                >
                  {msg.content}
                </div>
                {msg.flags && msg.flags.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {msg.flags.map((flag) => (
                      <span
                        key={flag}
                        className="flex items-center gap-0.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        {flag}
                      </span>
                    ))}
                  </div>
                )}
                {metrics && voiceMode && (
                  <AnswerMetricBadge metrics={metrics} />
                )}
              </div>
            </div>
            );
          })}

          {isSending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl px-4 py-3 flex items-center gap-1">
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t p-4 bg-card flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          {/* Mode toggles */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setVoiceMode(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  !voiceMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                }`}
              >
                <Keyboard className="w-3.5 h-3.5" /> Text
              </button>
              <button
                onClick={() => setVoiceMode(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  voiceMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                }`}
              >
                <Mic className="w-3.5 h-3.5" /> Voice
              </button>
            </div>
            {voiceMode && (
              <button
                onClick={() => setTtsEnabled(!ttsEnabled)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                title={ttsEnabled ? "Turn off AI voice" : "Turn on AI voice"}
              >
                {ttsEnabled ? <Volume2 className="w-4 h-4 text-primary" /> : <VolumeX className="w-4 h-4" />}
                <span>{ttsEnabled ? "AI voice on" : "AI voice off"}</span>
              </button>
            )}
          </div>

          {/* Input area */}
          {sessionComplete ? (
            <p className="text-center text-sm text-muted-foreground py-3">
              All questions complete — click &ldquo;End &amp; Get Feedback&rdquo; above.
            </p>
          ) : voiceMode ? (
            <VoiceInput
              onSubmit={(text, metrics) => handleSend(text, metrics)}
              disabled={isSending || !sessionId || transcript.length === 0}
              questionAppearedAt={questionAppearedAt}
            />
          ) : (
            <div className="flex gap-3">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Type your answer… (Enter to send, Shift+Enter for new line)"
                className="min-h-[60px] max-h-32 resize-none"
                disabled={isSending || !sessionId || transcript.length === 0}
              />
              <Button
                onClick={() => void handleSend()}
                disabled={!message.trim() || isSending || !sessionId || transcript.length === 0}
                className="self-end"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}

          <p className="text-xs text-center text-muted-foreground mt-2">
            {voiceMode
              ? "Speak your answer — auto-sends after 1.5s pause"
              : "Answer only what was asked. Be brief."}
          </p>
        </div>
      </div>
    </div>
  );
}
