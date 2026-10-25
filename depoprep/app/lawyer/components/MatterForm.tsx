"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, X, Plus, GripVertical, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";

export const EVENT_TYPES = [
  { value: "deposition", label: "Deposition / EFD" },
  { value: "trial_testimony", label: "Trial Testimony" },
  { value: "settlement_conference", label: "Settlement Conference" },
] as const;

export const PERSONAS = [
  { value: "calm_precise", label: "Calm & Precise", desc: "Methodical, short questions, exploits inconsistencies quietly" },
  { value: "aggressive", label: "Aggressive", desc: "Confrontational, fast-paced, presses hard on vague answers" },
  { value: "friendly_manipulative", label: "Friendly Manipulative", desc: "Builds rapport, then subtly leads witness to contradict themselves" },
] as const;

export type EventType = (typeof EVENT_TYPES)[number]["value"];
export type Persona = (typeof PERSONAS)[number]["value"];

export type MatterFormValues = {
  title: string;
  eventType: EventType;
  eventDate: string;
  caseSummary: string;
  persona: Persona;
  riskTags: string[];
  customQuestions: string[];
};

type MatterFormProps = {
  backHref: string;
  cardTitle: string;
  cardDescription: string;
  submitLabel: string;
  loadingLabel: string;
  initialValues?: Partial<MatterFormValues>;
  onSubmit: (values: MatterFormValues) => Promise<void>;
};

export function MatterForm({
  backHref,
  cardTitle,
  cardDescription,
  submitLabel,
  loadingLabel,
  initialValues,
  onSubmit,
}: MatterFormProps) {
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [eventType, setEventType] = useState<EventType>(initialValues?.eventType ?? "deposition");
  const [eventDate, setEventDate] = useState(initialValues?.eventDate ?? "");
  const [caseSummary, setCaseSummary] = useState(initialValues?.caseSummary ?? "");
  const [persona, setPersona] = useState<Persona>(initialValues?.persona ?? "calm_precise");
  const [riskTagInput, setRiskTagInput] = useState("");
  const [riskTags, setRiskTags] = useState<string[]>(initialValues?.riskTags ?? []);
  const [questionInput, setQuestionInput] = useState("");
  const [customQuestions, setCustomQuestions] = useState<string[]>(initialValues?.customQuestions ?? []);
  const [isLoading, setIsLoading] = useState(false);

  const addTag = () => {
    const tag = riskTagInput.trim();
    if (tag && !riskTags.includes(tag)) {
      setRiskTags([...riskTags, tag]);
      setRiskTagInput("");
    }
  };

  const addQuestion = () => {
    const q = questionInput.trim();
    if (q) {
      setCustomQuestions([...customQuestions, q]);
      setQuestionInput("");
    }
  };

  const suggestQuestions = useAction(api.ai.questionDrafts.suggest);
  const [isSuggesting, setIsSuggesting] = useState(false);

  // The LLM drafts; the lawyer reviews, removes or reorders before saving.
  const handleSuggest = async () => {
    setIsSuggesting(true);
    try {
      const drafts = await suggestQuestions({ eventType, caseSummary, riskTags });
      const fresh = drafts.filter((d) => !customQuestions.includes(d));
      setCustomQuestions([...customQuestions, ...fresh]);
      toast.success(`Added ${fresh.length} draft questions. Review them before saving.`);
    } catch (err) {
      toast.error(err instanceof ConvexError ? String(err.data) : "Couldn't draft questions");
    } finally {
      setIsSuggesting(false);
    }
  };

  const removeQuestion = (idx: number) => {
    setCustomQuestions(customQuestions.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await onSubmit({
        title,
        eventType,
        eventDate,
        caseSummary,
        persona,
        riskTags,
        customQuestions,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link href={backHref} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{cardTitle}</CardTitle>
          <CardDescription>{cardDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Matter Title</Label>
              <Input id="title" placeholder="e.g. Smith v. Jones — MVA Examination for Discovery" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label>Event Type</Label>
              <div className="grid grid-cols-3 gap-3">
                {EVENT_TYPES.map(({ value, label }) => (
                  <button key={value} type="button" onClick={() => setEventType(value)}
                    className={`py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${eventType === value ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="eventDate">Event Date</Label>
              <Input id="eventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="caseSummary">Case Summary</Label>
              <Textarea
                id="caseSummary"
                placeholder="Key facts, parties involved, timeline, how the accident/incident occurred, and any disputed issues the AI should probe..."
                value={caseSummary}
                onChange={(e) => setCaseSummary(e.target.value)}
                className="min-h-32"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Risk Areas to Probe</Label>
              <p className="text-xs text-muted-foreground">Topics the AI will circle back to throughout the session.</p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. prior notice of hazard, timeline inconsistency"
                  value={riskTagInput}
                  onChange={(e) => setRiskTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {riskTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {riskTags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 px-3 py-1 rounded-full text-sm">
                      {tag}
                      <button type="button" onClick={() => setRiskTags(riskTags.filter((t) => t !== tag))}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Custom Questions</Label>
              <p className="text-xs text-muted-foreground">
                The questions opposing counsel will ask, in order. Type your own or let AI draft some from the case summary and risk areas, then edit. At least one question is required for clients to start simulations.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Describe the accident in your own words."
                  value={questionInput}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQuestion(); } }}
                />
                <Button type="button" variant="outline" onClick={addQuestion}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleSuggest()}
                disabled={isSuggesting || caseSummary.trim().length < 20}
              >
                {isSuggesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Suggest questions with AI
              </Button>
              {customQuestions.length > 0 && (
                <div className="space-y-2 mt-2">
                  {customQuestions.map((q, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg border">
                      <GripVertical className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-muted-foreground w-5 flex-shrink-0 font-mono mt-0.5">{idx + 1}.</span>
                      <span className="text-sm flex-1">{q}</span>
                      <button type="button" onClick={() => removeQuestion(idx)} className="text-muted-foreground hover:text-destructive">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    {customQuestions.length} question{customQuestions.length !== 1 ? "s" : ""} — AI will ask these in this order.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Counsel Style</Label>
              <p className="text-xs text-muted-foreground">Choose a style that matches the opposing counsel your client will face.</p>
              <div className="grid gap-3">
                {PERSONAS.map(({ value, label, desc }) => (
                  <button key={value} type="button" onClick={() => setPersona(value)}
                    className={`p-4 rounded-lg border-2 text-left transition-colors ${persona === value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                    <div className="font-medium text-sm">{label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? loadingLabel : submitLabel}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
