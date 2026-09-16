import { describe, it, expect } from "vitest";
import {
  turnPlanner,
  deriveResponseObjectives,
  validateResponseCoverage,
  buildSynthesisInstruction,
  buildResynthesisInstruction,
} from "../../../src/ai/turn-planner.js";
import { SessionState } from "../../../src/context/context.types.js";

describe("TurnPlanner: Capability & Intent Planning", () => {
  const emptyState: SessionState = {
    sessionId: "test-session",
    userId: "test-user",
    currentEventId: null,
    currentEventLabel: null,
    currentWorkerId: null,
    currentWorkerLabel: null,
    recentEventResults: [],
    recentWorkerResults: [],
    lastIntent: null,
    pendingActionId: null,
    updatedAt: new Date().toISOString(),
  };

  it("Scenario 1: 'What's happening today?' -> requires dashboard/event read capability", () => {
    const plan = turnPlanner.planTurn("What's happening today?", emptyState);
    expect(plan.objectives).toEqual(["DASHBOARD"]);
    expect(plan.requiredReadTools).toContain("get_dashboard");
    expect(plan.isUnsupported).toBe(false);
    expect(plan.objectives).not.toContain("SEARCH_WORKERS");
    expect(plan.objectives).not.toContain("WORKER_DETAILS");
  });

  it("Scenario 2: 'Find worker Arif.' -> requires search_workers", () => {
    const plan = turnPlanner.planTurn("Find worker Arif.", emptyState);
    expect(plan.objectives).toEqual(["SEARCH_WORKERS"]);
    expect(plan.requiredReadTools).toEqual(["search_workers"]);
    expect(plan.isUnsupported).toBe(false);
    expect(plan.objectives).not.toContain("SEARCH_EVENTS");
    expect(plan.objectives).not.toContain("EVENT_DETAILS");
    expect(plan.requiredReadTools).not.toContain("search_events");
  });

  it("Scenario 3: 'Show Arif's details.' -> requires search_workers when unresolved then get_worker_details", () => {
    const plan = turnPlanner.planTurn("Show Arif's details.", emptyState);
    expect(plan.objectives).toEqual(["SEARCH_WORKERS", "WORKER_DETAILS"]);
    expect(plan.requiredReadTools).toEqual(["search_workers", "get_worker_details"]);
    expect(plan.objectives).not.toContain("SEARCH_EVENTS");
    expect(plan.objectives).not.toContain("EVENT_DETAILS");
    expect(plan.requiredReadTools).not.toContain("search_events");
  });

  it("Scenario 4: 'Show Arif's history.' -> requires search_workers when unresolved then get_worker_history", () => {
    const plan = turnPlanner.planTurn("Show Arif's history.", emptyState);
    expect(plan.objectives).toEqual(["SEARCH_WORKERS", "WORKER_HISTORY"]);
    expect(plan.requiredReadTools).toEqual(["search_workers", "get_worker_history"]);
    expect(plan.objectives).not.toContain("SEARCH_EVENTS");
    expect(plan.objectives).not.toContain("EVENT_REPORT");
    expect(plan.requiredReadTools).not.toContain("search_events");
  });

  it("Scenario 5: 'Find Arif and show his details and history.' -> compound objectives satisfied", () => {
    const plan = turnPlanner.planTurn("Find Arif and show his details and history.", emptyState);
    expect(plan.objectives).toEqual(["SEARCH_WORKERS", "WORKER_DETAILS", "WORKER_HISTORY"]);
    expect(plan.requiredReadTools).toEqual(["search_workers", "get_worker_details", "get_worker_history"]);
    expect(plan.objectives).not.toContain("SEARCH_EVENTS");
    expect(plan.objectives).not.toContain("EVENT_DETAILS");
    expect(plan.objectives).not.toContain("EVENT_REPORT");
    expect(plan.requiredReadTools).not.toContain("search_events");
  });

  it("Scenario 6: 'Tell me about VM Hall event.' -> search_events when unresolved then get_event_details", () => {
    const plan = turnPlanner.planTurn("Tell me about VM Hall event.", emptyState);
    expect(plan.objectives).toEqual(["SEARCH_EVENTS", "EVENT_DETAILS"]);
    expect(plan.requiredReadTools).toEqual(["search_events", "get_event_details"]);
    expect(plan.objectives).not.toContain("SEARCH_WORKERS");
    expect(plan.objectives).not.toContain("WORKER_DETAILS");
    expect(plan.requiredReadTools).not.toContain("search_workers");
  });

  it("Scenario 7: 'Give me VM Hall's event report.' -> search_events when unresolved then get_event_report", () => {
    const plan = turnPlanner.planTurn("Give me VM Hall's event report.", emptyState);
    expect(plan.objectives).toEqual(["SEARCH_EVENTS", "EVENT_REPORT"]);
    expect(plan.requiredReadTools).toEqual(["search_events", "get_event_report"]);
    expect(plan.objectives).not.toContain("SEARCH_WORKERS");
    expect(plan.objectives).not.toContain("WORKER_HISTORY");
    expect(plan.requiredReadTools).not.toContain("search_workers");
  });

  it("Scenario 8: 'What's happening today and show VM Hall's report.' -> compound objectives for today and report", () => {
    const plan = turnPlanner.planTurn("What's happening today and show VM Hall's report.", emptyState);
    expect(plan.objectives).toContain("DASHBOARD");
    expect(plan.objectives).toContain("EVENT_REPORT");
    expect(plan.requiredReadTools).toContain("get_event_report");
    expect(plan.objectives).not.toContain("SEARCH_WORKERS");
    expect(plan.objectives).not.toContain("WORKER_HISTORY");
    expect(plan.requiredReadTools).not.toContain("search_workers");
  });

  it("Scenario 9: 'Assign workers to today's event.' -> standard unsupported refusal flag", () => {
    const plan = turnPlanner.planTurn("Assign workers to today's event.", emptyState);
    expect(plan.isUnsupported).toBe(true);
    expect(plan.objectives).toContain("UNSUPPORTED_INTENT");
    expect(plan.requiredReadTools).toHaveLength(0);
    expect(plan.allowedTools).toHaveLength(0);
  });

  it("Scenario 10: Grounded context -> does not add redundant search prerequisite", () => {
    const groundedWorkerState: SessionState = {
      ...emptyState,
      currentWorkerId: "12345678-1234-1234-1234-123456789abc",
      currentWorkerLabel: "Arif Khan",
    };

    const plan = turnPlanner.planTurn("Show his history.", groundedWorkerState);
    expect(plan.workerGrounded).toBe(true);
    expect(plan.objectives).toEqual(["WORKER_HISTORY"]);
    // Since worker is already grounded, search_workers is not required
    expect(plan.requiredReadTools).not.toContain("search_workers");
    expect(plan.requiredReadTools).toEqual(["get_worker_history"]);
    expect(plan.objectives).not.toContain("EVENT_DETAILS");
  });

  it("validates turn completeness for satisfied and missing objectives", () => {
    const plan = turnPlanner.planTurn("Show Arif's history.", emptyState);

    // If model ran search_workers but not get_worker_history, turn is incomplete
    const incompleteResult = turnPlanner.validateTurnCompleteness(
      plan,
      ["search_workers"],
      emptyState,
      "I found Arif Khan with ID 123.",
    );
    expect(incompleteResult.isComplete).toBe(false);
    expect(incompleteResult.missingTool).toBe("get_worker_history");

    // Once get_worker_history is executed, turn is complete
    const completeResult = turnPlanner.validateTurnCompleteness(
      plan,
      ["search_workers", "get_worker_history"],
      emptyState,
      "Arif has worked 5 events with zero absences.",
    );
    expect(completeResult.isComplete).toBe(true);
  });

  // =========================================================================
  // REQUIREMENT 11: Production Failure Regression Test
  // =========================================================================
  it("Requirement 11 & Production Bug Regression: 'Find VM hall function, tell me its details, and give me its event report.'", () => {
    const plan = turnPlanner.planTurn(
      "Find VM hall function, tell me its details, and give me its event report.",
      emptyState,
    );

    // Assert objectives contain expected event objectives
    expect(plan.objectives).toContain("SEARCH_EVENTS");
    expect(plan.objectives).toContain("EVENT_DETAILS");
    expect(plan.objectives).toContain("EVENT_REPORT");

    // Assert objectives do NOT contain worker objectives
    expect(plan.objectives).not.toContain("SEARCH_WORKERS");
    expect(plan.objectives).not.toContain("WORKER_DETAILS");
    expect(plan.objectives).not.toContain("WORKER_HISTORY");

    // Assert required read tools are exactly/minimally:
    expect(plan.requiredReadTools).toEqual([
      "search_events",
      "get_event_details",
      "get_event_report",
    ]);

    // Assert allowed tools are strictly the 3 event reads and zero write tools:
    expect(plan.allowedTools).toEqual([
      "search_events",
      "get_event_details",
      "get_event_report",
    ]);
    expect(plan.allowedTools).not.toContain("publish_event");
    expect(plan.allowedTools).not.toContain("complete_event");
    expect(plan.allowedTools).not.toContain("close_event");
    expect(plan.allowedTools).not.toContain("change_worker_category");
    expect(plan.allowedTools).not.toContain("search_workers");
    expect(plan.allowedTools).not.toContain("get_worker_details");
    expect(plan.allowedTools).not.toContain("get_worker_history");
  });

  // =========================================================================
  // REQUIREMENT 12: Regression Cases A through J & Sub-tests B, C, D
  // =========================================================================
  it("Case A: 'Find VM hall function and show its details.' -> event tools only, zero write tools", () => {
    const plan = turnPlanner.planTurn("Find VM hall function and show its details.", emptyState);
    expect(plan.objectives).toEqual(["SEARCH_EVENTS", "EVENT_DETAILS"]);
    expect(plan.requiredReadTools).toEqual(["search_events", "get_event_details"]);
    expect(plan.allowedTools).toEqual(
      expect.arrayContaining(["search_events", "get_event_details"]),
    );
    expect(plan.allowedTools).not.toContain("publish_event");
    expect(plan.allowedTools).not.toContain("complete_event");
    expect(plan.allowedTools).not.toContain("close_event");
    expect(plan.allowedTools).not.toContain("change_worker_category");
    expect(plan.allowedTools).not.toContain("search_workers");
    expect(plan.allowedTools).not.toContain("get_worker_details");
    expect(plan.allowedTools).not.toContain("get_worker_history");
  });

  it("Case B: 'Find VM hall function and give me its report.' -> event tools only", () => {
    const plan = turnPlanner.planTurn("Find VM hall function and give me its report.", emptyState);
    expect(plan.objectives).toEqual(["SEARCH_EVENTS", "EVENT_REPORT"]);
    expect(plan.requiredReadTools).toEqual(["search_events", "get_event_report"]);
    expect(plan.allowedTools).not.toContain("publish_event");
    expect(plan.allowedTools).not.toContain("search_workers");
    expect(plan.allowedTools).not.toContain("get_worker_details");
    expect(plan.allowedTools).not.toContain("get_worker_history");
  });

  it("Case C: 'Tell me details about VM hall event.' -> event tools only", () => {
    const plan = turnPlanner.planTurn("Tell me details about VM hall event.", emptyState);
    expect(plan.objectives).toEqual(["SEARCH_EVENTS", "EVENT_DETAILS"]);
    expect(plan.requiredReadTools).toEqual(["search_events", "get_event_details"]);
    expect(plan.allowedTools).not.toContain("publish_event");
    expect(plan.allowedTools).not.toContain("search_workers");
    expect(plan.allowedTools).not.toContain("get_worker_details");
  });

  it("Case D: 'Find worker Arif and show his details.' -> worker tools only", () => {
    const plan = turnPlanner.planTurn("Find worker Arif and show his details.", emptyState);
    expect(plan.objectives).toEqual(["SEARCH_WORKERS", "WORKER_DETAILS"]);
    expect(plan.requiredReadTools).toEqual(["search_workers", "get_worker_details"]);
    expect(plan.allowedTools).not.toContain("change_worker_category");
    expect(plan.allowedTools).not.toContain("search_events");
    expect(plan.allowedTools).not.toContain("get_event_details");
    expect(plan.allowedTools).not.toContain("get_event_report");
  });

  it("Case E & Requirement 2.B: 'Find Arif and show his history.' works without any hardcoded 'Arif' production rule", () => {
    const plan = turnPlanner.planTurn("Find Arif and show his history.", emptyState);
    expect(plan.objectives).toEqual(["SEARCH_WORKERS", "WORKER_HISTORY"]);
    expect(plan.requiredReadTools).toEqual(["search_workers", "get_worker_history"]);
    expect(plan.allowedTools).toEqual(
      expect.arrayContaining(["search_workers", "get_worker_history"]),
    );
    expect(plan.allowedTools).not.toContain("change_worker_category");
    expect(plan.allowedTools).not.toContain("search_events");
    expect(plan.allowedTools).not.toContain("get_event_details");
    expect(plan.allowedTools).not.toContain("get_event_report");
  });

  it("Requirement 2.C: 'Find CompletelyNewPersonName and show his history.' resolves using the same worker-intent logic", () => {
    const plan = turnPlanner.planTurn("Find CompletelyNewPersonName and show his history.", emptyState);
    expect(plan.objectives).toEqual(["SEARCH_WORKERS", "WORKER_HISTORY"]);
    expect(plan.requiredReadTools).toEqual(["search_workers", "get_worker_history"]);
    expect(plan.allowedTools).toEqual(
      expect.arrayContaining(["search_workers", "get_worker_history"]),
    );
    expect(plan.allowedTools).not.toContain("change_worker_category");
    expect(plan.allowedTools).not.toContain("search_events");
    expect(plan.allowedTools).not.toContain("get_event_details");
    expect(plan.allowedTools).not.toContain("get_event_report");
  });

  it("Requirement 2.D: 'Find Alex.' with no grounding/domain signal does not rely on a hardcoded name list or silently guess", () => {
    const plan = turnPlanner.planTurn("Find Alex.", emptyState);
    // Must NOT guess worker or event
    expect(plan.objectives).not.toContain("SEARCH_WORKERS");
    expect(plan.objectives).not.toContain("SEARCH_EVENTS");
    expect(plan.requiredReadTools).not.toContain("search_workers");
    expect(plan.requiredReadTools).not.toContain("search_events");
    // Must NOT expose write tools
    expect(plan.allowedTools).not.toContain("publish_event");
    expect(plan.allowedTools).not.toContain("complete_event");
    expect(plan.allowedTools).not.toContain("close_event");
    expect(plan.allowedTools).not.toContain("change_worker_category");
  });

  it("Case F: 'Show details.' with only currentEventId -> get_event_details", () => {
    const eventState: SessionState = {
      ...emptyState,
      currentEventId: "evt-12345678-1234-1234-1234-123456789abc",
      currentEventLabel: "VM Hall Function",
    };
    const plan = turnPlanner.planTurn("Show details.", eventState);
    expect(plan.objectives).toEqual(["EVENT_DETAILS"]);
    expect(plan.requiredReadTools).toEqual(["get_event_details"]);
    expect(plan.allowedTools).not.toContain("search_workers");
    expect(plan.allowedTools).not.toContain("get_worker_details");
  });

  it("Case G: 'Show details.' with only currentWorkerId -> get_worker_details", () => {
    const workerState: SessionState = {
      ...emptyState,
      currentWorkerId: "wrk-12345678-1234-1234-1234-123456789abc",
      currentWorkerLabel: "Arif Khan",
    };
    const plan = turnPlanner.planTurn("Show details.", workerState);
    expect(plan.objectives).toEqual(["WORKER_DETAILS"]);
    expect(plan.requiredReadTools).toEqual(["get_worker_details"]);
    expect(plan.allowedTools).not.toContain("search_events");
    expect(plan.allowedTools).not.toContain("get_event_details");
  });

  it("Case H: 'Show details.' with both currentEventId AND currentWorkerId -> must not guess", () => {
    const dualState: SessionState = {
      ...emptyState,
      currentEventId: "evt-12345678-1234-1234-1234-123456789abc",
      currentEventLabel: "VM Hall Function",
      currentWorkerId: "wrk-12345678-1234-1234-1234-123456789abc",
      currentWorkerLabel: "Arif Khan",
    };
    const plan = turnPlanner.planTurn("Show details.", dualState);
    expect(plan.isAmbiguous).toBe(true);
    expect(plan.objectives).toContain("CONVERSATIONAL");
    expect(plan.requiredReadTools).toHaveLength(0);
    expect(plan.allowedTools).toHaveLength(0);
  });

  it("Case I: 'Show VM Hall details and worker Arif history.' -> legitimate event + worker multi-entity planning", () => {
    const plan = turnPlanner.planTurn("Show VM Hall details and worker Arif history.", emptyState);
    expect(plan.objectives).toContain("EVENT_DETAILS");
    expect(plan.objectives).toContain("WORKER_HISTORY");
    expect(plan.requiredReadTools).toContain("search_events");
    expect(plan.requiredReadTools).toContain("get_event_details");
    expect(plan.requiredReadTools).toContain("search_workers");
    expect(plan.requiredReadTools).toContain("get_worker_history");
  });

  it("Case J: 'What's happening today?' -> dashboard only", () => {
    const plan = turnPlanner.planTurn("What's happening today?", emptyState);
    expect(plan.objectives).toEqual(["DASHBOARD"]);
    expect(plan.requiredReadTools).toEqual(["get_dashboard"]);
    expect(plan.allowedTools).toContain("get_dashboard");
    expect(plan.allowedTools).toContain("search_events");
    expect(plan.allowedTools).not.toContain("search_workers");
    expect(plan.allowedTools).not.toContain("get_worker_details");
    expect(plan.allowedTools).not.toContain("get_worker_history");
  });

  describe("Response Coverage Plan Derivation (Requirement 1)", () => {
    it("derives response objectives for compound worker query, excluding prerequisite search_workers", () => {
      const plan = turnPlanner.planTurn("Find worker Adnan Adnan and show his details and history.", emptyState);
      expect(plan.objectives).toEqual(["SEARCH_WORKERS", "WORKER_DETAILS", "WORKER_HISTORY"]);
      expect(plan.requiredReadTools).toEqual(["search_workers", "get_worker_details", "get_worker_history"]);
      expect(plan.requiredResponseObjectives).toEqual(["WORKER_DETAILS", "WORKER_HISTORY"]);
      expect(plan.requiredResponseObjectives).not.toContain("SEARCH_WORKERS");
    });

    it("derives response objectives for compound event query, excluding prerequisite search_events", () => {
      const plan = turnPlanner.planTurn("Find VM hall function, tell me its details, and give me its event report.", emptyState);
      expect(plan.objectives).toContain("SEARCH_EVENTS");
      expect(plan.objectives).toContain("EVENT_DETAILS");
      expect(plan.objectives).toContain("EVENT_REPORT");
      expect(plan.requiredResponseObjectives).toEqual(["EVENT_DETAILS", "EVENT_REPORT"]);
      expect(plan.requiredResponseObjectives).not.toContain("SEARCH_EVENTS");
    });

    it("derives response objective for terminal search when search is user's final request", () => {
      const plan = turnPlanner.planTurn("Find events tomorrow.", emptyState);
      expect(plan.requiredResponseObjectives).toEqual(["SEARCH_EVENTS"]);

      const workerPlan = turnPlanner.planTurn("Find worker Arif.", emptyState);
      expect(workerPlan.requiredResponseObjectives).toEqual(["SEARCH_WORKERS"]);
    });

    it("derives response objective for grounded worker history", () => {
      const groundedState: SessionState = {
        ...emptyState,
        currentWorkerId: "12345678-1234-1234-1234-123456789abc",
        currentWorkerLabel: "Adnan Adnan",
      };
      const plan = turnPlanner.planTurn("Show his history.", groundedState);
      expect(plan.requiredResponseObjectives).toEqual(["WORKER_HISTORY"]);
      expect(plan.requiredResponseObjectives).not.toContain("WORKER_DETAILS");
    });

    it("derives response objectives for multi-domain query", () => {
      const plan = turnPlanner.planTurn("Show VM Hall details and worker Arif history.", emptyState);
      expect(plan.requiredResponseObjectives).toContain("EVENT_DETAILS");
      expect(plan.requiredResponseObjectives).toContain("WORKER_HISTORY");
      expect(plan.requiredResponseObjectives).not.toContain("SEARCH_EVENTS");
      expect(plan.requiredResponseObjectives).not.toContain("SEARCH_WORKERS");
    });

    it("returns empty response objectives for unsupported intents, confirmations, and greetings", () => {
      const unsupported = turnPlanner.planTurn("Cancel the event scheduled for tonight", emptyState);
      expect(unsupported.requiredResponseObjectives).toEqual([]);

      const confirm = turnPlanner.planTurn("confirm the action", emptyState);
      expect(confirm.requiredResponseObjectives).toEqual([]);

      const greeting = turnPlanner.planTurn("Hello, good morning!", emptyState);
      expect(greeting.requiredResponseObjectives).toEqual([]);
    });
  });

  describe("Deterministic Response Coverage Validation (Requirement 3)", () => {
    it("validates multi-objective response with canonical headings", () => {
      const content = `
### Worker Details
- Name: Adnan Adnan
- Role: Lead Staff
- Category: A

### Worker History
- Completed 15 events
- Reliability Score: 100%
      `;
      const result = validateResponseCoverage(["WORKER_DETAILS", "WORKER_HISTORY"], content);
      expect(result.isCovered).toBe(true);
      expect(result.coveredObjectives).toEqual(["WORKER_DETAILS", "WORKER_HISTORY"]);
      expect(result.missingObjectives).toEqual([]);
    });

    it("detects missing Worker History when response covers only Worker Details", () => {
      const content = `
### Worker Details
- Name: Adnan Adnan
- Role: Lead Staff
- Category: A
      `;
      const result = validateResponseCoverage(["WORKER_DETAILS", "WORKER_HISTORY"], content);
      expect(result.isCovered).toBe(false);
      expect(result.coveredObjectives).toEqual(["WORKER_DETAILS"]);
      expect(result.missingObjectives).toEqual(["WORKER_HISTORY"]);
    });

    it("accepts single-objective history without requiring unnecessary sections", () => {
      const content = "### Worker History\nAdnan has completed 12 events with 0 absences.";
      const result = validateResponseCoverage(["WORKER_HISTORY"], content);
      expect(result.isCovered).toBe(true);
      expect(result.coveredObjectives).toEqual(["WORKER_HISTORY"]);
      expect(result.missingObjectives).toEqual([]);
    });

    it("accepts empty history records when explicitly stated under canonical heading (Requirement 6)", () => {
      const content = `
### Worker Details
- Name: Adnan Adnan
- Status: ACTIVE

### Worker History
No worker history records were found.
      `;
      const result = validateResponseCoverage(["WORKER_DETAILS", "WORKER_HISTORY"], content);
      expect(result.isCovered).toBe(true);
      expect(result.coveredObjectives).toEqual(["WORKER_DETAILS", "WORKER_HISTORY"]);
      expect(result.missingObjectives).toEqual([]);
    });

    it("builds correct synthesis and resynthesis instructions without exposing internal enum names", () => {
      const synth = buildSynthesisInstruction(["WORKER_DETAILS", "WORKER_HISTORY"]);
      expect(synth).toContain("Worker Details");
      expect(synth).toContain("Worker History");
      expect(synth).toContain("### Worker Details");
      expect(synth).toContain("### Worker History");
      expect(synth).not.toContain("WORKER_DETAILS");
      expect(synth).not.toContain("WORKER_HISTORY");

      const retry = buildResynthesisInstruction(["WORKER_DETAILS", "WORKER_HISTORY"], ["WORKER_HISTORY"]);
      expect(retry).toContain("Worker History");
      expect(retry).toContain("### Worker Details");
      expect(retry).toContain("### Worker History");
      expect(retry).not.toContain("WORKER_DETAILS");
      expect(retry).not.toContain("WORKER_HISTORY");
    });
  });

  describe("Collection Intent vs Specific Entity Intent (Production Regression Fix)", () => {
    it("plans 'tell me about the events' strictly as SEARCH_EVENTS without get_event_details", () => {
      const plan = turnPlanner.planTurn("tell me about the events", emptyState);
      expect(plan.objectives).toEqual(["SEARCH_EVENTS"]);
      expect(plan.requiredReadTools).toEqual(["search_events"]);
      expect(plan.allowedTools).toEqual(["search_events"]);
      expect(plan.requiredResponseObjectives).toEqual(["SEARCH_EVENTS"]);
      expect(plan.requiredReadTools).not.toContain("get_event_details");
    });

    it("plural event collection query wins over active event in state", () => {
      const stateWithEvent: SessionState = {
        ...emptyState,
        currentEventId: "550e8400-e29b-41d4-a716-446655440000",
        currentEventLabel: "VM hall function",
      };
      const plan = turnPlanner.planTurn("tell me about the events", stateWithEvent);
      expect(plan.objectives).toEqual(["SEARCH_EVENTS"]);
      expect(plan.requiredReadTools).toEqual(["search_events"]);
      expect(plan.allowedTools).toEqual(["search_events"]);
      expect(plan.requiredResponseObjectives).toEqual(["SEARCH_EVENTS"]);
      expect(plan.requiredReadTools).not.toContain("get_event_details");
    });

    it("plans event collection variants strictly as SEARCH_EVENTS", () => {
      const variants = [
        "show me the events",
        "show events",
        "list events",
        "what events are there?",
        "what upcoming events are there?",
      ];
      for (const variant of variants) {
        const plan = turnPlanner.planTurn(variant, emptyState);
        expect(plan.objectives).toContain("SEARCH_EVENTS");
        expect(plan.requiredReadTools).toEqual(["search_events"]);
        expect(plan.requiredResponseObjectives).toEqual(["SEARCH_EVENTS"]);
        expect(plan.requiredReadTools).not.toContain("get_event_details");
      }
    });

    it("plans 'tell me about the workers' strictly as SEARCH_WORKERS without get_worker_details", () => {
      const plan = turnPlanner.planTurn("tell me about the workers", emptyState);
      expect(plan.objectives).toEqual(["SEARCH_WORKERS"]);
      expect(plan.requiredReadTools).toEqual(["search_workers"]);
      expect(plan.allowedTools).toEqual(["search_workers"]);
      expect(plan.requiredResponseObjectives).toEqual(["SEARCH_WORKERS"]);
      expect(plan.requiredReadTools).not.toContain("get_worker_details");
    });

    it("plural worker collection query wins over active worker in state", () => {
      const stateWithWorker: SessionState = {
        ...emptyState,
        currentWorkerId: "660e8400-e29b-41d4-a716-446655440000",
        currentWorkerLabel: "Adnan Adnan",
      };
      const plan = turnPlanner.planTurn("tell me about the workers", stateWithWorker);
      expect(plan.objectives).toEqual(["SEARCH_WORKERS"]);
      expect(plan.requiredReadTools).toEqual(["search_workers"]);
      expect(plan.allowedTools).toEqual(["search_workers"]);
      expect(plan.requiredResponseObjectives).toEqual(["SEARCH_WORKERS"]);
      expect(plan.requiredReadTools).not.toContain("get_worker_details");
    });

    it("plans worker collection variants strictly as SEARCH_WORKERS", () => {
      const variants = [
        "tell me about workers",
        "show workers",
        "list the workers",
        "list workers",
      ];
      for (const variant of variants) {
        const plan = turnPlanner.planTurn(variant, emptyState);
        expect(plan.objectives).toContain("SEARCH_WORKERS");
        expect(plan.requiredReadTools).toEqual(["search_workers"]);
        expect(plan.requiredResponseObjectives).toEqual(["SEARCH_WORKERS"]);
        expect(plan.requiredReadTools).not.toContain("get_worker_details");
      }
    });

    it("plans specific event query 'tell me about VM hall function' with SEARCH_EVENTS and EVENT_DETAILS", () => {
      const plan = turnPlanner.planTurn("tell me about VM hall function", emptyState);
      expect(plan.objectives).toContain("SEARCH_EVENTS");
      expect(plan.objectives).toContain("EVENT_DETAILS");
      expect(plan.requiredReadTools).toContain("search_events");
      expect(plan.requiredReadTools).toContain("get_event_details");
      expect(plan.requiredResponseObjectives).toEqual(["EVENT_DETAILS"]);
    });

    it("plans specific worker query 'tell me about the worker Adnan Adnan' with SEARCH_WORKERS and WORKER_DETAILS", () => {
      const plan = turnPlanner.planTurn("tell me about the worker Adnan Adnan", emptyState);
      expect(plan.objectives).toContain("SEARCH_WORKERS");
      expect(plan.objectives).toContain("WORKER_DETAILS");
      expect(plan.requiredReadTools).toContain("search_workers");
      expect(plan.requiredReadTools).toContain("get_worker_details");
      expect(plan.requiredResponseObjectives).toEqual(["WORKER_DETAILS"]);
    });

    it("does not assume worker domain for 'tell me about Alex' without entity/domain anchor", () => {
      const plan = turnPlanner.planTurn("tell me about Alex", emptyState);
      expect(plan.requiredReadTools).toEqual([]);
      expect(plan.allowedTools).toEqual([]);
      expect(plan.objectives).not.toContain("WORKER_DETAILS");
      expect(plan.objectives).not.toContain("SEARCH_WORKERS");
      expect(plan.isConversational).toBe(true);
    });
  });
});
