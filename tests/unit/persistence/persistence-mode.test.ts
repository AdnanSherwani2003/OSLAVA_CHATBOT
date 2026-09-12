import { describe, it, expect, beforeEach } from "vitest";
import { parseConfig } from "../../../src/config/env.js";
import { getPool } from "../../../src/persistence/database.js";
import { createPersistence } from "../../../src/persistence/persistence.factory.js";
import { InMemoryChatStore } from "../../../src/persistence/memory/in-memory-store.js";
import { runMigrations } from "../../../src/persistence/migrate.js";
import { buildApp } from "../../../src/app.js";

describe("Persistence Mode & In-Memory Persistence", () => {
  const testUserId = "11111111-1111-1111-1111-111111111111";

  it("memory mode config parses successfully without DATABASE_URL", () => {
    const config = parseConfig({
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-key",
      CHAT_PERSISTENCE_MODE: "memory",
    });

    expect(config.CHAT_PERSISTENCE_MODE).toBe("memory");
    expect(config.DATABASE_URL).toBeUndefined();
  });

  it("postgres mode config fails without DATABASE_URL", () => {
    expect(() =>
      parseConfig({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
        CHAT_PERSISTENCE_MODE: "postgres",
      }),
    ).toThrow("DATABASE_URL is required when CHAT_PERSISTENCE_MODE is 'postgres'");
  });

  it("postgres mode config succeeds when DATABASE_URL is provided", () => {
    const config = parseConfig({
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-key",
      CHAT_PERSISTENCE_MODE: "postgres",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
    });

    expect(config.CHAT_PERSISTENCE_MODE).toBe("postgres");
    expect(config.DATABASE_URL).toBe("postgresql://postgres:postgres@localhost:5432/testdb");
  });

  it("does not create a pg Pool in memory mode", () => {
    const pool = getPool();
    expect(pool).toBeNull();
  });

  it("in-memory repositories persist state across turns and support reset", async () => {
    const customStore = new InMemoryChatStore();
    const config = parseConfig({
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-key",
      CHAT_PERSISTENCE_MODE: "memory",
    });

    const bundle = createPersistence(config, customStore);

    // 1. Session creation
    const session = await bundle.sessionRepo.createSession(testUserId);
    expect(session.id).toBeDefined();
    expect(session.userId).toBe(testUserId);
    expect(session.status).toBe("ACTIVE");

    // 2. Message persistence & ordering
    await bundle.messageRepo.createMessage({
      sessionId: session.id,
      requestId: "req-1",
      role: "USER",
      content: "Hello",
    });
    await bundle.messageRepo.createMessage({
      sessionId: session.id,
      requestId: "req-1",
      role: "ASSISTANT",
      content: "World",
    });

    const msgs = await bundle.messageRepo.getMessagesBySessionId(session.id);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe("Hello");
    expect(msgs[1].content).toBe("World");

    // 3. State persistence
    await bundle.stateRepo.upsertState({
      sessionId: session.id,
      currentEventId: "event-123",
      currentEventLabel: "Gala",
      currentWorkerId: "worker-456",
      currentWorkerLabel: "Alice",
      recentEventResults: [{ id: "event-123", title: "Gala" }],
      recentWorkerResults: [{ id: "worker-456", fullName: "Alice" }],
    });

    const state = await bundle.stateRepo.getStateBySessionId(session.id);
    expect(state?.currentEventId).toBe("event-123");
    expect(state?.currentWorkerId).toBe("worker-456");
    expect(state?.recentEventResults).toHaveLength(1);

    // 4. Traces persistence
    await bundle.traceRepo.recordToolExecution({
      requestId: "req-1",
      sessionId: session.id,
      userId: testUserId,
      toolName: "get_dashboard",
      argumentsRedacted: {},
      status: "SUCCESS",
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 12,
    });

    await bundle.traceRepo.recordChatTrace({
      requestId: "req-1",
      sessionId: session.id,
      userId: testUserId,
      provider: "groq",
      model: "openai/gpt-oss-120b",
      toolCallCount: 1,
      durationMs: 300,
      outcome: "SUCCESS",
    });

    const toolExecs = await bundle.traceRepo.getToolExecutionsBySession(session.id);
    expect(toolExecs).toHaveLength(1);
    expect(toolExecs[0].toolName).toBe("get_dashboard");

    const traces = await bundle.traceRepo.getChatTracesBySession(session.id);
    expect(traces).toHaveLength(1);
    expect(traces[0].model).toBe("openai/gpt-oss-120b");

    // 5. Store reset produces empty state
    customStore.clear();
    const wipedSession = await bundle.sessionRepo.getSessionById(session.id);
    expect(wipedSession).toBeNull();
    const wipedMsgs = await bundle.messageRepo.getMessagesBySessionId(session.id);
    expect(wipedMsgs).toHaveLength(0);
  });

  it("db:migrate safely exits in memory mode without DATABASE_URL", async () => {
    // Should not throw even when DATABASE_URL is unset
    await expect(runMigrations()).resolves.toBeUndefined();
  });

  it("/readyz succeeds in memory mode and returns persistence metadata", async () => {
    const config = parseConfig({
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-key",
      CHAT_PERSISTENCE_MODE: "memory",
    });

    const app = await buildApp({ config });
    const res = await app.inject({
      method: "GET",
      url: "/readyz",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ready");
    expect(body.persistence).toBe("memory");
    await app.close();
  });
});
