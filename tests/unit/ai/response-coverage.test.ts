import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolLoop } from "../../../src/ai/tool-loop.js";
import { ModelCompletionOptions, ModelProvider } from "../../../src/ai/model.provider.js";
import { turnPlanner } from "../../../src/ai/turn-planner.js";
import { traceRepository } from "../../../src/persistence/repositories/trace.repository.js";
import { ActorContext } from "../../../src/auth/actor-context.js";
import { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import { SessionState } from "../../../src/context/context.types.js";
import { ModelInvalidResponseError } from "../../../src/domain/errors.js";
import { metrics } from "../../../src/observability/metrics.js";

describe("Response Coverage Completeness & Dedicated Synthesis (Requirements 1 - 13)", () => {
  const mockActor: ActorContext = {
    userId: "11111111-1111-1111-1111-111111111111",
    role: "ADMIN",
    accountStatus: "ACTIVE",
    displayName: "Admin Alice",
    accessToken: "jwt.mock",
    requestId: "req-coverage-1",
  };

  const adnanWorkerId = "33333333-3333-3333-3333-333333333333";
  const vmHallEventId = "44444444-4444-4444-4444-444444444444";
  const arifWorkerId = "55555555-5555-5555-5555-555555555555";

  // Existing session state with current_event_label = "VM hall function" (from production bug report)
  const sessionWithEventState: SessionState = {
    sessionId: "bf3d7f0d-fa4a-4848-b506-5f73a2d882b4",
    userId: "11111111-1111-1111-1111-111111111111",
    currentEventId: vmHallEventId,
    currentEventLabel: "VM hall function",
    currentWorkerId: null,
    currentWorkerLabel: null,
    recentEventResults: [],
    recentWorkerResults: [],
    lastIntent: null,
    pendingActionId: null,
    updatedAt: new Date().toISOString(),
  };

  const mockGateway = {
    searchWorkers: vi.fn().mockResolvedValue([
      {
        id: adnanWorkerId,
        full_name: "Adnan Adnan",
        category: "A",
        status: "ACTIVE",
        phone: "+919876543210",
      },
    ]),
    getWorkerDetail: vi.fn().mockResolvedValue({
      id: adnanWorkerId,
      full_name: "Adnan Adnan",
      category: "A",
      status: "ACTIVE",
      phone: "+919876543210",
      reliability_score: 98,
    }),
    getWorkerHistory: vi.fn().mockResolvedValue([
      {
        id: "hist-1",
        worker_id: adnanWorkerId,
        change_type: "CATEGORY_CHANGE",
        old_value: "B",
        new_value: "A",
        changed_at: "2026-09-01T10:00:00Z",
        reason: "Promoted to Category A for excellent attendance",
      },
    ]),
    getAdminEvents: vi.fn().mockResolvedValue([
      {
        id: vmHallEventId,
        title: "VM hall function",
        event_date: "2026-09-25",
        event_status: "PUBLISHED",
        venue_name: "VM Hall",
      },
    ]),
    getAdminEventDetail: vi.fn().mockResolvedValue({
      id: vmHallEventId,
      title: "VM hall function",
      event_date: "2026-09-25",
      event_status: "PUBLISHED",
      shifts: [],
      staffing_requirements: [],
    }),
    getEventReportSummary: vi.fn().mockResolvedValue({
      event_id: vmHallEventId,
      title: "VM hall function",
      total_shifts: 2,
      total_allocated_workers: 10,
      attended_workers: 10,
    }),
  } as unknown as OslavaGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    metrics.reset();
  });

  // =========================================================================
  // REQUIREMENT 8 — EXACT WORKER REGRESSION TEST
  // =========================================================================
  it("Requirement 8: Recovers missing Worker History via bounded resynthesis without re-executing tools", async () => {
    const prompt = "Find worker Adnan Adnan and show his details and history.";
    const plan = turnPlanner.planTurn(prompt, sessionWithEventState);

    // Assert TurnPlan separates tool objectives from response coverage requirements
    expect(plan.objectives).toEqual(["SEARCH_WORKERS", "WORKER_DETAILS", "WORKER_HISTORY"]);
    expect(plan.requiredReadTools).toEqual(["search_workers", "get_worker_details", "get_worker_history"]);
    expect(plan.requiredResponseObjectives).toEqual(["WORKER_DETAILS", "WORKER_HISTORY"]);
    expect(plan.requiredResponseObjectives).not.toContain("SEARCH_WORKERS");

    let callStep = 0;
    const mockModel: ModelProvider = {
      chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
        callStep++;
        if (callStep === 1) {
          // Model executes search_workers
          return {
            content: null,
            toolCalls: [
              {
                id: "call-search-worker",
                type: "function",
                function: {
                  name: "search_workers",
                  arguments: JSON.stringify({ query: "Adnan Adnan" }),
                },
              },
            ],
            model: "gpt-4o-mini",
          };
        }
        if (callStep === 2) {
          // Model executes get_worker_details and get_worker_history
          return {
            content: null,
            toolCalls: [
              {
                id: "call-worker-details",
                type: "function",
                function: {
                  name: "get_worker_details",
                  arguments: JSON.stringify({ worker_id: adnanWorkerId }),
                },
              },
              {
                id: "call-worker-history",
                type: "function",
                function: {
                  name: "get_worker_history",
                  arguments: JSON.stringify({ worker_id: adnanWorkerId }),
                },
              },
            ],
            model: "gpt-4o-mini",
          };
        }
        if (callStep === 3) {
          // Dedicated final synthesis call (toolChoice: "none"):
          // INTENTIONALLY returns ONLY Worker Details, omitting Worker History (exact production defect)
          expect(opts.toolChoice).toBe("none");
          return {
            content: "### Worker Details\n- Name: Adnan Adnan\n- Category: A\n- Phone: +919876543210\n- Status: ACTIVE",
            toolCalls: [],
            model: "gpt-4o-mini",
          };
        }
        if (callStep === 4) {
          // Bounded resynthesis retry call (toolChoice: "none"):
          // Re-synthesizes BOTH Worker Details and Worker History
          expect(opts.toolChoice).toBe("none");
          return {
            content:
              "### Worker Details\n- Name: Adnan Adnan\n- Category: A\n- Phone: +919876543210\n- Status: ACTIVE\n\n" +
              "### Worker History\n- Promoted from Category B to Category A on 2026-09-01 for excellent attendance.",
            toolCalls: [],
            model: "gpt-4o-mini",
          };
        }
        throw new Error(`Unexpected model call step ${callStep}`);
      }),
    };

    const loop = new ToolLoop(8);
    const result = await loop.run({
      modelProvider: mockModel,
      messages: [{ role: "user", content: prompt }],
      state: sessionWithEventState,
      userPrompt: prompt,
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-coverage-r8",
      sessionId: sessionWithEventState.sessionId,
      traceRepo: traceRepository,
      turnPlan: plan,
    });

    // 1. Assert final response contains BOTH Worker Details and Worker History
    expect(result.finalContent).toContain("### Worker Details");
    expect(result.finalContent).toContain("### Worker History");
    expect(result.finalContent).toContain("Promoted from Category B to Category A");

    // 2. Assert tool executions remain EXACTLY 1 each (Requirement 5: zero duplicate calls during resynthesis)
    expect((mockGateway as any).searchWorkers).toHaveBeenCalledTimes(1);
    expect((mockGateway as any).getWorkerDetail).toHaveBeenCalledTimes(1);
    expect((mockGateway as any).getWorkerHistory).toHaveBeenCalledTimes(1);

    // 3. Assert metric recorded response coverage recovery
    const snapshot = metrics.getSnapshot();
    expect(snapshot.agent.response_coverage_recovery_total).toBe(1);
    expect(snapshot.agent.response_coverage_failure_total).toBe(0);
  });

  // =========================================================================
  // REQUIREMENT 9 — FAIL-CLOSED TEST
  // =========================================================================
  it("Requirement 9: Fails closed with ModelInvalidResponseError when second synthesis also omits required objective", async () => {
    const prompt = "Find worker Adnan Adnan and show his details and history.";
    const plan = turnPlanner.planTurn(prompt, sessionWithEventState);

    let callStep = 0;
    const mockModel: ModelProvider = {
      chat: vi.fn().mockImplementation(async () => {
        callStep++;
        if (callStep === 1) {
          return {
            content: null,
            toolCalls: [
              {
                id: "c-sw",
                type: "function",
                function: { name: "search_workers", arguments: JSON.stringify({ query: "Adnan" }) },
              },
              {
                id: "c-gwd",
                type: "function",
                function: { name: "get_worker_details", arguments: JSON.stringify({ worker_id: adnanWorkerId }) },
              },
              {
                id: "c-gwh",
                type: "function",
                function: { name: "get_worker_history", arguments: JSON.stringify({ worker_id: adnanWorkerId }) },
              },
            ],
            model: "gpt-4o-mini",
          };
        }
        // First synthesis: omits Worker History
        if (callStep === 2) {
          return {
            content: "### Worker Details\n- Name: Adnan Adnan\n- Category: A",
            toolCalls: [],
            model: "gpt-4o-mini",
          };
        }
        // Second synthesis (resynthesis): stubbornly omits Worker History AGAIN!
        if (callStep === 3) {
          return {
            content: "### Worker Details\n- Name: Adnan Adnan\n- Category: A (still omitting history)",
            toolCalls: [],
            model: "gpt-4o-mini",
          };
        }
        return { content: "", toolCalls: [], model: "gpt-4o-mini" };
      }),
    };

    const loop = new ToolLoop(8);
    await expect(
      loop.run({
        modelProvider: mockModel,
        messages: [{ role: "user", content: prompt }],
        state: sessionWithEventState,
        userPrompt: prompt,
        gateway: mockGateway,
        actor: mockActor,
        requestId: "req-coverage-r9",
        sessionId: sessionWithEventState.sessionId,
        traceRepo: traceRepository,
        turnPlan: plan,
      }),
    ).rejects.toThrow(ModelInvalidResponseError);

    // Assert metric recorded response coverage failure
    const snapshot = metrics.getSnapshot();
    expect(snapshot.agent.response_coverage_recovery_total).toBe(1);
    expect(snapshot.agent.response_coverage_failure_total).toBe(1);

    // Tools ran exactly once each
    expect((mockGateway as any).searchWorkers).toHaveBeenCalledTimes(1);
    expect((mockGateway as any).getWorkerDetail).toHaveBeenCalledTimes(1);
    expect((mockGateway as any).getWorkerHistory).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // REQUIREMENT 10 — SINGLE OBJECTIVE REGRESSION TEST
  // =========================================================================
  it("Requirement 10: 'Show his history.' with safely grounded worker executes only history and covers Worker History", async () => {
    const groundedWorkerState: SessionState = {
      ...sessionWithEventState,
      currentWorkerId: adnanWorkerId,
      currentWorkerLabel: "Adnan Adnan",
    };

    const prompt = "Show his history.";
    const plan = turnPlanner.planTurn(prompt, groundedWorkerState);

    expect(plan.objectives).toEqual(["WORKER_HISTORY"]);
    expect(plan.requiredReadTools).toEqual(["get_worker_history"]);
    expect(plan.requiredResponseObjectives).toEqual(["WORKER_HISTORY"]);

    let callStep = 0;
    const mockModel: ModelProvider = {
      chat: vi.fn().mockImplementation(async () => {
        callStep++;
        if (callStep === 1) {
          return {
            content: null,
            toolCalls: [
              {
                id: "c-history",
                type: "function",
                function: { name: "get_worker_history", arguments: JSON.stringify({ worker_id: adnanWorkerId }) },
              },
            ],
            model: "gpt-4o-mini",
          };
        }
        return {
          content: "### Worker History\nAdnan Adnan has completed 15 shifts with zero absences.",
          toolCalls: [],
          model: "gpt-4o-mini",
        };
      }),
    };

    const loop = new ToolLoop(8);
    const result = await loop.run({
      modelProvider: mockModel,
      messages: [{ role: "user", content: prompt }],
      state: groundedWorkerState,
      userPrompt: prompt,
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-coverage-r10",
      sessionId: groundedWorkerState.sessionId,
      traceRepo: traceRepository,
      turnPlan: plan,
    });

    expect((mockGateway as any).getWorkerHistory).toHaveBeenCalledTimes(1);
    expect((mockGateway as any).getWorkerDetail).toHaveBeenCalledTimes(0);
    expect((mockGateway as any).searchWorkers).toHaveBeenCalledTimes(0);
    expect(result.finalContent).toContain("### Worker History");
  });

  // =========================================================================
  // REQUIREMENT 11 — EMPTY HISTORY TEST
  // =========================================================================
  it("Requirement 11: Worker history succeeds with empty [] records; covered explicitly without fabricating history", async () => {
    (mockGateway as any).getWorkerHistory.mockResolvedValueOnce([]);

    const prompt = "Show his details and history.";
    const groundedState: SessionState = {
      ...sessionWithEventState,
      currentWorkerId: adnanWorkerId,
      currentWorkerLabel: "Adnan Adnan",
    };

    const plan = turnPlanner.planTurn(prompt, groundedState);
    expect(plan.requiredResponseObjectives).toEqual(["WORKER_DETAILS", "WORKER_HISTORY"]);

    let callStep = 0;
    const mockModel: ModelProvider = {
      chat: vi.fn().mockImplementation(async () => {
        callStep++;
        if (callStep === 1) {
          return {
            content: null,
            toolCalls: [
              {
                id: "c-details",
                type: "function",
                function: { name: "get_worker_details", arguments: JSON.stringify({ worker_id: adnanWorkerId }) },
              },
              {
                id: "c-history",
                type: "function",
                function: { name: "get_worker_history", arguments: JSON.stringify({ worker_id: adnanWorkerId }) },
              },
            ],
            model: "gpt-4o-mini",
          };
        }
        return {
          content:
            "### Worker Details\n- Name: Adnan Adnan\n- Category: A\n\n" +
            "### Worker History\nNo worker history records were found.",
          toolCalls: [],
          model: "gpt-4o-mini",
        };
      }),
    };

    const loop = new ToolLoop(8);
    const result = await loop.run({
      modelProvider: mockModel,
      messages: [{ role: "user", content: prompt }],
      state: groundedState,
      userPrompt: prompt,
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-coverage-r11",
      sessionId: groundedState.sessionId,
      traceRepo: traceRepository,
      turnPlan: plan,
    });

    expect(result.finalContent).toContain("### Worker Details");
    expect(result.finalContent).toContain("### Worker History");
    expect(result.finalContent).toContain("No worker history records were found");
  });

  // =========================================================================
  // REQUIREMENT 12 — EVENT + WORKER TRUE MULTI-DOMAIN TEST
  // =========================================================================
  it("Requirement 12: 'Show VM Hall details and worker Arif history.' covers Event Details and Worker History", async () => {
    (mockGateway as any).searchWorkers.mockResolvedValueOnce([
      { id: arifWorkerId, full_name: "Arif Khan", category: "B", status: "ACTIVE" },
    ]);
    (mockGateway as any).getWorkerHistory.mockResolvedValueOnce([
      { id: "h-arif-1", worker_id: arifWorkerId, change_type: "SHIFT_COMPLETED" },
    ]);

    const prompt = "Show VM Hall details and worker Arif history.";
    const plan = turnPlanner.planTurn(prompt, sessionWithEventState);

    expect(plan.objectives).toContain("EVENT_DETAILS");
    expect(plan.objectives).toContain("WORKER_HISTORY");
    expect(plan.requiredResponseObjectives).toEqual(["EVENT_DETAILS", "WORKER_HISTORY"]);

    let callStep = 0;
    const mockModel: ModelProvider = {
      chat: vi.fn().mockImplementation(async () => {
        callStep++;
        if (callStep === 1) {
          return {
            content: null,
            toolCalls: [
              {
                id: "c-ed",
                type: "function",
                function: { name: "get_event_details", arguments: JSON.stringify({ event_id: vmHallEventId }) },
              },
              {
                id: "c-sw",
                type: "function",
                function: { name: "search_workers", arguments: JSON.stringify({ query: "Arif" }) },
              },
            ],
            model: "gpt-4o-mini",
          };
        }
        if (callStep === 2) {
          return {
            content: null,
            toolCalls: [
              {
                id: "c-wh",
                type: "function",
                function: { name: "get_worker_history", arguments: JSON.stringify({ worker_id: arifWorkerId }) },
              },
            ],
            model: "gpt-4o-mini",
          };
        }
        return {
          content:
            "### Event Details\n- Title: VM hall function\n- Date: 2026-09-25\n- Status: PUBLISHED\n\n" +
            "### Worker History\n- Arif Khan has completed 8 shifts.",
          toolCalls: [],
          model: "gpt-4o-mini",
        };
      }),
    };

    const loop = new ToolLoop(8);
    const result = await loop.run({
      modelProvider: mockModel,
      messages: [{ role: "user", content: prompt }],
      state: sessionWithEventState,
      userPrompt: prompt,
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-coverage-r12",
      sessionId: sessionWithEventState.sessionId,
      traceRepo: traceRepository,
      turnPlan: plan,
    });

    expect(result.finalContent).toContain("### Event Details");
    expect(result.finalContent).toContain("### Worker History");
    expect(result.finalContent).not.toContain("### Worker Details");
    expect(result.finalContent).not.toContain("### Event Report");
  });
});
