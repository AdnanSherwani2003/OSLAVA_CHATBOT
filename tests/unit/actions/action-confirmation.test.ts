import { describe, it, expect, beforeEach } from "vitest";
import { ActionConfirmationService } from "../../../src/actions/action-confirmation.service.js";
import { ActionProposalService } from "../../../src/actions/action-proposal.service.js";
import { ActionExecutionService } from "../../../src/actions/action-execution.service.js";
import { MemoryActionRepository } from "../../../src/persistence/memory/memory-action.repository.js";
import { MockOslavaGateway } from "../../../src/dev/mock-oslava.gateway.js";
import { ConversationService } from "../../../src/context/conversation.service.js";
import { MemorySessionRepository } from "../../../src/persistence/memory/memory-session.repository.js";
import { MemoryMessageRepository } from "../../../src/persistence/memory/memory-message.repository.js";
import { MemoryStateRepository } from "../../../src/persistence/memory/memory-state.repository.js";
import { MemoryTraceRepository } from "../../../src/persistence/memory/memory-trace.repository.js";
import {
  ActionAlreadyResolvedError,
  ActionExpiredError,
  ActionForbiddenError,
  ActionNotFoundError,
  ActionStaleError,
} from "../../../src/domain/errors.js";

describe("ActionConfirmationService", () => {
  let actionRepo: MemoryActionRepository;
  let proposalService: ActionProposalService;
  let executionService: ActionExecutionService;
  let convService: ConversationService;
  let confirmationService: ActionConfirmationService;
  let gateway: MockOslavaGateway;

  const sessionId = "session-test-confirm-1";
  const userId = "00000000-0000-4000-8000-000000000001";
  const otherUserId = "00000000-0000-4000-8000-000000000002";
  const requestId = "req-test-confirm-1";

  // Real mock IDs from mock-data.ts
  const arifAhmedId = "22222222-2222-4222-8222-222222222222"; // Category B, ACTIVE
  const draftEventId = "eeee5555-5555-4eee-8eee-555555555555"; // DRAFT, v1
  const inProgressEventId = "aaaa1111-1111-4aaa-8aaa-111111111111"; // IN_PROGRESS, v1

  beforeEach(async () => {
    actionRepo = new MemoryActionRepository();
    await actionRepo.clear();
    proposalService = new ActionProposalService(actionRepo);
    executionService = new ActionExecutionService();
    convService = new ConversationService(
      new MemorySessionRepository(),
      new MemoryMessageRepository(),
      new MemoryStateRepository(),
      new MemoryTraceRepository(),
    );
    confirmationService = new ActionConfirmationService(
      actionRepo,
      executionService,
      convService,
    );
    gateway = new MockOslavaGateway();
    gateway.resetMockData();
  });

  describe("confirmAction", () => {
    it("successfully confirms and executes change_worker_category", async () => {
      // 1. Propose action: Arif Ahmed B -> A
      const proposed = await proposalService.proposeAction({
        sessionId,
        userId,
        actionType: "change_worker_category",
        args: {
          worker_id: arifAhmedId,
          new_category: "A",
          reason: "Outstanding event leadership",
        },
        gateway,
        createdRequestId: requestId,
      });

      // Verify worker is initially category B
      const initialWorker = await gateway.getWorkerDetail(arifAhmedId);
      expect(initialWorker.category).toBe("B");

      // 2. Confirm action
      const result = await confirmationService.confirmAction({
        actionId: proposed.id,
        userId,
        gateway,
        requestId: "confirm-req-1",
      });

      expect(result.status).toBe("SUCCEEDED");
      expect(result.actionType).toBe("change_worker_category");
      expect(result.resultSummary).toMatchObject({
        old_category: "B",
        new_category: "A",
        status: "SUCCESS",
      });

      // 3. Verify underlying worker category is now mutated to A
      const updatedWorker = await gateway.getWorkerDetail(arifAhmedId);
      expect(updatedWorker.category).toBe("A");

      // 4. Verify record in action repository is SUCCEEDED
      const record = await actionRepo.getActionById(proposed.id);
      expect(record?.status).toBe("SUCCEEDED");
      expect(record?.confirmedAt).toBeDefined();
      expect(record?.executedAt).toBeDefined();
      expect(record?.executionRequestId).toBe("confirm-req-1");
    });

    it("successfully confirms and executes publish_event", async () => {
      const proposed = await proposalService.proposeAction({
        sessionId,
        userId,
        actionType: "publish_event",
        args: {
          event_id: draftEventId,
          reason: "Approved by operations director",
        },
        gateway,
        createdRequestId: requestId,
      });

      const result = await confirmationService.confirmAction({
        actionId: proposed.id,
        userId,
        gateway,
        requestId: "confirm-req-publish",
      });

      expect(result.status).toBe("SUCCEEDED");
      expect(result.resultSummary).toMatchObject({
        new_status: "PUBLISHED",
        version: 2,
        status: "SUCCESS",
      });

      // Verify event is now PUBLISHED in gateway
      const event = await gateway.getAdminEventDetail(draftEventId);
      expect(event.event_status).toBe("PUBLISHED");
      expect(event.version).toBe(2);
    });

    it("rejects confirmation if action ID does not exist", async () => {
      await expect(
        confirmationService.confirmAction({
          actionId: "00000000-0000-4000-0000-000000000099",
          userId,
          gateway,
          requestId: "req-99",
        }),
      ).rejects.toThrow(ActionNotFoundError);
    });

    it("rejects confirmation if caller is not the action owner", async () => {
      const proposed = await proposalService.proposeAction({
        sessionId,
        userId,
        actionType: "publish_event",
        args: {
          event_id: draftEventId,
          reason: "Publish test",
        },
        gateway,
        createdRequestId: requestId,
      });

      await expect(
        confirmationService.confirmAction({
          actionId: proposed.id,
          userId: otherUserId, // Non-owner
          gateway,
          requestId: "req-unauthorized",
        }),
      ).rejects.toThrow(ActionForbiddenError);
    });

    it("rejects confirmation on already resolved action", async () => {
      const proposed = await proposalService.proposeAction({
        sessionId,
        userId,
        actionType: "publish_event",
        args: {
          event_id: draftEventId,
          reason: "Publish test",
        },
        gateway,
        createdRequestId: requestId,
      });

      // First confirm succeeds
      await confirmationService.confirmAction({
        actionId: proposed.id,
        userId,
        gateway,
        requestId: "req-first",
      });

      // Second confirm fails (already resolved)
      await expect(
        confirmationService.confirmAction({
          actionId: proposed.id,
          userId,
          gateway,
          requestId: "req-second",
        }),
      ).rejects.toThrow(ActionAlreadyResolvedError);
    });

    it("rejects confirmation if action has expired", async () => {
      const proposed = await actionRepo.createAction({
        sessionId,
        userId,
        actionType: "publish_event",
        arguments: {
          event_id: draftEventId,
          reason: "Expired action",
        },
        expectedState: { currentStatus: "DRAFT", version: 1 },
        displaySummary: { title: "Test Event" },
        createdRequestId: requestId,
        expiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
      });

      await expect(
        confirmationService.confirmAction({
          actionId: proposed.id,
          userId,
          gateway,
          requestId: "req-expired",
        }),
      ).rejects.toThrow(ActionExpiredError);

      const record = await actionRepo.getActionById(proposed.id);
      expect(record?.status).toBe("EXPIRED");
    });

    it("detects stale worker state and aborts with ActionStaleError", async () => {
      // 1. Propose B -> A
      const proposed = await proposalService.proposeAction({
        sessionId,
        userId,
        actionType: "change_worker_category",
        args: {
          worker_id: arifAhmedId,
          new_category: "A",
          reason: "Promotion proposed",
        },
        gateway,
        createdRequestId: requestId,
      });

      // 2. Simulate outside state change before confirmation:
      // Category demoted to C by another admin
      gateway.workerDetails[arifAhmedId].category = "C";

      // 3. Confirm should fail due to stale expected state (was B, now C)
      await expect(
        confirmationService.confirmAction({
          actionId: proposed.id,
          userId,
          gateway,
          requestId: "req-confirm-stale",
        }),
      ).rejects.toThrow(ActionStaleError);

      const record = await actionRepo.getActionById(proposed.id);
      expect(record?.status).toBe("STALE");
    });

    it("detects stale event state (version/status changed) and aborts", async () => {
      // 1. Propose complete_event on In-Progress Event (v1)
      const proposed = await proposalService.proposeAction({
        sessionId,
        userId,
        actionType: "complete_event",
        args: {
          event_id: inProgressEventId,
          reason: "Shift completed",
        },
        gateway,
        createdRequestId: requestId,
      });

      // 2. Simulate outside version bump or status change
      gateway.eventDetails[inProgressEventId].version += 1;

      // 3. Confirm should detect stale version and abort
      await expect(
        confirmationService.confirmAction({
          actionId: proposed.id,
          userId,
          gateway,
          requestId: "req-confirm-stale-event",
        }),
      ).rejects.toThrow(ActionStaleError);

      const record = await actionRepo.getActionById(proposed.id);
      expect(record?.status).toBe("STALE");
    });
  });

  describe("cancelAction", () => {
    it("successfully cancels a pending action", async () => {
      const proposed = await proposalService.proposeAction({
        sessionId,
        userId,
        actionType: "publish_event",
        args: {
          event_id: draftEventId,
          reason: "Publish test",
        },
        gateway,
        createdRequestId: requestId,
      });

      const cancelResult = await confirmationService.cancelAction({
        actionId: proposed.id,
        userId,
        reason: "User cancelled proposal",
      });

      expect(cancelResult.status).toBe("CANCELLED");

      const record = await actionRepo.getActionById(proposed.id);
      expect(record?.status).toBe("CANCELLED");
      expect(record?.cancelledAt).toBeDefined();
    });

    it("rejects cancellation by non-owner user", async () => {
      const proposed = await proposalService.proposeAction({
        sessionId,
        userId,
        actionType: "publish_event",
        args: {
          event_id: draftEventId,
          reason: "Publish test",
        },
        gateway,
        createdRequestId: requestId,
      });

      await expect(
        confirmationService.cancelAction({
          actionId: proposed.id,
          userId: otherUserId,
        }),
      ).rejects.toThrow(ActionForbiddenError);
    });
  });
});
