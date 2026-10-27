// The fallback chain's time budget, with fetch stubbed: no network, no keys.

import { afterEach, describe, expect, it, vi } from "vitest";
import { chainJson, parseJson } from "../convex/ai/grader";

const SCHEMA = { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] };
const geminiReply = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
const unavailable = () => new Response(JSON.stringify({ error: { message: "high demand" } }), { status: 503 });

// A request that never answers until its timeout aborts it, like Gemini's free tier under load.
const hang = (_url: unknown, init?: RequestInit) =>
  new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));

const ping = (timeoutMs: number) =>
  chainJson({ prompt: "ping", schema: SCHEMA, parse: parseJson, only: "gemini", timeoutMs, maxTokens: 50 });

describe("chainJson time budget (Gemini)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("retries a 503 once when there is time left", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    const fetch = vi.fn().mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(geminiReply('{"ok": true}'));
    vi.stubGlobal("fetch", fetch);
    const result = await ping(10_000);
    expect(result.value).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("gives up on a hung request at the timeout, so the next provider can start", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    const fetch = vi.fn(hang);
    vi.stubGlobal("fetch", fetch);
    const started = Date.now();
    await expect(ping(500)).rejects.toThrow(/Gemini/);
    expect(Date.now() - started).toBeLessThan(1_500);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("skips the retry when a 503 leaves too little time for a reply", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    const fetch = vi.fn().mockResolvedValue(unavailable());
    vi.stubGlobal("fetch", fetch);
    await expect(ping(4_000)).rejects.toThrow(/503/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
