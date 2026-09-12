import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { sessionRepository } from "../../../src/persistence/repositories/session.repository.js";
import { messageRepository } from "../../../src/persistence/repositories/message.repository.js";
import { stateRepository } from "../../../src/persistence/repositories/state.repository.js";
import { traceRepository } from "../../../src/persistence/repositories/trace.repository.js";
import { parseConfig, setCachedConfig } from "../../../src/config/env.js";

describe("Persistence Repositories (In-Memory Fallback)", () => {
  const testUserId = "11111111-1111-1111-1111-111111111111";

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

  describe("SessionRepository", () => {
    it("creates, retrieves, and touches chat sessions", async () => {
      const session = await sessionRepository.createSession(testUserId);
      expect(session.id).toBeDefined();
      expect(session.userId).toBe(testUserId);
      expect(session.status).toBe("ACTIVE");

      const fetched = await sessionRepository.getSessionById(session.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(session.id);

      const list = await sessionRepository.listSessionsByUserId(testUserId);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(session.id);

      const prevTime = session.lastActivityAt.getTime();
      await new Promise((r) => setTimeout(r, 10));
      await sessionRepository.touchSession(session.id);
      const touched = await sessionRepository.getSessionById(session.id);
      expect(touched?.lastActivityAt.getTime()).toBeGreaterThanOrEqual(prevTime);
    });

    it("returns null for non-existent session", async () => {
      const fetched = await sessionRepository.getSessionById("22222222-2222-2222-2222-222222222222");
      expect(fetched).toBeNull();
    });
  });

  describe("MessageRepository", () => {
    it("creates, retrieves, and orders chat messages", async () => {
      const sessionId = "33333333-3333-3333-3333-333333333333";
      await messageRepository.createMessage({
        sessionId,
        requestId: "req-1",
        role: "USER",
        content: "Hello",
      });
      await messageRepository.createMessage({
        sessionId,
        requestId: "req-1",
        role: "ASSISTANT",
        content: "Hi there!",
      });

      const messages = await messageRepository.getMessagesBySessionId(sessionId);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("USER");
      expect(messages[1].role).toBe("ASSISTANT");

      const recent = await messageRepository.getRecentMessages(sessionId, 1);
      expect(recent).toHaveLength(1);
      expect(recent[0].content).toBe("Hi there!");
    });
  });

  describe("StateRepository", () => {
    it("upserts and retrieves session entity state", async () => {
      const sessionId = "44444444-4444-4444-4444-444444444444";
      const saved = await stateRepository.upsertState({
        sessionId,
        currentEventId: "event-123",
        currentEventLabel: "Gala Night",
        currentWorkerId: null,
        currentWorkerLabel: null,
        recentEventResults: [{ id: "event-123", title: "Gala Night" }],
        recentWorkerResults: [],
      });

      expect(saved.currentEventId).toBe("event-123");
      expect(saved.currentEventLabel).toBe("Gala Night");

      const fetched = await stateRepository.getStateBySessionId(sessionId);
      expect(fetched).not.toBeNull();
      expect(fetched?.currentEventId).toBe("event-123");
      expect(fetched?.recentEventResults).toHaveLength(1);
    });
  });

  describe("TraceRepository", () => {
    it("records and retrieves tool executions and chat traces", async () => {
      const sessionId = "55555555-5555-5555-5555-555555555555";
      await traceRepository.recordToolExecution({
        requestId: "req-t1",
        sessionId,
        userId: testUserId,
        toolName: "get_dashboard",
        argumentsRedacted: {},
        status: "SUCCESS",
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 15,
      });

      await traceRepository.recordChatTrace({
        requestId: "req-t1",
        sessionId,
        userId: testUserId,
        provider: "groq",
        model: "openai/gpt-oss-120b",
        toolCallCount: 1,
        inputTokens: 100,
        outputTokens: 50,
        durationMs: 400,
        outcome: "SUCCESS",
      });

      const executions = await traceRepository.getToolExecutionsBySession(sessionId);
      expect(executions).toHaveLength(1);
      expect(executions[0].toolName).toBe("get_dashboard");

      const traces = await traceRepository.getChatTracesBySession(sessionId);
      expect(traces).toHaveLength(1);
      expect(traces[0].model).toBe("openai/gpt-oss-120b");
      expect(traces[0].toolCallCount).toBe(1);
    });
  });
});
