import { describe, it, expect, beforeEach } from "vitest";
import { MockOslavaGateway } from "../../../src/dev/mock-oslava.gateway.js";
import { MemoryActionRepository } from "../../../src/persistence/memory/memory-action.repository.js";
import { ActionProposalService } from "../../../src/actions/action-proposal.service.js";
import { ActionConfirmationService } from "../../../src/actions/action-confirmation.service.js";
import { ActionExecutionService } from "../../../src/actions/action-execution.service.js";
import { InMemoryChatStore } from "../../../src/persistence/memory/in-memory-store.js";
import { MemorySessionRepository } from "../../../src/persistence/memory/memory-session.repository.js";
import { MemoryMessageRepository } from "../../../src/persistence/memory/memory-message.repository.js";
import { ConversationService } from "../../../src/context/conversation.service.js";
import {
  ActionAlreadyResolvedError,
  ActionExpiredError,
  ActionForbiddenError,
  ActionStaleError,
} from "../../../src/domain/errors.js";

describe("Security: Write Safety Regression Matrix", () => {
  let mockGateway: MockOslavaGateway;
  let store: InMemoryChatStore;
  let actionRepo: MemoryActionRepository;
  let proposalService: ActionProposalService;
  let executionService: ActionExecutionService;
  let convService: ConversationService;
  let confirmationService: ActionConfirmationService;

  const adminUserId = "usr_admin_owner";
  const otherUserId = "usr_admin_attacker";
  let sessionId: string;

  beforeEach(async () => {
    mockGateway = new MockOslavaGateway();
    store = new InMemoryChatStore();
    actionRepo = new MemoryActionRepository(store);
    proposalService = new ActionProposalService(actionRepo);
    executionService = new ActionExecutionService();
    convService = new ConversationService(
      new MemorySessionRepository(store),
      new MemoryMessageRepository(store),
    );
    confirmationService = new ActionConfirmationService(
      actionRepo,
      executionService,
      convService,
    );

    const session = await convService.createSession(adminUserId);
    sessionId = session.id;
  });

  describe("1. change_worker_category write safety", () => {
    const workerId = "22222222-2222-4222-8222-222222222222"; // Arif Khan in mock-data (Category B, ACTIVE)

    it("proposing category change stages action and does NOT mutate worker in gateway", async () => {
      const pending = await proposalService.proposeAction({
        sessionId,
        userId: adminUserId,
        actionType: "change_worker_category",
        args: { worker_id: workerId, new_category: "A", reason: "Demonstrated exceptional leadership" },
        gateway: mockGateway as any,
        createdRequestId: "req_prop_1",
      });

      expect(pending.status).toBe("PENDING");
      expect(pending.expectedState).toMatchObject({
        currentCategory: "B",
        accountStatus: "ACTIVE",
      });

      // Verify Gateway worker remains Category B
      const worker = await mockGateway.getWorkerDetail(workerId);
      expect(worker.category).toBe("B");
    });

    it("executes mutation only upon explicit confirmation and verifies read-after-write", async () => {
      const pending = await proposalService.proposeAction({
        sessionId,
        userId: adminUserId,
        actionType: "change_worker_category",
        args: { worker_id: workerId, new_category: "A", reason: "Performance review" },
        gateway: mockGateway as any,
        createdRequestId: "req_prop_2",
      });

      const confirmResult = await confirmationService.confirmAction({
        actionId: pending.id,
        userId: adminUserId,
        gateway: mockGateway as any,
        requestId: "req_conf_2",
      });

      expect(confirmResult.status).toBe("SUCCEEDED");

      // Verify Gateway worker is now mutated to A
      const worker = await mockGateway.getWorkerDetail(workerId);
      expect(worker.category).toBe("A");
    });

    it("blocks duplicate confirmation attempts with ActionAlreadyResolvedError", async () => {
      const pending = await proposalService.proposeAction({
        sessionId,
        userId: adminUserId,
        actionType: "change_worker_category",
        args: { worker_id: workerId, new_category: "A", reason: "Performance review" },
        gateway: mockGateway as any,
        createdRequestId: "req_prop_3",
      });

      await confirmationService.confirmAction({
        actionId: pending.id,
        userId: adminUserId,
        gateway: mockGateway as any,
        requestId: "req_conf_3a",
      });

      // Second confirm must fail
      await expect(
        confirmationService.confirmAction({
          actionId: pending.id,
          userId: adminUserId,
          gateway: mockGateway as any,
          requestId: "req_conf_3b",
        }),
      ).rejects.toThrowError(ActionAlreadyResolvedError);
    });

    it("handles concurrent confirmation race atomically, allowing exactly one execution", async () => {
      const pending = await proposalService.proposeAction({
        sessionId,
        userId: adminUserId,
        actionType: "change_worker_category",
        args: { worker_id: workerId, new_category: "A", reason: "Performance review" },
        gateway: mockGateway as any,
        createdRequestId: "req_prop_4",
      });

      // Simultaneously trigger two confirmation promises
      const results = await Promise.allSettled([
        confirmationService.confirmAction({
          actionId: pending.id,
          userId: adminUserId,
          gateway: mockGateway as any,
          requestId: "req_conf_race_1",
        }),
        confirmationService.confirmAction({
          actionId: pending.id,
          userId: adminUserId,
          gateway: mockGateway as any,
          requestId: "req_conf_race_2",
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        ActionAlreadyResolvedError,
      );
    });

    it("cancels action and prevents subsequent mutation", async () => {
      const pending = await proposalService.proposeAction({
        sessionId,
        userId: adminUserId,
        actionType: "change_worker_category",
        args: { worker_id: workerId, new_category: "A", reason: "Performance review" },
        gateway: mockGateway as any,
        createdRequestId: "req_prop_5",
      });

      const cancelResult = await confirmationService.cancelAction({
        actionId: pending.id,
        userId: adminUserId,
        reason: "Admin cancelled manually",
      });

      expect(cancelResult.status).toBe("CANCELLED");

      // Verify worker remains B
      const worker = await mockGateway.getWorkerDetail(workerId);
      expect(worker.category).toBe("B");

      // Attempting to confirm cancelled action must fail
      await expect(
        confirmationService.confirmAction({
          actionId: pending.id,
          userId: adminUserId,
          gateway: mockGateway as any,
          requestId: "req_conf_cancelled",
        }),
      ).rejects.toThrowError(ActionAlreadyResolvedError);
    });

    it("aborts execution with ActionStaleError when underlying worker state changed out-of-band", async () => {
      const pending = await proposalService.proposeAction({
        sessionId,
        userId: adminUserId,
        actionType: "change_worker_category",
        args: { worker_id: workerId, new_category: "A", reason: "Performance review" },
        gateway: mockGateway as any,
        createdRequestId: "req_prop_6",
      });

      // Out-of-band external change: Worker was demoted to C or suspended
      mockGateway.workerDetails[workerId].category = "C";

      await expect(
        confirmationService.confirmAction({
          actionId: pending.id,
          userId: adminUserId,
          gateway: mockGateway as any,
          requestId: "req_conf_stale",
        }),
      ).rejects.toThrowError(ActionStaleError);

      const action = await actionRepo.getActionById(pending.id);
      expect(action?.status).toBe("STALE");
    });

    it("rejects confirmation by a different user with ActionForbiddenError", async () => {
      const pending = await proposalService.proposeAction({
        sessionId,
        userId: adminUserId,
        actionType: "change_worker_category",
        args: { worker_id: workerId, new_category: "A", reason: "Performance review" },
        gateway: mockGateway as any,
        createdRequestId: "req_prop_7",
      });

      await expect(
        confirmationService.confirmAction({
          actionId: pending.id,
          userId: otherUserId, // Attacker or different admin
          gateway: mockGateway as any,
          requestId: "req_conf_forbidden",
        }),
      ).rejects.toThrowError(ActionForbiddenError);
    });

    it("rejects confirmation when TTL has expired", async () => {
      const pending = await proposalService.proposeAction({
        sessionId,
        userId: adminUserId,
        actionType: "change_worker_category",
        args: { worker_id: workerId, new_category: "A", reason: "Performance review" },
        gateway: mockGateway as any,
        createdRequestId: "req_prop_8",
      });

      // Force expiration into the past
      await actionRepo.updateActionStatus(pending.id, {
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        confirmationService.confirmAction({
          actionId: pending.id,
          userId: adminUserId,
          gateway: mockGateway as any,
          requestId: "req_conf_expired",
        }),
      ).rejects.toThrowError(ActionExpiredError);
    });
  });

  describe("2. publish_event write safety", () => {
    const draftEventId = "eeee5555-5555-4eee-8eee-555555555555"; // Tech Conference in mock-data (DRAFT)

    it("proposing publish does NOT mutate event status in gateway", async () => {
      const pending = await proposalService.proposeAction({
        sessionId,
        userId: adminUserId,
        actionType: "publish_event",
        args: { event_id: draftEventId, reason: "Staffing confirmed" },
        gateway: mockGateway as any,
        createdRequestId: "req_pub_prop_1",
      });

      expect(pending.status).toBe("PENDING");

      // Verify event is still DRAFT
      const event = await mockGateway.getAdminEventDetail(draftEventId);
      expect(event.event_status).toBe("DRAFT");
    });

    it("publishes event upon confirmation and increments version", async () => {
      const pending = await proposalService.proposeAction({
        sessionId,
        userId: adminUserId,
        actionType: "publish_event",
        args: { event_id: draftEventId, reason: "Staffing confirmed" },
        gateway: mockGateway as any,
        createdRequestId: "req_pub_prop_2",
      });

      const result = await confirmationService.confirmAction({
        actionId: pending.id,
        userId: adminUserId,
        gateway: mockGateway as any,
        requestId: "req_pub_conf_2",
      });

      expect(result.status).toBe("SUCCEEDED");

      // Verify event is published
      const event = await mockGateway.getAdminEventDetail(draftEventId);
      expect(["PUBLISHED", "UPCOMING"]).toContain(event.event_status);
      expect(event.version).toBe(2);
    });
  });

  describe("3. complete_event & close_event write safety", () => {
    it("completes an in-progress event upon explicit confirmation", async () => {
      // Set an event to IN_PROGRESS
      const eventId = "33333333-3333-4333-8333-333333333333";
      mockGateway.eventDetails[eventId] = {
        ...mockGateway.eventDetails["11111111-1111-4111-8111-111111111111"],
        id: eventId,
        event_status: "IN_PROGRESS",
        version: 2,
      };

      const pending = await proposalService.proposeAction({
        sessionId,
        userId: adminUserId,
        actionType: "complete_event",
        args: { event_id: eventId, reason: "Event schedule concluded" },
        gateway: mockGateway as any,
        createdRequestId: "req_comp_prop_1",
      });

      const result = await confirmationService.confirmAction({
        actionId: pending.id,
        userId: adminUserId,
        gateway: mockGateway as any,
        requestId: "req_comp_conf_1",
      });

      expect(result.status).toBe("SUCCEEDED");
      const event = await mockGateway.getAdminEventDetail(eventId);
      expect(event.event_status).toBe("COMPLETED");
      expect(event.version).toBe(3);
    });

    it("closes a completed event upon explicit confirmation", async () => {
      const eventId = "44444444-4444-4444-8444-444444444444";
      mockGateway.eventDetails[eventId] = {
        ...mockGateway.eventDetails["11111111-1111-4111-8111-111111111111"],
        id: eventId,
        event_status: "COMPLETED",
        version: 3,
      };

      const pending = await proposalService.proposeAction({
        sessionId,
        userId: adminUserId,
        actionType: "close_event",
        args: { event_id: eventId, reason: "Post-event settlement finished" },
        gateway: mockGateway as any,
        createdRequestId: "req_close_prop_1",
      });

      const result = await confirmationService.confirmAction({
        actionId: pending.id,
        userId: adminUserId,
        gateway: mockGateway as any,
        requestId: "req_close_conf_1",
      });

      expect(result.status).toBe("SUCCEEDED");
      const event = await mockGateway.getAdminEventDetail(eventId);
      expect(event.event_status).toBe("CLOSED");
      expect(event.version).toBe(4);
    });
  });

  describe("4. In-Memory vs Postgres Persistence restart semantics", () => {
    it("memory mode store starts completely empty on process restart", () => {
      // Simulates server restart by instantiating new store
      const freshStore = new InMemoryChatStore();
      const freshActionRepo = new MemoryActionRepository(freshStore);

      expect(freshStore.actions).toHaveLength(0);
      expect(freshStore.sessions).toHaveLength(0);
    });
  });
});
