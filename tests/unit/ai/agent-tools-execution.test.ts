import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { AgentService } from "../../../src/ai/agent.service.js";
import { ToolLoop } from "../../../src/ai/tool-loop.js";
import { ModelCompletionOptions, ModelProvider } from "../../../src/ai/model.provider.js";
import { ActorContext } from "../../../src/auth/actor-context.js";
import { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import { parseConfig, setCachedConfig } from "../../../src/config/env.js";
import { ConversationService } from "../../../src/context/conversation.service.js";

describe("Agent Tool Calling & Execution", () => {
  const mockActor: ActorContext = {
    userId: "11111111-1111-1111-1111-111111111111",
    role: "ADMIN",
    accountStatus: "ACTIVE",
    displayName: "Admin Alice",
    accessToken: "jwt.mock",
    requestId: "req-1",
  };

  let mockGateway: OslavaGateway;

  beforeAll(() => {
    setCachedConfig(
      parseConfig({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
        CHAT_PERSISTENCE_MODE: "memory",
      }),
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGateway = {
      getAdminDashboard: vi.fn(),
      getAdminEvents: vi.fn(),
      getAdminEventDetail: vi.fn(),
      searchWorkers: vi.fn(),
      getWorkerDetail: vi.fn(),
      getWorkerHistory: vi.fn(),
      getEventReportSummary: vi.fn(),
      getEventStaffingReport: vi.fn(),
      getEventAuditHistoryFiltered: vi.fn(),
    } as unknown as OslavaGateway;
  });

  // 1. Tool selection
  describe("Tool Selection", () => {
    it("selects get_dashboard for overview requests", async () => {
      (mockGateway.getAdminDashboard as any).mockResolvedValue({
        today_event_count: 5,
        vacant_today_count: 3,
      });

      let calledToolName = "";
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
          if (opts.toolChoice !== "none" && !calledToolName) {
            calledToolName = "get_dashboard";
            return {
              content: null,
              toolCalls: [
                {
                  id: "c-1",
                  type: "function",
                  function: { name: "get_dashboard", arguments: "{}" },
                },
              ],
              model: "openai/gpt-oss-120b",
            };
          }
          return {
            content: "There are 5 events today with 3 vacant spots.",
            toolCalls: [],
            model: "openai/gpt-oss-120b",
          };
        }),
      };

      const agent = new AgentService(mockModel, new ConversationService(), new ToolLoop(5));
      const res = await agent.executeRequest({
        prompt: "Show me today's dashboard overview",
        gateway: mockGateway,
        actor: mockActor,
      });

      expect(mockGateway.getAdminDashboard).toHaveBeenCalled();
      expect(res.content).toContain("5 events today");
      expect(res.toolCallCount).toBe(1);
    });

    it("selects search_events for event queries", async () => {
      (mockGateway.getAdminEvents as any).mockResolvedValue([
        {
          id: "22222222-2222-2222-2222-222222222222",
          title: "Winter Festival",
          event_type: "FESTIVAL",
          venue_name: "Grand Arena",
          event_date: "2026-12-01",
          event_status: "PUBLISHED",
          recruitment_status: "OPEN",
        },
      ]);

      let called = false;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
          if (opts.toolChoice !== "none" && !called) {
            called = true;
            return {
              content: null,
              toolCalls: [
                {
                  id: "c-2",
                  type: "function",
                  function: {
                    name: "search_events",
                    arguments: JSON.stringify({ query: "Winter" }),
                  },
                },
              ],
              model: "openai/gpt-oss-120b",
            };
          }
          return {
            content: "I found Winter Festival on 2026-12-01.",
            toolCalls: [],
            model: "openai/gpt-oss-120b",
          };
        }),
      };

      const agent = new AgentService(mockModel, new ConversationService(), new ToolLoop(5));
      const res = await agent.executeRequest({
        prompt: "Find winter events",
        gateway: mockGateway,
        actor: mockActor,
      });

      expect(mockGateway.getAdminEvents).toHaveBeenCalled();
      expect(res.content).toContain("Winter Festival");
    });

    it("selects search_workers for staff search", async () => {
      (mockGateway.searchWorkers as any).mockResolvedValue([
        {
          worker_id: "33333333-3333-3333-3333-333333333333",
          full_name: "John Doe",
          account_status: "ACTIVE",
          category: "A",
        },
      ]);

      let called = false;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
          if (opts.toolChoice !== "none" && !called) {
            called = true;
            return {
              content: null,
              toolCalls: [
                {
                  id: "c-3",
                  type: "function",
                  function: {
                    name: "search_workers",
                    arguments: JSON.stringify({ query: "John" }),
                  },
                },
              ],
              model: "openai/gpt-oss-120b",
            };
          }
          return {
            content: "Found worker John Doe (Category A).",
            toolCalls: [],
            model: "openai/gpt-oss-120b",
          };
        }),
      };

      const agent = new AgentService(mockModel, new ConversationService(), new ToolLoop(5));
      const res = await agent.executeRequest({
        prompt: "Search for John",
        gateway: mockGateway,
        actor: mockActor,
      });

      expect(mockGateway.searchWorkers).toHaveBeenCalledWith(
        expect.objectContaining({ query: "John" }),
      );
      expect(res.content).toContain("John Doe");
    });
  });

  // 2. Argument generation & execution
  describe("Argument Generation & Successful Execution", () => {
    it("passes grounded event_id to get_event_details and receives details", async () => {
      const eventId = "44444444-4444-4444-4444-444444444444";
      (mockGateway.getAdminEventDetail as any).mockResolvedValue({
        id: eventId,
        title: "Spring Conference",
        event_date: "2026-04-15",
        required_worker_count: 20,
        event_status: "PUBLISHED",
      });

      let called = false;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
          if (opts.toolChoice !== "none" && !called) {
            called = true;
            return {
              content: null,
              toolCalls: [
                {
                  id: "c-4",
                  type: "function",
                  function: {
                    name: "get_event_details",
                    arguments: JSON.stringify({ event_id: eventId }),
                  },
                },
              ],
              model: "openai/gpt-oss-120b",
            };
          }
          return {
            content: "Spring Conference requires 20 workers.",
            toolCalls: [],
            model: "openai/gpt-oss-120b",
          };
        }),
      };

      const agent = new AgentService(mockModel, new ConversationService(), new ToolLoop(5));
      const res = await agent.executeRequest({
        prompt: `Show details for event ${eventId}`,
        gateway: mockGateway,
        actor: mockActor,
      });

      expect(mockGateway.getAdminEventDetail).toHaveBeenCalledWith(eventId);
      expect(res.content).toContain("20 workers");
    });

    it("passes grounded worker_id to get_worker_history", async () => {
      const workerId = "55555555-5555-5555-5555-555555555555";
      (mockGateway.getWorkerHistory as any).mockResolvedValue([
        {
          history_type: "ROLE_CHANGE",
          action: "PROMOTED",
          old_value: "WORKER",
          new_value: "SUPERVISOR",
          created_at: "2026-01-01T00:00:00Z",
        },
      ]);

      let called = false;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
          if (opts.toolChoice !== "none" && !called) {
            called = true;
            return {
              content: null,
              toolCalls: [
                {
                  id: "c-5",
                  type: "function",
                  function: {
                    name: "get_worker_history",
                    arguments: JSON.stringify({ worker_id: workerId }),
                  },
                },
              ],
              model: "openai/gpt-oss-120b",
            };
          }
          return {
            content: "The worker was promoted to SUPERVISOR on Jan 1.",
            toolCalls: [],
            model: "openai/gpt-oss-120b",
          };
        }),
      };

      const agent = new AgentService(mockModel, new ConversationService(), new ToolLoop(5));
      const res = await agent.executeRequest({
        prompt: `Check history for worker ${workerId}`,
        gateway: mockGateway,
        actor: mockActor,
      });

      expect(mockGateway.getWorkerHistory).toHaveBeenCalledWith(workerId);
      expect(res.content).toContain("promoted to SUPERVISOR");
    });
  });

  // 3. Invalid arguments
  describe("Invalid Arguments Handling", () => {
    it("handles invalid tool arguments gracefully without crashing", async () => {
      let called = false;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
          if (opts.toolChoice !== "none" && !called) {
            called = true;
            return {
              content: null,
              toolCalls: [
                {
                  id: "c-bad-args",
                  type: "function",
                  function: {
                    name: "search_events",
                    // Invalid start_date > end_date
                    arguments: JSON.stringify({
                      start_date: "2026-12-31",
                      end_date: "2026-01-01",
                    }),
                  },
                },
              ],
              model: "openai/gpt-oss-120b",
            };
          }
          return {
            content: "The date range provided was invalid. Please specify a valid start and end date.",
            toolCalls: [],
            model: "openai/gpt-oss-120b",
          };
        }),
      };

      const agent = new AgentService(mockModel, new ConversationService(), new ToolLoop(5));
      const res = await agent.executeRequest({
        prompt: "Find events with end before start",
        gateway: mockGateway,
        actor: mockActor,
      });

      expect(res.content).toContain("date range provided was invalid");
    });
  });

  // 4. Unknown / unsupported requests & write actions
  describe("Unknown / Unsupported Requests & Write Prevention", () => {
    it("intercepts mutation tools and informs model that writes are unsupported", async () => {
      let called = false;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
          if (opts.toolChoice !== "none" && !called) {
            called = true;
            return {
              content: null,
              toolCalls: [
                {
                  id: "c-write",
                  type: "function",
                  function: {
                    name: "publish_event",
                    arguments: JSON.stringify({ event_id: "66666666-6666-6666-6666-666666666666" }),
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

      const agent = new AgentService(mockModel, new ConversationService(), new ToolLoop(5));
      const res = await agent.executeRequest({
        prompt: "Publish event 66666666-6666-6666-6666-666666666666",
        gateway: mockGateway,
        actor: mockActor,
      });

      expect(res.content).toContain("That action isn't available through the chatbot yet.");
    });

    it("rejects unknown tool requests", async () => {
      let called = false;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
          if (opts.toolChoice !== "none" && !called) {
            called = true;
            return {
              content: null,
              toolCalls: [
                {
                  id: "c-unknown",
                  type: "function",
                  function: {
                    name: "execute_sql_query",
                    arguments: JSON.stringify({ query: "SELECT 1" }),
                  },
                },
              ],
              model: "openai/gpt-oss-120b",
            };
          }
          return {
            content: "I do not have access to execute custom queries.",
            toolCalls: [],
            model: "openai/gpt-oss-120b",
          };
        }),
      };

      const agent = new AgentService(mockModel, new ConversationService(), new ToolLoop(5));
      const res = await agent.executeRequest({
        prompt: "Run SQL query",
        gateway: mockGateway,
        actor: mockActor,
      });

      expect(res.content).toContain("I do not have access");
    });
  });

  // 5. Tool failures
  describe("Tool Failures Handling", () => {
    it("handles gateway error gracefully and allows model to report issue", async () => {
      (mockGateway.getAdminDashboard as any).mockRejectedValue(
        new Error("Database connection dropped"),
      );

      let called = false;
      const mockModel: ModelProvider = {
        chat: vi.fn().mockImplementation(async (opts: ModelCompletionOptions) => {
          if (opts.toolChoice !== "none" && !called) {
            called = true;
            return {
              content: null,
              toolCalls: [
                {
                  id: "c-fail",
                  type: "function",
                  function: { name: "get_dashboard", arguments: "{}" },
                },
              ],
              model: "openai/gpt-oss-120b",
            };
          }
          return {
            content: "I'm sorry, I encountered a temporary issue connecting to the database. Please try again shortly.",
            toolCalls: [],
            model: "openai/gpt-oss-120b",
          };
        }),
      };

      const agent = new AgentService(mockModel, new ConversationService(), new ToolLoop(5));
      const res = await agent.executeRequest({
        prompt: "Show dashboard overview",
        gateway: mockGateway,
        actor: mockActor,
      });

      expect(res.content).toContain("encountered a temporary issue");
    });
  });
});
