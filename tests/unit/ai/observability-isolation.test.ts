import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentService } from "../../../src/ai/agent.service.js";
import { ConversationService } from "../../../src/context/conversation.service.js";
import { ToolLoop } from "../../../src/ai/tool-loop.js";
import { ModelProvider } from "../../../src/ai/model.provider.js";
import { ActorContext } from "../../../src/auth/actor-context.js";
import { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import { sessionRepository } from "../../../src/persistence/repositories/session.repository.js";
import { messageRepository } from "../../../src/persistence/repositories/message.repository.js";
import { stateRepository } from "../../../src/persistence/repositories/state.repository.js";
import { traceRepository } from "../../../src/persistence/repositories/trace.repository.js";
import { ModelUnavailableError } from "../../../src/domain/errors.js";
import { parseConfig, setCachedConfig } from "../../../src/config/env.js";

describe("Observability Isolation (Part V)", () => {
  const mockActor: ActorContext = {
    userId: "11111111-1111-1111-1111-111111111111",
    role: "ADMIN",
    accountStatus: "ACTIVE",
    displayName: "Admin Alice",
    accessToken: "jwt.mock",
    requestId: "req-obs-1",
  };

  const mockGateway = {} as OslavaGateway;

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
    await sessionRepository.clear();
    await messageRepository.clear();
    await stateRepository.clear();
    await traceRepository.clear();
  });

  it("successful chatbot response remains successful even when recordChatTrace throws", async () => {
    const convService = new ConversationService(
      sessionRepository,
      messageRepository,
      stateRepository,
      traceRepository,
    );

    const session = await convService.createSession(mockActor.userId);

    // Force recordChatTrace to throw a database connection error
    vi.spyOn(traceRepository, "recordChatTrace").mockRejectedValue(
      new Error("PostgreSQL connection error in telemetry pool"),
    );

    const mockModel: ModelProvider = {
      chat: vi.fn().mockResolvedValue({
        content: "Operational status is normal.",
        toolCalls: [],
        model: "gpt-4o-mini",
        provider: "openai",
      }),
    };

    const toolLoop = new ToolLoop(8);
    const agentService = new AgentService(mockModel, convService, toolLoop);

    const result = await agentService.executeUserTurn({
      sessionId: session.id,
      userPrompt: "Hi",
      requestId: "req-obs-1",
      gateway: mockGateway,
      actor: mockActor,
    });

    // Chatbot response must succeed despite tracing write failure
    expect(result.response.type).toBe("message");
    expect((result.response as any).content).toBe("Operational status is normal.");

    // Core message must still be persisted
    const messages = await convService.getMessages(session.id);
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toBe("Operational status is normal.");
  });

  it("when model fails and tracing also fails, original model error remains the returned error", async () => {
    const convService = new ConversationService(
      sessionRepository,
      messageRepository,
      stateRepository,
      traceRepository,
    );

    const session = await convService.createSession(mockActor.userId);

    // Force recordChatTrace to throw
    vi.spyOn(traceRepository, "recordChatTrace").mockRejectedValue(
      new Error("Telemetry write failure"),
    );

    // Model fails with ModelUnavailableError
    const mockModel: ModelProvider = {
      chat: vi.fn().mockRejectedValue(new ModelUnavailableError("OpenAI API 503 Outage")),
    };

    const toolLoop = new ToolLoop(8);
    const agentService = new AgentService(mockModel, convService, toolLoop);

    await expect(
      agentService.executeUserTurn({
        sessionId: session.id,
        userPrompt: "Hi",
        requestId: "req-obs-2",
        gateway: mockGateway,
        actor: mockActor,
      }),
    ).rejects.toThrow(ModelUnavailableError);
  });
});
