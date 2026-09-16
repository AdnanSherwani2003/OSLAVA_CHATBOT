import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolLoop } from "../../../src/ai/tool-loop.js";
import { ModelCompletionOptions, ModelProvider } from "../../../src/ai/model.provider.js";
import { traceRepository } from "../../../src/persistence/repositories/trace.repository.js";
import { ActorContext } from "../../../src/auth/actor-context.js";
import { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";

describe("Tool Deduplication & Write Safety (Part T)", () => {
  const mockActor: ActorContext = {
    userId: "11111111-1111-1111-1111-111111111111",
    role: "ADMIN",
    accountStatus: "ACTIVE",
    displayName: "Admin Alice",
    accessToken: "jwt.mock",
    requestId: "req-dedup-1",
  };

  const mockGateway = {
    getAdminDashboard: vi.fn().mockResolvedValue({
      today_event_count: 4,
      draft_count: 1,
      published_count: 3,
      upcoming_count: 3,
      in_progress_count: 0,
      completed_count: 0,
      open_review_flag_count: 0,
      required_today_count: 15,
      confirmed_today_count: 12,
      vacant_today_count: 3,
    }),
    getAdminEvents: vi.fn().mockResolvedValue([
      {
        id: "33333333-3333-3333-3333-333333333333",
        title: "Marriage Expo",
        date: "2026-09-16",
        status: "PUBLISHED",
      },
    ]),
  } as unknown as OslavaGateway;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes read tool only once when identical arguments are requested twice", async () => {
    let callCount = 0;

    // Simulation:
    // Turn 1: Model calls get_dashboard ({})
    // Turn 2: Model inadvertently calls get_dashboard ({}) again with same args
    // Turn 3: Model returns final prose
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
            model: "gpt-4o-mini",
          };
        }

        if (callCount === 2) {
          return {
            content: null,
            toolCalls: [
              {
                id: "call-2",
                type: "function",
                function: {
                  name: "get_dashboard",
                  arguments: "{}",
                },
              },
            ],
            model: "gpt-4o-mini",
          };
        }

        return {
          content: "There are 4 events today with 3 vacant positions.",
          toolCalls: [],
          model: "gpt-4o-mini",
        };
      }),
    };

    const loop = new ToolLoop(8);
    const result = await loop.run({
      modelProvider: mockModel,
      messages: [{ role: "user", content: "What's happening today?" }],
      state: null,
      userPrompt: "What's happening today?",
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-dedup-1",
      sessionId: "session-dedup-1",
      traceRepo: traceRepository,
    });

    // Gateway getAdminDashboard must be called exactly once despite 2 requests
    expect(mockGateway.getAdminDashboard).toHaveBeenCalledTimes(1);
    expect(result.finalContent).toContain("There are 4 events today with 3 vacant positions.");
  });

  it("does NOT deduplicate distinct read tool calls with different arguments", async () => {
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
                  name: "search_events",
                  arguments: JSON.stringify({ start_date: "2026-09-16", end_date: "2026-09-16" }),
                },
              },
            ],
            model: "gpt-4o-mini",
          };
        }

        if (callCount === 2) {
          return {
            content: null,
            toolCalls: [
              {
                id: "call-2",
                type: "function",
                function: {
                  name: "search_events",
                  arguments: JSON.stringify({ start_date: "2026-09-17", end_date: "2026-09-17" }),
                },
              },
            ],
            model: "gpt-4o-mini",
          };
        }

        return {
          content: "Checked both today and tomorrow.",
          toolCalls: [],
          model: "gpt-4o-mini",
        };
      }),
    };

    const loop = new ToolLoop(8);
    await loop.run({
      modelProvider: mockModel,
      messages: [{ role: "user", content: "Events today and tomorrow" }],
      state: null,
      userPrompt: "Events today and tomorrow",
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-dedup-2",
      sessionId: "session-dedup-2",
      traceRepo: traceRepository,
    });

    // Both distinct calls must execute
    expect(mockGateway.getAdminEvents).toHaveBeenCalledTimes(2);
  });
});
