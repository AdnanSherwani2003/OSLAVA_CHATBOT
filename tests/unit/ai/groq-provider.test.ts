import { describe, it, expect, vi, beforeEach } from "vitest";
import { GroqProvider } from "../../../src/ai/groq.provider.js";
import { setCachedConfig, parseConfig } from "../../../src/config/env.js";
import { ModelRateLimitedError, ModelTimeoutError, ModelUnavailableError } from "../../../src/domain/errors.js";

describe("GroqProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws ModelUnavailableError if GROQ_API_KEY is not configured", async () => {
    setCachedConfig(
      parseConfig({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
      }),
    );

    const provider = new GroqProvider();
    await expect(
      provider.chat({
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toThrow(ModelUnavailableError);
  });

  it("strips thinking tags and processes tool calls", async () => {
    setCachedConfig(
      parseConfig({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
        GROQ_API_KEY: "gsk_mock_test_key",
      }),
    );

    const provider = new GroqProvider();

    // Mock client internal call
    const mockCreate = vi.fn().mockResolvedValue({
      model: "openai/gpt-oss-120b",
      choices: [
        {
          message: {
            role: "assistant",
            content: "<think>Let me evaluate this event query</think>Here are the details for the gala.",
            tool_calls: [
              {
                id: "call-1",
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
        prompt_tokens: 15,
        completion_tokens: 25,
        total_tokens: 40,
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
    });

    expect(res.content).toBe("Here are the details for the gala.");
    expect(res.content).not.toContain("<think>");
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0].function.name).toBe("get_dashboard");
    expect(res.usage?.totalTokens).toBe(40);
  });

  it("retries on 429 rate limit and throws ModelRateLimitedError if still failing", async () => {
    setCachedConfig(
      parseConfig({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
        GROQ_API_KEY: "gsk_mock_test_key",
      }),
    );

    const provider = new GroqProvider();
    const rateLimitErr = new Error("Rate limit");
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

    // Initial attempt + 1 retry
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("throws ModelTimeoutError when request is aborted", async () => {
    setCachedConfig(
      parseConfig({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
        GROQ_API_KEY: "gsk_mock_test_key",
      }),
    );

    const provider = new GroqProvider();
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
});
