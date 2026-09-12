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

import { parseConfig, setCachedConfig } from "../../../src/config/env.js";

describe("AgentService", () => {
  const mockActor: ActorContext = {
    userId: "11111111-1111-1111-1111-111111111111",
    role: "ADMIN",
    accountStatus: "ACTIVE",
    displayName: "Admin Alice",
    accessToken: "jwt.mock",
    requestId: "req-1",
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
    await sessionRepository.clear();
    await messageRepository.clear();
    await stateRepository.clear();
    await traceRepository.clear();
  });

  it("coordinates user turn end-to-end", async () => {
    const convService = new ConversationService(
      sessionRepository,
      messageRepository,
      stateRepository,
      traceRepository,
    );

    const session = await convService.createSession(mockActor.userId);

    const mockModel: ModelProvider = {
      chat: vi.fn().mockResolvedValue({
        content: "I checked the dashboard and all looks good.",
        toolCalls: [],
        model: "openai/gpt-oss-120b",
        usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
      }),
    };

    const toolLoop = new ToolLoop(5);
    const agentService = new AgentService(mockModel, convService, toolLoop);

    const result = await agentService.executeUserTurn({
      sessionId: session.id,
      userPrompt: "How are things today?",
      requestId: "req-1",
      gateway: mockGateway,
      actor: mockActor,
    });

    expect(result.response.type).toBe("message");
    expect((result.response as any).content).toBe("I checked the dashboard and all looks good.");
    expect(result.messageId).toBeDefined();

    // Verify messages persisted
    const messages = await convService.getMessages(session.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("USER");
    expect(messages[0].content).toBe("How are things today?");
    expect(messages[1].role).toBe("ASSISTANT");
    expect(messages[1].content).toBe("I checked the dashboard and all looks good.");

    // Verify trace recorded
    const traces = await traceRepository.getChatTracesBySession(session.id);
    expect(traces).toHaveLength(1);
    expect(traces[0].toolCallCount).toBe(0);
    expect(traces[0].inputTokens).toBe(50);
  });
});
