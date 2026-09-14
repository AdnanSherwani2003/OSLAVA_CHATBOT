import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { AgentService } from "../../../src/ai/agent.service.js";
import { ToolLoop } from "../../../src/ai/tool-loop.js";
import { ModelCompletionOptions, ModelProvider } from "../../../src/ai/model.provider.js";
import { ActorContext } from "../../../src/auth/actor-context.js";
import { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import { parseConfig, setCachedConfig } from "../../../src/config/env.js";
import { ConversationService } from "../../../src/context/conversation.service.js";
import { toolRegistry } from "../../../src/ai/tool-registry.js";
import { V1_READ_TOOLS, V1_WRITE_INTENT_TOOLS } from "../../../src/ai/v1-manifest.js";
import { buildSystemPrompt } from "../../../src/ai/prompts/system.prompt.js";
import { TOOL_POLICY_PROMPT } from "../../../src/ai/prompts/tool-policy.prompt.js";

describe("Capability Boundary & Proactive Offering Safety", () => {
  const mockActor: ActorContext = {
    userId: "11111111-1111-1111-1111-111111111111",
    role: "ADMIN",
    accountStatus: "ACTIVE",
    displayName: "Admin Coordinator",
    accessToken: "jwt.mock",
    requestId: "cap-req-1",
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

  // 1. Tool surface boundary
  describe("1. Frozen Tool Surface Enforcement", () => {
    it("exposes exactly the 7 read tools and 4 write intent tools", () => {
      const toolNames = toolRegistry.getToolDefinitions().map((t) => t.function.name);

      expect(toolNames).toHaveLength(11);
      expect(toolNames).toEqual(expect.arrayContaining([...V1_READ_TOOLS, ...V1_WRITE_INTENT_TOOLS]));
    });

    it("ensures zero unsupported tools exist in the registry", () => {
      const toolNames = toolRegistry.getToolDefinitions().map((t) => t.function.name);

      const forbiddenTools = [
        "create_event",
        "edit_event",
        "cancel_event",
        "delete_event",
        "assign_worker",
        "remove_worker",
        "assign_leader",
        "remove_leader",
        "adjust_recruitment",
        "open_recruitment",
        "close_recruitment",
        "modify_staffing",
        "register_worker",
        "approve_registration",
        "delete_data",
      ];

      for (const forbidden of forbiddenTools) {
        expect(toolNames).not.toContain(forbidden);
      }
    });
  });

  // 2. Staffing shortages & recruitment status reporting
  describe("2. Staffing Shortages & Recruitment Status Read-Only Reporting", () => {
    it("instructs model to report staffing numbers as read-only and forbids offering worker assignment", async () => {
      const systemPrompt = `${buildSystemPrompt(null)}\n\n${TOOL_POLICY_PROMPT}`;

      // Verify prompt explicitly instructs how to handle shortages
      expect(systemPrompt).toContain("Even when reporting on staffing shortages, unassigned shifts, vacancies, or recruitment statuses (OPEN, FULL, CLOSED), describe the factual data purely as read-only information.");
      expect(systemPrompt).toContain('NEVER offer to resolve the shortage, adjust recruitment, or assign workers.');
      expect(systemPrompt).toContain('NEVER say "you may assign additional workers"');
    });

    it("supports factual inspection of recruitment status (OPEN/FULL/CLOSED) without offering to adjust it", () => {
      const prompt = buildSystemPrompt(null);

      expect(prompt).toContain("You are fully permitted to read and display factual staffing numbers, confirmed workers, required worker counts, vacancies, and recruitment statuses (e.g. OPEN, FULL, CLOSED).");
      expect(prompt).toContain('NEVER say "wish to adjust recruitment" or offer to open, close, or modify recruitment.');
    });
  });

  // 3. Handling unsupported worker assignment requests
  describe("3. Unsupported Worker Assignment Requests", () => {
    it("declines worker assignment requests with standard refusal sentence", async () => {
      const refusalText = "That action isn't available through the chatbot yet. You can inspect worker profiles or view the event staffing details directly.";

      const mockModel: ModelProvider = {
        chat: vi.fn().mockResolvedValue({
          content: refusalText,
          toolCalls: [],
          model: "openai/gpt-oss-120b",
        }),
      };

      const agentService = new AgentService(
        mockModel,
        undefined,
        new ToolLoop(toolRegistry),
      );

      const result = await agentService.executeRequest({
        prompt: "Assign worker Arif Khan to today's event at VM Hall",
        gateway: mockGateway,
        actor: mockActor,
      });

      expect(result.content).toContain("That action isn't available through the chatbot yet.");
      expect(result.toolCallCount).toBe(0);
      expect(mockModel.chat).toHaveBeenCalledTimes(1);

      // Verify system prompt contained the refusal rule
      const callArgs = (mockModel.chat as any).mock.calls[0][0];
      const systemMsg = callArgs.messages.find((m: any) => m.role === "system");
      expect(systemMsg.content).toContain('That action isn\'t available through the chatbot yet.');
      expect(systemMsg.content).toContain('Assigning workers to events, shifts, or teams');
    });
  });

  // 4. Handling unsupported event creation & editing requests
  describe("4. Unsupported Event Creation & Editing Requests", () => {
    it("declines event creation requests without invoking tools", async () => {
      const refusalText = "That action isn't available through the chatbot yet. Event creation must be done through the Oslava admin console.";

      const mockModel: ModelProvider = {
        chat: vi.fn().mockResolvedValue({
          content: refusalText,
          toolCalls: [],
          model: "openai/gpt-oss-120b",
        }),
      };

      const agentService = new AgentService(
        mockModel,
        undefined,
        new ToolLoop(toolRegistry),
      );

      const result = await agentService.executeRequest({
        prompt: "Create a new catering event for tomorrow at Le Meridien Kochi",
        gateway: mockGateway,
        actor: mockActor,
      });

      expect(result.content).toContain("That action isn't available through the chatbot yet.");
      expect(result.toolCallCount).toBe(0);

      const callArgs = (mockModel.chat as any).mock.calls[0][0];
      const systemMsg = callArgs.messages.find((m: any) => m.role === "system");
      expect(systemMsg.content).toContain("Creating new events");
    });

    it("declines event editing and cancellation requests", async () => {
      const refusalText = "That action isn't available through the chatbot yet.";

      const mockModel: ModelProvider = {
        chat: vi.fn().mockResolvedValue({
          content: refusalText,
          toolCalls: [],
          model: "openai/gpt-oss-120b",
        }),
      };

      const agentService = new AgentService(
        mockModel,
        undefined,
        new ToolLoop(toolRegistry),
      );

      const result = await agentService.executeRequest({
        prompt: "Cancel the event scheduled for tonight",
        gateway: mockGateway,
        actor: mockActor,
      });

      expect(result.content).toContain("That action isn't available through the chatbot yet.");
      expect(result.toolCallCount).toBe(0);
    });
  });

  // 5. Allowed closing sentence suggestions
  describe("5. Allowed Closing Sentence Suggestions", () => {
    it("authorizes only supported read actions and supported write intents", () => {
      const prompt = buildSystemPrompt(null);

      // Permitted read suggestions:
      expect(prompt).toContain('"view staffing details"');
      expect(prompt).toContain('"view event report"');
      expect(prompt).toContain('"inspect workers"');
      expect(prompt).toContain('"inspect event details"');

      // Prohibited suggestions:
      expect(prompt).toContain('NEVER offer to resolve the shortage, adjust recruitment, or assign workers.');
      expect(prompt).toContain('In closing sentences, NEVER offer unsupported actions.');
    });
  });
});
