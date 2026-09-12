import { randomUUID } from "node:crypto";
import {
  CreateActionParams,
  PendingActionRecord,
  UpdateActionStatusParams,
} from "../../actions/action.types.js";
import { IActionRepository } from "../contracts/repository.interfaces.js";
import { defaultInMemoryChatStore, InMemoryChatStore } from "./in-memory-store.js";
import { ActionNotFoundError } from "../../domain/errors.js";

export class MemoryActionRepository implements IActionRepository {
  constructor(
    private readonly store: InMemoryChatStore = defaultInMemoryChatStore,
  ) {}

  async createAction(params: CreateActionParams): Promise<PendingActionRecord> {
    const record: PendingActionRecord = {
      id: params.id || randomUUID(),
      sessionId: params.sessionId,
      userId: params.userId,
      actionType: params.actionType,
      status: "PENDING",
      arguments: { ...params.arguments },
      expectedState: { ...params.expectedState },
      displaySummary: { ...params.displaySummary },
      createdRequestId: params.createdRequestId,
      createdAt: new Date(),
      expiresAt: params.expiresAt,
      confirmedAt: null,
      cancelledAt: null,
      executedAt: null,
      executionRequestId: null,
      executionErrorCode: null,
      resultSummary: null,
    };

    this.store.actions.set(record.id, record);
    return { ...record };
  }

  async getActionById(id: string): Promise<PendingActionRecord | null> {
    const action = this.store.actions.get(id);
    return action ? { ...action } : null;
  }

  async getActivePendingActionBySession(
    sessionId: string,
  ): Promise<PendingActionRecord | null> {
    const now = new Date();
    for (const action of this.store.actions.values()) {
      if (
        action.sessionId === sessionId &&
        action.status === "PENDING" &&
        action.expiresAt > now
      ) {
        return { ...action };
      }
    }
    return null;
  }

  async claimActionForExecution(
    id: string,
    executionRequestId: string,
  ): Promise<PendingActionRecord | null> {
    const action = this.store.actions.get(id);
    if (!action || action.status !== "PENDING") {
      return null;
    }

    action.status = "EXECUTING";
    action.executionRequestId = executionRequestId;
    this.store.actions.set(id, action);
    return { ...action };
  }

  async updateActionStatus(
    id: string,
    update: UpdateActionStatusParams,
  ): Promise<PendingActionRecord> {
    const action = this.store.actions.get(id);
    if (!action) {
      throw new ActionNotFoundError(id);
    }

    if (update.status !== undefined) action.status = update.status;
    if (update.expiresAt !== undefined) action.expiresAt = update.expiresAt;
    if (update.confirmedAt !== undefined) action.confirmedAt = update.confirmedAt;
    if (update.cancelledAt !== undefined) action.cancelledAt = update.cancelledAt;
    if (update.executedAt !== undefined) action.executedAt = update.executedAt;
    if (update.executionRequestId !== undefined)
      action.executionRequestId = update.executionRequestId;
    if (update.executionErrorCode !== undefined)
      action.executionErrorCode = update.executionErrorCode;
    if (update.resultSummary !== undefined)
      action.resultSummary = update.resultSummary;

    this.store.actions.set(id, action);
    return { ...action };
  }

  async cancelAction(id: string): Promise<PendingActionRecord> {
    const action = this.store.actions.get(id);
    if (!action) {
      throw new ActionNotFoundError(id);
    }

    action.status = "CANCELLED";
    action.cancelledAt = new Date();
    this.store.actions.set(id, action);
    return { ...action };
  }

  async clear(): Promise<void> {
    this.store.actions.clear();
  }
}
