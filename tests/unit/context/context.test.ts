import { describe, it, expect } from "vitest";
import { entityContextService } from "../../../src/context/entity-context.service.js";
import { reduceSessionState } from "../../../src/context/context.reducer.js";
import { SessionState } from "../../../src/context/context.types.js";

describe("Context Layer", () => {
  describe("EntityContextService", () => {
    const mockState: SessionState = {
      sessionId: "session-1",
      currentEventId: "11111111-1111-1111-1111-111111111111",
      currentEventLabel: "Summer Gala",
      currentWorkerId: "22222222-2222-2222-2222-222222222222",
      currentWorkerLabel: "John Doe",
      recentEventResults: [
        { id: "11111111-1111-1111-1111-111111111111", title: "Summer Gala" },
        { id: "33333333-3333-3333-3333-333333333333", title: "Winter Fest" },
      ],
      recentWorkerResults: [
        { id: "22222222-2222-2222-2222-222222222222", fullName: "John Doe" },
        { id: "44444444-4444-4444-4444-444444444444", fullName: "Jane Smith" },
      ],
    };

    it("accepts entity present in active state", () => {
      const validEvent = entityContextService.validateEntityReference(
        "11111111-1111-1111-1111-111111111111",
        "EVENT",
        mockState,
        "What is the staffing?",
      );
      expect(validEvent).toBe(true);

      const validWorker = entityContextService.validateEntityReference(
        "22222222-2222-2222-2222-222222222222",
        "WORKER",
        mockState,
        "Show his history",
      );
      expect(validWorker).toBe(true);
    });

    it("accepts entity present in recent search results", () => {
      const validEvent = entityContextService.validateEntityReference(
        "33333333-3333-3333-3333-333333333333",
        "EVENT",
        mockState,
        "Show the second one",
      );
      expect(validEvent).toBe(true);

      const validWorker = entityContextService.validateEntityReference(
        "44444444-4444-4444-4444-444444444444",
        "WORKER",
        mockState,
        "Check Jane's details",
      );
      expect(validWorker).toBe(true);
    });

    it("accepts entity literally mentioned in user prompt", () => {
      const promptUuid = "55555555-5555-5555-5555-555555555555";
      const valid = entityContextService.validateEntityReference(
        promptUuid,
        "EVENT",
        null,
        `Look up event ${promptUuid} for me`,
      );
      expect(valid).toBe(true);
    });

    it("accepts entity returned in earlier turn tool outputs", () => {
      const returnedUuid = "66666666-6666-6666-6666-666666666666";
      const turnOutputs = [
        [{ id: returnedUuid, title: "Found in search" }],
      ];

      const valid = entityContextService.validateEntityReference(
        returnedUuid,
        "EVENT",
        null,
        "show me that event",
        turnOutputs,
      );
      expect(valid).toBe(true);
    });

    it("rejects hallucinated UUID not present in state, prompt, or turn outputs", () => {
      const hallucinatedUuid = "99999999-9999-9999-9999-999999999999";
      const valid = entityContextService.validateEntityReference(
        hallucinatedUuid,
        "EVENT",
        mockState,
        "Show details for the concert",
      );
      expect(valid).toBe(false);
    });

    it("resolves ordinal references correctly", () => {
      const items = ["Item A", "Item B", "Item C"];
      expect(entityContextService.resolveOrdinalReference("first", items)).toBe("Item A");
      expect(entityContextService.resolveOrdinalReference("the 2nd one", items)).toBe("Item B");
      expect(entityContextService.resolveOrdinalReference("#3", items)).toBe("Item C");
      expect(entityContextService.resolveOrdinalReference("last", items)).toBe("Item C");
      expect(entityContextService.resolveOrdinalReference("tenth", items)).toBeNull();
    });

    it("resolves pronoun references correctly", () => {
      const workerRes = entityContextService.resolvePronounReference(
        "show his history",
        mockState,
      );
      expect(workerRes?.workerId).toBe("22222222-2222-2222-2222-222222222222");

      const eventRes = entityContextService.resolvePronounReference(
        "what is its report",
        mockState,
      );
      expect(eventRes?.eventId).toBe("11111111-1111-1111-1111-111111111111");
    });
  });

  describe("ContextReducer", () => {
    it("updates recentEventResults and auto-selects if single result", () => {
      const state = reduceSessionState(
        null,
        "session-1",
        "search_events",
        {},
        [
          {
            id: "e1",
            title: "Exclusive Dinner",
            event_date: "2026-10-01",
            event_status: "UPCOMING",
          },
        ],
      );

      expect(state.recentEventResults).toHaveLength(1);
      expect(state.currentEventId).toBe("e1");
      expect(state.currentEventLabel).toBe("Exclusive Dinner");
    });

    it("updates currentEventId and prepends to recentEventResults on get_event_details", () => {
      const initial: SessionState = {
        sessionId: "session-1",
        currentEventId: null,
        currentEventLabel: null,
        currentWorkerId: null,
        currentWorkerLabel: null,
        recentEventResults: [],
        recentWorkerResults: [],
      };

      const updated = reduceSessionState(
        initial,
        "session-1",
        "get_event_details",
        { event_id: "e2" },
        {
          id: "e2",
          title: "VIP Gala",
          event_date: "2026-11-15",
          event_status: "PUBLISHED",
        },
      );

      expect(updated.currentEventId).toBe("e2");
      expect(updated.currentEventLabel).toBe("VIP Gala");
      expect(updated.recentEventResults).toHaveLength(1);
      expect(updated.recentEventResults[0].id).toBe("e2");
    });

    it("updates currentWorkerId and prepends to recentWorkerResults on get_worker_details", () => {
      const initial: SessionState = {
        sessionId: "session-1",
        currentEventId: null,
        currentEventLabel: null,
        currentWorkerId: null,
        currentWorkerLabel: null,
        recentEventResults: [],
        recentWorkerResults: [],
      };

      const updated = reduceSessionState(
        initial,
        "session-1",
        "get_worker_details",
        { worker_id: "w1" },
        {
          worker_id: "w1",
          full_name: "Alice Walker",
          category: "A",
          account_status: "ACTIVE",
        },
      );

      expect(updated.currentWorkerId).toBe("w1");
      expect(updated.currentWorkerLabel).toBe("Alice Walker");
      expect(updated.recentWorkerResults).toHaveLength(1);
      expect(updated.recentWorkerResults[0].id).toBe("w1");
    });
  });
});
