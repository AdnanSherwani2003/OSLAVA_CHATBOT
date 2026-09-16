import { describe, it, expect, beforeEach } from "vitest";
import { MockOslavaGateway } from "../../src/dev/mock-oslava.gateway.js";
import { actionRepository } from "../../src/persistence/repositories/action.repository.js";
import { sessionRepository } from "../../src/persistence/repositories/session.repository.js";
import { messageRepository } from "../../src/persistence/repositories/message.repository.js";
import { stateRepository } from "../../src/persistence/repositories/state.repository.js";
import { traceRepository } from "../../src/persistence/repositories/trace.repository.js";
import { ConversationService } from "../../src/context/conversation.service.js";
import { ActionExecutionService } from "../../src/actions/action-execution.service.js";
import { ActionConfirmationService } from "../../src/actions/action-confirmation.service.js";
import { AgentService } from "../../src/ai/agent.service.js";
import { ToolLoop } from "../../src/ai/tool-loop.js";
import { ActorContext } from "../../src/auth/actor-context.js";
import {
  ModelCompletionOptions,
  ModelCompletionResponse,
  ModelProvider,
} from "../../src/ai/model.provider.js";

describe("E2E Acceptance: 13-Step Full Lifecycle Mock Acceptance Scenario", () => {
  let mockGateway: MockOslavaGateway;
  let convService: ConversationService;
  let confirmationService: ActionConfirmationService;
  let agentService: AgentService;
  let actor: ActorContext;

  beforeEach(async () => {
    mockGateway = new MockOslavaGateway();

    convService = new ConversationService(
      sessionRepository,
      messageRepository,
      stateRepository,
      traceRepository,
    );
    const executionService = new ActionExecutionService();
    confirmationService = new ActionConfirmationService(
      actionRepository,
      executionService,
      convService,
    );

    // Deterministic mock model simulating intelligent natural language tool calling
    const deterministicModel: ModelProvider = {
      async chat(options: ModelCompletionOptions): Promise<ModelCompletionResponse> {
        const lastMsg = options.messages[options.messages.length - 1];
        const userMsgs = options.messages.filter((m) => m.role === "user");
        const prompt = userMsgs[userMsgs.length - 1]?.content || "";

        // If last message was a tool result or final synthesis was requested, generate assistant summary
        if (lastMsg.role === "tool" || options.toolChoice === "none") {
          const lastToolMsg = [...options.messages].reverse().find((m) => m.role === "tool");
          const toolName = lastToolMsg?.name || "";
          const header = toolName.includes("history")
            ? "Worker History"
            : toolName.includes("details")
            ? "Details"
            : "Results";
          return {
            content: `Handled ${toolName}. ${header}: ${lastToolMsg?.content?.slice(0, 100) || "Success"}...`,
            toolCalls: [],
            model: "openai/gpt-oss-120b",
          };
        }

        const lower = prompt.toLowerCase();

        // 1. Search worker
        if (lower.includes("find arif")) {
          return {
            content: null,
            toolCalls: [
              {
                id: "tc_sw",
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

        // 2. Resolve second worker
        if (lower.includes("second") || lower.includes("2nd")) {
          const state = await convService.getState(options.messages[0].content || "");
          const target = state?.recentWorkerResults?.[1];
          return {
            content: null,
            toolCalls: [
              {
                id: "tc_gwd",
                type: "function",
                function: {
                  name: "get_worker_details",
                  arguments: JSON.stringify({
                    worker_id: target?.id || "22222222-2222-4222-8222-222222222222",
                  }),
                },
              },
            ],
            model: "openai/gpt-oss-120b",
          };
        }

        // 3. Show his history
        if (lower.includes("history")) {
          return {
            content: null,
            toolCalls: [
              {
                id: "tc_gwh",
                type: "function",
                function: {
                  name: "get_worker_history",
                  arguments: JSON.stringify({
                    worker_id: "22222222-2222-4222-8222-222222222222",
                  }),
                },
              },
            ],
            model: "openai/gpt-oss-120b",
          };
        }

        // 4. Propose category promotion
        if (lower.includes("promote him to a")) {
          return {
            content: null,
            toolCalls: [
              {
                id: "tc_cwc",
                type: "function",
                function: {
                  name: "change_worker_category",
                  arguments: JSON.stringify({
                    worker_id: "22222222-2222-4222-8222-222222222222",
                    new_category: "A",
                    reason: "Demonstrated exemplary service and 100% attendance",
                  }),
                },
              },
            ],
            model: "openai/gpt-oss-120b",
          };
        }

        // 5. Search draft events
        if (lower.includes("draft events")) {
          return {
            content: null,
            toolCalls: [
              {
                id: "tc_se",
                type: "function",
                function: {
                  name: "search_events",
                  arguments: JSON.stringify({ event_status: "DRAFT" }),
                },
              },
            ],
            model: "openai/gpt-oss-120b",
          };
        }

        // 6. Open draft event
        if (lower.includes("open the first draft event") || lower.includes("open the draft")) {
          return {
            content: null,
            toolCalls: [
              {
                id: "tc_ged",
                type: "function",
                function: {
                  name: "get_event_details",
                  arguments: JSON.stringify({
                    event_id: "eeee5555-5555-4eee-8eee-555555555555",
                  }),
                },
              },
            ],
            model: "openai/gpt-oss-120b",
          };
        }

        // 7. Propose publish
        if (lower.includes("publish this event")) {
          return {
            content: null,
            toolCalls: [
              {
                id: "tc_pe",
                type: "function",
                function: {
                  name: "publish_event",
                  arguments: JSON.stringify({
                    event_id: "eeee5555-5555-4eee-8eee-555555555555",
                    reason: "Staffing confirmed and finalized",
                  }),
                },
              },
            ],
            model: "openai/gpt-oss-120b",
          };
        }

        return {
          content: "I understand.",
          toolCalls: [],
          model: "openai/gpt-oss-120b",
        };
      },
    };

    const loop = new ToolLoop(5);
    agentService = new AgentService(
      deterministicModel,
      convService,
      loop,
      confirmationService,
    );

    actor = {
      userId: "usr_superadmin_001",
      role: "SUPER_ADMIN",
      accountStatus: "ACTIVE",
      email: "superadmin@oslava.test",
    };
  });

  it("successfully completes all 13 steps of the acceptance specification", async () => {
    // -------------------------------------------------------------
    // STEP 1: Create session
    // -------------------------------------------------------------
    const session = await convService.createSession(actor.userId);
    expect(session.id).toBeDefined();
    expect(session.userId).toBe(actor.userId);

    // -------------------------------------------------------------
    // STEP 2: Search worker
    // -------------------------------------------------------------
    const turn1 = await agentService.executeUserTurn({
      sessionId: session.id,
      userPrompt: "Find Arif",
      requestId: "req_step_2",
      gateway: mockGateway as any,
      actor,
    });
    expect(turn1.state?.recentWorkerResults.length).toBeGreaterThanOrEqual(2);

    // -------------------------------------------------------------
    // STEP 3: Resolve second worker
    // -------------------------------------------------------------
    const secondWorker = turn1.state?.recentWorkerResults[1];
    expect(secondWorker?.fullName).toContain("Arif");
    expect(secondWorker?.category).toBe("B");

    const turn2 = await agentService.executeUserTurn({
      sessionId: session.id,
      userPrompt: "Select the second one",
      requestId: "req_step_3",
      gateway: mockGateway as any,
      actor,
    });
    expect(turn2.state?.currentWorkerId).toBe("22222222-2222-4222-8222-222222222222");

    // -------------------------------------------------------------
    // STEP 4: Show worker history
    // -------------------------------------------------------------
    const turn3 = await agentService.executeUserTurn({
      sessionId: session.id,
      userPrompt: "Show his history",
      requestId: "req_step_4",
      gateway: mockGateway as any,
      actor,
    });
    expect(turn3.response.type).toBe("message");

    // -------------------------------------------------------------
    // STEP 5: Propose category change (B -> A)
    // -------------------------------------------------------------
    const turn4 = await agentService.executeUserTurn({
      sessionId: session.id,
      userPrompt: "Promote him to A because he demonstrated exemplary service",
      requestId: "req_step_5",
      gateway: mockGateway as any,
      actor,
    });

    expect(turn4.response.type).toBe("confirmation_required");
    const workerConfirmation = turn4.response as any;
    expect(workerConfirmation.action.id).toBeDefined();
    expect(workerConfirmation.action.type).toBe("change_worker_category");

    // -------------------------------------------------------------
    // STEP 6: Verify NO mutation occurred yet
    // -------------------------------------------------------------
    const workerBeforeConfirm = await mockGateway.getWorkerDetail(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(workerBeforeConfirm.category).toBe("B"); // Strictly unchanged!

    // -------------------------------------------------------------
    // STEP 7: Confirm mutation via ActionConfirmationService
    // -------------------------------------------------------------
    const confirmWorkerResult = await confirmationService.confirmAction({
      actionId: workerConfirmation.action.id,
      userId: actor.userId,
      gateway: mockGateway as any,
      requestId: "req_step_7",
    });
    expect(confirmWorkerResult.status).toBe("SUCCEEDED");

    // -------------------------------------------------------------
    // STEP 8: Verify mutation succeeded (Category is now A)
    // -------------------------------------------------------------
    const workerAfterConfirm = await mockGateway.getWorkerDetail(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(workerAfterConfirm.category).toBe("A");

    // -------------------------------------------------------------
    // STEP 9: Search draft events
    // -------------------------------------------------------------
    const turn5 = await agentService.executeUserTurn({
      sessionId: session.id,
      userPrompt: "Search draft events",
      requestId: "req_step_9",
      gateway: mockGateway as any,
      actor,
    });
    expect(turn5.state?.recentEventResults).toBeDefined();
    expect(turn5.state?.recentEventResults.some((e) => e.status === "DRAFT")).toBe(true);

    // -------------------------------------------------------------
    // STEP 10: Open draft event
    // -------------------------------------------------------------
    const turn6 = await agentService.executeUserTurn({
      sessionId: session.id,
      userPrompt: "Open the first draft event",
      requestId: "req_step_10",
      gateway: mockGateway as any,
      actor,
    });
    expect(turn6.state?.currentEventId).toBe("eeee5555-5555-4eee-8eee-555555555555");

    // -------------------------------------------------------------
    // STEP 11: Propose publish
    // -------------------------------------------------------------
    const turn7 = await agentService.executeUserTurn({
      sessionId: session.id,
      userPrompt: "Publish this event because staffing is confirmed",
      requestId: "req_step_11",
      gateway: mockGateway as any,
      actor,
    });
    expect(turn7.response.type).toBe("confirmation_required");
    const publishConfirmation = turn7.response as any;
    expect(publishConfirmation.action.type).toBe("publish_event");

    // -------------------------------------------------------------
    // STEP 12: Cancel publish action
    // -------------------------------------------------------------
    const cancelResult = await confirmationService.cancelAction({
      actionId: publishConfirmation.action.id,
      userId: actor.userId,
      reason: "Scheduling details need revision",
    });
    expect(cancelResult.status).toBe("CANCELLED");

    // -------------------------------------------------------------
    // STEP 13: Verify event is STILL DRAFT
    // -------------------------------------------------------------
    const eventAfterCancel = await mockGateway.getAdminEventDetail(
      "eeee5555-5555-4eee-8eee-555555555555",
    );
    expect(eventAfterCancel.event_status).toBe("DRAFT");
    expect(eventAfterCancel.version).toBe(1); // Version unchanged
  });
});
