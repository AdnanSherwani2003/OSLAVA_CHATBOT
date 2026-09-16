import { describe, it, expect, vi, beforeEach } from "vitest";
import { FallbackModelProvider } from "../../../src/ai/fallback.provider.js";
import { ModelCompletionOptions, ModelCompletionResponse, ModelProvider } from "../../../src/ai/model.provider.js";
import { setCachedConfig, parseConfig } from "../../../src/config/env.js";
import {
  ModelInvalidResponseError,
  ModelRateLimitedError,
  ModelTimeoutError,
  ModelUnavailableError,
} from "../../../src/domain/errors.js";
import { metrics } from "../../../src/observability/metrics.js";

describe("FallbackModelProvider", () => {
  const baseConfig = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "test-key",
    OPENAI_API_KEY: "sk-mock-test-key",
    GROQ_API_KEY: "gsk_mock_test_key",
    AI_PRIMARY_PROVIDER: "openai",
    AI_FALLBACK_PROVIDER: "groq",
    AI_FALLBACK_ENABLED: "true",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    metrics.reset();
    setCachedConfig(parseConfig(baseConfig));
  });

  const dummyOptions: ModelCompletionOptions = {
    messages: [{ role: "user", content: "What is happening today?" }],
  };

  const openAiSuccessResponse: ModelCompletionResponse = {
    content: "OpenAI: 2 events today.",
    toolCalls: [],
    model: "gpt-4o-mini",
    provider: "openai",
    fallbackUsed: false,
  };

  const groqSuccessResponse: ModelCompletionResponse = {
    content: "Groq: 2 events today.",
    toolCalls: [],
    model: "openai/gpt-oss-120b",
    provider: "groq",
    fallbackUsed: false,
  };

  describe("Section 13: Primary Success Behavior", () => {
    it("returns OpenAI response and NEVER invokes Groq when OpenAI succeeds", async () => {
      const mockOpenAI: ModelProvider = {
        chat: vi.fn().mockResolvedValue(openAiSuccessResponse),
      };
      const mockGroq: ModelProvider = {
        chat: vi.fn().mockResolvedValue(groqSuccessResponse),
      };

      const fallbackProvider = new FallbackModelProvider(mockOpenAI, mockGroq);
      const res = await fallbackProvider.chat(dummyOptions);

      expect(res.content).toBe("OpenAI: 2 events today.");
      expect(res.model).toBe("gpt-4o-mini");
      expect(res.provider).toBe("openai");
      expect(res.fallbackUsed).toBe(false);

      expect(mockOpenAI.chat).toHaveBeenCalledTimes(1);
      expect(mockGroq.chat).not.toHaveBeenCalled();

      const snapshot = metrics.getSnapshot();
      expect(snapshot.agent.openai_model_calls_total).toBe(1);
      expect(snapshot.agent.groq_model_calls_total).toBe(0);
      expect(snapshot.agent.fallback_activations_total).toBe(0);
    });
  });

  describe("Section 14: Fallback Invocations on Provider Failures", () => {
    it("falls back to Groq exactly once when OpenAI throws ModelUnavailableError", async () => {
      const mockOpenAI: ModelProvider = {
        chat: vi.fn().mockRejectedValue(new ModelUnavailableError("OpenAI 503 Outage")),
      };
      const mockGroq: ModelProvider = {
        chat: vi.fn().mockResolvedValue(groqSuccessResponse),
      };

      const fallbackProvider = new FallbackModelProvider(mockOpenAI, mockGroq);
      const res = await fallbackProvider.chat(dummyOptions);

      expect(mockOpenAI.chat).toHaveBeenCalledTimes(1);
      expect(mockGroq.chat).toHaveBeenCalledTimes(1);

      expect(res.content).toBe("Groq: 2 events today.");
      expect(res.model).toBe("openai/gpt-oss-120b");
      expect(res.provider).toBe("groq");
      expect(res.fallbackUsed).toBe(true);

      const snapshot = metrics.getSnapshot();
      expect(snapshot.agent.openai_model_calls_total).toBe(1);
      expect(snapshot.agent.groq_model_calls_total).toBe(1);
      expect(snapshot.agent.fallback_activations_total).toBe(1);
      expect(snapshot.agent.primary_provider_failures_total).toBe(1);
    });

    it("falls back to Groq when OpenAI throws ModelTimeoutError", async () => {
      const mockOpenAI: ModelProvider = {
        chat: vi.fn().mockRejectedValue(new ModelTimeoutError("OpenAI timed out after 30000ms")),
      };
      const mockGroq: ModelProvider = {
        chat: vi.fn().mockResolvedValue(groqSuccessResponse),
      };

      const fallbackProvider = new FallbackModelProvider(mockOpenAI, mockGroq);
      const res = await fallbackProvider.chat(dummyOptions);

      expect(mockOpenAI.chat).toHaveBeenCalledTimes(1);
      expect(mockGroq.chat).toHaveBeenCalledTimes(1);
      expect(res.content).toBe("Groq: 2 events today.");
      expect(res.fallbackUsed).toBe(true);
    });

    it("falls back to Groq when OpenAI throws ModelRateLimitedError", async () => {
      const mockOpenAI: ModelProvider = {
        chat: vi.fn().mockRejectedValue(new ModelRateLimitedError("OpenAI 429")),
      };
      const mockGroq: ModelProvider = {
        chat: vi.fn().mockResolvedValue(groqSuccessResponse),
      };

      const fallbackProvider = new FallbackModelProvider(mockOpenAI, mockGroq);
      const res = await fallbackProvider.chat(dummyOptions);

      expect(mockOpenAI.chat).toHaveBeenCalledTimes(1);
      expect(mockGroq.chat).toHaveBeenCalledTimes(1);
      expect(res.content).toBe("Groq: 2 events today.");
      expect(res.fallbackUsed).toBe(true);
    });

    it("falls back to Groq when OpenAI throws ModelInvalidResponseError", async () => {
      const mockOpenAI: ModelProvider = {
        chat: vi.fn().mockRejectedValue(new ModelInvalidResponseError("Empty choices")),
      };
      const mockGroq: ModelProvider = {
        chat: vi.fn().mockResolvedValue(groqSuccessResponse),
      };

      const fallbackProvider = new FallbackModelProvider(mockOpenAI, mockGroq);
      const res = await fallbackProvider.chat(dummyOptions);

      expect(mockOpenAI.chat).toHaveBeenCalledTimes(1);
      expect(mockGroq.chat).toHaveBeenCalledTimes(1);
      expect(res.content).toBe("Groq: 2 events today.");
      expect(res.fallbackUsed).toBe(true);
    });
  });

  describe("Section 15: No-Fallback and Boundary Constraints", () => {
    it("does NOT invoke Groq when an ineligible / non-provider error occurs", async () => {
      const genericError = new Error("Generic application programming error");
      const mockOpenAI: ModelProvider = {
        chat: vi.fn().mockRejectedValue(genericError),
      };
      const mockGroq: ModelProvider = {
        chat: vi.fn().mockResolvedValue(groqSuccessResponse),
      };

      const fallbackProvider = new FallbackModelProvider(mockOpenAI, mockGroq);
      await expect(fallbackProvider.chat(dummyOptions)).rejects.toThrow("Generic application programming error");

      expect(mockOpenAI.chat).toHaveBeenCalledTimes(1);
      expect(mockGroq.chat).not.toHaveBeenCalled();
    });

    it("does NOT invoke Groq when AI_FALLBACK_ENABLED is false", async () => {
      setCachedConfig(
        parseConfig({
          ...baseConfig,
          AI_FALLBACK_ENABLED: "false",
        }),
      );

      const mockOpenAI: ModelProvider = {
        chat: vi.fn().mockRejectedValue(new ModelUnavailableError("OpenAI down")),
      };
      const mockGroq: ModelProvider = {
        chat: vi.fn().mockResolvedValue(groqSuccessResponse),
      };

      const fallbackProvider = new FallbackModelProvider(mockOpenAI, mockGroq);
      await expect(fallbackProvider.chat(dummyOptions)).rejects.toThrow(ModelUnavailableError);

      expect(mockOpenAI.chat).toHaveBeenCalledTimes(1);
      expect(mockGroq.chat).not.toHaveBeenCalled();
    });

    it("throws fallback error and does not alternate recursively if Groq also fails", async () => {
      const mockOpenAI: ModelProvider = {
        chat: vi.fn().mockRejectedValue(new ModelUnavailableError("OpenAI down")),
      };
      const mockGroq: ModelProvider = {
        chat: vi.fn().mockRejectedValue(new ModelUnavailableError("Groq also down")),
      };

      const fallbackProvider = new FallbackModelProvider(mockOpenAI, mockGroq);
      await expect(fallbackProvider.chat(dummyOptions)).rejects.toThrow("Groq also down");

      expect(mockOpenAI.chat).toHaveBeenCalledTimes(1);
      expect(mockGroq.chat).toHaveBeenCalledTimes(1);

      const snapshot = metrics.getSnapshot();
      expect(snapshot.agent.primary_provider_failures_total).toBe(1);
      expect(snapshot.agent.fallback_provider_failures_total).toBe(1);
    });

    it("routes directly to Groq if AI_PRIMARY_PROVIDER is configured as groq", async () => {
      setCachedConfig(
        parseConfig({
          ...baseConfig,
          AI_PRIMARY_PROVIDER: "groq",
        }),
      );

      const mockOpenAI: ModelProvider = {
        chat: vi.fn().mockResolvedValue(openAiSuccessResponse),
      };
      const mockGroq: ModelProvider = {
        chat: vi.fn().mockResolvedValue(groqSuccessResponse),
      };

      const fallbackProvider = new FallbackModelProvider(mockOpenAI, mockGroq);
      const res = await fallbackProvider.chat(dummyOptions);

      expect(res.content).toBe("Groq: 2 events today.");
      expect(mockOpenAI.chat).not.toHaveBeenCalled();
      expect(mockGroq.chat).toHaveBeenCalledTimes(1);
    });
  });
});
