import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { ToolLoop } from "../../../src/ai/tool-loop.js";
import { FallbackModelProvider } from "../../../src/ai/fallback.provider.js";
import { ModelCompletionOptions, ModelProvider } from "../../../src/ai/model.provider.js";
import { traceRepository } from "../../../src/persistence/repositories/trace.repository.js";
import { ActorContext } from "../../../src/auth/actor-context.js";
import { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import { parseConfig, setCachedConfig } from "../../../src/config/env.js";
import { ModelUnavailableError } from "../../../src/domain/errors.js";

describe("FallbackModelProvider + ToolLoop Compatibility", () => {
  const mockActor: ActorContext = {
    userId: "11111111-1111-1111-1111-111111111111",
    role: "ADMIN",
    accountStatus: "ACTIVE",
    displayName: "Admin Alice",
    accessToken: "jwt.mock",
    requestId: "req-1",
  };

  const mockGateway = {
    getAdminDashboard: vi.fn(),
  } as unknown as OslavaGateway;

  beforeAll(() => {
    setCachedConfig(
      parseConfig({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
        OPENAI_API_KEY: "sk-mock-test-key",
        GROQ_API_KEY: "gsk_mock_test_key",
        AI_PRIMARY_PROVIDER: "openai",
        AI_FALLBACK_PROVIDER: "groq",
        AI_FALLBACK_ENABLED: "true",
      }),
    );
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await traceRepository.clear();
  });

  it("Section 16.1: Full OpenAI sequence with tool call and result", async () => {
    (mockGateway.getAdminDashboard as any).mockResolvedValue({
      total_events_today: 2,
      published_count: 1,
      draft_count: 1,
      completed_count: 0,
      open_review_flag_count: 0,
      required_today_count: 10,
      confirmed_today_count: 8,
      vacant_today_count: 2,
    });

    let openAiTurns = 0;
    const mockOpenAI: ModelProvider = {
      chat: vi.fn().mockImplementation(async () => {
        openAiTurns++;
        if (openAiTurns === 1) {
          return {
            content: null,
            toolCalls: [
              {
                id: "call_openai_1",
                type: "function",
                function: {
                  name: "get_dashboard",
                  arguments: "{}",
                },
              },
            ],
            model: "gpt-4o-mini",
            provider: "openai",
            fallbackUsed: false,
          };
        }
        return {
          content: "OpenAI: 2 events today, 2 vacant spots.",
          toolCalls: [],
          model: "gpt-4o-mini",
          provider: "openai",
          fallbackUsed: false,
        };
      }),
    };

    const mockGroq: ModelProvider = {
      chat: vi.fn(),
    };

    const provider = new FallbackModelProvider(mockOpenAI, mockGroq);
    const loop = new ToolLoop(5);

    const result = await loop.run({
      modelProvider: provider,
      messages: [{ role: "user", content: "What is happening today?" }],
      state: null,
      userPrompt: "What is happening today?",
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-1",
      sessionId: "session-1",
      traceRepo: traceRepository,
    });

    expect(result.finalContent).toBe("OpenAI: 2 events today, 2 vacant spots.");
    expect(result.toolCallCount).toBe(1);
    expect(result.provider).toBe("openai");
    expect(result.fallbackUsed).toBe(false);

    expect(mockOpenAI.chat).toHaveBeenCalledTimes(2);
    expect(mockGroq.chat).not.toHaveBeenCalled();
    expect(mockGateway.getAdminDashboard).toHaveBeenCalledTimes(1);
  });

  it("Section 16.2: OpenAI first invocation succeeds with tool call -> tool executes once -> second OpenAI invocation throws ModelUnavailableError -> Groq completes turn -> tool is NOT executed twice", async () => {
    (mockGateway.getAdminDashboard as any).mockResolvedValue({
      total_events_today: 3,
      published_count: 2,
      draft_count: 1,
      completed_count: 0,
      open_review_flag_count: 0,
      required_today_count: 15,
      confirmed_today_count: 12,
      vacant_today_count: 3,
    });

    let openAiCallCount = 0;
    const mockOpenAI: ModelProvider = {
      chat: vi.fn().mockImplementation(async () => {
        openAiCallCount++;
        if (openAiCallCount === 1) {
          // Turn 1: OpenAI successfully proposes tool call
          return {
            content: null,
            toolCalls: [
              {
                id: "call_openai_tool",
                type: "function",
                function: {
                  name: "get_dashboard",
                  arguments: "{}",
                },
              },
            ],
            model: "gpt-4o-mini",
            provider: "openai",
            fallbackUsed: false,
          };
        }
        // Turn 2: OpenAI fails with ModelUnavailableError
        throw new ModelUnavailableError("OpenAI 503 Service Unavailable");
      }),
    };

    const mockGroq: ModelProvider = {
      chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
        // Groq receives conversation messages including the tool execution output
        const hasToolMessage = opts.messages.some(
          (m) => m.role === "tool" && m.tool_call_id === "call_openai_tool",
        );
        expect(hasToolMessage).toBe(true);

        return {
          content: "Groq fallback: 3 events today with 3 vacant positions.",
          toolCalls: [],
          model: "openai/gpt-oss-120b",
          provider: "groq",
          fallbackUsed: false,
        };
      }),
    };

    const provider = new FallbackModelProvider(mockOpenAI, mockGroq);
    const loop = new ToolLoop(5);

    const result = await loop.run({
      modelProvider: provider,
      messages: [{ role: "user", content: "Show dashboard" }],
      state: null,
      userPrompt: "Show dashboard",
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-fallback-turn",
      sessionId: "session-fallback",
      traceRepo: traceRepository,
    });

    // Tool execution safety verification:
    expect(mockGateway.getAdminDashboard).toHaveBeenCalledTimes(1); // NOT executed twice!
    expect(result.toolCallCount).toBe(1);

    // Provider invocation counts:
    expect(mockOpenAI.chat).toHaveBeenCalledTimes(2); // Turn 1 (success) + Turn 2 (failed)
    expect(mockGroq.chat).toHaveBeenCalledTimes(1);   // Turn 2 fallback only (NEVER on Turn 1)

    // Final result attributes:
    expect(result.finalContent).toBe(
      "Groq fallback: 3 events today with 3 vacant positions.",
    );
    expect(result.provider).toBe("openai->groq");
    expect(result.fallbackUsed).toBe(true);

    // Verify trace repository has exactly 1 tool execution record
    const toolExecs = await traceRepository.getToolExecutionsBySession("session-fallback");
    expect(toolExecs).toHaveLength(1);
    expect(toolExecs[0].toolName).toBe("get_dashboard");
    expect(toolExecs[0].status).toBe("SUCCESS");
  });

  it("Section 15: Tool execution errors do NOT trigger Groq fallback", async () => {
    (mockGateway.getAdminDashboard as any).mockRejectedValue(new Error("Database connection dropped"));

    let openAiCallCount = 0;
    const mockOpenAI: ModelProvider = {
      chat: vi.fn().mockImplementation(async () => {
        openAiCallCount++;
        if (openAiCallCount === 1) {
          return {
            content: null,
            toolCalls: [
              {
                id: "call_tool_fail",
                type: "function",
                function: {
                  name: "get_dashboard",
                  arguments: "{}",
                },
              },
            ],
            model: "gpt-4o-mini",
            provider: "openai",
            fallbackUsed: false,
          };
        }
        return {
          content: "OpenAI: Encountered error while fetching dashboard.",
          toolCalls: [],
          model: "gpt-4o-mini",
          provider: "openai",
          fallbackUsed: false,
        };
      }),
    };

    const mockGroq: ModelProvider = {
      chat: vi.fn(),
    };

    const provider = new FallbackModelProvider(mockOpenAI, mockGroq);
    const loop = new ToolLoop(5);

    const result = await loop.run({
      modelProvider: provider,
      messages: [{ role: "user", content: "Show dashboard" }],
      state: null,
      userPrompt: "Show dashboard",
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-tool-err",
      sessionId: "session-tool-err",
      traceRepo: traceRepository,
    });

    expect(result.finalContent).toBe("OpenAI: Encountered error while fetching dashboard.");
    expect(mockOpenAI.chat).toHaveBeenCalledTimes(2);
    expect(mockGroq.chat).not.toHaveBeenCalled(); // Groq was NOT called because tool error is handled inside tool loop!
    expect(mockGateway.getAdminDashboard).toHaveBeenCalledTimes(1);
  });
});
