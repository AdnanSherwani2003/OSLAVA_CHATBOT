/**
 * OSLAVA ADMIN AI CHATBOT — FROZEN V1 API VALIDATION SCHEMAS
 *
 * Strict Zod validation schemas enforcing the exact frozen V1 API contracts.
 * Used for contract testing, documentation generation, and zero-drift verification.
 */

import { z } from "zod";
import { ALLOWED_ADMIN_ROLES } from "../../domain/auth.types.js";

// ============================================================================
// 1. STANDARD ERROR ENVELOPE (All 4xx / 5xx)
// ============================================================================

export const errorDetailSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  retryable: z.boolean(),
  request_id: z.string().min(1),
});

export const errorEnvelopeSchema = z.object({
  error: errorDetailSchema,
});

// ============================================================================
// 2. SESSION MANAGEMENT SCHEMAS (1 - 3)
// ============================================================================

export const sessionSummarySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  status: z.string(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  last_activity_at: z.string().datetime({ offset: true }),
});

export const createSessionResponseSchema = z.object({
  request_id: z.string().min(1),
  session: sessionSummarySchema,
});

export const listSessionsResponseSchema = z.object({
  request_id: z.string().min(1),
  sessions: z.array(sessionSummarySchema),
});

export const entityStateSnapshotSchema = z.object({
  current_event_id: z.string().uuid().nullable(),
  current_event_label: z.string().nullable(),
  current_worker_id: z.string().uuid().nullable(),
  current_worker_label: z.string().nullable(),
  recent_events: z.array(z.record(z.unknown())).optional(),
  recent_workers: z.array(z.record(z.unknown())).optional(),
});

export const getSessionDetailResponseSchema = z.object({
  request_id: z.string().min(1),
  session: sessionSummarySchema,
  session_state: entityStateSnapshotSchema.nullable(),
});

// ============================================================================
// 3. MESSAGE HISTORY SCHEMAS (4)
// ============================================================================

export const chatMessageRecordSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  role: z.enum(["USER", "ASSISTANT", "SYSTEM_EVENT"]),
  content: z.string(),
  created_at: z.string().datetime({ offset: true }),
});

export const getMessagesResponseSchema = z.object({
  request_id: z.string().min(1),
  session_id: z.string().uuid(),
  messages: z.array(chatMessageRecordSchema),
});

// ============================================================================
// 4. CHAT TURN INTERACTION SCHEMAS (5)
// ============================================================================

export const sendMessageRequestSchema = z
  .object({
    message: z.string().trim().min(1, "Message must not be empty"),
  })
  .strict();

export const confirmationActionTypeSchema = z.enum([
  "change_worker_category",
  "publish_event",
  "complete_event",
  "close_event",
]);

export const standardMessagePayloadSchema = z.object({
  type: z.literal("message"),
  content: z.string(),
});

export const entitySelectionOptionSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().min(1),
  subtitle: z.string(),
});

export const entitySelectionPayloadSchema = z.object({
  type: z.literal("entity_selection_required"),
  content: z.string(),
  selection: z.object({
    entity_type: z.enum(["event", "worker"]),
    options: z.array(entitySelectionOptionSchema),
  }),
});

export const confirmationRequiredPayloadSchema = z.object({
  type: z.literal("confirmation_required"),
  content: z.string(),
  action: z.object({
    id: z.string().uuid(),
    type: confirmationActionTypeSchema,
    status: z.literal("PENDING"),
    expires_at: z.string().datetime({ offset: true }),
    summary: z.record(z.unknown()),
  }),
});

export const chatResponsePayloadSchema = z.discriminatedUnion("type", [
  standardMessagePayloadSchema,
  entitySelectionPayloadSchema,
  confirmationRequiredPayloadSchema,
]);

export const sessionTurnStateSchema = z.object({
  current_event_id: z.string().uuid().nullable(),
  current_event_label: z.string().nullable(),
  current_worker_id: z.string().uuid().nullable(),
  current_worker_label: z.string().nullable(),
});

export const sendMessageResponseSchema = z.object({
  request_id: z.string().min(1),
  session_id: z.string().uuid(),
  message_id: z.string().uuid(),
  response: chatResponsePayloadSchema,
  session_state: sessionTurnStateSchema.nullable(),
});

// ============================================================================
// 5. PENDING ACTION SCHEMAS (6)
// ============================================================================

export const pendingActionSummarySchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  action_type: confirmationActionTypeSchema,
  status: z.literal("PENDING"),
  display_summary: z.record(z.unknown()),
  expires_at: z.string().datetime({ offset: true }),
  created_at: z.string().datetime({ offset: true }),
});

export const getPendingActionResponseSchema = z.object({
  request_id: z.string().min(1),
  session_id: z.string().uuid(),
  pending_action: pendingActionSummarySchema.nullable(),
});

// ============================================================================
// 6. ACTION DETAILS SCHEMAS (7)
// ============================================================================

export const publicActionStatusSchema = z.enum([
  "PENDING",
  "EXECUTING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "STALE",
]);

export const actionDetailSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  action_type: confirmationActionTypeSchema,
  status: publicActionStatusSchema,
  display_summary: z.record(z.unknown()),
  created_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
  confirmed_at: z.string().datetime({ offset: true }).nullable(),
  cancelled_at: z.string().datetime({ offset: true }).nullable(),
  executed_at: z.string().datetime({ offset: true }).nullable(),
  result_summary: z.record(z.unknown()).nullable(),
  execution_error_code: z.string().nullable(),
});

export const getActionDetailResponseSchema = z.object({
  request_id: z.string().min(1),
  action: actionDetailSchema,
});

// ============================================================================
// 7. CONFIRM ACTION SCHEMAS (8)
// ============================================================================

export const actionCompletedPayloadSchema = z.object({
  type: z.literal("action_completed"),
  content: z.string(),
  action: z.object({
    id: z.string().uuid(),
    type: confirmationActionTypeSchema,
    status: z.literal("SUCCEEDED"),
    summary: z.record(z.unknown()),
    result: z.record(z.unknown()).nullable(),
  }),
});

export const confirmActionResponseSchema = z.object({
  request_id: z.string().min(1),
  session_id: z.string().uuid(),
  response: actionCompletedPayloadSchema,
});

// ============================================================================
// 8. CANCEL ACTION SCHEMAS (9)
// ============================================================================

export const cancelActionRequestSchema = z
  .object({
    reason: z.string().trim().optional(),
  })
  .strict()
  .optional();

export const actionCancelledPayloadSchema = z.object({
  type: z.literal("action_cancelled"),
  content: z.string(),
  action: z.object({
    id: z.string().uuid(),
    type: confirmationActionTypeSchema,
    status: z.literal("CANCELLED"),
    summary: z.record(z.unknown()),
  }),
});

export const cancelActionResponseSchema = z.object({
  request_id: z.string().min(1),
  session_id: z.string().uuid(),
  response: actionCancelledPayloadSchema,
});

// ============================================================================
// 9. CALLER IDENTITY SCHEMAS (10)
// ============================================================================

export const authMeResponseSchema = z.object({
  request_id: z.string().min(1),
  user_id: z.string().uuid(),
  role: z.enum(ALLOWED_ADMIN_ROLES),
  display_name: z.string(),
  account_status: z.literal("ACTIVE"),
  worker_number: z.number().int().optional(),
});

// ============================================================================
// 10. OPERATIONAL SCHEMAS
// ============================================================================

export const healthzResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  timestamp: z.string(),
  uptime: z.number().optional(),
});

export const readyzResponseSchema = z.object({
  status: z.literal("ready"),
  service: z.string(),
  persistence: z.string(),
  timestamp: z.string(),
});
