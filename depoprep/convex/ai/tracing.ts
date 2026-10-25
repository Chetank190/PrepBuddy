// Tracing: each AI action records what it did (retrieval, embeddings, every provider attempt in the
// fallback chain, with prompts, replies, token usage and errors) and exports it to Langfuse as
// OpenTelemetry spans over OTLP/HTTP JSON. No SDK: spans are collected in memory and handed to a
// scheduled action, so tracing never slows down or breaks the feature it observes. Any OTLP backend
// accepts the same payload; only the `langfuse.*` attribute names are Langfuse-specific.
// Off unless LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set in Convex.

import { internalAction, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

export type ObservationType = "span" | "chain" | "generation" | "embedding" | "retriever";
export type Usage = { input: number; output: number };
type Scalar = string | number | boolean | undefined;
export type ObservationFields = {
  input?: unknown;
  output?: unknown;
  model?: string;
  usage?: Usage;
  /** Shown as a warning in Langfuse, e.g. a reply that arrived but failed validation. */
  warning?: string;
  metadata?: Record<string, Scalar>;
};

/** Anything spans can hang off: the trace itself (top level) or another observation (nested). */
export interface TraceParent {
  start(name: string, type: ObservationType, fields?: ObservationFields): Observation;
}

type OtlpValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean }
  | { arrayValue: { values: OtlpValue[] } };
type OtlpAttribute = { key: string; value: OtlpValue };
type OtlpSpan = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: 1; // SPAN_KIND_INTERNAL
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
  status: { code: 1 | 2; message?: string }; // 1 = OK, 2 = ERROR
};

// Prompts and transcripts are a few KB; the cap only guards against a runaway reply.
const MAX_TEXT = 20_000;

export function tracingEnabled(): boolean {
  return Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
}

function hex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

const nanos = (ms: number) => `${ms}000000`;

function otlpValue(value: unknown): OtlpValue {
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value) && value.every((x) => typeof x === "string")) {
    return { arrayValue: { values: value.map((x) => ({ stringValue: x })) } };
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return { stringValue: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…[truncated]` : text };
}

function attributes(entries: Record<string, unknown>): OtlpAttribute[] {
  return Object.entries(entries)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ({ key, value: otlpValue(value) }));
}

export class Observation implements TraceParent {
  readonly id = hex(8);
  private readonly startMs = Date.now();
  private ended = false;

  constructor(
    private readonly trace: Trace,
    private readonly name: string,
    private readonly type: ObservationType,
    private readonly parentId: string | undefined,
    private fields: ObservationFields,
  ) {}

  start(name: string, type: ObservationType, fields: ObservationFields = {}): Observation {
    return new Observation(this.trace, name, type, this.id, fields);
  }

  set(fields: ObservationFields): this {
    this.fields = { ...this.fields, ...fields, metadata: { ...this.fields.metadata, ...fields.metadata } };
    return this;
  }

  /** Records the span. Pass the error if the step failed; it shows as ERROR with its message. */
  end(error?: unknown): void {
    if (this.ended) return;
    this.ended = true;
    const f = this.fields;
    const errorMessage = error === undefined ? undefined : error instanceof Error ? error.message : String(error);
    const metadata = Object.fromEntries(
      Object.entries(f.metadata ?? {}).map(([k, value]) => [`langfuse.observation.metadata.${k}`, value]),
    );
    this.trace.record({
      traceId: this.trace.traceId,
      spanId: this.id,
      parentSpanId: this.parentId,
      name: this.name,
      kind: 1,
      startTimeUnixNano: nanos(this.startMs),
      endTimeUnixNano: nanos(Date.now()),
      attributes: attributes({
        ...this.trace.sharedAttributes,
        "langfuse.observation.type": this.type,
        "langfuse.observation.input": f.input,
        "langfuse.observation.output": f.output,
        "langfuse.observation.model.name": f.model,
        "langfuse.observation.usage_details": f.usage,
        "langfuse.observation.level": errorMessage ? "ERROR" : f.warning ? "WARNING" : undefined,
        "langfuse.observation.status_message": errorMessage ?? f.warning,
        ...metadata,
      }),
      status: errorMessage ? { code: 2, message: errorMessage } : { code: 1 },
    });
  }
}

/**
 * One trace per action run. Start child spans with `trace.start(...)`, then call `flush(ctx)` once at
 * the end (in a `finally`), which closes the root span and schedules the export.
 */
export class Trace implements TraceParent {
  readonly traceId = hex(16);
  /** Langfuse filters on trace attributes reliably only when every span carries them. */
  readonly sharedAttributes: Record<string, unknown>;
  private readonly spans: OtlpSpan[] = [];
  private readonly root: Observation;

  constructor(
    name: string,
    opts: {
      /** Groups traces in Langfuse's Sessions view; we use the deposition (sim session) id. */
      sessionId?: string;
      userId?: string;
      tags?: string[];
      metadata?: Record<string, Scalar>;
      input?: unknown;
    } = {},
  ) {
    this.sharedAttributes = {
      "langfuse.trace.name": name,
      "langfuse.session.id": opts.sessionId,
      "langfuse.user.id": opts.userId,
      "langfuse.trace.tags": opts.tags,
      ...Object.fromEntries(
        Object.entries(opts.metadata ?? {}).map(([k, value]) => [`langfuse.trace.metadata.${k}`, value]),
      ),
    };
    // The root span's input and output become the trace's input and output in Langfuse.
    this.root = new Observation(this, name, "span", undefined, { input: opts.input });
  }

  start(name: string, type: ObservationType, fields: ObservationFields = {}): Observation {
    return this.root.start(name, type, fields);
  }

  /** Sets the trace's output (or other root-span fields). */
  set(fields: ObservationFields): this {
    this.root.set(fields);
    return this;
  }

  /** Internal: called by Observation.end. */
  record(span: OtlpSpan): void {
    this.spans.push(span);
  }

  /** Closes the root span and schedules the export. Never throws. */
  async flush(ctx: ActionCtx, error?: unknown): Promise<void> {
    this.root.end(error);
    if (!tracingEnabled() || this.spans.length === 0) return;
    const payload = {
      resourceSpans: [
        {
          resource: { attributes: attributes({ "service.name": "prepbuddy" }) },
          scopeSpans: [{ scope: { name: "prepbuddy" }, spans: this.spans }],
        },
      ],
    };
    try {
      // A separate action does the HTTP call, so the caller returns without waiting on Langfuse.
      await ctx.scheduler.runAfter(0, internal.ai.tracing.exportSpans, { body: JSON.stringify(payload) });
    } catch (err) {
      console.warn(`Trace export not scheduled: ${err instanceof Error ? err.message : err}`);
    }
  }
}

export const exportSpans = internalAction({
  args: { body: v.string() },
  handler: async (_ctx, { body }): Promise<void> => {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    if (!publicKey || !secretKey) return;
    const baseUrl = (process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com").replace(/\/+$/, "");
    try {
      const res = await fetch(`${baseUrl}/api/public/otel/v1/traces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${btoa(`${publicKey}:${secretKey}`)}`,
          // Without this header Langfuse may take up to 10 minutes to show a trace.
          "x-langfuse-ingestion-version": "4",
        },
        signal: AbortSignal.timeout(10_000),
        body,
      });
      if (!res.ok) console.warn(`Langfuse export failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    } catch (err) {
      console.warn(`Langfuse export failed: ${err instanceof Error ? err.message : err}`);
    }
  },
});
