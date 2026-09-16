import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolLoop } from "../../../src/ai/tool-loop.js";
import { ModelCompletionOptions, ModelProvider } from "../../../src/ai/model.provider.js";
import { turnPlanner } from "../../../src/ai/turn-planner.js";
import { traceRepository } from "../../../src/persistence/repositories/trace.repository.js";
import { ActorContext } from "../../../src/auth/actor-context.js";
import { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import { SessionState } from "../../../src/context/context.types.js";
import { ModelInvalidResponseError } from "../../../src/domain/errors.js";

describe("VM Hall Production Regression & Context Pollution Protection", () => {
  const mockActor: ActorContext = {
    userId: "11111111-1111-1111-1111-111111111111",
    role: "ADMIN",
    accountStatus: "ACTIVE",
    displayName: "Admin Alice",
    accessToken: "jwt.mock",
    requestId: "req-vm-regression-1",
  };

  const emptyState: SessionState = {
    sessionId: "d22667fa-b685-48b6-b4bd-edf5dba314ce",
    userId: "11111111-1111-1111-1111-111111111111",
    currentEventId: null,
    currentEventLabel: null,
    currentWorkerId: null,
    currentWorkerLabel: null,
    recentEventResults: [],
    recentWorkerResults: [],
    lastIntent: null,
    pendingActionId: null,
    updatedAt: new Date().toISOString(),
  };

  const testEventId = "12345678-1234-1234-1234-123456789abc";

  const mockGateway = {
    getAdminEvents: vi.fn().mockResolvedValue([
      {
        id: testEventId,
        title: "VM hall function",
        event_date: "2026-09-20",
        reporting_at: "2026-09-20T09:00:00Z",
        event_status: "PUBLISHED",
        event_type: "FUNCTION",
        venue_name: "VM Hall",
      },
    ]),
    getAdminEventDetail: vi.fn().mockResolvedValue({
      id: testEventId,
      title: "VM hall function",
      event_date: "2026-09-20",
      event_status: "PUBLISHED",
      shifts: [],
      staffing_requirements: [],
    }),
    getEventReportSummary: vi.fn().mockResolvedValue({
      event_id: testEventId,
      title: "VM hall function",
      total_shifts: 2,
      total_allocated_workers: 15,
      attended_workers: 15,
    }),
    getEventStaffingReport: vi.fn().mockResolvedValue([]),
    getEventAuditHistory: vi.fn().mockResolvedValue([]),
    searchWorkers: vi.fn().mockResolvedValue([]),
    getWorkerDetail: vi.fn().mockResolvedValue(null),
    getWorkerHistory: vi.fn().mockResolvedValue([]),
    changeWorkerCategory: vi.fn(),
    publishEvent: vi.fn(),
    completeEvent: vi.fn(),
    closeEvent: vi.fn(),
  } as unknown as OslavaGateway;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Requirement 11 & 13: Exact production prompt executes event tools only and leaves worker state null", async () => {
    const prompt = "Find VM hall function, tell me its details, and give me its event report.";
    const plan = turnPlanner.planTurn(prompt, emptyState);

    // Assert TurnPlan contract:
    expect(plan.objectives).toContain("SEARCH_EVENTS");
    expect(plan.objectives).toContain("EVENT_DETAILS");
    expect(plan.objectives).toContain("EVENT_REPORT");

    expect(plan.objectives).not.toContain("SEARCH_WORKERS");
    expect(plan.objectives).not.toContain("WORKER_DETAILS");
    expect(plan.objectives).not.toContain("WORKER_HISTORY");

    expect(plan.requiredReadTools).toEqual([
      "search_events",
      "get_event_details",
      "get_event_report",
    ]);

    // Assert allowedTools strictly matches the 3 event reads and zero write tools:
    expect(plan.allowedTools).toEqual([
      "search_events",
      "get_event_details",
      "get_event_report",
    ]);
    expect(plan.allowedTools).not.toContain("publish_event");
    expect(plan.allowedTools).not.toContain("complete_event");
    expect(plan.allowedTools).not.toContain("close_event");
    expect(plan.allowedTools).not.toContain("change_worker_category");

    let step = 0;
    const mockModel: ModelProvider = {
      chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
        step++;
        if (step === 1) {
          // Model calls search_events
          return {
            content: null,
            toolCalls: [
              {
                id: "call-search",
                type: "function",
                function: {
                  name: "search_events",
                  arguments: JSON.stringify({ query: "VM hall function" }),
                },
              },
            ],
            model: "gpt-4o-mini",
          };
        }
        if (step === 2) {
          // Model calls get_event_details
          return {
            content: null,
            toolCalls: [
              {
                id: "call-details",
                type: "function",
                function: {
                  name: "get_event_details",
                  arguments: JSON.stringify({ event_id: testEventId }),
                },
              },
            ],
            model: "gpt-4o-mini",
          };
        }
        if (step === 3) {
          // Model calls get_event_report
          return {
            content: null,
            toolCalls: [
              {
                id: "call-report",
                type: "function",
                function: {
                  name: "get_event_report",
                  arguments: JSON.stringify({ event_id: testEventId }),
                },
              },
            ],
            model: "gpt-4o-mini",
          };
        }
        return {
          content:
            "### Event Details\nVM hall function is scheduled for Sep 20.\n\n### Event Report\nReport shows 15 workers assigned.",
          toolCalls: [],
          model: "gpt-4o-mini",
        };
      }),
    };

    const loop = new ToolLoop(8);
    const result = await loop.run({
      modelProvider: mockModel,
      messages: [{ role: "user", content: prompt }],
      state: emptyState,
      userPrompt: prompt,
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-vm-regression-1",
      sessionId: emptyState.sessionId,
      traceRepo: traceRepository,
      turnPlan: plan,
    });

    // Assert tools executed:
    expect((mockGateway as any).getAdminEvents).toHaveBeenCalledTimes(1);
    expect((mockGateway as any).getAdminEventDetail).toHaveBeenCalledTimes(1);
    expect((mockGateway as any).getEventReportSummary).toHaveBeenCalledTimes(1);

    // Assert zero worker tool executions:
    expect((mockGateway as any).searchWorkers).toHaveBeenCalledTimes(0);
    expect((mockGateway as any).getWorkerDetail).toHaveBeenCalledTimes(0);
    expect((mockGateway as any).getWorkerHistory).toHaveBeenCalledTimes(0);

    // Assert no write-intent tool executes:
    expect((mockGateway as any).changeWorkerCategory).toHaveBeenCalledTimes(0);
    expect((mockGateway as any).publishEvent).toHaveBeenCalledTimes(0);
    expect((mockGateway as any).completeEvent).toHaveBeenCalledTimes(0);
    expect((mockGateway as any).closeEvent).toHaveBeenCalledTimes(0);

    // Assert no pending action is proposed / staged:
    expect(result.proposedAction).toBeUndefined();

    // Assert session state (Requirement 13):
    expect(result.state?.currentEventLabel).toBe("VM hall function");
    expect(result.state?.currentEventId).toBe(testEventId);
    expect(result.state?.currentWorkerId).toBeNull();
    expect(result.state?.currentWorkerLabel).toBeNull();

    // Verify response content:
    expect(result.finalContent).toContain("VM hall function");
  });

  it("Requirement 8 & 9: Model cannot execute out-of-plan worker tool during event turn", async () => {
    const prompt = "Find VM hall function, tell me its details, and give me its event report.";
    const plan = turnPlanner.planTurn(prompt, emptyState);

    let step = 0;
    const mockModel: ModelProvider = {
      chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
        step++;
        if (step === 1) {
          // Model erroneously attempts to call search_workers
          return {
            content: null,
            toolCalls: [
              {
                id: "call-rogue-worker",
                type: "function",
                function: {
                  name: "search_workers",
                  arguments: JSON.stringify({ query: "Adnan" }),
                },
              },
            ],
            model: "gpt-4o-mini",
          };
        }
        if (step === 2) {
          // After rejection, model calls search_events
          return {
            content: null,
            toolCalls: [
              {
                id: "call-search-events",
                type: "function",
                function: {
                  name: "search_events",
                  arguments: JSON.stringify({ query: "VM hall" }),
                },
              },
            ],
            model: "gpt-4o-mini",
          };
        }
        if (step === 3) {
          return {
            content: null,
            toolCalls: [
              {
                id: "call-details",
                type: "function",
                function: {
                  name: "get_event_details",
                  arguments: JSON.stringify({ event_id: testEventId }),
                },
              },
            ],
            model: "gpt-4o-mini",
          };
        }
        if (step === 4) {
          return {
            content: null,
            toolCalls: [
              {
                id: "call-report",
                type: "function",
                function: {
                  name: "get_event_report",
                  arguments: JSON.stringify({ event_id: testEventId }),
                },
              },
            ],
            model: "gpt-4o-mini",
          };
        }
        return {
          content:
            "### Event Details\nVM hall function is scheduled for Sep 20.\n\n### Event Report\nVM Hall Function report details.",
          toolCalls: [],
          model: "gpt-4o-mini",
        };
      }),
    };

    const loop = new ToolLoop(8);
    const result = await loop.run({
      modelProvider: mockModel,
      messages: [{ role: "user", content: prompt }],
      state: emptyState,
      userPrompt: prompt,
      gateway: mockGateway,
      actor: mockActor,
      requestId: "req-vm-regression-2",
      sessionId: emptyState.sessionId,
      traceRepo: traceRepository,
      turnPlan: plan,
    });

    // The rogue search_workers call must NOT have reached gateway:
    expect((mockGateway as any).searchWorkers).toHaveBeenCalledTimes(0);

    // The allowed event tools executed properly:
    expect((mockGateway as any).getAdminEvents).toHaveBeenCalledTimes(1);
    expect((mockGateway as any).getAdminEventDetail).toHaveBeenCalledTimes(1);
    expect((mockGateway as any).getEventReportSummary).toHaveBeenCalledTimes(1);

    // Session state remains unpolluted:
    expect(result.state?.currentWorkerId).toBeNull();
    expect(result.state?.currentWorkerLabel).toBeNull();
    expect(result.state?.currentEventLabel).toBe("VM hall function");
  });

  it("Requirement 5: Fails closed with ModelInvalidResponseError when required objectives remain incomplete", async () => {
    const prompt = "Find VM hall function, tell me its details, and give me its event report.";
    const plan = turnPlanner.planTurn(prompt, emptyState);

    // Model stubbornly outputs premature prose and ignores reminders
    const mockModel: ModelProvider = {
      chat: vi.fn().mockResolvedValue({
        content: "Here is what I think without checking the event report.",
        toolCalls: [],
        model: "gpt-4o-mini",
      }),
    };

    const loop = new ToolLoop(8);
    await expect(
      loop.run({
        modelProvider: mockModel,
        messages: [{ role: "user", content: prompt }],
        state: emptyState,
        userPrompt: prompt,
        gateway: mockGateway,
        actor: mockActor,
        requestId: "req-vm-regression-3",
        sessionId: emptyState.sessionId,
        traceRepo: traceRepository,
        turnPlan: plan,
      }),
    ).rejects.toThrow(ModelInvalidResponseError);
  });

  it("Requirement 6: Fails closed when max tool calls limit is reached with incomplete plan", async () => {
    const prompt = "Find VM hall function, tell me its details, and give me its event report.";
    const plan = turnPlanner.planTurn(prompt, emptyState);

    // Model makes repeated calls to search_events until maxToolCalls (2) is reached
    const mockModel: ModelProvider = {
      chat: vi.fn().mockResolvedValue({
        content: null,
        toolCalls: [
          {
            id: "call-repeat",
            type: "function",
            function: {
              name: "search_events",
              arguments: JSON.stringify({ query: "VM hall" }),
            },
          },
        ],
        model: "gpt-4o-mini",
      }),
    };

    const loop = new ToolLoop(2); // Set maxToolCalls to 2 (not enough to complete search, details, and report)
    await expect(
      loop.run({
        modelProvider: mockModel,
        messages: [{ role: "user", content: prompt }],
        state: emptyState,
        userPrompt: prompt,
        gateway: mockGateway,
        actor: mockActor,
        requestId: "req-vm-regression-4",
        sessionId: emptyState.sessionId,
        traceRepo: traceRepository,
        turnPlan: plan,
        maxToolCalls: 2,
      }),
    ).rejects.toThrow(ModelInvalidResponseError);
  });
});
