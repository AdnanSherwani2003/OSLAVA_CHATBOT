import { describe, it, expect, beforeEach } from "vitest";
import { ActionProposalService } from "../../../src/actions/action-proposal.service.js";
import { MemoryActionRepository } from "../../../src/persistence/memory/memory-action.repository.js";
import { MockOslavaGateway } from "../../../src/dev/mock-oslava.gateway.js";
import {
  DomainRejectedError,
  PendingActionExistsError,
} from "../../../src/domain/errors.js";

describe("ActionProposalService", () => {
  let actionRepo: MemoryActionRepository;
  let proposalService: ActionProposalService;
  let gateway: MockOslavaGateway;

  const sessionId = "session-test-proposal-1";
  const userId = "00000000-0000-4000-8000-000000000001";
  const requestId = "req-test-proposal-1";

  // Real mock IDs from mock-data.ts
  const arifAhmedId = "22222222-2222-4222-8222-222222222222"; // Category B, ACTIVE
  const suspendedWorkerId = "44444444-4444-4444-8444-444444444444"; // Category A, SUSPENDED

  const draftEventId = "eeee5555-5555-4eee-8eee-555555555555"; // DRAFT, v1
  const inProgressEventId = "aaaa1111-1111-4aaa-8aaa-111111111111"; // IN_PROGRESS, v1
  const completedEventId = "dddd4444-4444-4ddd-8ddd-444444444444"; // COMPLETED, v1

  beforeEach(async () => {
    actionRepo = new MemoryActionRepository();
    await actionRepo.clear();
    proposalService = new ActionProposalService(actionRepo);
    gateway = new MockOslavaGateway();
    gateway.resetMockData();
  });

  describe("change_worker_category proposals", () => {
    it("successfully proposes a valid 1-step category change (B -> A)", async () => {
      const action = await proposalService.proposeAction({
        sessionId,
        userId,
        actionType: "change_worker_category",
        args: {
          worker_id: arifAhmedId,
          new_category: "A",
          reason: "Consistently excellent punctuality and performance ratings",
          notes: "Reviewed by Lead Coordinator",
        },
        gateway,
        createdRequestId: requestId,
      });

      expect(action).toBeDefined();
      expect(action.id).toBeDefined();
      expect(action.actionType).toBe("change_worker_category");
      expect(action.status).toBe("PENDING");
      expect(action.expectedState).toEqual({
        workerId: arifAhmedId,
        currentCategory: "B",
        accountStatus: "ACTIVE",
      });
      expect(action.displaySummary).toMatchObject({
        action: "Change Worker Category",
        workerName: "Arif Ahmed",
        currentCategory: "B",
        newCategory: "A",
        reason: "Consistently excellent punctuality and performance ratings",
      });
      expect(new Date(action.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it("successfully proposes a valid 1-step demotion (B -> C)", async () => {
      const action = await proposalService.proposeAction({
        sessionId,
        userId,
        actionType: "change_worker_category",
        args: {
          worker_id: arifAhmedId,
          new_category: "C",
          reason: "Repeated tardiness across last 3 events",
        },
        gateway,
        createdRequestId: requestId,
      });

      expect(action.status).toBe("PENDING");
      expect(action.expectedState.currentCategory).toBe("B");
      expect(action.arguments.new_category).toBe("C");
    });

    it("rejects multi-step jump from B to F (difference is 2 steps)", async () => {
      await expect(
        proposalService.proposeAction({
          sessionId,
          userId,
          actionType: "change_worker_category",
          args: {
            worker_id: arifAhmedId,
            new_category: "F",
            reason: "Demoting directly to F",
          },
          gateway,
          createdRequestId: requestId,
        }),
      ).rejects.toThrow(DomainRejectedError);
    });

    it("rejects same-category proposal (B -> B)", async () => {
      await expect(
        proposalService.proposeAction({
          sessionId,
          userId,
          actionType: "change_worker_category",
          args: {
            worker_id: arifAhmedId,
            new_category: "B",
            reason: "No actual change",
          },
          gateway,
          createdRequestId: requestId,
        }),
      ).rejects.toThrow(DomainRejectedError);
    });

    it("rejects reason with fewer than 3 characters", async () => {
      await expect(
        proposalService.proposeAction({
          sessionId,
          userId,
          actionType: "change_worker_category",
          args: {
            worker_id: arifAhmedId,
            new_category: "A",
            reason: "ok",
          },
          gateway,
          createdRequestId: requestId,
        }),
      ).rejects.toThrow();
    });

    it("rejects proposal for non-active worker", async () => {
      await expect(
        proposalService.proposeAction({
          sessionId,
          userId,
          actionType: "change_worker_category",
          args: {
            worker_id: suspendedWorkerId,
            new_category: "B",
            reason: "Attempt promotion on suspended worker",
          },
          gateway,
          createdRequestId: requestId,
        }),
      ).rejects.toThrow(DomainRejectedError);
    });
  });

  describe("Event Write Intent Proposals", () => {
    it("successfully proposes publish_event on a DRAFT event", async () => {
      const action = await proposalService.proposeAction({
        sessionId,
        userId,
        actionType: "publish_event",
        args: {
          event_id: draftEventId,
          reason: "Roster finalized and ready for tier release",
        },
        gateway,
        createdRequestId: requestId,
      });

      expect(action.actionType).toBe("publish_event");
      expect(action.status).toBe("PENDING");
      expect(action.expectedState).toEqual({
        eventId: draftEventId,
        currentStatus: "DRAFT",
        version: 1,
      });
      expect(action.displaySummary).toMatchObject({
        action: "Publish Event",
        eventTitle: "Tech Conference",
        targetStatus: "PUBLISHED",
      });
    });

    it("rejects publish_event on non-draft event (e.g. COMPLETED)", async () => {
      await expect(
        proposalService.proposeAction({
          sessionId,
          userId,
          actionType: "publish_event",
          args: {
            event_id: completedEventId,
            reason: "Trying to publish a completed event",
          },
          gateway,
          createdRequestId: requestId,
        }),
      ).rejects.toThrow(DomainRejectedError);
    });

    it("successfully proposes complete_event on an IN_PROGRESS event", async () => {
      const action = await proposalService.proposeAction({
        sessionId,
        userId,
        actionType: "complete_event",
        args: {
          event_id: inProgressEventId,
          reason: "All shifts concluded and attendance captured",
        },
        gateway,
        createdRequestId: requestId,
      });

      expect(action.actionType).toBe("complete_event");
      expect(action.status).toBe("PENDING");
      expect(action.expectedState.currentStatus).toBe("IN_PROGRESS");
      expect(action.displaySummary.targetStatus).toBe("COMPLETED");
    });

    it("successfully proposes close_event on a COMPLETED event", async () => {
      const action = await proposalService.proposeAction({
        sessionId,
        userId,
        actionType: "close_event",
        args: {
          event_id: completedEventId,
          reason: "Final settlement and audit verified",
        },
        gateway,
        createdRequestId: requestId,
      });

      expect(action.actionType).toBe("close_event");
      expect(action.status).toBe("PENDING");
      expect(action.expectedState.currentStatus).toBe("COMPLETED");
      expect(action.displaySummary.targetStatus).toBe("CLOSED");
    });
  });

  describe("Single Active Pending Action Rule", () => {
    it("blocks proposing a new action when one is already active on the session", async () => {
      await proposalService.proposeAction({
        sessionId,
        userId,
        actionType: "publish_event",
        args: {
          event_id: draftEventId,
          reason: "First action proposed",
        },
        gateway,
        createdRequestId: requestId,
      });

      // Second proposal on same session should fail with PendingActionExistsError
      await expect(
        proposalService.proposeAction({
          sessionId,
          userId,
          actionType: "change_worker_category",
          args: {
            worker_id: arifAhmedId,
            new_category: "A",
            reason: "Second action proposed",
          },
          gateway,
          createdRequestId: "req-second",
        }),
      ).rejects.toThrow(PendingActionExistsError);
    });
  });
});
