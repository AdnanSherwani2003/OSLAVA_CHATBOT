import {
  conversationService,
  ConversationService,
} from "../context/conversation.service.js";
import {
  ActionAlreadyResolvedError,
  ActionExpiredError,
  ActionForbiddenError,
  ActionNotFoundError,
  ActionStaleError,
  AppError,
} from "../domain/errors.js";
import { OslavaGateway } from "../integrations/supabase/oslava.gateway.js";
import { logger } from "../observability/logger.js";
import { metrics } from "../observability/metrics.js";
import {
  IActionRepository,
  actionRepository,
} from "../persistence/repositories/action.repository.js";
import {
  actionExecutionService,
  ActionExecutionService,
} from "./action-execution.service.js";
import { ActionType, PendingActionRecord } from "./action.types.js";

export interface ActionConfirmationResult {
  actionId: string;
  sessionId: string;
  actionType: ActionType;
  status: "SUCCEEDED";
  displaySummary: Record<string, unknown>;
  resultSummary: Record<string, unknown>;
  message: string;
}

export interface ActionCancelResult {
  actionId: string;
  sessionId: string;
  actionType: ActionType;
  status: "CANCELLED";
  displaySummary: Record<string, unknown>;
  message: string;
}

export class ActionConfirmationService {
  constructor(
    private readonly actionRepo: IActionRepository = actionRepository,
    private readonly executionService: ActionExecutionService = actionExecutionService,
    private readonly convService: ConversationService = conversationService,
  ) {}

  public async getPendingAction(
    actionId: string,
  ): Promise<PendingActionRecord | null> {
    const action = await this.actionRepo.getActionById(actionId);
    if (!action) return null;

    if (action.status === "PENDING") {
      if (new Date(action.expiresAt).getTime() <= Date.now()) {
        await this.actionRepo.updateActionStatus(actionId, {
          status: "EXPIRED",
        });
        return { ...action, status: "EXPIRED" };
      }
    }

    return action;
  }

  public async getActivePendingActionForSession(
    sessionId: string,
  ): Promise<PendingActionRecord | null> {
    const action =
      await this.actionRepo.getActivePendingActionBySession(sessionId);
    if (!action) return null;

    if (new Date(action.expiresAt).getTime() <= Date.now()) {
      await this.actionRepo.updateActionStatus(action.id, {
        status: "EXPIRED",
      });
      return null;
    }

    return action;
  }

  public async confirmAction(params: {
    actionId: string;
    userId: string;
    gateway: OslavaGateway;
    requestId: string;
  }): Promise<ActionConfirmationResult> {
    const { actionId, userId, gateway, requestId } = params;

    // 1. Fetch action
    const action = await this.actionRepo.getActionById(actionId);
    if (!action) {
      throw new ActionNotFoundError(actionId);
    }

    // 2. Ownership verification
    if (action.userId !== userId) {
      throw new ActionForbiddenError(actionId);
    }

    // 3. Status check
    if (action.status !== "PENDING") {
      throw new ActionAlreadyResolvedError(actionId, action.status);
    }

    // 4. TTL check
    if (new Date(action.expiresAt).getTime() <= Date.now()) {
      await this.actionRepo.updateActionStatus(actionId, {
        status: "EXPIRED",
      });
      throw new ActionExpiredError(actionId);
    }

    // 5. Atomic claiming (PENDING -> EXECUTING)
    const claimed = await this.actionRepo.claimActionForExecution(
      actionId,
      requestId,
    );
    if (!claimed) {
      throw new ActionAlreadyResolvedError(actionId, "EXECUTING_OR_RESOLVED");
    }

    // 6. Stale state detection against underlying entity
    try {
      if (action.actionType === "change_worker_category") {
        const workerId = action.arguments.worker_id as string;
        const worker = await gateway.getWorkerDetail(workerId);
        if (
          worker.category !== action.expectedState.currentCategory ||
          worker.account_status !== "ACTIVE"
        ) {
          metrics.recordActionStale(action.actionType);
          await this.actionRepo.updateActionStatus(actionId, {
            status: "STALE",
            executionErrorCode: "ACTION_STALE",
          });
          throw new ActionStaleError(
            `Worker state changed since proposal. Expected category '${action.expectedState.currentCategory}', current is '${worker.category}'.`,
          );
        }
      } else {
        const eventId = action.arguments.event_id as string;
        const event = await gateway.getAdminEventDetail(eventId);
        if (
          event.event_status !== action.expectedState.currentStatus ||
          event.version !== action.expectedState.version
        ) {
          metrics.recordActionStale(action.actionType);
          await this.actionRepo.updateActionStatus(actionId, {
            status: "STALE",
            executionErrorCode: "ACTION_STALE",
          });
          throw new ActionStaleError(
            `Event state changed since proposal. Expected status '${action.expectedState.currentStatus}' (v${action.expectedState.version}), current is '${event.event_status}' (v${event.version}).`,
          );
        }
      }
    } catch (staleErr) {
      if (staleErr instanceof ActionStaleError) {
        throw staleErr;
      }
      await this.actionRepo.updateActionStatus(actionId, {
        status: "STALE",
        executionErrorCode: "STATE_CHECK_FAILED",
      });
      throw new ActionStaleError(
        `Failed to verify entity state before execution: ${staleErr instanceof Error ? staleErr.message : String(staleErr)}`,
      );
    }

    // 7. Execution
    let resultSummary: Record<string, unknown>;
    try {
      resultSummary = await this.executionService.executeAction(
        action,
        gateway,
        requestId,
      );
    } catch (execErr) {
      const errorCode =
        execErr instanceof AppError ? execErr.code : "ACTION_EXECUTION_FAILED";
      await this.actionRepo.updateActionStatus(actionId, {
        status: "FAILED",
        confirmedAt: new Date(),
        executedAt: new Date(),
        executionRequestId: requestId,
        executionErrorCode: errorCode,
      });
      throw execErr;
    }

    // 8. Update status to SUCCEEDED
    await this.actionRepo.updateActionStatus(actionId, {
      status: "SUCCEEDED",
      confirmedAt: new Date(),
      executedAt: new Date(),
      executionRequestId: requestId,
      resultSummary,
    });

    metrics.recordActionConfirmed(action.actionType);

    // 9. Append audit log
    logger.info(
      {
        audit: true,
        action: "ADMIN_ACTION_EXECUTED",
        actionId: action.id,
        actionType: action.actionType,
        sessionId: action.sessionId,
        userId,
        arguments: action.arguments,
        resultSummary,
        requestId,
      },
      "Audit: Admin action successfully executed",
    );

    // 10. Append conversation system message
    try {
      await this.convService.appendMessage(
        action.sessionId,
        requestId,
        "SYSTEM_EVENT",
        `[Confirmed & Executed] ${action.actionType} completed successfully.`,
      );
    } catch (msgErr) {
      logger.warn({ msgErr, actionId }, "Failed to append system message for action");
    }

    return {
      actionId: action.id,
      sessionId: action.sessionId,
      actionType: action.actionType,
      status: "SUCCEEDED",
      displaySummary: action.displaySummary,
      resultSummary,
      message: `Action '${action.actionType}' completed successfully.`,
    };
  }

  public async cancelAction(params: {
    actionId: string;
    userId: string;
    reason?: string;
  }): Promise<ActionCancelResult> {
    const { actionId, userId, reason } = params;

    const action = await this.actionRepo.getActionById(actionId);
    if (!action) {
      throw new ActionNotFoundError(actionId);
    }

    if (action.userId !== userId) {
      throw new ActionForbiddenError(actionId);
    }

    if (action.status !== "PENDING") {
      throw new ActionAlreadyResolvedError(actionId, action.status);
    }

    await this.actionRepo.cancelAction(actionId);
    metrics.recordActionCancelled(action.actionType);

    logger.info(
      {
        audit: true,
        action: "ADMIN_ACTION_CANCELLED",
        actionId: action.id,
        actionType: action.actionType,
        sessionId: action.sessionId,
        userId,
        reason,
      },
      "Audit: Admin action cancelled",
    );

    try {
      await this.convService.appendMessage(
        action.sessionId,
        "cancel",
        "SYSTEM_EVENT",
        `[Cancelled] ${action.actionType} was cancelled.`,
      );
    } catch (msgErr) {
      logger.warn({ msgErr, actionId }, "Failed to append cancel system message");
    }

    return {
      actionId: action.id,
      sessionId: action.sessionId,
      actionType: action.actionType,
      status: "CANCELLED",
      displaySummary: action.displaySummary,
      message: `Action '${action.actionType}' was cancelled.`,
    };
  }
}

export const actionConfirmationService = new ActionConfirmationService();
