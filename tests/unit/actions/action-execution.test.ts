import { describe, it, expect, beforeEach } from "vitest";
import { ActionExecutionService } from "../../../src/actions/action-execution.service.js";
import { MockOslavaGateway } from "../../../src/dev/mock-oslava.gateway.js";
import {
  ActionExecutionFailedError,
  ActionOutcomeUnknownError,
} from "../../../src/domain/errors.js";
import type { PendingActionRecord } from "../../../src/actions/action.types.js";

describe("ActionExecutionService", () => {
  let executionService: ActionExecutionService;
  let gateway: MockOslavaGateway;

  const arifAhmedId = "22222222-2222-4222-8222-222222222222";
  const draftEventId = "eeee5555-5555-4eee-8eee-555555555555";
  const inProgressEventId = "aaaa1111-1111-4aaa-8aaa-111111111111";
  const completedEventId = "dddd4444-4444-4ddd-8ddd-444444444444";

  beforeEach(() => {
    executionService = new ActionExecutionService();
    gateway = new MockOslavaGateway();
    gateway.resetMockData();
  });

  it("executes change_worker_category with read-after-write verification", async () => {
    const action: PendingActionRecord = {
      id: "act-exec-1",
      sessionId: "sess-1",
      userId: "user-1",
      actionType: "change_worker_category",
      status: "EXECUTING",
      arguments: {
        worker_id: arifAhmedId,
        new_category: "A",
        reason: "Valid operational reason",
      },
      expectedState: { currentCategory: "B" },
      displaySummary: {},
      createdRequestId: "req-1",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 600000),
    };

    const res = await executionService.executeAction(action, gateway, "req-exec-1");

    expect(res).toEqual({
      worker_id: arifAhmedId,
      old_category: "B",
      new_category: "A",
      status: "SUCCESS",
    });

    const refetched = await gateway.getWorkerDetail(arifAhmedId);
    expect(refetched.category).toBe("A");
  });

  it("throws ActionOutcomeUnknownError if read-after-write verification fails", async () => {
    const action: PendingActionRecord = {
      id: "act-exec-2",
      sessionId: "sess-1",
      userId: "user-1",
      actionType: "change_worker_category",
      status: "EXECUTING",
      arguments: {
        worker_id: arifAhmedId,
        new_category: "A",
        reason: "Reason",
      },
      expectedState: { currentCategory: "B" },
      displaySummary: {},
      createdRequestId: "req-1",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 600000),
    };

    // Simulate gateway mutation that didn't actually update worker category in DB
    gateway.changeWorkerCategory = async () => ({
      worker_id: arifAhmedId,
      old_category: "B",
      new_category: "A",
    });

    await expect(
      executionService.executeAction(action, gateway, "req-exec-2"),
    ).rejects.toThrow(ActionOutcomeUnknownError);
  });

  it("executes complete_event and verifies status is COMPLETED", async () => {
    const action: PendingActionRecord = {
      id: "act-exec-3",
      sessionId: "sess-1",
      userId: "user-1",
      actionType: "complete_event",
      status: "EXECUTING",
      arguments: {
        event_id: inProgressEventId,
        reason: "All shifts wrapped",
      },
      expectedState: { currentStatus: "IN_PROGRESS" },
      displaySummary: {},
      createdRequestId: "req-1",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 600000),
    };

    const res = await executionService.executeAction(action, gateway, "req-exec-3");

    expect(res).toMatchObject({
      event_id: inProgressEventId,
      old_status: "IN_PROGRESS",
      new_status: "COMPLETED",
      status: "SUCCESS",
    });

    const event = await gateway.getAdminEventDetail(inProgressEventId);
    expect(event.event_status).toBe("COMPLETED");
  });

  it("executes close_event and verifies status is CLOSED", async () => {
    const action: PendingActionRecord = {
      id: "act-exec-4",
      sessionId: "sess-1",
      userId: "user-1",
      actionType: "close_event",
      status: "EXECUTING",
      arguments: {
        event_id: completedEventId,
        reason: "Audit finalised",
      },
      expectedState: { currentStatus: "COMPLETED" },
      displaySummary: {},
      createdRequestId: "req-1",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 600000),
    };

    const res = await executionService.executeAction(action, gateway, "req-exec-4");

    expect(res).toMatchObject({
      event_id: completedEventId,
      old_status: "COMPLETED",
      new_status: "CLOSED",
      status: "SUCCESS",
    });

    const event = await gateway.getAdminEventDetail(completedEventId);
    expect(event.event_status).toBe("CLOSED");
  });

  it("throws ActionExecutionFailedError on unsupported action type", async () => {
    const action: PendingActionRecord = {
      id: "act-exec-5",
      sessionId: "sess-1",
      userId: "user-1",
      actionType: "unknown_mutation" as any,
      status: "EXECUTING",
      arguments: {},
      expectedState: {},
      displaySummary: {},
      createdRequestId: "req-1",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 600000),
    };

    await expect(
      executionService.executeAction(action, gateway, "req-exec-5"),
    ).rejects.toThrow(ActionExecutionFailedError);
  });
});
