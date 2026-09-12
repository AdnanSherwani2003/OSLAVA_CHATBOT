import {
  ActionExecutionFailedError,
  ActionOutcomeUnknownError,
  AppError,
} from "../domain/errors.js";
import { OslavaGateway } from "../integrations/supabase/oslava.gateway.js";
import { logger } from "../observability/logger.js";
import { PendingActionRecord } from "./action.types.js";

/**
 * Server-only execution service for confirmed administrative actions.
 * NOTE: This service must NEVER be exposed or reachable by LLM/agent tools.
 */
export class ActionExecutionService {
  public async executeAction(
    action: PendingActionRecord,
    gateway: OslavaGateway,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    logger.info(
      {
        actionId: action.id,
        actionType: action.actionType,
        sessionId: action.sessionId,
        requestId,
      },
      "Executing confirmed action via OslavaGateway",
    );

    const args = action.arguments;

    try {
      switch (action.actionType) {
        case "change_worker_category": {
          const workerId = args.worker_id as string;
          const newCategory = args.new_category as any;
          const reason = args.reason as string;
          const notes = args.notes as string | undefined;

          await gateway.changeWorkerCategory({
            workerId,
            newCategory,
            reason,
            notes,
          });

          // Read-after-write verification
          const refetched = await gateway.getWorkerDetail(workerId);
          if (refetched.category !== newCategory) {
            throw new ActionOutcomeUnknownError(
              `Worker category update was issued, but verified category is '${refetched.category}' instead of '${newCategory}'.`,
            );
          }

          return {
            worker_id: workerId,
            old_category: action.expectedState.currentCategory,
            new_category: newCategory,
            status: "SUCCESS",
          };
        }

        case "publish_event": {
          const eventId = args.event_id as string;
          const reason = args.reason as string;

          await gateway.publishEvent({ eventId, reason });

          // Read-after-write verification
          const refetched = await gateway.getAdminEventDetail(eventId);
          if (
            refetched.event_status !== "PUBLISHED" &&
            refetched.event_status !== "UPCOMING"
          ) {
            throw new ActionOutcomeUnknownError(
              `Event publish was issued, but verified status is '${refetched.event_status}'.`,
            );
          }

          return {
            event_id: eventId,
            old_status: action.expectedState.currentStatus,
            new_status: refetched.event_status,
            version: refetched.version,
            status: "SUCCESS",
          };
        }

        case "complete_event": {
          const eventId = args.event_id as string;
          const reason = args.reason as string;

          await gateway.completeEvent({ eventId, reason });

          // Read-after-write verification
          const refetched = await gateway.getAdminEventDetail(eventId);
          if (refetched.event_status !== "COMPLETED") {
            throw new ActionOutcomeUnknownError(
              `Event complete was issued, but verified status is '${refetched.event_status}'.`,
            );
          }

          return {
            event_id: eventId,
            old_status: action.expectedState.currentStatus,
            new_status: "COMPLETED",
            version: refetched.version,
            status: "SUCCESS",
          };
        }

        case "close_event": {
          const eventId = args.event_id as string;
          const reason = args.reason as string;

          await gateway.closeEvent({ eventId, reason });

          // Read-after-write verification
          const refetched = await gateway.getAdminEventDetail(eventId);
          if (refetched.event_status !== "CLOSED") {
            throw new ActionOutcomeUnknownError(
              `Event close was issued, but verified status is '${refetched.event_status}'.`,
            );
          }

          return {
            event_id: eventId,
            old_status: action.expectedState.currentStatus,
            new_status: "CLOSED",
            version: refetched.version,
            status: "SUCCESS",
          };
        }

        default:
          throw new ActionExecutionFailedError(
            `Unsupported action type '${action.actionType}'.`,
          );
      }
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new ActionExecutionFailedError(
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

export const actionExecutionService = new ActionExecutionService();
