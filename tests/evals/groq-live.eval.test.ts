import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AgentService } from "../../src/ai/agent.service.js";
import { GroqProvider } from "../../src/ai/groq.provider.js";
import { MockOslavaGateway } from "../../src/dev/mock-oslava.gateway.js";
import { ConversationService } from "../../src/context/conversation.service.js";
import { sessionRepository } from "../../src/persistence/repositories/session.repository.js";
import { messageRepository } from "../../src/persistence/repositories/message.repository.js";
import { stateRepository } from "../../src/persistence/repositories/state.repository.js";
import { traceRepository } from "../../src/persistence/repositories/trace.repository.js";
import { ToolLoop } from "../../src/ai/tool-loop.js";
import { ActionConfirmationService } from "../../src/actions/action-confirmation.service.js";
import { actionRepository } from "../../src/persistence/repositories/action.repository.js";
import { ActionExecutionService } from "../../src/actions/action-execution.service.js";
import { ActorContext } from "../../src/auth/actor-context.js";

const shouldRun =
  process.env.RUN_LIVE_GROQ_TESTS === "true" && Boolean(process.env.GROQ_API_KEY);

describe.skipIf(!shouldRun)("Live Evals: Groq GPT-OSS 120B Natural Language Tool Selection", () => {
  let agentService: AgentService;
  let mockGateway: MockOslavaGateway;
  let convService: ConversationService;
  let actor: ActorContext;

  beforeAll(() => {
    mockGateway = new MockOslavaGateway();
    convService = new ConversationService(
      sessionRepository,
      messageRepository,
      stateRepository,
      traceRepository,
    );
    const confirmationService = new ActionConfirmationService(
      actionRepository,
      new ActionExecutionService(),
      convService,
    );
    const groq = new GroqProvider();
    const loop = new ToolLoop(5);

    agentService = new AgentService(
      groq,
      convService,
      loop,
      confirmationService,
    );

    actor = {
      userId: "00000000-0000-4000-8000-000000000001",
      role: "ADMIN",
      accountStatus: "ACTIVE",
      email: "admin@oslava.test",
    };
  });

  it("loads the deterministic v1-cases fixture dataset", () => {
    const raw = readFileSync(resolve(process.cwd(), "evals/v1-cases.json"), "utf8");
    const cases = JSON.parse(raw);
    expect(cases.length).toBeGreaterThanOrEqual(15);
  });

  it("selects get_dashboard for broad overview prompts", async () => {
    const session = await convService.createSession(actor.userId);
    const result = await agentService.executeUserTurn({
      sessionId: session.id,
      userPrompt: "What's happening today?",
      requestId: "eval_req_1",
      gateway: mockGateway as any,
      actor,
    });

    expect(result.response.type).toBe("message");
    expect(result.response.content.length).toBeGreaterThan(10);
  });

  it("selects search_workers when asked to find a worker by name", async () => {
    const session = await convService.createSession(actor.userId);
    const result = await agentService.executeUserTurn({
      sessionId: session.id,
      userPrompt: "Find Arif in field workers",
      requestId: "eval_req_2",
      gateway: mockGateway as any,
      actor,
    });

    expect(result.response.type).toBe("message");
    expect(result.state?.recentWorkerResults.length).toBeGreaterThanOrEqual(1);
  });

  it("refuses out-of-scope V2 event creation requests", async () => {
    const session = await convService.createSession(actor.userId);
    const result = await agentService.executeUserTurn({
      sessionId: session.id,
      userPrompt: "Create a new wedding event called Royal Banquet tomorrow",
      requestId: "eval_req_3",
      gateway: mockGateway as any,
      actor,
    });

    expect(result.response.type).toBe("message");
    // Should explain out of scope rather than fabricating an event or hallucinating a tool call
    const content = result.response.content.toLowerCase();
    expect(
      content.includes("cannot create") ||
        content.includes("not available") ||
        content.includes("out of scope") ||
        content.includes("chatbot"),
    ).toBe(true);
  });
});
