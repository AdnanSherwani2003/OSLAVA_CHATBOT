import { describe, it, expect } from "vitest";
import { turnPlanner } from "../../../src/ai/turn-planner.js";
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
    expect(plan.objectives).toContain("DASHBOARD");
    expect(plan.requiredReadTools).toContain("get_dashboard");
    expect(plan.isUnsupported).toBe(false);
  });

  it("Scenario 2: 'Find worker Arif.' -> requires search_workers", () => {
    const plan = turnPlanner.planTurn("Find worker Arif.", emptyState);
    expect(plan.objectives).toContain("SEARCH_WORKERS");
    expect(plan.requiredReadTools).toContain("search_workers");
    expect(plan.isUnsupported).toBe(false);
  });

  it("Scenario 3: 'Show Arif's details.' -> requires search_workers when unresolved then get_worker_details", () => {
    const plan = turnPlanner.planTurn("Show Arif's details.", emptyState);
    expect(plan.objectives).toContain("WORKER_DETAILS");
    expect(plan.requiredReadTools).toContain("search_workers");
    expect(plan.requiredReadTools).toContain("get_worker_details");
  });

  it("Scenario 4: 'Show Arif's history.' -> requires search_workers when unresolved then get_worker_history", () => {
    const plan = turnPlanner.planTurn("Show Arif's history.", emptyState);
    expect(plan.objectives).toContain("WORKER_HISTORY");
    expect(plan.requiredReadTools).toContain("search_workers");
    expect(plan.requiredReadTools).toContain("get_worker_history");
  });

  it("Scenario 5: 'Find Arif and show his details and history.' -> compound objectives satisfied", () => {
    const plan = turnPlanner.planTurn("Find Arif and show his details and history.", emptyState);
    expect(plan.objectives).toContain("WORKER_HISTORY");
    expect(plan.objectives).toContain("WORKER_DETAILS");
    expect(plan.requiredReadTools).toContain("search_workers");
    expect(plan.requiredReadTools).toContain("get_worker_details");
    expect(plan.requiredReadTools).toContain("get_worker_history");
  });

  it("Scenario 6: 'Tell me about VM Hall event.' -> search_events when unresolved then get_event_details", () => {
    const plan = turnPlanner.planTurn("Tell me about VM Hall event.", emptyState);
    expect(plan.objectives).toContain("EVENT_DETAILS");
    expect(plan.requiredReadTools).toContain("search_events");
    expect(plan.requiredReadTools).toContain("get_event_details");
  });

  it("Scenario 7: 'Give me VM Hall's event report.' -> search_events when unresolved then get_event_report", () => {
    const plan = turnPlanner.planTurn("Give me VM Hall's event report.", emptyState);
    expect(plan.objectives).toContain("EVENT_REPORT");
    expect(plan.requiredReadTools).toContain("search_events");
    expect(plan.requiredReadTools).toContain("get_event_report");
  });

  it("Scenario 8: 'What's happening today and show VM Hall's report.' -> compound objectives for today and report", () => {
    const plan = turnPlanner.planTurn("What's happening today and show VM Hall's report.", emptyState);
    expect(plan.objectives).toContain("DASHBOARD");
    expect(plan.objectives).toContain("EVENT_REPORT");
    expect(plan.requiredReadTools).toContain("get_event_report");
  });

  it("Scenario 9: 'Assign workers to today's event.' -> standard unsupported refusal flag", () => {
    const plan = turnPlanner.planTurn("Assign workers to today's event.", emptyState);
    expect(plan.isUnsupported).toBe(true);
    expect(plan.objectives).toContain("UNSUPPORTED_INTENT");
    expect(plan.requiredReadTools).toHaveLength(0);
  });

  it("Scenario 10: Grounded context -> does not add redundant search prerequisite", () => {
    const groundedWorkerState: SessionState = {
      ...emptyState,
      currentWorkerId: "12345678-1234-1234-1234-123456789abc",
      currentWorkerLabel: "Arif Khan",
    };

    const plan = turnPlanner.planTurn("Show his history.", groundedWorkerState);
    expect(plan.workerGrounded).toBe(true);
    expect(plan.objectives).toContain("WORKER_HISTORY");
    // Since worker is already grounded, search_workers is not required
    expect(plan.requiredReadTools).not.toContain("search_workers");
    expect(plan.requiredReadTools).toContain("get_worker_history");
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
});
