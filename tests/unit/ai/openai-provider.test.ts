import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAIProvider } from "../../../src/ai/openai.provider.js";
import { setCachedConfig, parseConfig } from "../../../src/config/env.js";
import {
  ModelInvalidResponseError,
  ModelRateLimitedError,
  ModelTimeoutError,
  ModelUnavailableError,
} from "../../../src/domain/errors.js";

describe("OpenAIProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws ModelUnavailableError if OPENAI_API_KEY is not configured", async () => {
    setCachedConfig(
      parseConfig({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
      }),
    );

    const provider = new OpenAIProvider();
    await expect(
      provider.chat({
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toThrow(ModelUnavailableError);
  });

  it("translates options, strips thinking tags, and maps tool calls correctly", async () => {
    setCachedConfig(
      parseConfig({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
        OPENAI_API_KEY: "sk-mock-test-key",
        OPENAI_MODEL: "gpt-4o-mini",
      }),
    );

    const provider = new OpenAIProvider();

    const mockCreate = vi.fn().mockResolvedValue({
      model: "gpt-4o-mini",
      choices: [
        {
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "<think>thinking process</think>Here is the answer.",
            tool_calls: [
              {
                id: "call_abc123",
                type: "function",
                function: {
                  name: "get_dashboard",
                  arguments: "{}",
                },
              },
            ],
          },
        },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 30,
        total_tokens: 50,
      },
    });

    (provider as any).client = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };

    const res = await provider.chat({
      messages: [{ role: "user", content: "Check dashboard" }],
      tools: [
        {
          type: "function",
          function: {
            name: "get_dashboard",
            description: "Get today overview",
            parameters: {},
          },
        },
      ],
      toolChoice: "auto",
    });

    expect(res.content).toBe("Here is the answer.");
    expect(res.content).not.toContain("<think>");
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0].id).toBe("call_abc123");
    expect(res.toolCalls[0].function.name).toBe("get_dashboard");
    expect(res.usage?.totalTokens).toBe(50);
    expect(res.provider).toBe("openai");
    expect(res.fallbackUsed).toBe(false);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const passedPayload = mockCreate.mock.calls[0][0];
    expect(passedPayload.model).toBe("gpt-4o-mini");
    expect(passedPayload.parallel_tool_calls).toBe(false);
    expect(passedPayload.tool_choice).toBe("auto");
    expect(passedPayload.tools).toHaveLength(1);
  });

  it("maps HTTP 429 to ModelRateLimitedError without internal retry loop", async () => {
    setCachedConfig(
      parseConfig({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
        OPENAI_API_KEY: "sk-mock-test-key",
      }),
    );

    const provider = new OpenAIProvider();
    const rateLimitErr = new Error("Rate limit exceeded");
    (rateLimitErr as any).status = 429;

    const mockCreate = vi.fn().mockRejectedValue(rateLimitErr);
    (provider as any).client = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };

    await expect(
      provider.chat({
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toThrow(ModelRateLimitedError);

    // Bounded retry verification: fails fast on 1 attempt
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("maps 5xx server error to ModelUnavailableError", async () => {
    setCachedConfig(
      parseConfig({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
        OPENAI_API_KEY: "sk-mock-test-key",
      }),
    );

    const provider = new OpenAIProvider();
    const serverErr = new Error("OpenAI 500 Internal Error");
    (serverErr as any).status = 500;

    const mockCreate = vi.fn().mockRejectedValue(serverErr);
    (provider as any).client = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };

    await expect(
      provider.chat({
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toThrow(ModelUnavailableError);
  });

  it("maps AbortError to ModelTimeoutError", async () => {
    setCachedConfig(
      parseConfig({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
        OPENAI_API_KEY: "sk-mock-test-key",
      }),
    );

    const provider = new OpenAIProvider();
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";

    const mockCreate = vi.fn().mockRejectedValue(abortErr);
    (provider as any).client = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };

    await expect(
      provider.chat({
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toThrow(ModelTimeoutError);
  });

  it("maps empty choices to ModelInvalidResponseError", async () => {
    setCachedConfig(
      parseConfig({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
        OPENAI_API_KEY: "sk-mock-test-key",
      }),
    );

    const provider = new OpenAIProvider();
    const mockCreate = vi.fn().mockResolvedValue({
      model: "gpt-4o-mini",
      choices: [],
    });

    (provider as any).client = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };

    await expect(
      provider.chat({
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toThrow(ModelInvalidResponseError);
  });
});
