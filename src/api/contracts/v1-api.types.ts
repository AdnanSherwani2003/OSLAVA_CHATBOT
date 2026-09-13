/**
 * OSLAVA ADMIN AI CHATBOT — FROZEN V1 API CONTRACT TYPES
 *
 * Authoritative TypeScript interfaces and discriminated unions for all 10 V1 application
 * endpoints, operational endpoints, and standard error envelopes.
 *
 * DO NOT MODIFY WITHOUT AN EXPLICIT CONTRACT MIGRATION (V2).
 */

import type { AllowedAdminRole } from "../../domain/auth.types.js";
import type { ErrorCode } from "../../domain/errors.js";

// ============================================================================
// 1. STANDARD ERROR ENVELOPE (All 4xx / 5xx)
// ============================================================================

export interface ErrorDetail {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  request_id: string;
}

export interface ErrorEnvelope {
  error: ErrorDetail;
}

// ============================================================================
// 2. SESSION MANAGEMENT ENDPOINTS (1 - 3)
// ============================================================================

export interface SessionSummary {
  id: string;
  user_id: string;
  status: "ACTIVE" | "ARCHIVED" | string;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
}

/** POST /v1/chat/sessions -> 201 Created */
export interface CreateSessionResponse {
  request_id: string;
  session: SessionSummary;
}

/** GET /v1/chat/sessions -> 200 OK */
export interface ListSessionsResponse {
  request_id: string;
  sessions: SessionSummary[];
}

export interface EntityStateSnapshot {
  current_event_id: string | null;
  current_event_label: string | null;
  current_worker_id: string | null;
  current_worker_label: string | null;
  recent_events?: Array<{
    id: string;
    title: string;
    date?: string;
    status?: string;
  }>;
  recent_workers?: Array<{
    id: string;
    fullName?: string;
    full_name?: string;
    worker_number?: number | null;
    category?: string | null;
    status?: string;
  }>;
}

/** GET /v1/chat/sessions/:sessionId -> 200 OK */
export interface GetSessionDetailResponse {
  request_id: string;
  session: SessionSummary;
  session_state: EntityStateSnapshot | null;
}

// ============================================================================
// 3. MESSAGE HISTORY ENDPOINT (4)
// ============================================================================

export type PublicChatRole = "USER" | "ASSISTANT" | "SYSTEM_EVENT";

export interface ChatMessageRecord {
  id: string;
  session_id: string;
  role: PublicChatRole;
  content: string;
  created_at: string;
}

/** GET /v1/chat/sessions/:sessionId/messages -> 200 OK */
export interface GetMessagesResponse {
  request_id: string;
  session_id: string;
  messages: ChatMessageRecord[];
}

// ============================================================================
// 4. CHAT TURN INTERACTION ENDPOINT (5)
// ============================================================================

export interface SendMessageRequest {
  message: string;
}

export type ConfirmationActionType =
  | "change_worker_category"
  | "publish_event"
  | "complete_event"
  | "close_event";

export interface StandardMessagePayload {
  type: "message";
  content: string;
}

export interface EntitySelectionOption {
  id: string;
  display_name: string;
  subtitle: string;
}

export interface EntitySelectionPayload {
  type: "entity_selection_required";
  content: string;
  selection: {
    entity_type: "event" | "worker";
    options: EntitySelectionOption[];
  };
}

export interface ConfirmationRequiredPayload {
  type: "confirmation_required";
  content: string;
  action: {
    id: string;
    type: ConfirmationActionType;
    status: "PENDING";
    expires_at: string;
    summary: Record<string, unknown>;
  };
}

export type ChatResponsePayload =
  | StandardMessagePayload
  | EntitySelectionPayload
  | ConfirmationRequiredPayload;

export interface SessionTurnState {
  current_event_id: string | null;
  current_event_label: string | null;
  current_worker_id: string | null;
  current_worker_label: string | null;
}

/** POST /v1/chat/sessions/:sessionId/messages -> 200 OK */
export interface SendMessageResponse {
  request_id: string;
  session_id: string;
  message_id: string;
  response: ChatResponsePayload;
  session_state: SessionTurnState | null;
}

// ============================================================================
// 5. PENDING ACTION ENDPOINT (6)
// ============================================================================

export interface PendingActionSummary {
  id: string;
  session_id: string;
  action_type: ConfirmationActionType;
  status: "PENDING";
  display_summary: Record<string, unknown>;
  expires_at: string;
  created_at: string;
}

/** GET /v1/chat/sessions/:sessionId/action/pending -> 200 OK */
export interface GetPendingActionResponse {
  request_id: string;
  session_id: string;
  pending_action: PendingActionSummary | null;
}

// ============================================================================
// 6. ACTION DETAILS ENDPOINT (7)
// ============================================================================

export type PublicActionStatus =
  | "PENDING"
  | "EXECUTING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "STALE";

export interface ActionDetail {
  id: string;
  session_id: string;
  action_type: ConfirmationActionType;
  status: PublicActionStatus;
  display_summary: Record<string, unknown>;
  created_at: string;
  expires_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  executed_at: string | null;
  result_summary: Record<string, unknown> | null;
  execution_error_code: string | null;
}

/** GET /v1/chat/actions/:actionId -> 200 OK */
export interface GetActionDetailResponse {
  request_id: string;
  action: ActionDetail;
}

// ============================================================================
// 7. CONFIRM ACTION ENDPOINT (8)
// ============================================================================

export interface ActionCompletedPayload {
  type: "action_completed";
  content: string;
  action: {
    id: string;
    type: ConfirmationActionType;
    status: "SUCCEEDED";
    summary: Record<string, unknown>;
    result: Record<string, unknown> | null;
  };
}

/** POST /v1/chat/actions/:actionId/confirm -> 200 OK */
export interface ConfirmActionResponse {
  request_id: string;
  session_id: string;
  response: ActionCompletedPayload;
}

// ============================================================================
// 8. CANCEL ACTION ENDPOINT (9)
// ============================================================================

export interface CancelActionRequest {
  reason?: string;
}

export interface ActionCancelledPayload {
  type: "action_cancelled";
  content: string;
  action: {
    id: string;
    type: ConfirmationActionType;
    status: "CANCELLED";
    summary: Record<string, unknown>;
  };
}

/** POST /v1/chat/actions/:actionId/cancel -> 200 OK */
export interface CancelActionResponse {
  request_id: string;
  session_id: string;
  response: ActionCancelledPayload;
}

// ============================================================================
// 9. CALLER IDENTITY ENDPOINT (10)
// ============================================================================

/** GET /v1/auth/me -> 200 OK */
export interface AuthMeResponse {
  request_id: string;
  user_id: string;
  role: AllowedAdminRole;
  display_name: string;
  account_status: "ACTIVE";
  worker_number?: number;
}

// ============================================================================
// 10. OPERATIONAL ENDPOINTS
// ============================================================================

export interface HealthzResponse {
  status: "ok";
  service: string;
  timestamp: string;
  uptime?: number;
}

export interface ReadyzResponse {
  status: "ready";
  service: string;
  persistence: string;
  timestamp: string;
}
