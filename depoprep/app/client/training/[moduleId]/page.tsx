"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Mic,
  Lightbulb,
} from "lucide-react";
import { useRouter } from "next/navigation";

type Flashcard = { id: string; question: string; answer: string };

type ModuleContent = {
  flashcards?: Flashcard[];
  isChecklist?: boolean;
  items?: { id: string; text: string }[];
};

type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

type Phase = "flashcards" | "checklist" | "quiz" | "results";

export default function ModulePage({ params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = use(params);
  const { user } = useAuth();
  const router = useRouter();

  const mod = useQuery(api.basicModules.getById, {
    id: moduleId as Id<"basic_modules">,
  });
  const existingProgress = useQuery(
    api.moduleProgress.getForClientModule,
    user && mod ? { clientId: user._id, moduleId: mod._id } : "skip"
  );
  const unlock = useQuery(
    api.moduleProgress.getTrainingUnlockStatus,
    user ? { clientId: user._id } : "skip"
  );
  const upsertProgress = useMutation(api.moduleProgress.upsertProgress);

  const alreadyPassed =
    existingProgress?.status === "completed" && (existingProgress.score ?? 0) >= 80;

  const [phase, setPhase] = useState<Phase>("flashcards");
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [showExplanation, setShowExplanation] = useState(false);

  if (!mod) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const content: ModuleContent = JSON.parse(mod.content);
  const flashcards = content.flashcards ?? [];
  const questions: QuizQuestion[] = mod.quizQuestions;
  const isChecklist = content.isChecklist;
  const checklistItems = content.items ?? [];

  const handleStartProgress = async () => {
    if (!user) return;
    await upsertProgress({ clientId: user._id, moduleId: mod._id, status: "in_progress" });
  };

  // Flashcard study phase
  if (phase === "flashcards") {
    const card = flashcards[cardIndex];
    const isLastCard = cardIndex === flashcards.length - 1;

    const goNext = async () => {
      if (cardIndex < flashcards.length - 1) {
        setCardIndex(cardIndex + 1);
        setFlipped(false);
      } else if (isChecklist) {
        await handleStartProgress();
        setPhase("checklist");
      } else if (questions.length > 0) {
        await handleStartProgress();
        setPhase("quiz");
      } else {
        if (!user) return;
        await upsertProgress({
          clientId: user._id,
          moduleId: mod._id,
          status: "completed",
          score: 100,
        });
        toast.success("Module complete!");
        router.push("/client/training");
      }
    };

    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Link
          href="/client/training"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Training
        </Link>

        {alreadyPassed && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800 flex items-center justify-between gap-3">
            <span>
              You passed this module ({existingProgress?.score}%) — score saved. Review flashcards
              anytime; no need to retake the quiz for unlock.
            </span>
            {unlock?.allModulesPassed && (
              <Link href="/client/simulation">
                <Button size="sm" variant="outline">
                  <Mic className="w-4 h-4 mr-1" />
                  Simulation
                </Button>
              </Link>
            )}
          </div>
        )}

        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">{mod.title}</h1>
          <p className="text-muted-foreground text-sm">{mod.description}</p>
          <div className="flex justify-between text-sm mt-4 mb-2">
            <span className="text-muted-foreground">Flashcard {cardIndex + 1} of {flashcards.length}</span>
            <span className="text-primary font-medium">Tap card to flip</span>
          </div>
          <Progress value={((cardIndex + 1) / flashcards.length) * 100} className="h-2" />
        </div>

        <button
          type="button"
          className="w-full min-h-[220px] perspective-1000 mb-6"
          onClick={() => setFlipped(!flipped)}
        >
          <Card
            className={`transition-all duration-300 cursor-pointer hover:shadow-lg ${
              flipped ? "bg-primary text-primary-foreground" : "bg-card"
            }`}
          >
            <CardContent className="p-10 text-center min-h-[220px] flex flex-col items-center justify-center">
              <p className="text-xs uppercase tracking-wider opacity-70 mb-3">
                {flipped ? "Answer" : "Question"}
              </p>
              <p className="text-lg font-medium leading-relaxed">
                {flipped ? card.answer : card.question}
              </p>
              <p className="text-xs mt-6 opacity-60 flex items-center gap-1">
                <RotateCcw className="w-3 h-3" />
                {flipped ? "Tap to see question" : "Tap to reveal answer"}
              </p>
            </CardContent>
          </Card>
        </button>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            disabled={cardIndex === 0}
            onClick={() => {
              setCardIndex(cardIndex - 1);
              setFlipped(false);
            }}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <Button className="flex-1" onClick={goNext}>
            {isLastCard
              ? isChecklist
                ? "Continue to Checklist"
                : questions.length > 0
                  ? alreadyPassed
                    ? "Retake Quiz (optional)"
                    : "Take the Quiz"
                  : "Complete Module"
              : "Next Card"}
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  // Checklist phase
  if (phase === "checklist") {
    const allChecked = checklistItems.every((item) => checkedItems.has(item.id));

    const handleCompleteChecklist = () => {
      if (questions.length > 0) {
        setPhase("quiz");
      }
    };

    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Link
          href="/client/training"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Training
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Pre-Event Checklist</CardTitle>
            <p className="text-muted-foreground">Check off each item before taking the quiz.</p>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span>Progress</span>
                <span>
                  {checkedItems.size}/{checklistItems.length}
                </span>
              </div>
              <Progress value={(checkedItems.size / checklistItems.length) * 100} className="h-2" />
            </div>
            <div className="space-y-3">
              {checklistItems.map((item) => (
                <label
                  key={item.id}
                  className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                    checkedItems.has(item.id) ? "bg-green-50 border-green-200" : "hover:bg-muted/50"
                  }`}
                >
                  <Checkbox
                    checked={checkedItems.has(item.id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(checkedItems);
                      if (checked) next.add(item.id);
                      else next.delete(item.id);
                      setCheckedItems(next);
                    }}
                    className="mt-0.5"
                  />
                  <span
                    className={`text-sm ${checkedItems.has(item.id) ? "line-through text-muted-foreground" : ""}`}
                  >
                    {item.text}
                  </span>
                </label>
              ))}
            </div>
            <Button className="w-full mt-6" disabled={!allChecked} onClick={handleCompleteChecklist}>
              <CheckCircle className="w-4 h-4 mr-2" />
              Take the Quiz
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Quiz phase
  if (phase === "quiz") {
    const question = questions[currentQ];
    const isAnswered = selected !== null;
    const isCorrect = selected === question.correctIndex;

    const handleAnswer = (idx: number) => {
      if (isAnswered) return;
      setSelected(idx);
      setShowExplanation(true);
      setAnswers({ ...answers, [question.id]: idx });
    };

    const handleNext = () => {
      if (currentQ < questions.length - 1) {
        setCurrentQ(currentQ + 1);
        setSelected(null);
        setShowExplanation(false);
      } else {
        setPhase("results");
      }
    };

    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">
              Question {currentQ + 1} of {questions.length}
            </span>
            <span className="font-medium">{mod.title}</span>
          </div>
          <Progress value={(currentQ / questions.length) * 100} className="h-2" />
        </div>

        <Card>
          <CardContent className="p-8">
            <h2 className="text-lg font-semibold mb-6">{question.question}</h2>
            <div className="space-y-3">
              {question.options.map((opt, idx) => {
                let className =
                  "p-4 rounded-xl border-2 text-left w-full text-sm font-medium transition-all ";
                if (!isAnswered) {
                  className += "hover:border-primary/40 border-border cursor-pointer";
                } else if (idx === question.correctIndex) {
                  className += "border-green-500 bg-green-50 text-green-800";
                } else if (idx === selected) {
                  className += "border-red-500 bg-red-50 text-red-800";
                } else {
                  className += "border-border text-muted-foreground cursor-not-allowed";
                }

                return (
                  <button
                    key={idx}
                    className={className}
                    onClick={() => handleAnswer(idx)}
                    disabled={isAnswered}
                  >
                    <span className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      {opt}
                      {isAnswered && idx === question.correctIndex && (
                        <CheckCircle className="w-4 h-4 text-green-600 ml-auto" />
                      )}
                      {isAnswered && idx === selected && idx !== question.correctIndex && (
                        <XCircle className="w-4 h-4 text-red-600 ml-auto" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {showExplanation && (
              <div
                className={`mt-4 p-4 rounded-xl text-sm ${
                  isCorrect
                    ? "bg-green-50 border border-green-200 text-green-800"
                    : "bg-amber-50 border border-amber-200 text-amber-800"
                }`}
              >
                <p className="font-semibold mb-1">{isCorrect ? "Correct!" : "Not quite."}</p>
                <p>{question.explanation}</p>
              </div>
            )}

            {isAnswered && (
              <Button className="w-full mt-4" onClick={handleNext}>
                {currentQ < questions.length - 1 ? "Next Question" : "See Results"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Results phase
  if (phase === "results") {
    const correct = questions.filter((q) => answers[q.id] === q.correctIndex).length;
    const score = Math.round((correct / questions.length) * 100);
    const passed = score >= 80;
    const needsRepeat = score < 70;
    const missedQuestions = questions.filter((q) => answers[q.id] !== q.correctIndex);

    const handleSave = async () => {
      if (!user) return;
      await upsertProgress({
        clientId: user._id,
        moduleId: mod._id,
        status: "completed",
        score,
      });
      toast.success(passed ? "Module passed! Great work." : "Score saved. Try again to reach 80%.");
      router.push("/client/training");
    };

    const handleRetakeQuiz = () => {
      setPhase("quiz");
      setCurrentQ(0);
      setSelected(null);
      setAnswers({});
      setShowExplanation(false);
    };

    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Card>
          <CardContent className="p-10 text-center">
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold mx-auto mb-6 ${
                passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              }`}
            >
              {score}%
            </div>
            <h2 className="text-2xl font-bold mb-2">{passed ? "Module Passed!" : "Not Yet"}</h2>
            <p className="text-muted-foreground mb-2">
              You got {correct} of {questions.length} questions right.
            </p>
            <p className={`text-sm font-medium mb-4 ${passed ? "text-green-700" : "text-red-700"}`}>
              {passed
                ? "You met the 80% passing threshold."
                : "You need at least 80% to pass. Review the flashcards and try again."}
            </p>
            {needsRepeat && (
              <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm text-left">
                <p className="font-semibold mb-1">Score below 70% — please repeat the test</p>
                <p>
                  Review the suggestions below, study the flashcards, then retake the quiz to build
                  your readiness.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {missedQuestions.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-primary" />
                How to Improve
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {missedQuestions.map((q, i) => (
                <div key={q.id} className="text-sm border-b last:border-0 pb-4 last:pb-0">
                  <p className="font-medium mb-1">
                    {i + 1}. {q.question}
                  </p>
                  <p className="text-muted-foreground mb-1">
                    Your answer:{" "}
                    <span className="text-red-700">{q.options[answers[q.id]] ?? "—"}</span>
                  </p>
                  <p className="text-green-700 mb-1">
                    Correct answer: {q.options[q.correctIndex]}
                  </p>
                  <p className="text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3">
                    {q.explanation}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3 justify-center mt-6">
          <Button
            variant="outline"
            onClick={() => {
              setPhase("flashcards");
              setCardIndex(0);
              setFlipped(false);
              setCurrentQ(0);
              setSelected(null);
              setAnswers({});
              setShowExplanation(false);
            }}
          >
            Review Flashcards
          </Button>
          {needsRepeat && (
            <Button onClick={handleRetakeQuiz}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Repeat Test
            </Button>
          )}
          <Button variant={needsRepeat ? "outline" : "default"} onClick={handleSave}>
            {passed ? "Continue to Next Module" : "Save & Retry Later"}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
