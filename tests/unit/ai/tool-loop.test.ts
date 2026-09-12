import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolLoop } from "../../../src/ai/tool-loop.js";
import { ModelCompletionOptions, ModelCompletionResponse, ModelProvider } from "../../../src/ai/model.provider.js";
import { traceRepository } from "../../../src/persistence/repositories/trace.repository.js";
import { ActorContext } from "../../../src/auth/actor-context.js";
import { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import { parseConfig, setCachedConfig } from "../../../src/config/env.js";

describe("ToolLoop", () => {
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
    getAdminEvents: vi.fn(),
    getAdminEventDetail: vi.fn(),
    searchWorkers: vi.fn(),
    getWorkerDetail: vi.fn(),
  } as unknown as OslavaGateway;

  beforeAll(() => {
    setCachedConfig(
      parseConfig({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
      }),
    );
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await traceRepository.clear();
  });

  it("handles direct response with 0 tool calls", async () => {
    const mockModel: ModelProvider = {
      chat: vi.fn().mockResolvedValue({
        content: "Hello! How can I help you manage events today?",
        toolCalls: [],
        model: "openai/gpt-oss-120b",
      }),
    };

    const loop = new ToolLoop(5);
    const result = await loop.run({
      modelProvider: mockModel,
      messages: [{ role: "user", content: "Hi" }],
      state: null,
      userPrompt: "Hi",
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-1",
      sessionId: "session-1",
      traceRepo: traceRepository,
    });

    expect(result.finalContent).toBe("Hello! How can I help you manage events today?");
    expect(result.toolCallCount).toBe(0);
    expect(mockModel.chat).toHaveBeenCalledTimes(1);
  });

  it("executes 1 tool call and passes result back to model", async () => {
    (mockGateway.getAdminDashboard as any).mockResolvedValue({
      today_event_count: 3,
      draft_count: 1,
      published_count: 2,
      upcoming_count: 2,
      in_progress_count: 1,
      completed_count: 0,
      open_review_flag_count: 0,
      required_today_count: 10,
      confirmed_today_count: 8,
      vacant_today_count: 2,
    });

    let callCount = 0;
    const mockModel: ModelProvider = {
      chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
        callCount++;
        if (callCount === 1) {
          return {
            content: null,
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: {
                  name: "get_dashboard",
                  arguments: "{}",
                },
              },
            ],
            model: "openai/gpt-oss-120b",
          };
        }
        return {
          content: "Today we have 3 events with 2 vacant spots remaining.",
          toolCalls: [],
          model: "openai/gpt-oss-120b",
        };
      }),
    };

    const loop = new ToolLoop(5);
    const messages = [{ role: "user" as const, content: "Show today's dashboard" }];
    const result = await loop.run({
      modelProvider: mockModel,
      messages,
      state: null,
      userPrompt: "Show today's dashboard",
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-1",
      sessionId: "session-1",
      traceRepo: traceRepository,
    });

    expect(result.finalContent).toBe("Today we have 3 events with 2 vacant spots remaining.");
    expect(result.toolCallCount).toBe(1);
    expect(mockGateway.getAdminDashboard).toHaveBeenCalled();

    const executions = await traceRepository.getToolExecutionsBySession("session-1");
    expect(executions).toHaveLength(1);
    expect(executions[0].toolName).toBe("get_dashboard");
    expect(executions[0].status).toBe("SUCCESS");
  });

  it("intercepts unsupported write tool call and informs model", async () => {
    let callCount = 0;
    const mockModel: ModelProvider = {
      chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
        callCount++;
        if (callCount === 1) {
          return {
            content: null,
            toolCalls: [
              {
                id: "call-write",
                type: "function",
                function: {
                  name: "publish_event",
                  arguments: JSON.stringify({ event_id: "11111111-1111-1111-1111-111111111111" }),
                },
              },
            ],
            model: "openai/gpt-oss-120b",
          };
        }
        return {
          content: "That action isn't available through the chatbot yet.",
          toolCalls: [],
          model: "openai/gpt-oss-120b",
        };
      }),
    };

    const loop = new ToolLoop(5);
    const messages = [{ role: "user" as const, content: "Publish event now" }];
    const result = await loop.run({
      modelProvider: mockModel,
      messages,
      state: null,
      userPrompt: "Publish event now",
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-1",
      sessionId: "session-1",
      traceRepo: traceRepository,
    });

    expect(result.finalContent).toContain("That action isn't available through the chatbot yet.");
    expect(result.toolCallCount).toBe(1);
  });

  it("intercepts hallucinated UUIDs before tool execution", async () => {
    const hallucinatedId = "99999999-9999-9999-9999-999999999999";
    let callCount = 0;
    const mockModel: ModelProvider = {
      chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
        callCount++;
        if (callCount === 1) {
          return {
            content: null,
            toolCalls: [
              {
                id: "call-hallucinated",
                type: "function",
                function: {
                  name: "get_event_details",
                  arguments: JSON.stringify({ event_id: hallucinatedId }),
                },
              },
            ],
            model: "openai/gpt-oss-120b",
          };
        }
        return {
          content: "I could not find that event. Would you like me to search for it first?",
          toolCalls: [],
          model: "openai/gpt-oss-120b",
        };
      }),
    };

    const loop = new ToolLoop(5);
    const messages = [{ role: "user" as const, content: "Give me details on that gala" }];
    const result = await loop.run({
      modelProvider: mockModel,
      messages,
      state: null,
      userPrompt: "Give me details on that gala",
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-1",
      sessionId: "session-1",
      traceRepo: traceRepository,
    });

    expect(mockGateway.getAdminEventDetail).not.toHaveBeenCalled();
    expect(result.finalContent).toContain("Would you like me to search for it first?");
  });

  it("enforces maximum 5 tool calls limit per user turn", async () => {
    (mockGateway.getAdminDashboard as any).mockResolvedValue({ today_event_count: 1 });

    const mockModel: ModelProvider = {
      chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
        if (opts.toolChoice === "none") {
          return {
            content: "Reached search limit. Here is the summary.",
            toolCalls: [],
            model: "openai/gpt-oss-120b",
          };
        }
        // Always try to call get_dashboard
        return {
          content: null,
          toolCalls: [
            {
              id: `call-loop`,
              type: "function",
              function: {
                name: "get_dashboard",
                arguments: "{}",
              },
            },
          ],
          model: "openai/gpt-oss-120b",
        };
      }),
    };

    const loop = new ToolLoop(5);
    const messages = [{ role: "user" as const, content: "Loop test" }];
    const result = await loop.run({
      modelProvider: mockModel,
      messages,
      state: null,
      userPrompt: "Loop test",
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-1",
      sessionId: "session-1",
      traceRepo: traceRepository,
    });

    expect(result.toolCallCount).toBe(5);
    expect(result.finalContent).toBe("Reached search limit. Here is the summary.");
  });
});
