import { describe, it, expect, vi, beforeEach } from "vitest";
import { toolRegistry } from "../../../src/ai/tool-registry.js";
import { MockOslavaGateway } from "../../../src/dev/mock-oslava.gateway.js";
import { ChangeWorkerCategoryTool } from "../../../src/tools/writes/change-worker-category.tool.js";
import { MemoryActionRepository } from "../../../src/persistence/memory/memory-action.repository.js";
import { ActionProposalService } from "../../../src/actions/action-proposal.service.js";
import { ActionConfirmationService } from "../../../src/actions/action-confirmation.service.js";
import { ActionExecutionService } from "../../../src/actions/action-execution.service.js";
import { ConversationService } from "../../../src/context/conversation.service.js";
import { MemorySessionRepository } from "../../../src/persistence/memory/memory-session.repository.js";
import { MemoryMessageRepository } from "../../../src/persistence/memory/memory-message.repository.js";
import { MemoryStateRepository } from "../../../src/persistence/memory/memory-state.repository.js";
import { MemoryTraceRepository } from "../../../src/persistence/memory/memory-trace.repository.js";
import type { ToolExecutionContext } from "../../../src/tools/tool.types.js";

describe("Security Boundary: Write Intents & Mutation Isolation", () => {
  let actionRepo: MemoryActionRepository;
  let proposalService: ActionProposalService;
  let executionService: ActionExecutionService;
  let confirmationService: ActionConfirmationService;
  let gateway: MockOslavaGateway;

  const sessionId = "sec-session-1";
  const userId = "00000000-0000-4000-8000-000000000001";
  const arifAhmedId = "22222222-2222-4222-8222-222222222222"; // Category B

  const context: ToolExecutionContext = {
    sessionId,
    actor: {
      userId,
      role: "ADMIN",
      accountStatus: "ACTIVE",
      displayName: "Admin Tester",
      accessToken: "mock-jwt",
      requestId: "sec-req-1",
    },
    gateway: null as any,
    requestId: "sec-req-1",
  };

  beforeEach(async () => {
    actionRepo = new MemoryActionRepository();
    await actionRepo.clear();
    proposalService = new ActionProposalService(actionRepo);
    executionService = new ActionExecutionService();
    confirmationService = new ActionConfirmationService(
      actionRepo,
      executionService,
      new ConversationService(
        new MemorySessionRepository(),
        new MemoryMessageRepository(),
        new MemoryStateRepository(),
        new MemoryTraceRepository(),
      ),
    );
    gateway = new MockOslavaGateway();
    gateway.resetMockData();
    context.gateway = gateway;
  });

  it("ensures ActionExecutionService is strictly internal and never exposed as a tool", () => {
    const allTools = toolRegistry.getToolDefinitions().map((d) => d.function.name);

    expect(allTools).not.toContain("execute_action");
    expect(allTools).not.toContain("action_execution");
    expect(allTools).not.toContain("confirm_action");
    expect(allTools).not.toContain("ActionExecutionService");
  });

  it("invoking ChangeWorkerCategoryTool stages an action but DOES NOT mutate gateway data", async () => {
    const spyGatewayMutation = vi.spyOn(gateway, "changeWorkerCategory");
    const tool = new ChangeWorkerCategoryTool(proposalService);

    // Arif Ahmed is initially B
    const beforeWorker = await gateway.getWorkerDetail(arifAhmedId);
    expect(beforeWorker.category).toBe("B");

    // Execute tool call (what LLM tool loop invokes)
    const result = await tool.execute(context, {
      worker_id: arifAhmedId,
      new_category: "A",
      reason: "Excellent punctuality across all recent shifts",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confirmationRequired).toBe(true);
      expect(result.data.action.status).toBe("PENDING");
      expect(result.data.action.id).toBeDefined();
    }

    // Critical check: Gateway mutation was NOT called!
    expect(spyGatewayMutation).not.toHaveBeenCalled();

    // Data in gateway is completely unchanged!
    const afterWorker = await gateway.getWorkerDetail(arifAhmedId);
    expect(afterWorker.category).toBe("B");
  });

  it("gateway mutation only occurs after ActionConfirmationService.confirmAction is called", async () => {
    const spyGatewayMutation = vi.spyOn(gateway, "changeWorkerCategory");
    const tool = new ChangeWorkerCategoryTool(proposalService);

    const toolResult = await tool.execute(context, {
      worker_id: arifAhmedId,
      new_category: "A",
      reason: "Proven leadership in emergency staffing",
    });

    expect(spyGatewayMutation).not.toHaveBeenCalled();

    const actionId = (toolResult as any).data.action.id;

    // Now execute explicit confirmation
    await confirmationService.confirmAction({
      actionId,
      userId,
      gateway,
      requestId: "confirm-explicit-1",
    });

    // Now gateway mutation WAS called
    expect(spyGatewayMutation).toHaveBeenCalledTimes(1);

    const finalWorker = await gateway.getWorkerDetail(arifAhmedId);
    expect(finalWorker.category).toBe("A");
  });
});
