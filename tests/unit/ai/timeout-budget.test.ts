import { describe, it, expect, vi, beforeEach } from "vitest";
import { FallbackModelProvider } from "../../../src/ai/fallback.provider.js";
import { ModelProvider } from "../../../src/ai/model.provider.js";
import { ModelTimeoutError, ModelUnavailableError } from "../../../src/domain/errors.js";
import { parseConfig, setCachedConfig } from "../../../src/config/env.js";

describe("Timeout & Fallback Turn Budget (Part U)", () => {
  beforeAll(() => {
    setCachedConfig(
      parseConfig({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
        OPENAI_API_KEY: "test-openai-key",
        GROQ_API_KEY: "test-groq-key",
        AI_FALLBACK_ENABLED: "true",
        AI_PRIMARY_PROVIDER: "openai",
        AI_FALLBACK_PROVIDER: "groq",
        OPENAI_TIMEOUT_MS: "20000",
        GROQ_TIMEOUT_MS: "20000",
        CHAT_TURN_TIMEOUT_MS: "45000",
      }),
    );
  });

  it("OpenAI succeeds quickly -> Groq not called", async () => {
    const mockOpenAI: ModelProvider = {
      chat: vi.fn().mockResolvedValue({
        content: "OpenAI response",
        toolCalls: [],
        model: "gpt-4o-mini",
        provider: "openai",
      }),
    };

    const mockGroq: ModelProvider = {
      chat: vi.fn(),
    };

    const provider = new FallbackModelProvider(mockOpenAI, mockGroq);
    const res = await provider.chat({
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 20000,
    });

    expect(res.content).toBe("OpenAI response");
    expect(res.provider).toBe("openai");
    expect(mockGroq.chat).not.toHaveBeenCalled();
  });

  it("OpenAI timeout -> Groq fallback attempted when sufficient turn time remains", async () => {
    const mockOpenAI: ModelProvider = {
      chat: vi.fn().mockRejectedValue(new ModelTimeoutError("OpenAI timed out")),
    };

    const mockGroq: ModelProvider = {
      chat: vi.fn().mockResolvedValue({
        content: "Groq response after fallback",
        toolCalls: [],
        model: "openai/gpt-oss-120b",
        provider: "groq",
      }),
    };

    const provider = new FallbackModelProvider(mockOpenAI, mockGroq);
    const res = await provider.chat({
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 30000, // plenty of budget
    });

    expect(res.content).toBe("Groq response after fallback");
    expect(res.fallbackUsed).toBe(true);
    expect(mockGroq.chat).toHaveBeenCalledTimes(1);
  });

  it("OpenAI timeout with negligible turn budget (<2s) -> Groq call skipped, throws immediately", async () => {
    const mockOpenAI: ModelProvider = {
      chat: vi.fn().mockRejectedValue(new ModelTimeoutError("OpenAI timed out")),
    };

    const mockGroq: ModelProvider = {
      chat: vi.fn(),
    };

    const provider = new FallbackModelProvider(mockOpenAI, mockGroq);

    // Timeout budget passed is 1500ms (<2000ms threshold)
    await expect(
      provider.chat({
        messages: [{ role: "user", content: "hi" }],
        timeoutMs: 1500,
      }),
    ).rejects.toThrow(ModelTimeoutError);

    expect(mockGroq.chat).not.toHaveBeenCalled();
  });

  it("OpenAI unavailable + Groq timeout -> standardized ModelTimeoutError returned promptly", async () => {
    const mockOpenAI: ModelProvider = {
      chat: vi.fn().mockRejectedValue(new ModelUnavailableError("OpenAI 503")),
    };

    const mockGroq: ModelProvider = {
      chat: vi.fn().mockRejectedValue(new ModelTimeoutError("Groq timed out after 20s")),
    };

    const provider = new FallbackModelProvider(mockOpenAI, mockGroq);

    await expect(
      provider.chat({
        messages: [{ role: "user", content: "hi" }],
        timeoutMs: 30000,
      }),
    ).rejects.toThrow(ModelTimeoutError);

    expect(mockGroq.chat).toHaveBeenCalledTimes(1);
  });
});
