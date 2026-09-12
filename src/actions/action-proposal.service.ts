import { getConfig } from "../config/env.js";
import { WorkerCategory } from "../domain/auth.types.js";
import {
  DomainRejectedError,
  PendingActionExistsError,
} from "../domain/errors.js";
import { OslavaGateway } from "../integrations/supabase/oslava.gateway.js";
import {
  IActionRepository,
  actionRepository,
} from "../persistence/repositories/action.repository.js";
import {
  closeEventInputSchema,
  completeEventInputSchema,
  publishEventInputSchema,
  changeWorkerCategoryInputSchema,
} from "./action.schemas.js";
import { ActionType, PendingActionRecord } from "./action.types.js";
import { metrics } from "../observability/metrics.js";

const CATEGORY_RANKS: Record<WorkerCategory, number> = {
  A: 1,
  B: 2,
  C: 3,
  F: 4,
};

export interface ProposeActionParams {
  sessionId: string;
  userId: string;
  actionType: ActionType;
  args: Record<string, unknown>;
  gateway: OslavaGateway;
  createdRequestId: string;
}

export class ActionProposalService {
  constructor(
    private readonly actionRepo: IActionRepository = actionRepository,
  ) {}

  public async proposeAction(
    params: ProposeActionParams,
  ): Promise<PendingActionRecord> {
    const { sessionId, userId, actionType, args, gateway, createdRequestId } =
      params;

    // Rule: Check if an active pending action already exists for this session
    const existingPending =
      await this.actionRepo.getActivePendingActionBySession(sessionId);
    if (existingPending) {
      throw new PendingActionExistsError();
    }

    let expectedState: Record<string, unknown>;
    let displaySummary: Record<string, unknown>;

    switch (actionType) {
      case "change_worker_category": {
        const parsed = changeWorkerCategoryInputSchema.parse(args);
        const worker = await gateway.getWorkerDetail(parsed.worker_id);

        if (worker.account_status !== "ACTIVE") {
          throw new DomainRejectedError(
            "Category changes require an active Worker account.",
          );
        }

        if (!worker.category) {
          throw new DomainRejectedError(
            "Target worker has no active category.",
          );
        }

        if (worker.category === parsed.new_category) {
          throw new DomainRejectedError(
            "New category must differ from current category.",
          );
        }

        const currentRank = CATEGORY_RANKS[worker.category as WorkerCategory];
        const newRank = CATEGORY_RANKS[parsed.new_category as WorkerCategory];
        if (
          currentRank === undefined ||
          newRank === undefined ||
          Math.abs(currentRank - newRank) !== 1
        ) {
          throw new DomainRejectedError(
            "Category changes must move exactly one step (A <-> B <-> C <-> F).",
          );
        }

        expectedState = {
          workerId: parsed.worker_id,
          currentCategory: worker.category,
          accountStatus: worker.account_status,
        };

        displaySummary = {
          action: "Change Worker Category",
          workerId: parsed.worker_id,
          workerName: worker.full_name,
          workerNumber: worker.worker_number,
          currentCategory: worker.category,
          newCategory: parsed.new_category,
          reason: parsed.reason,
          notes: parsed.notes ?? null,
        };
        break;
      }

      case "publish_event": {
        const parsed = publishEventInputSchema.parse(args);
        const event = await gateway.getAdminEventDetail(parsed.event_id);

        if (event.event_status !== "DRAFT") {
          throw new DomainRejectedError(
            `Cannot publish event '${event.title}': event is in status '${event.event_status}', expected 'DRAFT'.`,
          );
        }

        expectedState = {
          eventId: parsed.event_id,
          currentStatus: event.event_status,
          version: event.version,
        };

        displaySummary = {
          action: "Publish Event",
          eventId: parsed.event_id,
          eventTitle: event.title,
          currentStatus: event.event_status,
          targetStatus: "PUBLISHED",
          version: event.version,
          reason: parsed.reason,
        };
        break;
      }

      case "complete_event": {
        const parsed = completeEventInputSchema.parse(args);
        const event = await gateway.getAdminEventDetail(parsed.event_id);

        if (event.event_status !== "IN_PROGRESS") {
          throw new DomainRejectedError(
            `Cannot complete event '${event.title}': event is in status '${event.event_status}', expected 'IN_PROGRESS'.`,
          );
        }

        expectedState = {
          eventId: parsed.event_id,
          currentStatus: event.event_status,
          version: event.version,
        };

        displaySummary = {
          action: "Complete Event",
          eventId: parsed.event_id,
          eventTitle: event.title,
          currentStatus: event.event_status,
          targetStatus: "COMPLETED",
          version: event.version,
          reason: parsed.reason,
        };
        break;
      }

      case "close_event": {
        const parsed = closeEventInputSchema.parse(args);
        const event = await gateway.getAdminEventDetail(parsed.event_id);

        if (event.event_status !== "COMPLETED") {
          throw new DomainRejectedError(
            `Cannot close event '${event.title}': event is in status '${event.event_status}', expected 'COMPLETED'.`,
          );
        }

        expectedState = {
          eventId: parsed.event_id,
          currentStatus: event.event_status,
          version: event.version,
        };

        displaySummary = {
          action: "Close Event",
          eventId: parsed.event_id,
          eventTitle: event.title,
          currentStatus: event.event_status,
          targetStatus: "CLOSED",
          version: event.version,
          reason: parsed.reason,
        };
        break;
      }

      default:
        throw new DomainRejectedError(
          `Unsupported action type '${actionType}'.`,
        );
    }

    const env = getConfig();
    const expiresAt = new Date(
      Date.now() + env.ACTION_CONFIRMATION_TTL_SECONDS * 1000,
    );

    metrics.recordActionProposed(actionType);

    return await this.actionRepo.createAction({
      sessionId,
      userId,
      actionType,
      arguments: args,
      expectedState,
      displaySummary,
      createdRequestId,
      expiresAt,
    });
  }
}

export const actionProposalService = new ActionProposalService();
