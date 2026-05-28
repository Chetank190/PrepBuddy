"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Send, Loader2 } from "lucide-react";

const FILLER_WORDS = [
  "um", "uh", "er", "ah", "like", "you know", "i think",
  "i guess", "i'm not sure", "maybe", "probably", "i believe",
  "kind of", "sort of", "basically", "literally",
];

export interface VoiceMetrics {
  fillerCount: number;
  fillerWords: string[];
  confidence: number;       // 0–1 avg transcription clarity
  responseDelayMs: number;  // ms from question to first word
  wordCount: number;
  pauseCount: number;       // number of mid-answer pauses detected
}

interface VoiceInputProps {
  onSubmit: (text: string, metrics: VoiceMetrics) => void;
  disabled: boolean;
  questionAppearedAt: number | null; // Date.now() when AI question appeared
}

// Web Speech API type shims (not included in all TS lib.dom versions)
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onspeechend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

export function VoiceInput({ onSubmit, disabled, questionAppearedAt }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [pauseCountdown, setPauseCountdown] = useState<number | null>(null);
  const [detectedFillers, setDetectedFillers] = useState<string[]>([]);
  const [avgConfidence, setAvgConfidence] = useState(1);
  const [pauseCount, setPauseCount] = useState(0);
  const [firstWordAt, setFirstWordAt] = useState<number | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confidenceSamplesRef = useRef<number[]>([]);
  const pauseCountRef = useRef(0);
  const firstWordAtRef = useRef<number | null>(null);
  const finalTextRef = useRef("");

  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      setIsSupported(false);
      return;
    }

    const recognition: SpeechRecognitionInstance = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-CA"; // Canadian English

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Track first word timing
      if (firstWordAtRef.current === null) {
        firstWordAtRef.current = Date.now();
        setFirstWordAt(Date.now());
      }

      // Clear pause timer on any new speech
      clearPauseTimer();

      let interim = "";
      let newFinal = "";
      let totalConfidence = 0;
      let confidenceSamples = 0;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          newFinal += result[0].transcript;
          totalConfidence += result[0].confidence;
          confidenceSamples++;
        } else {
          interim += result[0].transcript;
        }
      }

      if (newFinal) {
        finalTextRef.current += newFinal;
        setFinalText(finalTextRef.current);

        if (confidenceSamples > 0) {
          confidenceSamplesRef.current.push(totalConfidence / confidenceSamples);
          const avg = confidenceSamplesRef.current.reduce((a, b) => a + b, 0) / confidenceSamplesRef.current.length;
          setAvgConfidence(avg);
        }

        // Detect filler words in the running transcript
        const lower = finalTextRef.current.toLowerCase();
        const found = FILLER_WORDS.filter((fw) => lower.includes(fw));
        setDetectedFillers(found);

        // Start pause timer after each final result
        startPauseTimer();
      }

      setInterimText(interim);
    };

    recognition.onspeechend = () => {
      pauseCountRef.current += 1;
      setPauseCount(pauseCountRef.current);
      startPauseTimer();
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "no-speech") {
        console.error("Speech recognition error:", event.error);
        stopListening();
      }
    };

    recognition.onend = () => {
      // Auto-restart if still in listening mode (continuous recognition stops on silence)
      if (isListening && finalTextRef.current.length === 0) {
        try { recognition.start(); } catch { /* already starting */ }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onspeechend = null;
      recognition.onerror = null;
      recognition.onend = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPauseTimer = useCallback(() => {
    clearPauseTimer();
    let remaining = 15; // 1.5s in 100ms steps
    setPauseCountdown(remaining);

    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setPauseCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current!);
        setPauseCountdown(null);
        submitAnswer();
      }
    }, 100);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clearPauseTimer = () => {
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setPauseCountdown(null);
  };

  const submitAnswer = useCallback(() => {
    const text = finalTextRef.current.trim();
    if (!text) return;

    const lower = text.toLowerCase();
    const fillers = FILLER_WORDS.filter((fw) => lower.includes(fw));
    const words = text.split(/\s+/).filter(Boolean);
    const delay = (firstWordAtRef.current && questionAppearedAt)
      ? firstWordAtRef.current - questionAppearedAt
      : 0;

    const metrics: VoiceMetrics = {
      fillerCount: fillers.length,
      fillerWords: fillers,
      confidence: confidenceSamplesRef.current.length > 0
        ? confidenceSamplesRef.current.reduce((a, b) => a + b, 0) / confidenceSamplesRef.current.length
        : 1,
      responseDelayMs: delay,
      wordCount: words.length,
      pauseCount: pauseCountRef.current,
    };

    stopListening();
    onSubmit(text, metrics);
    resetState();
  }, [onSubmit, questionAppearedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetState = () => {
    finalTextRef.current = "";
    firstWordAtRef.current = null;
    confidenceSamplesRef.current = [];
    pauseCountRef.current = 0;
    setFinalText("");
    setInterimText("");
    setDetectedFillers([]);
    setAvgConfidence(1);
    setPauseCount(0);
    setFirstWordAt(null);
    setPauseCountdown(null);
  };

  const stopListening = () => {
    clearPauseTimer();
    setIsListening(false);
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
  };

  const startListening = () => {
    if (!recognitionRef.current || disabled) return;
    resetState();
    setIsListening(true);
    try { recognitionRef.current.start(); } catch { /* ignore if already running */ }
  };

  const handleManualSubmit = () => {
    clearPauseTimer();
    submitAnswer();
  };

  const handleCancelListen = () => {
    clearPauseTimer();
    stopListening();
    resetState();
  };

  if (!isSupported) {
    return (
      <p className="text-xs text-amber-600 text-center py-2">
        Voice input requires Chrome or Edge. Switch to text mode.
      </p>
    );
  }

  // ── Idle: mic button to start ──────────────────────────────────────────
  if (!isListening) {
    return (
      <button
        onClick={startListening}
        disabled={disabled}
        className="flex flex-col items-center gap-2 mx-auto disabled:opacity-40"
      >
        <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-lg hover:bg-primary/90 transition-all hover:scale-105 active:scale-95">
          <Mic className="w-7 h-7 text-primary-foreground" />
        </div>
        <span className="text-xs text-muted-foreground">Tap to speak</span>
      </button>
    );
  }

  // ── Listening: live transcript + pause bar ────────────────────────────
  const displayText = finalText + (interimText ? ` ${interimText}` : "");

  return (
    <div className="space-y-3 w-full">
      {/* Live transcript */}
      <div className="min-h-[60px] max-h-28 overflow-y-auto rounded-xl border bg-background px-4 py-3 text-sm">
        {displayText ? (
          <>
            <span className="text-foreground">{finalText}</span>
            {interimText && <span className="text-muted-foreground"> {interimText}</span>}
          </>
        ) : (
          <span className="text-muted-foreground animate-pulse">Listening…</span>
        )}
      </div>

      {/* Pause countdown bar */}
      {pauseCountdown !== null && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Auto-sending in {(pauseCountdown / 10).toFixed(1)}s…</span>
            <span className="text-amber-600">{detectedFillers.length > 0 && `${detectedFillers.length} filler word${detectedFillers.length !== 1 ? "s" : ""}`}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-100 rounded-full"
              style={{ width: `${((15 - pauseCountdown) / 15) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Live filler word alerts */}
      {detectedFillers.length > 0 && pauseCountdown === null && (
        <div className="flex flex-wrap gap-1">
          {detectedFillers.map((fw) => (
            <span key={fw} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
              "{fw}" detected
            </span>
          ))}
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-2">
        {/* Pulsing recording indicator */}
        <div className="flex items-center gap-2 flex-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs text-muted-foreground">Recording</span>
        </div>

        <button
          onClick={handleCancelListen}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Cancel
        </button>

        <Button
          size="sm"
          onClick={handleManualSubmit}
          disabled={!finalText.trim()}
        >
          <Send className="w-3.5 h-3.5 mr-1.5" />
          Send now
        </Button>
      </div>
    </div>
  );
}

// ── Answer metric badge shown after each client response ──────────────────

export function AnswerMetricBadge({ metrics }: { metrics: VoiceMetrics }) {
  const hasFillers = metrics.fillerCount > 0;
  const slowResponse = metrics.responseDelayMs > 5000;
  const shortAnswer = metrics.wordCount < 5;
  const longAnswer = metrics.wordCount > 60;

  const issues = [
    hasFillers && `${metrics.fillerCount} filler word${metrics.fillerCount !== 1 ? "s" : ""}`,
    slowResponse && "slow response",
    shortAnswer && "very brief",
    longAnswer && "long answer",
  ].filter(Boolean) as string[];

  if (issues.length === 0) {
    return (
      <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
        ✓ Clean answer
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {issues.map((issue) => (
        <span key={issue} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
          ⚠ {issue}
        </span>
      ))}
    </div>
  );
}
