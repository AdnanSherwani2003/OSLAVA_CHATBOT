# Oslava Admin AI Chatbot — Frozen V1 API Contract Reference

> [!IMPORTANT]
> **API CONTRACT FREEZE DECLARATION**:
> This document specifies the **frozen, authoritative V1 REST API contract** between the standalone Oslava Admin AI Chatbot backend and the Flutter mobile application.
> - All response payloads use the deterministic top-level envelope defined herein.
> - There are zero duplicate or deprecated legacy response formats.
> - No endpoints, request fields, or envelope shapes will change without an explicit **V2** migration.

---

## 1. Overview & General Standards

### Base URLs
- **Local Dev / Android Emulator**: `http://10.0.2.2:3000`
- **Local Dev / iOS Simulator**: `http://localhost:3000`
- **Staging / Production**: `https://api-chatbot.oslava.com` (configured via app environment)

### Authentication
All application endpoints (except `/healthz`, `/readyz`, and `/metrics`) require the active admin's Supabase Access Token in the standard HTTP `Authorization` header:

```http
Authorization: Bearer <supabase_access_token>
```

- **Authorized Roles**: `SUPER_ADMIN` or `ADMIN`.
- **Authorized Status**: `ACTIVE` accounts only.
- **Request Tracing**: All requests receive an `x-request-id` header in the HTTP response, and every JSON response includes a `request_id` property.

---

## 2. Standard Error Envelope

Every `4xx` and `5xx` error response returns a standardized JSON structure:

```json
{
  "error": {
    "code": "ACTION_STALE",
    "message": "Action cannot be executed because underlying entity state has changed.",
    "retryable": false,
    "request_id": "req_64f9b8c1d2e3"
  }
}
```

### Complete Error Code Matrix

| Error Code | HTTP Status | Retryable | Description & Recommended Flutter Handling |
|---|---|---|---|
| `AUTH_REQUIRED` | 401 | `false` | Missing `Authorization` header. Redirect to login. |
| `AUTH_INVALID` | 401 | `false` | Expired or invalid Supabase JWT. Refresh session or re-authenticate. |
| `ROLE_FORBIDDEN` | 403 | `false` | Caller is not `ADMIN` or `SUPER_ADMIN`. Block access and show unauthorized message. |
| `ACCOUNT_RESTRICTED` | 403 | `false` | Admin account is suspended or pending approval. |
| `INVALID_INPUT` | 400 | `false` | Malformed JSON body or query parameters failed Zod validation. |
| `ENTITY_NOT_FOUND` | 404 | `false` | Targeted worker or event ID does not exist. |
| `DOMAIN_REJECTED` | 400 | `false` | Business rule rejected (e.g. invalid category transition). |
| `MODEL_UNAVAILABLE` | 503 | `true` | AI provider is unreachable. Retry after short delay. |
| `MODEL_RATE_LIMITED` | 429 | `true` | LLM rate limit exceeded. Show "Server busy, retrying..." |
| `MODEL_TIMEOUT` | 504 | `true` | LLM turn took > 30s. Retryable prompt. |
| `MODEL_INVALID_RESPONSE` | 502 | `true` | LLM returned invalid tool call format. |
| `TOOL_LIMIT_EXCEEDED` | 500 | `false` | Agent exceeded 5 iterations in a single turn. |
| `SESSION_NOT_FOUND` | 404 | `false` | Chat session does not exist. Redirect to session list or start new chat. |
| `SESSION_FORBIDDEN` | 403 | `false` | Caller attempted to access another admin's chat session. |
| `ACTION_NOT_FOUND` | 404 | `false` | Action ID not found in database. |
| `ACTION_FORBIDDEN` | 403 | `false` | Caller is not the admin who staged the pending action. |
| `ACTION_EXPIRED` | 400 | `false` | Action exceeded its 10-minute TTL. Inform user to request the action again. |
| `ACTION_ALREADY_RESOLVED`| 409 | `false` | Action already confirmed, cancelled, or executing. Disable action button. |
| `ACTION_STALE` | 409 | `false` | Entity modified since proposal (e.g. event status changed). Action aborted. |
| `ACTION_EXECUTION_FAILED` | 500 | `false` | Database RPC returned an error during execution. |
| `ACTION_OUTCOME_UNKNOWN` | 500 | `false` | Verification after write failed. |
| `PENDING_ACTION_EXISTS` | 409 | `false` | Session already has an active pending action. Confirm or cancel it first. |
| `SUPABASE_UNAVAILABLE` | 503 | `true` | Supabase RPC or database temporarily unreachable. |
| `INTERNAL_ERROR` | 500 | `false` | Unexpected server crash. Masked internal error. |

---

## 3. The 10 Application Endpoints

### 1. Create Session
`POST /v1/chat/sessions`

Creates a new conversation session for the caller.

- **Status**: `201 Created`
- **Response**:
```json
{
  "request_id": "req_88540c4900da44658a5433a0e69b5cfa",
  "session": {
    "id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
    "user_id": "11111111-1111-1111-1111-111111111111",
    "status": "ACTIVE",
    "created_at": "2026-09-14T02:00:00.000Z",
    "updated_at": "2026-09-14T02:00:00.000Z",
    "last_activity_at": "2026-09-14T02:00:00.000Z"
  }
}
```

---

### 2. List Caller Sessions
`GET /v1/chat/sessions`

Returns all active chat sessions owned by the authenticated admin.

- **Status**: `200 OK`
- **Response**:
```json
{
  "request_id": "req_b28d08c581a84f39b1a03f421fbc3432",
  "sessions": [
    {
      "id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
      "user_id": "11111111-1111-1111-1111-111111111111",
      "status": "ACTIVE",
      "created_at": "2026-09-14T02:00:00.000Z",
      "updated_at": "2026-09-14T02:00:00.000Z",
      "last_activity_at": "2026-09-14T02:00:00.000Z"
    }
  ]
}
```

---

### 3. Get Session Details & State
`GET /v1/chat/sessions/:sessionId`

Returns session metadata and currently grounded active context (active worker/event).

- **Status**: `200 OK`
- **Response**:
```json
{
  "request_id": "req_748fbc01d94b434cb27f88414b0bca22",
  "session": {
    "id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
    "user_id": "11111111-1111-1111-1111-111111111111",
    "status": "ACTIVE",
    "created_at": "2026-09-14T02:00:00.000Z",
    "updated_at": "2026-09-14T02:00:00.000Z",
    "last_activity_at": "2026-09-14T02:00:00.000Z"
  },
  "session_state": {
    "current_event_id": "eeee5555-5555-4eee-8eee-555555555555",
    "current_event_label": "Taj Palace Wedding",
    "current_worker_id": "22222222-2222-4222-8222-222222222222",
    "current_worker_label": "Arif Ahmed",
    "recent_events": [
      {
        "id": "eeee5555-5555-4eee-8eee-555555555555",
        "title": "Taj Palace Wedding",
        "status": "DRAFT"
      }
    ],
    "recent_workers": [
      {
        "id": "22222222-2222-4222-8222-222222222222",
        "fullName": "Arif Ahmed",
        "worker_number": 1002,
        "category": "B"
      }
    ]
  }
}
```

---

### 4. Get Message History
`GET /v1/chat/sessions/:sessionId/messages?limit=50&offset=0`

Returns chronological message history.

- **Query Parameters**:
  - `limit`: integer (1-100, default `50`)
  - `offset`: integer (min 0, default `0`)
- **Status**: `200 OK`
- **Response**:
```json
{
  "request_id": "req_8604724b0a7d4dcf8ffbe31011406450",
  "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
  "messages": [
    {
      "id": "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
      "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
      "role": "USER",
      "content": "Show tomorrow's events",
      "created_at": "2026-09-14T02:01:00.000Z"
    },
    {
      "id": "f9e8d7c6-b5a4-49e8-8d7c-6b5a4f3e2d1c",
      "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
      "role": "ASSISTANT",
      "content": "Tomorrow we have 1 event scheduled: **Taj Palace Wedding** (Draft, 12 workers needed).",
      "created_at": "2026-09-14T02:01:02.000Z"
    }
  ]
}
```

---

### 5. Send User Message Turn
`POST /v1/chat/sessions/:sessionId/messages`

Executes an interactive agent turn. The response object contains a polymorphic `response` field with 3 possible types:
1. `message`: standard markdown text response
2. `entity_selection_required`: disambiguation selection required
3. `confirmation_required`: staged write intent awaiting explicit confirmation

- **Status**: `200 OK`
- **Request Body**:
```json
{
  "message": "Promote Arif to category A"
}
```

#### Turn Response — Case A: Standard Message (`type: "message"`)
```json
{
  "request_id": "req_318e8a60bb4a43aebc914e9f758410ca",
  "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
  "message_id": "93424d5b-426c-486a-a82f-8706d860d5b6",
  "response": {
    "type": "message",
    "content": "Today's Overview (2026-09-14):\n- **Total Events Today**: 2\n- **Published**: 1\n- **Workers Required Today**: 23"
  },
  "session_state": {
    "current_event_id": null,
    "current_event_label": null,
    "current_worker_id": null,
    "current_worker_label": null
  }
}
```

#### Turn Response — Case B: Entity Selection Required (`type: "entity_selection_required"`)
```json
{
  "request_id": "req_79c836d5e1284ebcb895fa784860bca1",
  "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
  "message_id": "e9365e12-881c-4ce1-8072-a169b2d86a41",
  "response": {
    "type": "entity_selection_required",
    "content": "I found multiple workers matching 'Arif'. Which worker would you like to inspect?",
    "selection": {
      "entity_type": "worker",
      "options": [
        {
          "id": "11111111-1111-4111-8111-111111111111",
          "display_name": "Arif Khan",
          "subtitle": "Worker #1001 • Category C"
        },
        {
          "id": "22222222-2222-4222-8222-222222222222",
          "display_name": "Arif Ahmed",
          "subtitle": "Worker #1002 • Category B"
        }
      ]
    }
  },
  "session_state": null
}
```

#### Turn Response — Case C: Confirmation Required (`type: "confirmation_required"`)
```json
{
  "request_id": "req_55b0a216d12f45888d30e3184f4f4699",
  "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
  "message_id": "b304cbca-e2e7-402b-a36c-92d6e3c63d59",
  "response": {
    "type": "confirmation_required",
    "content": "I have staged a category change for worker **Arif Ahmed** (Worker #1002) from category **B** to **A**.\n\nReason: \"Exemplary service and 100% punctuality\"\n\nPlease review and confirm or cancel this action.",
    "action": {
      "id": "baa8a85d-e77c-40fc-ac31-29e3959c4afa",
      "type": "change_worker_category",
      "status": "PENDING",
      "expires_at": "2026-09-14T02:15:00.000Z",
      "summary": {
        "workerId": "22222222-2222-4222-8222-222222222222",
        "workerName": "Arif Ahmed",
        "workerNumber": 1002,
        "currentCategory": "B",
        "newCategory": "A",
        "reason": "Exemplary service and 100% punctuality"
      }
    }
  },
  "session_state": {
    "current_event_id": null,
    "current_event_label": null,
    "current_worker_id": "22222222-2222-4222-8222-222222222222",
    "current_worker_label": "Arif Ahmed"
  }
}
```

---

### 6. Get Active Pending Action
`GET /v1/chat/sessions/:sessionId/action/pending`

Returns the currently pending action for the session, or `pending_action: null` if none exists.

- **Status**: `200 OK`
- **Response (When Active)**:
```json
{
  "request_id": "req_847101bbd0674e2d83769165d4b8e219",
  "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
  "pending_action": {
    "id": "baa8a85d-e77c-40fc-ac31-29e3959c4afa",
    "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
    "action_type": "change_worker_category",
    "status": "PENDING",
    "display_summary": {
      "workerId": "22222222-2222-4222-8222-222222222222",
      "workerName": "Arif Ahmed",
      "workerNumber": 1002,
      "currentCategory": "B",
      "newCategory": "A",
      "reason": "Exemplary service and 100% punctuality"
    },
    "expires_at": "2026-09-14T02:15:00.000Z",
    "created_at": "2026-09-14T02:05:00.000Z"
  }
}
```

- **Response (When None)**:
```json
{
  "request_id": "req_9930f14d9b73489ca7298642a8b9f123",
  "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
  "pending_action": null
}
```

---

### 7. Get Action Details
`GET /v1/chat/actions/:actionId`

Returns safe public metadata and timestamps for any action.

- **Status**: `200 OK`
- **Response**:
```json
{
  "request_id": "req_a4208a28723945419918b843dc0c2d39",
  "action": {
    "id": "baa8a85d-e77c-40fc-ac31-29e3959c4afa",
    "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
    "action_type": "change_worker_category",
    "status": "SUCCEEDED",
    "display_summary": {
      "workerName": "Arif Ahmed",
      "workerNumber": 1002,
      "currentCategory": "B",
      "newCategory": "A",
      "reason": "Exemplary service and 100% punctuality"
    },
    "created_at": "2026-09-14T02:05:00.000Z",
    "expires_at": "2026-09-14T02:15:00.000Z",
    "confirmed_at": "2026-09-14T02:06:12.000Z",
    "cancelled_at": null,
    "executed_at": "2026-09-14T02:06:13.000Z",
    "result_summary": {
      "worker_id": "22222222-2222-4222-8222-222222222222",
      "old_category": "B",
      "new_category": "A",
      "status": "SUCCESS"
    },
    "execution_error_code": null
  }
}
```

---

### 8. Confirm Action
`POST /v1/chat/actions/:actionId/confirm`

Atomically claims and executes the staged pending action.

- **Status**: `200 OK`
- **Response**:
```json
{
  "request_id": "req_d39589d107a94488be6dae766e4a689b",
  "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
  "response": {
    "type": "action_completed",
    "content": "Action 'change_worker_category' completed successfully.",
    "action": {
      "id": "baa8a85d-e77c-40fc-ac31-29e3959c4afa",
      "type": "change_worker_category",
      "status": "SUCCEEDED",
      "summary": {
        "workerName": "Arif Ahmed",
        "workerNumber": 1002,
        "currentCategory": "B",
        "newCategory": "A",
        "reason": "Exemplary service and 100% punctuality"
      },
      "result": {
        "worker_id": "22222222-2222-4222-8222-222222222222",
        "old_category": "B",
        "new_category": "A",
        "status": "SUCCESS"
      }
    }
  }
}
```

---

### 9. Cancel Action
`POST /v1/chat/actions/:actionId/cancel`

Explicitly cancels a pending action without modifying database records.

- **Status**: `200 OK`
- **Request Body** (optional):
```json
{
  "reason": "Admin decided to verify attendance records first"
}
```
- **Response**:
```json
{
  "request_id": "req_45690184b23847e38466bbd08a5c43d2",
  "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
  "response": {
    "type": "action_cancelled",
    "content": "Action 'change_worker_category' was cancelled.",
    "action": {
      "id": "baa8a85d-e77c-40fc-ac31-29e3959c4afa",
      "type": "change_worker_category",
      "status": "CANCELLED",
      "summary": {
        "workerName": "Arif Ahmed",
        "workerNumber": 1002,
        "currentCategory": "B",
        "newCategory": "A",
        "reason": "Exemplary service and 100% punctuality"
      }
    }
  }
}
```

---

### 10. Get Authenticated Admin Profile
`GET /v1/auth/me`

Validates bearer token and returns current actor profile.

- **Status**: `200 OK`
- **Response**:
```json
{
  "request_id": "req_e12048f029384620894b986e11942851",
  "user_id": "11111111-1111-1111-1111-111111111111",
  "role": "ADMIN",
  "display_name": "Admin Alice",
  "account_status": "ACTIVE",
  "worker_number": 101
}
```

---

## 4. Operational Probes

### Liveness Probe
`GET /healthz`

- **Status**: `200 OK`
```json
{
  "status": "ok",
  "service": "oslava-admin-ai",
  "timestamp": "2026-09-14T02:00:00.000Z",
  "uptime": 234.5
}
```

### Readiness Probe
`GET /readyz`

- **Status**: `200 OK`
```json
{
  "status": "ready",
  "service": "oslava-admin-ai",
  "persistence": "memory",
  "timestamp": "2026-09-14T02:00:00.000Z"
}
```

---

## 5. Flutter Integration Guidelines

1. **State Management**:
   Store the active `sessionId` in your chat provider or BLoC. When starting the screen, call `POST /v1/chat/sessions` (or load existing from `GET /v1/chat/sessions`).
2. **Pending Action Hydration**:
   On screen load or app reconnect, call `GET /v1/chat/sessions/:sessionId/action/pending`. If non-null, immediately render the Confirmation Card UI.
3. **Card Lifecycle**:
   - Tapping **Confirm** executes `POST /v1/chat/actions/:actionId/confirm`.
   - Tapping **Cancel** executes `POST /v1/chat/actions/:actionId/cancel`.
   - Disable buttons immediately upon tap to avoid duplicate requests.
   - If an HTTP 409 `ACTION_STALE` is returned, show an alert indicating the underlying data changed.
4. **Timezone Awareness**:
   The backend operates with `Asia/Kolkata` business dates. Date strings in the UI are formatted in local time.
