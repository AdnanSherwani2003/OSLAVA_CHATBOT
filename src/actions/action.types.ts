export type ActionType =
  | "change_worker_category"
  | "publish_event"
  | "complete_event"
  | "close_event";

export type ActionStatus =
  | "PENDING"
  | "EXECUTING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "STALE";

export interface PendingActionRecord {
  id: string;
  sessionId: string;
  userId: string;
  actionType: ActionType;
  status: ActionStatus;
  arguments: Record<string, unknown>;
  expectedState: Record<string, unknown>;
  displaySummary: Record<string, unknown>;
  createdRequestId: string;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt?: Date | null;
  cancelledAt?: Date | null;
  executedAt?: Date | null;
  executionRequestId?: string | null;
  executionErrorCode?: string | null;
  resultSummary?: Record<string, unknown> | null;
}

export interface CreateActionParams {
  id?: string;
  sessionId: string;
  userId: string;
  actionType: ActionType;
  arguments: Record<string, unknown>;
  expectedState: Record<string, unknown>;
  displaySummary: Record<string, unknown>;
  createdRequestId: string;
  expiresAt: Date;
}

export interface UpdateActionStatusParams {
  status?: ActionStatus;
  expiresAt?: Date;
  confirmedAt?: Date;
  cancelledAt?: Date;
  executedAt?: Date;
  executionRequestId?: string;
  executionErrorCode?: string | null;
  resultSummary?: Record<string, unknown>;
}
