import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseConfig, setCachedConfig } from "../../../src/config/env.js";
import { MockOslavaGateway } from "../../../src/dev/mock-oslava.gateway.js";
import { ToolRegistry } from "../../../src/ai/tool-registry.js";
import { AgentService } from "../../../src/ai/agent.service.js";
import { ConversationService } from "../../../src/context/conversation.service.js";
import { ToolLoop } from "../../../src/ai/tool-loop.js";
import { ModelProvider } from "../../../src/ai/model.provider.js";
import { sessionRepository } from "../../../src/persistence/repositories/session.repository.js";
import { messageRepository } from "../../../src/persistence/repositories/message.repository.js";
import { stateRepository } from "../../../src/persistence/repositories/state.repository.js";
import { traceRepository } from "../../../src/persistence/repositories/trace.repository.js";
import type { ActorContext } from "../../../src/auth/actor-context.js";
import type { ToolExecutionContext } from "../../../src/tools/tool.types.js";
import {
  MOCK_EVENTS,
  MOCK_WORKERS,
} from "../../../src/dev/mock-data.js";

describe("Dev Chat CLI & Mock Logic", () => {
  const devActor: ActorContext = {
    userId: "00000000-0000-4000-8000-000000000001",
    role: "ADMIN",
    accountStatus: "ACTIVE",
    displayName: "Local Test Admin",
    workerNumber: 999,
    accessToken: "dev-cli-mock-jwt",
    requestId: "test-req-1",
  };

  beforeEach(async () => {
    await sessionRepository.clear();
    await messageRepository.clear();
    await stateRepository.clear();
    await traceRepository.clear();
  });

  describe("Environment & Initialization", () => {
    it("CLI dependencies can initialize without Supabase and without DATABASE_URL", () => {
      const config = parseConfig({
        DEV_CLI_MODE: "true",
        GROQ_API_KEY: "test-groq-key",
      });

      expect(config.DEV_CLI_MODE).toBe(true);
      expect(config.CHAT_PERSISTENCE_MODE).toBe("memory");
      expect(config.GROQ_API_KEY).toBe("test-groq-key");
      expect(config.GROQ_MODEL).toBe("openai/gpt-oss-120b");
      expect(config.DATABASE_URL).toBeUndefined();
    });

    it("production / server mode requires Supabase credentials", () => {
      expect(() =>
        parseConfig({
          DEV_CLI_MODE: "false",
        }),
      ).toThrowError(/SUPABASE_URL/);

      expect(() =>
        parseConfig({
          SUPABASE_URL: "https://test.supabase.co",
          DEV_CLI_MODE: "false",
        }),
      ).toThrowError(/Either SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY must be provided/);
    });
  });

  describe("Mock Gateway Read Capabilities", () => {
    const gateway = new MockOslavaGateway();

    it("mock gateway supports getAdminDashboard", async () => {
      const dashboard = await gateway.getAdminDashboard();
      expect(dashboard).toBeDefined();
      expect(dashboard.today_event_count).toBeGreaterThanOrEqual(0);
      expect(dashboard.published_count).toBeGreaterThanOrEqual(0);
      expect(dashboard.required_today_count).toBeGreaterThanOrEqual(0);
    });

    it("mock gateway supports getAdminEvents with required sample events", async () => {
      const events = await gateway.getAdminEvents();
      expect(events.length).toBeGreaterThanOrEqual(5);

      const titles = events.map((e) => e.title);
      expect(titles).toContain("Taj Palace Wedding");
      expect(titles).toContain("Hyatt Wedding");
      expect(titles).toContain("Corporate Meetup");
      expect(titles).toContain("Royal Garden Reception");
      expect(titles).toContain("Tech Conference");
    });

    it("mock gateway supports getAdminEventDetail", async () => {
      const target = MOCK_EVENTS[0];
      const detail = await gateway.getAdminEventDetail(target.id);
      expect(detail.id).toBe(target.id);
      expect(detail.title).toBe(target.title);

      await expect(
        gateway.getAdminEventDetail("00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow();
    });

    it("mock gateway supports searchWorkers with filtering", async () => {
      const allWorkers = await gateway.searchWorkers({});
      expect(allWorkers.length).toBe(4);

      // Query by name "Arif"
      const arifs = await gateway.searchWorkers({ query: "Arif" });
      expect(arifs.length).toBe(2);
      expect(arifs.map((w) => w.full_name)).toEqual(["Arif Khan", "Arif Ahmed"]);

      // Filter by category "F"
      const catF = await gateway.searchWorkers({ category: "F" });
      expect(catF.length).toBe(1);
      expect(catF[0].full_name).toBe("Rahul Sharma");

      // Filter by status "SUSPENDED"
      const suspended = await gateway.searchWorkers({ account_status: "SUSPENDED" });
      expect(suspended.length).toBe(1);
      expect(suspended[0].full_name).toBe("Aman Verma");
    });

    it("mock gateway supports getWorkerDetail", async () => {
      const workerId = MOCK_WORKERS[0].worker_id;
      const detail = await gateway.getWorkerDetail(workerId);
      expect(detail.worker_id).toBe(workerId);
      expect(detail.full_name).toBe("Arif Khan");
      expect(detail.category).toBe("C");
      expect(detail.reliability_score).toBe(88);
    });

    it("mock gateway supports getWorkerHistory", async () => {
      const workerId = MOCK_WORKERS[0].worker_id;
      const history = await gateway.getWorkerHistory(workerId);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].action).toBeDefined();
    });

    it("mock gateway supports getEventReportSummary, staffing, and audit", async () => {
      const eventId = MOCK_EVENTS[0].id;
      const summary = await gateway.getEventReportSummary(eventId);
      expect(summary.event_id).toBe(eventId);
      expect(summary.total_worker_pay_display).toBeGreaterThan(0);

      const staffing = await gateway.getEventStaffingReport(eventId);
      expect(staffing).toBeInstanceOf(Array);

      const audit = await gateway.getEventAuditHistory({ eventId });
      expect(audit).toBeInstanceOf(Array);
    });
  });

  describe("Real ToolRegistry with Mock Gateway", () => {
    const gateway = new MockOslavaGateway();
    const registry = new ToolRegistry();
    const execContext: ToolExecutionContext = {
      gateway,
      actor: devActor,
      requestId: "test-tool-req",
    };

    it("executes get_dashboard successfully", async () => {
      const tool = registry.getTool("get_dashboard")!;
      expect(tool).toBeDefined();
      const res = await tool.execute(execContext, {});
      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty("today_event_count");
    });

    it("executes search_events successfully", async () => {
      const tool = registry.getTool("search_events")!;
      expect(tool).toBeDefined();
      const res = await tool.execute(execContext, { query: "Wedding" });
      expect(res.success).toBe(true);
      expect(res.data.length).toBeGreaterThan(0);
    });

    it("executes get_event_details successfully", async () => {
      const tool = registry.getTool("get_event_details")!;
      expect(tool).toBeDefined();
      const res = await tool.execute(execContext, { event_id: MOCK_EVENTS[0].id });
      expect(res.success).toBe(true);
      expect(res.data.id).toBe(MOCK_EVENTS[0].id);
    });

    it("executes search_workers successfully", async () => {
      const tool = registry.getTool("search_workers")!;
      expect(tool).toBeDefined();
      const res = await tool.execute(execContext, { query: "Arif" });
      expect(res.success).toBe(true);
      expect(res.data.length).toBe(2);
    });

    it("executes get_worker_details successfully", async () => {
      const tool = registry.getTool("get_worker_details")!;
      expect(tool).toBeDefined();
      const res = await tool.execute(execContext, {
        worker_id: MOCK_WORKERS[1].worker_id,
      });
      expect(res.success).toBe(true);
      expect(res.data.full_name).toBe("Arif Ahmed");
    });

    it("executes get_worker_history successfully", async () => {
      const tool = registry.getTool("get_worker_history")!;
      expect(tool).toBeDefined();
      const res = await tool.execute(execContext, {
        worker_id: MOCK_WORKERS[1].worker_id,
      });
      expect(res.success).toBe(true);
      expect(res.data).toBeInstanceOf(Array);
    });

    it("executes get_event_report successfully", async () => {
      const tool = registry.getTool("get_event_report")!;
      expect(tool).toBeDefined();
      const res = await tool.execute(execContext, {
        event_id: MOCK_EVENTS[0].id,
        section: "summary",
      });
      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty("summary");
    });
  });

  describe("Write Protection & Write Intents", () => {
    it("unsupported write mutations remain strictly absent from ToolRegistry", () => {
      const registry = new ToolRegistry();
      expect(registry.getTool("promote_worker")).toBeUndefined();
      expect(registry.getTool("delete_event")).toBeUndefined();
      expect(registry.getTool("cancel_event")).toBeUndefined();
      expect(registry.getTool("create_event")).toBeUndefined();
    });

    it("registers exactly 7 read tools and 4 write intent tools", () => {
      const registry = new ToolRegistry();
      const defs = registry.getToolDefinitions();
      expect(defs).toHaveLength(11);
      const names = defs.map((d) => d.function.name);
      expect(names).toEqual([
        "get_dashboard",
        "search_events",
        "get_event_details",
        "search_workers",
        "get_worker_details",
        "get_worker_history",
        "get_event_report",
        "change_worker_category",
        "publish_event",
        "complete_event",
        "close_event",
      ]);
    });
  });

  describe("Multi-Turn Context & Reset", () => {
    const gateway = new MockOslavaGateway();

    beforeAll(() => {
      setCachedConfig(
        parseConfig({
          DEV_CLI_MODE: "true",
          GROQ_API_KEY: "test-groq-key",
        }),
      );
    });

    it("context survives multiple turns and updates entity context", async () => {
      const convService = new ConversationService(
        sessionRepository,
        messageRepository,
        stateRepository,
        traceRepository,
      );

      const session = await convService.createSession(devActor.userId);

      // Simulated turn 1: model executes search_workers
      let callCount = 0;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            return {
              content: null,
              toolCalls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "search_workers",
                    arguments: JSON.stringify({ query: "Arif" }),
                  },
                },
              ],
              model: "openai/gpt-oss-120b",
            };
          }
          if (callCount === 2) {
            return {
              content: "I found two workers: 1. Arif Khan, 2. Arif Ahmed. Which one would you like?",
              toolCalls: [],
              model: "openai/gpt-oss-120b",
            };
          }
          if (callCount === 3) {
            // Turn 2 tool call
            return {
              content: null,
              toolCalls: [
                {
                  id: "call_2",
                  type: "function",
                  function: {
                    name: "get_worker_details",
                    arguments: JSON.stringify({ worker_id: MOCK_WORKERS[1].worker_id }),
                  },
                },
              ],
              model: "openai/gpt-oss-120b",
            };
          }
          return {
            content: "Arif Ahmed is Category B with a reliability score of 94.",
            toolCalls: [],
            model: "openai/gpt-oss-120b",
          };
        }),
      };

      const agentService = new AgentService(
        mockModel,
        convService,
        new ToolLoop(5, new ToolRegistry()),
      );

      // Turn 1
      const turn1 = await agentService.executeUserTurn({
        sessionId: session.id,
        userPrompt: "find Arif",
        requestId: "turn-1-req",
        gateway,
        actor: devActor,
      });

      expect(turn1.state?.recentWorkerResults).toHaveLength(2);
      expect(turn1.state?.recentWorkerResults[0].fullName).toBe("Arif Khan");
      expect(turn1.state?.recentWorkerResults[1].fullName).toBe("Arif Ahmed");

      // Turn 2: refer to "second one"
      const turn2 = await agentService.executeUserTurn({
        sessionId: session.id,
        userPrompt: "second one",
        requestId: "turn-2-req",
        gateway,
        actor: devActor,
      });

      expect(turn2.state?.currentWorkerId).toBe(MOCK_WORKERS[1].worker_id);
      expect(turn2.state?.currentWorkerLabel).toBe("Arif Ahmed");
      expect(turn2.response.content).toContain("Arif Ahmed");
    });

    it("reset clears session and provides fresh state", async () => {
      const convService = new ConversationService(
        sessionRepository,
        messageRepository,
        stateRepository,
        traceRepository,
      );

      const session1 = await convService.createSession(devActor.userId);
      await convService.saveState({
        sessionId: session1.id,
        currentEventId: "event-1",
        currentEventLabel: "Test Event",
        currentWorkerId: "worker-1",
        currentWorkerLabel: "Test Worker",
        recentEventResults: [],
        recentWorkerResults: [],
      });

      const state1 = await convService.getState(session1.id);
      expect(state1?.currentWorkerLabel).toBe("Test Worker");

      // Simulate /reset -> creates session2
      const session2 = await convService.createSession(devActor.userId);
      const state2 = await convService.getState(session2.id);
      expect(state2).toBeNull();
    });
  });
});
