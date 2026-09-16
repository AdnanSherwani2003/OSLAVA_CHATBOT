import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolLoop } from "../../../src/ai/tool-loop.js";
import { ModelCompletionOptions, ModelProvider } from "../../../src/ai/model.provider.js";
import { turnPlanner } from "../../../src/ai/turn-planner.js";
import { traceRepository } from "../../../src/persistence/repositories/trace.repository.js";
import { ActorContext } from "../../../src/auth/actor-context.js";
import { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import { metrics } from "../../../src/observability/metrics.js";

describe("Tool Omission Prevention (Part S)", () => {
  const mockActor: ActorContext = {
    userId: "11111111-1111-1111-1111-111111111111",
    role: "ADMIN",
    accountStatus: "ACTIVE",
    displayName: "Admin Alice",
    accessToken: "jwt.mock",
    requestId: "req-omission-1",
  };

  const mockGateway = {
    searchWorkers: vi.fn().mockResolvedValue([
      {
        id: "22222222-2222-2222-2222-222222222222",
        full_name: "Arif Khan",
        category: "A",
        status: "ACTIVE",
        phone: "+919876543210",
      },
    ]),
    getWorkerHistory: vi.fn().mockResolvedValue([
      {
        id: "hist-1",
        worker_id: "22222222-2222-2222-2222-222222222222",
        change_type: "CATEGORY_CHANGE",
        old_value: "B",
        new_value: "A",
        changed_at: "2026-09-01T10:00:00Z",
        reason: "Promoted for stellar performance",
      },
    ]),
  } as unknown as OslavaGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    metrics.reset();
  });

  it("intercepts premature prose when required tool objective is missing, then recovers cleanly", async () => {
    let callCount = 0;

    // Simulation:
    // Turn 1: Model calls search_workers
    // Turn 2: Model prematurely tries to return prose without calling get_worker_history
    // Intercepted by completeness check -> System pushes reminder
    // Turn 3: Model calls get_worker_history
    // Turn 4: Model outputs final prose
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
                  name: "search_workers",
                  arguments: JSON.stringify({ query: "Arif" }),
                },
              },
            ],
            model: "gpt-4o-mini",
          };
        }

        if (callCount === 2) {
          // Premature prose attempt!
          return {
            content: "I found Arif Khan (ID: 22222222-2222-2222-2222-222222222222). He is a Tier A worker.",
            toolCalls: [],
            model: "gpt-4o-mini",
          };
        }

        if (callCount === 3) {
          // Model obeys the interception prompt and calls get_worker_history
          return {
            content: null,
            toolCalls: [
              {
                id: "call-2",
                type: "function",
                function: {
                  name: "get_worker_history",
                  arguments: JSON.stringify({ worker_id: "22222222-2222-2222-2222-222222222222" }),
                },
              },
            ],
            model: "gpt-4o-mini",
          };
        }

        return {
          content: "Arif Khan has completed 12 events with a 100% on-time track record and 0 absences.",
          toolCalls: [],
          model: "gpt-4o-mini",
        };
      }),
    };

    const userPrompt = "Show the history of worker Arif";
    const turnPlan = turnPlanner.planTurn(userPrompt, null);
    const loop = new ToolLoop(8);

    const result = await loop.run({
      modelProvider: mockModel,
      messages: [{ role: "user", content: userPrompt }],
      state: null,
      userPrompt,
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-omission-1",
      sessionId: "session-omission-1",
      traceRepo: traceRepository,
      turnPlan,
    });

    // 1. Verifies that the premature answer was rejected and both tools executed
    expect(mockGateway.searchWorkers).toHaveBeenCalledTimes(1);
    expect((mockGateway as any).getWorkerHistory).toHaveBeenCalledTimes(1);

    // 2. Verifies final prose reflects both objectives
    expect(result.finalContent).toContain("12 events with a 100% on-time track record");
    expect(result.toolCallCount).toBe(2);

    // 3. Verifies metric recorded omission prevention
    const snapshot = metrics.getSnapshot();
    expect(snapshot.agent.tool_omission_prevented_total).toBe(1);
  });
});
