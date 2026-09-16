import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ToolLoop } from "../../../src/ai/tool-loop.js";
import { ModelCompletionOptions, ModelProvider } from "../../../src/ai/model.provider.js";
import { turnPlanner } from "../../../src/ai/turn-planner.js";
import { traceRepository } from "../../../src/persistence/repositories/trace.repository.js";
import { ActorContext } from "../../../src/auth/actor-context.js";
import { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import { SessionState } from "../../../src/context/context.types.js";
import { ModelInvalidResponseError } from "../../../src/domain/errors.js";
import { parseConfig, setCachedConfig } from "../../../src/config/env.js";

/**
 * Collection Intent vs Specific Entity: ToolLoop-level runtime regressions.
 *
 * These tests prove the EXACT runtime behavior that the Flutter production
 * regression exposed. Every test drives the full ToolLoop with a TurnPlan
 * and mock model/gateway, asserting:
 *   - exact gateway method call counts
 *   - no MODEL_INVALID_RESPONSE for clean paths
 *   - no search looping
 *   - no hallucinated dependent tool calls
 *   - correct terminal resolution for 0/1/N results
 */
describe("Collection Intent Regression: ToolLoop Runtime", () => {
  const mockActor: ActorContext = {
    userId: "11111111-1111-1111-1111-111111111111",
    role: "ADMIN",
    accountStatus: "ACTIVE",
    displayName: "Admin Alice",
    accessToken: "jwt.mock",
    requestId: "req-collection-1",
  };

  const emptyState: SessionState = {
    sessionId: "test-collection-session",
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

  const testEventId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const testWorkerId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  let mockGateway: any;

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

    // Default gateway mocks (overridden per test as needed)
    mockGateway = {
      getAdminDashboard: vi.fn().mockResolvedValue({ today_event_count: 0 }),
      getAdminEvents: vi.fn().mockResolvedValue([]),
      getAdminEventDetail: vi.fn().mockResolvedValue(null),
      getEventReportSummary: vi.fn().mockResolvedValue(null),
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
  });

  // ==========================================================================
  // §1: EXACT FLUTTER FAILURE QUERY — "tell me about the events"
  // ==========================================================================
  describe("§1: Collection query 'tell me about the events'", () => {
    it("executes search_events exactly once, zero dependent tools, normal response, no 502", async () => {
      const prompt = "tell me about the events";
      const plan = turnPlanner.planTurn(prompt, emptyState);

      // Assert TurnPlan contract
      expect(plan.objectives).toEqual(["SEARCH_EVENTS"]);
      expect(plan.requiredReadTools).toEqual(["search_events"]);
      expect(plan.allowedTools).toEqual(["search_events"]);
      expect(plan.requiredResponseObjectives).toEqual(["SEARCH_EVENTS"]);

      // Mock: search returns two events (collection)
      mockGateway.getAdminEvents.mockResolvedValue([
        { id: testEventId, title: "VM hall function", event_date: "2026-09-20", event_status: "PUBLISHED" },
        { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", title: "Gala Dinner", event_date: "2026-09-22", event_status: "DRAFT" },
      ]);

      let modelCallCount = 0;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
          modelCallCount++;
          if (modelCallCount === 1) {
            return {
              content: null,
              toolCalls: [
                {
                  id: "call-search",
                  type: "function",
                  function: { name: "search_events", arguments: "{}" },
                },
              ],
              model: "gpt-4o-mini",
            };
          }
          // Final response
          return {
            content: "Here are the events:\n1. VM hall function — Sep 20, PUBLISHED\n2. Gala Dinner — Sep 22, DRAFT",
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
        requestId: "req-flutter-1",
        sessionId: emptyState.sessionId,
        traceRepo: traceRepository,
        turnPlan: plan,
      });

      // Runtime assertions
      expect(mockGateway.getAdminEvents).toHaveBeenCalledTimes(1);  // search_events = 1
      expect(mockGateway.getAdminEventDetail).toHaveBeenCalledTimes(0);  // get_event_details = 0
      expect(mockGateway.getEventReportSummary).toHaveBeenCalledTimes(0);  // get_event_report = 0
      expect(mockGateway.searchWorkers).toHaveBeenCalledTimes(0);  // worker tools = 0
      expect(mockGateway.getWorkerDetail).toHaveBeenCalledTimes(0);
      expect(mockGateway.getWorkerHistory).toHaveBeenCalledTimes(0);
      expect(mockGateway.changeWorkerCategory).toHaveBeenCalledTimes(0);  // write tools = 0
      expect(mockGateway.publishEvent).toHaveBeenCalledTimes(0);

      // Normal response, no error
      expect(result.finalContent).toContain("events");
      expect(result.toolCallCount).toBe(1);
    });
  });

  // ==========================================================================
  // §2: SPECIFIC EVENT CONTINUATION — "tell me about VM hall function"
  // ==========================================================================
  describe("§2: Specific event 'tell me about VM hall function'", () => {
    it("search_events = 1, get_event_details = 1, search not repeated", async () => {
      const prompt = "tell me about VM hall function";
      const plan = turnPlanner.planTurn(prompt, emptyState);

      // Assert TurnPlan contract
      expect(plan.objectives).toContain("SEARCH_EVENTS");
      expect(plan.objectives).toContain("EVENT_DETAILS");
      expect(plan.requiredResponseObjectives).toEqual(["EVENT_DETAILS"]);

      // Mock: exactly one event returned
      mockGateway.getAdminEvents.mockResolvedValue([
        { id: testEventId, title: "VM hall function", event_date: "2026-09-20", event_status: "PUBLISHED", venue_name: "VM Hall" },
      ]);
      mockGateway.getAdminEventDetail.mockResolvedValue({
        id: testEventId,
        title: "VM hall function",
        event_date: "2026-09-20",
        event_status: "PUBLISHED",
        shifts: [],
        staffing_requirements: [],
      });

      let modelStep = 0;
      const searchCallsAttempted: string[] = [];
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
          modelStep++;
          if (modelStep === 1) {
            searchCallsAttempted.push("search_events");
            return {
              content: null,
              toolCalls: [
                {
                  id: "call-search",
                  type: "function",
                  function: { name: "search_events", arguments: JSON.stringify({ query: "VM hall function" }) },
                },
              ],
              model: "gpt-4o-mini",
            };
          }
          if (modelStep === 2) {
            // Model calls get_event_details with the grounded ID
            return {
              content: null,
              toolCalls: [
                {
                  id: "call-details",
                  type: "function",
                  function: { name: "get_event_details", arguments: JSON.stringify({ event_id: testEventId }) },
                },
              ],
              model: "gpt-4o-mini",
            };
          }
          // Final synthesis
          return {
            content: "### Event Details\nVM hall function is scheduled for Sep 20, 2026.\nStatus: PUBLISHED\nVenue: VM Hall",
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
        requestId: "req-specific-event-1",
        sessionId: emptyState.sessionId,
        traceRepo: traceRepository,
        turnPlan: plan,
      });

      // Exact execution counts
      expect(mockGateway.getAdminEvents).toHaveBeenCalledTimes(1);  // search_events = exactly 1
      expect(mockGateway.getAdminEventDetail).toHaveBeenCalledTimes(1);  // get_event_details = exactly 1
      expect(mockGateway.getEventReportSummary).toHaveBeenCalledTimes(0);
      expect(mockGateway.searchWorkers).toHaveBeenCalledTimes(0);
      expect(mockGateway.getWorkerDetail).toHaveBeenCalledTimes(0);

      // Prove search was only attempted once by model
      expect(searchCallsAttempted).toEqual(["search_events"]);

      // Verify response
      expect(result.finalContent).toContain("Event Details");
      expect(result.finalContent).toContain("VM hall function");
    });
  });

  // ==========================================================================
  // §3: SPECIFIC WORKER CONTINUATION — "tell me about the worker Adnan Adnan"
  // ==========================================================================
  describe("§3: Specific worker 'tell me about the worker Adnan Adnan'", () => {
    it("search_workers = 1, get_worker_details = 1, no event tools", async () => {
      const prompt = "tell me about the worker Adnan Adnan";
      const plan = turnPlanner.planTurn(prompt, emptyState);

      // Assert TurnPlan contract
      expect(plan.objectives).toContain("SEARCH_WORKERS");
      expect(plan.objectives).toContain("WORKER_DETAILS");
      expect(plan.requiredResponseObjectives).toEqual(["WORKER_DETAILS"]);

      // Mock: exactly one worker returned
      mockGateway.searchWorkers.mockResolvedValue([
        { id: testWorkerId, full_name: "Adnan Adnan", category: "A", status: "ACTIVE", phone: "+919876543210" },
      ]);
      mockGateway.getWorkerDetail.mockResolvedValue({
        id: testWorkerId,
        full_name: "Adnan Adnan",
        category: "A",
        status: "ACTIVE",
        phone: "+919876543210",
        reliability_score: 98,
      });

      let modelStep = 0;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async () => {
          modelStep++;
          if (modelStep === 1) {
            return {
              content: null,
              toolCalls: [
                {
                  id: "call-search-w",
                  type: "function",
                  function: { name: "search_workers", arguments: JSON.stringify({ query: "Adnan Adnan" }) },
                },
              ],
              model: "gpt-4o-mini",
            };
          }
          if (modelStep === 2) {
            return {
              content: null,
              toolCalls: [
                {
                  id: "call-details-w",
                  type: "function",
                  function: { name: "get_worker_details", arguments: JSON.stringify({ worker_id: testWorkerId }) },
                },
              ],
              model: "gpt-4o-mini",
            };
          }
          return {
            content: "### Worker Details\n- Name: Adnan Adnan\n- Category: A\n- Status: ACTIVE\n- Reliability: 98%",
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
        requestId: "req-specific-worker-1",
        sessionId: emptyState.sessionId,
        traceRepo: traceRepository,
        turnPlan: plan,
      });

      // Exact execution counts
      expect(mockGateway.searchWorkers).toHaveBeenCalledTimes(1);  // search_workers = exactly 1
      expect(mockGateway.getWorkerDetail).toHaveBeenCalledTimes(1);  // get_worker_details = exactly 1
      expect(mockGateway.getAdminEvents).toHaveBeenCalledTimes(0);  // no event tools
      expect(mockGateway.getAdminEventDetail).toHaveBeenCalledTimes(0);
      expect(mockGateway.getWorkerHistory).toHaveBeenCalledTimes(0);

      expect(result.finalContent).toContain("Worker Details");
      expect(result.finalContent).toContain("Adnan Adnan");
    });
  });

  // ==========================================================================
  // §4: ZERO / MULTIPLE RESULT TERMINAL PATHS
  // ==========================================================================
  describe("§4: Terminal resolution paths", () => {
    // --- EVENT: ZERO RESULTS ---
    it("event zero results: no dependent tool, no hallucinated UUID, no 502", async () => {
      const prompt = "tell me about VM hall function";
      const plan = turnPlanner.planTurn(prompt, emptyState);

      // Mock: search returns empty
      mockGateway.getAdminEvents.mockResolvedValue([]);

      let modelStep = 0;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async () => {
          modelStep++;
          if (modelStep === 1) {
            return {
              content: null,
              toolCalls: [
                {
                  id: "call-search-e",
                  type: "function",
                  function: { name: "search_events", arguments: JSON.stringify({ query: "VM hall function" }) },
                },
              ],
              model: "gpt-4o-mini",
            };
          }
          // Terminal resolution synthesis (toolChoice: none)
          return {
            content: "No matching events were found for 'VM hall function'. Please check the event name and try again.",
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
        requestId: "req-zero-event",
        sessionId: emptyState.sessionId,
        traceRepo: traceRepository,
        turnPlan: plan,
      });

      expect(mockGateway.getAdminEvents).toHaveBeenCalledTimes(1);
      expect(mockGateway.getAdminEventDetail).toHaveBeenCalledTimes(0);  // dependent tool = 0
      expect(mockGateway.getEventReportSummary).toHaveBeenCalledTimes(0);
      expect(result.finalContent).toContain("No matching");  // normal no-match response
      expect(result.toolCallCount).toBe(1);
    });

    // --- EVENT: MULTIPLE RESULTS ---
    it("event multiple results: no dependent tool, disambiguation response, no 502", async () => {
      const prompt = "tell me about VM hall function";
      const plan = turnPlanner.planTurn(prompt, emptyState);

      // Mock: search returns 2+ candidates
      mockGateway.getAdminEvents.mockResolvedValue([
        { id: testEventId, title: "VM hall function morning", event_date: "2026-09-20", event_status: "PUBLISHED" },
        { id: "dddddddd-dddd-dddd-dddd-dddddddddddd", title: "VM hall function evening", event_date: "2026-09-20", event_status: "DRAFT" },
      ]);

      let modelStep = 0;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async () => {
          modelStep++;
          if (modelStep === 1) {
            return {
              content: null,
              toolCalls: [
                {
                  id: "call-search-e",
                  type: "function",
                  function: { name: "search_events", arguments: JSON.stringify({ query: "VM hall function" }) },
                },
              ],
              model: "gpt-4o-mini",
            };
          }
          // Disambiguation synthesis
          return {
            content: "I found 2 matching events:\n1. VM hall function morning\n2. VM hall function evening\nWhich one would you like details for?",
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
        requestId: "req-multi-event",
        sessionId: emptyState.sessionId,
        traceRepo: traceRepository,
        turnPlan: plan,
      });

      expect(mockGateway.getAdminEvents).toHaveBeenCalledTimes(1);
      expect(mockGateway.getAdminEventDetail).toHaveBeenCalledTimes(0);  // no arbitrary candidate
      expect(result.finalContent).toContain("2 matching");  // safe disambiguation
      expect(result.toolCallCount).toBe(1);
    });

    // --- WORKER: ZERO RESULTS ---
    it("worker zero results: no dependent tool, no hallucinated UUID, no 502", async () => {
      const prompt = "tell me about the worker Adnan Adnan";
      const plan = turnPlanner.planTurn(prompt, emptyState);

      // Mock: search returns empty
      mockGateway.searchWorkers.mockResolvedValue([]);

      let modelStep = 0;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async () => {
          modelStep++;
          if (modelStep === 1) {
            return {
              content: null,
              toolCalls: [
                {
                  id: "call-search-w",
                  type: "function",
                  function: { name: "search_workers", arguments: JSON.stringify({ query: "Adnan Adnan" }) },
                },
              ],
              model: "gpt-4o-mini",
            };
          }
          return {
            content: "No matching workers were found for 'Adnan Adnan'. Please verify the name.",
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
        requestId: "req-zero-worker",
        sessionId: emptyState.sessionId,
        traceRepo: traceRepository,
        turnPlan: plan,
      });

      expect(mockGateway.searchWorkers).toHaveBeenCalledTimes(1);
      expect(mockGateway.getWorkerDetail).toHaveBeenCalledTimes(0);  // dependent tool = 0
      expect(mockGateway.getWorkerHistory).toHaveBeenCalledTimes(0);
      expect(result.finalContent).toContain("No matching");
      expect(result.toolCallCount).toBe(1);
    });

    // --- WORKER: MULTIPLE RESULTS ---
    it("worker multiple results: no dependent tool, disambiguation response, no 502", async () => {
      const prompt = "tell me about the worker Adnan Adnan";
      const plan = turnPlanner.planTurn(prompt, emptyState);

      // Mock: search returns 2+ candidates
      mockGateway.searchWorkers.mockResolvedValue([
        { id: testWorkerId, full_name: "Adnan Adnan (Senior)", category: "A", status: "ACTIVE" },
        { id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", full_name: "Adnan Adnan (Junior)", category: "B", status: "ACTIVE" },
      ]);

      let modelStep = 0;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async () => {
          modelStep++;
          if (modelStep === 1) {
            return {
              content: null,
              toolCalls: [
                {
                  id: "call-search-w",
                  type: "function",
                  function: { name: "search_workers", arguments: JSON.stringify({ query: "Adnan Adnan" }) },
                },
              ],
              model: "gpt-4o-mini",
            };
          }
          return {
            content: "I found 2 workers matching 'Adnan Adnan':\n1. Adnan Adnan (Senior) - Category A\n2. Adnan Adnan (Junior) - Category B\nWhich one would you like details for?",
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
        requestId: "req-multi-worker",
        sessionId: emptyState.sessionId,
        traceRepo: traceRepository,
        turnPlan: plan,
      });

      expect(mockGateway.searchWorkers).toHaveBeenCalledTimes(1);
      expect(mockGateway.getWorkerDetail).toHaveBeenCalledTimes(0);  // no arbitrary candidate
      expect(result.finalContent).toContain("2 workers");
      expect(result.toolCallCount).toBe(1);
    });
  });

  // ==========================================================================
  // §5: ACTIVE CONTEXT MUST NOT OVERRIDE COLLECTION INTENT
  // ==========================================================================
  describe("§5: Active context does not override collection intent", () => {
    it("currentEventId exists but 'tell me about the events' is terminal SEARCH_EVENTS", async () => {
      const stateWithEvent: SessionState = {
        ...emptyState,
        currentEventId: testEventId,
        currentEventLabel: "VM hall function",
      };

      const prompt = "tell me about the events";
      const plan = turnPlanner.planTurn(prompt, stateWithEvent);

      // Plan must be terminal collection, NOT details for active entity
      expect(plan.objectives).toEqual(["SEARCH_EVENTS"]);
      expect(plan.requiredReadTools).toEqual(["search_events"]);
      expect(plan.allowedTools).toEqual(["search_events"]);
      expect(plan.requiredResponseObjectives).toEqual(["SEARCH_EVENTS"]);

      // Mock: search returns multiple events
      mockGateway.getAdminEvents.mockResolvedValue([
        { id: testEventId, title: "VM hall function", event_date: "2026-09-20", event_status: "PUBLISHED" },
        { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", title: "Wedding", event_date: "2026-09-22", event_status: "DRAFT" },
      ]);

      let modelStep = 0;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async () => {
          modelStep++;
          if (modelStep === 1) {
            return {
              content: null,
              toolCalls: [
                {
                  id: "call-search-e",
                  type: "function",
                  function: { name: "search_events", arguments: JSON.stringify({}) },
                },
              ],
              model: "gpt-4o-mini",
            };
          }
          return {
            content: "Here are the events:\n1. VM hall function\n2. Wedding",
            toolCalls: [],
            model: "gpt-4o-mini",
          };
        }),
      };

      const loop = new ToolLoop(8);
      const result = await loop.run({
        modelProvider: mockModel,
        messages: [{ role: "user", content: prompt }],
        state: stateWithEvent,
        userPrompt: prompt,
        gateway: mockGateway,
        actor: mockActor,
        requestId: "req-ctx-override-event",
        sessionId: emptyState.sessionId,
        traceRepo: traceRepository,
        turnPlan: plan,
      });

      expect(mockGateway.getAdminEvents).toHaveBeenCalledTimes(1);
      expect(mockGateway.getAdminEventDetail).toHaveBeenCalledTimes(0);  // NOT details for active entity
      expect(result.finalContent).toContain("events");
    });

    it("currentWorkerId exists but 'tell me about the workers' is terminal SEARCH_WORKERS", async () => {
      const stateWithWorker: SessionState = {
        ...emptyState,
        currentWorkerId: testWorkerId,
        currentWorkerLabel: "Adnan Adnan",
      };

      const prompt = "tell me about the workers";
      const plan = turnPlanner.planTurn(prompt, stateWithWorker);

      expect(plan.objectives).toEqual(["SEARCH_WORKERS"]);
      expect(plan.requiredReadTools).toEqual(["search_workers"]);
      expect(plan.allowedTools).toEqual(["search_workers"]);
      expect(plan.requiredResponseObjectives).toEqual(["SEARCH_WORKERS"]);

      mockGateway.searchWorkers.mockResolvedValue([
        { id: testWorkerId, full_name: "Adnan Adnan", category: "A", status: "ACTIVE" },
        { id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", full_name: "Arif Khan", category: "B", status: "ACTIVE" },
      ]);

      let modelStep = 0;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async () => {
          modelStep++;
          if (modelStep === 1) {
            return {
              content: null,
              toolCalls: [
                {
                  id: "call-search-w",
                  type: "function",
                  function: { name: "search_workers", arguments: JSON.stringify({}) },
                },
              ],
              model: "gpt-4o-mini",
            };
          }
          return {
            content: "Here are the workers:\n1. Adnan Adnan - Category A\n2. Arif Khan - Category B",
            toolCalls: [],
            model: "gpt-4o-mini",
          };
        }),
      };

      const loop = new ToolLoop(8);
      const result = await loop.run({
        modelProvider: mockModel,
        messages: [{ role: "user", content: prompt }],
        state: stateWithWorker,
        userPrompt: prompt,
        gateway: mockGateway,
        actor: mockActor,
        requestId: "req-ctx-override-worker",
        sessionId: emptyState.sessionId,
        traceRepo: traceRepository,
        turnPlan: plan,
      });

      expect(mockGateway.searchWorkers).toHaveBeenCalledTimes(1);
      expect(mockGateway.getWorkerDetail).toHaveBeenCalledTimes(0);  // NOT details for active entity
      expect(result.finalContent).toContain("workers");
    });
  });

  // ==========================================================================
  // §6: DEPENDENCY-AWARE RECOVERY
  // ==========================================================================
  describe("§6: Dependency-aware recovery", () => {
    it("model concludes after search without get_event_details; recovery forces it, search not re-executed", async () => {
      const prompt = "tell me about VM hall function";
      const plan = turnPlanner.planTurn(prompt, emptyState);

      // Mock: search returns exactly one event
      mockGateway.getAdminEvents.mockResolvedValue([
        { id: testEventId, title: "VM hall function", event_date: "2026-09-20", event_status: "PUBLISHED" },
      ]);
      mockGateway.getAdminEventDetail.mockResolvedValue({
        id: testEventId,
        title: "VM hall function",
        event_date: "2026-09-20",
        event_status: "PUBLISHED",
        shifts: [{ id: "shift-1", time: "09:00" }],
      });

      const modelToolAttempts: string[] = [];
      let modelStep = 0;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
          modelStep++;
          if (modelStep === 1) {
            // Step 1: model calls search_events
            modelToolAttempts.push("search_events");
            return {
              content: null,
              toolCalls: [
                {
                  id: "call-search",
                  type: "function",
                  function: { name: "search_events", arguments: JSON.stringify({ query: "VM hall function" }) },
                },
              ],
              model: "gpt-4o-mini",
            };
          }
          if (modelStep === 2) {
            // Step 2: model prematurely concludes without calling get_event_details
            modelToolAttempts.push("premature_prose");
            return {
              content: "I found VM hall function scheduled for Sep 20.",
              toolCalls: [],
              model: "gpt-4o-mini",
            };
          }
          if (modelStep === 3) {
            // Step 3: After omission recovery, model is forced to call get_event_details
            modelToolAttempts.push("get_event_details");
            return {
              content: null,
              toolCalls: [
                {
                  id: "call-details-recovery",
                  type: "function",
                  function: { name: "get_event_details", arguments: JSON.stringify({ event_id: testEventId }) },
                },
              ],
              model: "gpt-4o-mini",
            };
          }
          // Step 4: Final synthesis
          return {
            content: "### Event Details\nVM hall function — Sep 20, 2026\nStatus: PUBLISHED\nShifts: 1",
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
        requestId: "req-recovery-1",
        sessionId: emptyState.sessionId,
        traceRepo: traceRepository,
        turnPlan: plan,
      });

      // Report: model attempted tool calls
      expect(modelToolAttempts).toEqual(["search_events", "premature_prose", "get_event_details"]);

      // Report: actual underlying tool executions
      expect(mockGateway.getAdminEvents).toHaveBeenCalledTimes(1);  // search_events actually executed = 1
      expect(mockGateway.getAdminEventDetail).toHaveBeenCalledTimes(1);  // get_event_details executed = 1

      // Proof: prerequisite search was NOT executed again
      // (search_events appears in modelToolAttempts exactly once)
      expect(modelToolAttempts.filter((t) => t === "search_events")).toHaveLength(1);

      // Report: read-cache reuse count = 0 (search only ran once, no duplicate needed)
      // The tool-loop's dedup filter prevents search_events from even being offered after execution.

      // Final answer succeeds
      expect(result.finalContent).toContain("Event Details");
      expect(result.finalContent).toContain("VM hall function");
    });
  });

  // ==========================================================================
  // §7: PUBLIC ERROR SANITIZATION
  // ==========================================================================
  describe("§7: Public error sanitization", () => {
    it("ModelInvalidResponseError internal message preserved but public toResponse is sanitized", () => {
      const internalMessage = "AI model failed to complete EVENT_DETAILS using get_event_details";
      const err = new ModelInvalidResponseError(internalMessage);

      // Internal diagnostic preserved
      expect(err.message).toBe(internalMessage);
      expect(err.message).toContain("EVENT_DETAILS");
      expect(err.message).toContain("get_event_details");
      expect(err.code).toBe("MODEL_INVALID_RESPONSE");
      expect(err.statusCode).toBe(502);
      expect(err.retryable).toBe(false);

      // Public response is sanitized
      const publicPayload = err.toResponse("req_test");
      expect(publicPayload.error.message).toBe(
        "The AI assistant couldn't complete that request. Please try again or be more specific.",
      );
      expect(publicPayload.error.code).toBe("MODEL_INVALID_RESPONSE");
      expect(publicPayload.error.retryable).toBe(false);
      expect(publicPayload.error.request_id).toBe("req_test");

      // Public message does NOT leak internals
      expect(publicPayload.error.message).not.toContain("EVENT_DETAILS");
      expect(publicPayload.error.message).not.toContain("get_event_details");
    });
  });

  // ==========================================================================
  // §8: EXISTING COMPOUND QUERY REGRESSIONS
  // ==========================================================================
  describe("§8: Existing compound query regressions preserved", () => {
    it("'Find VM hall function, tell me its details, and give me its event report.' — search=1, details=1, report=1", async () => {
      const prompt = "Find VM hall function, tell me its details, and give me its event report.";
      const plan = turnPlanner.planTurn(prompt, emptyState);

      mockGateway.getAdminEvents.mockResolvedValue([
        { id: testEventId, title: "VM hall function", event_date: "2026-09-20", event_status: "PUBLISHED" },
      ]);
      mockGateway.getAdminEventDetail.mockResolvedValue({
        id: testEventId,
        title: "VM hall function",
        event_date: "2026-09-20",
        event_status: "PUBLISHED",
        shifts: [],
      });
      mockGateway.getEventReportSummary.mockResolvedValue({
        event_id: testEventId,
        title: "VM hall function",
        total_shifts: 2,
        total_allocated_workers: 10,
        attended_workers: 10,
      });

      let modelStep = 0;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async () => {
          modelStep++;
          if (modelStep === 1) {
            return {
              content: null,
              toolCalls: [
                { id: "c1", type: "function", function: { name: "search_events", arguments: JSON.stringify({ query: "VM hall function" }) } },
              ],
              model: "gpt-4o-mini",
            };
          }
          if (modelStep === 2) {
            return {
              content: null,
              toolCalls: [
                { id: "c2", type: "function", function: { name: "get_event_details", arguments: JSON.stringify({ event_id: testEventId }) } },
              ],
              model: "gpt-4o-mini",
            };
          }
          if (modelStep === 3) {
            return {
              content: null,
              toolCalls: [
                { id: "c3", type: "function", function: { name: "get_event_report", arguments: JSON.stringify({ event_id: testEventId }) } },
              ],
              model: "gpt-4o-mini",
            };
          }
          return {
            content: "### Event Details\nVM hall function — Sep 20\n\n### Event Report\n10 workers attended, 2 shifts.",
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
        requestId: "req-compound-event",
        sessionId: emptyState.sessionId,
        traceRepo: traceRepository,
        turnPlan: plan,
      });

      expect(mockGateway.getAdminEvents).toHaveBeenCalledTimes(1);
      expect(mockGateway.getAdminEventDetail).toHaveBeenCalledTimes(1);
      expect(mockGateway.getEventReportSummary).toHaveBeenCalledTimes(1);
      expect(mockGateway.searchWorkers).toHaveBeenCalledTimes(0);
      expect(result.finalContent).toContain("Event Details");
      expect(result.finalContent).toContain("Event Report");
    });

    it("'Find worker Adnan Adnan and show his details and history.' — search=1, details=1, history=1", async () => {
      const prompt = "Find worker Adnan Adnan and show his details and history.";
      const plan = turnPlanner.planTurn(prompt, emptyState);

      mockGateway.searchWorkers.mockResolvedValue([
        { id: testWorkerId, full_name: "Adnan Adnan", category: "A", status: "ACTIVE" },
      ]);
      mockGateway.getWorkerDetail.mockResolvedValue({
        id: testWorkerId,
        full_name: "Adnan Adnan",
        category: "A",
        status: "ACTIVE",
        reliability_score: 98,
      });
      mockGateway.getWorkerHistory.mockResolvedValue([
        { id: "h1", worker_id: testWorkerId, change_type: "CATEGORY_CHANGE", old_value: "B", new_value: "A" },
      ]);

      let modelStep = 0;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async () => {
          modelStep++;
          if (modelStep === 1) {
            return {
              content: null,
              toolCalls: [
                { id: "c1", type: "function", function: { name: "search_workers", arguments: JSON.stringify({ query: "Adnan Adnan" }) } },
              ],
              model: "gpt-4o-mini",
            };
          }
          if (modelStep === 2) {
            return {
              content: null,
              toolCalls: [
                { id: "c2", type: "function", function: { name: "get_worker_details", arguments: JSON.stringify({ worker_id: testWorkerId }) } },
                { id: "c3", type: "function", function: { name: "get_worker_history", arguments: JSON.stringify({ worker_id: testWorkerId }) } },
              ],
              model: "gpt-4o-mini",
            };
          }
          return {
            content: "### Worker Details\n- Name: Adnan Adnan\n- Category: A\n\n### Worker History\n- Promoted from B to A.",
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
        requestId: "req-compound-worker",
        sessionId: emptyState.sessionId,
        traceRepo: traceRepository,
        turnPlan: plan,
      });

      expect(mockGateway.searchWorkers).toHaveBeenCalledTimes(1);
      expect(mockGateway.getWorkerDetail).toHaveBeenCalledTimes(1);
      expect(mockGateway.getWorkerHistory).toHaveBeenCalledTimes(1);
      expect(mockGateway.getAdminEvents).toHaveBeenCalledTimes(0);
      expect(result.finalContent).toContain("Worker Details");
      expect(result.finalContent).toContain("Worker History");
    });
  });
});
