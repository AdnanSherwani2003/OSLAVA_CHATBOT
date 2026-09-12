import { describe, it, expect } from "vitest";
import { entityContextService } from "../../../src/context/entity-context.service.js";
import { SessionState } from "../../../src/context/context.types.js";
import { MemorySessionRepository } from "../../../src/persistence/memory/memory-session.repository.js";
import { InMemoryChatStore } from "../../../src/persistence/memory/in-memory-store.js";
import { ConversationService } from "../../../src/context/conversation.service.js";
import { MemoryMessageRepository } from "../../../src/persistence/memory/memory-message.repository.js";

describe("Security: Entity Safety & Context Grounding Regression Suite", () => {
  const validEventId = "11111111-1111-4111-8111-111111111111";
  const validWorkerId = "22222222-2222-4222-8222-222222222222";
  const hallucinatedId = "99999999-9999-4999-8999-999999999999";

  it("rejects invented event UUID that does not exist in prompt, state, or turn outputs", () => {
    const state: SessionState = {
      sessionId: "sess_1",
      currentEventId: validEventId,
      currentEventLabel: "Gala Event",
      currentWorkerId: null,
      currentWorkerLabel: null,
      recentEventResults: [{ id: validEventId, title: "Gala Event", date: "2026-09-20", status: "DRAFT" }],
      recentWorkerResults: [],
    };

    const isGrounded = entityContextService.validateEntityReference(
      hallucinatedId,
      "EVENT",
      state,
      "show details for the event",
      [],
    );

    expect(isGrounded).toBe(false);
  });

  it("rejects invented worker UUID that does not exist in prompt, state, or turn outputs", () => {
    const state: SessionState = {
      sessionId: "sess_1",
      currentEventId: null,
      currentEventLabel: null,
      currentWorkerId: validWorkerId,
      currentWorkerLabel: "Arif Khan",
      recentEventResults: [],
      recentWorkerResults: [{ id: validWorkerId, fullName: "Arif Khan", category: "B", status: "ACTIVE" }],
    };

    const isGrounded = entityContextService.validateEntityReference(
      hallucinatedId,
      "WORKER",
      state,
      "what is his current tier?",
      [],
    );

    expect(isGrounded).toBe(false);
  });

  it("accepts entity reference when user explicitly provides the UUID in the prompt", () => {
    const isGrounded = entityContextService.validateEntityReference(
      hallucinatedId,
      "WORKER",
      null, // No state
      `Please check worker with id ${hallucinatedId}`,
      [],
    );

    expect(isGrounded).toBe(true);
  });

  it("grounds entity reference from earlier tool outputs produced within the same turn", () => {
    const turnToolOutputs = [
      [
        {
          id: "33333333-3333-4333-8333-333333333333",
          full_name: "Turn Grounded Worker",
          category: "A",
        },
      ],
    ];

    const isGrounded = entityContextService.validateEntityReference(
      "33333333-3333-4333-8333-333333333333",
      "WORKER",
      null, // State not yet committed
      "tell me about this worker",
      turnToolOutputs,
    );

    expect(isGrounded).toBe(true);
  });

  it("rejects ordinal selection outside the available search results range", () => {
    const recentItems = [
      { id: "evt_1", title: "Item 1" },
      { id: "evt_2", title: "Item 2" },
    ];

    // Out of range ordinals: "third", "fifth", "number 10"
    expect(entityContextService.resolveOrdinalReference("the third one", recentItems)).toBeNull();
    expect(entityContextService.resolveOrdinalReference("the 5th option", recentItems)).toBeNull();
    expect(entityContextService.resolveOrdinalReference("number 10", recentItems)).toBeNull();

    // In-range ordinals should resolve correctly
    expect(entityContextService.resolveOrdinalReference("the first one", recentItems)).toEqual(recentItems[0]);
    expect(entityContextService.resolveOrdinalReference("second option", recentItems)).toEqual(recentItems[1]);
    expect(entityContextService.resolveOrdinalReference("the last one", recentItems)).toEqual(recentItems[1]);
  });

  it("fails to resolve ambiguous pronoun 'him' when no active worker is selected in state", () => {
    const stateWithNoActiveWorker: SessionState = {
      sessionId: "sess_ambig",
      currentEventId: null,
      currentEventLabel: null,
      currentWorkerId: null, // Multiple search results exist, but none chosen as active
      currentWorkerLabel: null,
      recentEventResults: [],
      recentWorkerResults: [
        { id: "w1", fullName: "Worker One", category: "B", status: "ACTIVE" },
        { id: "w2", fullName: "Worker Two", category: "C", status: "ACTIVE" },
      ],
    };

    const resolved = entityContextService.resolvePronounReference(
      "promote him to tier A",
      stateWithNoActiveWorker,
    );

    expect(resolved).toBeNull();
  });

  it("fails to resolve ambiguous pronoun 'that event' when no active event is selected in state", () => {
    const stateWithNoActiveEvent: SessionState = {
      sessionId: "sess_ambig_evt",
      currentEventId: null,
      currentEventLabel: null,
      currentWorkerId: null,
      currentWorkerLabel: null,
      recentEventResults: [
        { id: "e1", title: "Event One", date: "2026-09-20", status: "DRAFT" },
        { id: "e2", title: "Event Two", date: "2026-09-21", status: "DRAFT" },
      ],
      recentWorkerResults: [],
    };

    const resolved = entityContextService.resolvePronounReference(
      "publish that event please",
      stateWithNoActiveEvent,
    );

    expect(resolved).toBeNull();
  });

  it("clears entity references upon reset and forbids pronoun resolution afterwards", () => {
    const stateBeforeReset: SessionState = {
      sessionId: "sess_reset",
      currentEventId: validEventId,
      currentEventLabel: "Gala Event",
      currentWorkerId: validWorkerId,
      currentWorkerLabel: "Arif Khan",
      recentEventResults: [{ id: validEventId, title: "Gala Event", date: "2026-09-20", status: "DRAFT" }],
      recentWorkerResults: [{ id: validWorkerId, fullName: "Arif Khan", category: "B", status: "ACTIVE" }],
    };

    // Before reset, pronoun resolves
    expect(entityContextService.resolvePronounReference("his status", stateBeforeReset)).toEqual({
      workerId: validWorkerId,
    });

    // Simulate reset
    const stateAfterReset: SessionState = {
      sessionId: "sess_reset",
      currentEventId: null,
      currentEventLabel: null,
      currentWorkerId: null,
      currentWorkerLabel: null,
      recentEventResults: [],
      recentWorkerResults: [],
    };

    expect(entityContextService.resolvePronounReference("his status", stateAfterReset)).toBeNull();
    expect(entityContextService.resolvePronounReference("that event", stateAfterReset)).toBeNull();
  });

  it("enforces complete context isolation between different user sessions", async () => {
    const store = new InMemoryChatStore();
    const sessionRepo = new MemorySessionRepository(store);
    const messageRepo = new MemoryMessageRepository(store);
    const convService = new ConversationService(sessionRepo, messageRepo);

    // User A creates session A
    const sessionA = await convService.createSession("user_alice");
    await convService.saveState({
      sessionId: sessionA.id,
      currentEventId: validEventId,
      currentEventLabel: "Alice Private Event",
      currentWorkerId: null,
      currentWorkerLabel: null,
      recentEventResults: [{ id: validEventId, title: "Alice Private Event", date: "2026-09-20", status: "DRAFT" }],
      recentWorkerResults: [],
    });

    // User B creates session B
    const sessionB = await convService.createSession("user_bob");

    // Bob cannot access Alice's session state
    await expect(
      convService.verifySessionAccess(sessionA.id, "user_bob"),
    ).rejects.toThrowError(/Access to .*chat session.*is forbidden/i);

    // Bob's session state is completely empty and isolated
    const bobState = await convService.getState(sessionB.id);
    expect(bobState).toBeNull();
  });
});
