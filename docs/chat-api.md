# Chat API Documentation

All Chat API endpoints require authentication with a valid Supabase JWT for an **ACTIVE** user with role **ADMIN** or **SUPER_ADMIN**.

Headers required:
- `Authorization: Bearer <supabase_jwt>`
- `Content-Type: application/json`

---

## 1. Create a Chat Session
**Endpoint**: `POST /v1/chat/sessions`

### Response (201 Created)
```json
{
  "session": {
    "id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
    "user_id": "41624b51-cf49-43c2-8419-74e2d3126f58",
    "status": "ACTIVE",
    "created_at": "2026-09-12T18:00:00.000Z",
    "updated_at": "2026-09-12T18:00:00.000Z",
    "last_activity_at": "2026-09-12T18:00:00.000Z"
  }
}
```

---

## 2. List Chat Sessions
**Endpoint**: `GET /v1/chat/sessions`

Returns all active and archived sessions created by the caller, sorted by `last_activity_at DESC`.

---

## 3. Get Session Details & Active State
**Endpoint**: `GET /v1/chat/sessions/:sessionId`

Returns session metadata and current active entity state.

---

## 4. Get Message History
**Endpoint**: `GET /v1/chat/sessions/:sessionId/messages?limit=50&offset=0`

---

## 5. Send Message (Run Agent Turn)
**Endpoint**: `POST /v1/chat/sessions/:sessionId/messages`

### Standard Read Turn Response (200 OK)
```json
{
  "message_id": "d0fbc021-ef78-43d9-951b-10332309ec91",
  "response": {
    "type": "message",
    "content": "The Taj Palace Wedding requires 15 workers. Currently 15 workers are confirmed."
  },
  "session_state": {
    "current_event_id": "aaaa1111-1111-4aaa-8aaa-111111111111",
    "current_event_label": "Taj Palace Wedding",
    "current_worker_id": null,
    "current_worker_label": null
  }
}
```

### Write Intent Proposed Response (200 OK - Confirmation Required)
When the user requests an administrative mutation with a valid reason, the agent halts and returns `confirmation_required`:

```json
{
  "message_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "response": {
    "type": "confirmation_required",
    "actionId": "8ec9239b-af5f-4944-92bb-bda777e09592",
    "actionType": "change_worker_category",
    "displaySummary": {
      "action": "Change Worker Category",
      "workerId": "22222222-2222-4222-8222-222222222222",
      "workerName": "Arif Ahmed",
      "workerNumber": 1002,
      "currentCategory": "B",
      "newCategory": "A",
      "reason": "Outstanding performance in urgent wedding staffing",
      "notes": null
    },
    "content": "I have staged a category change for worker **Arif Ahmed** (Worker #1002) from category **B** to **A**.\n\nReason: \"Outstanding performance in urgent wedding staffing\"\n\nPlease review and confirm or cancel this action.",
    "expiresAt": "2026-09-13T01:00:00.000Z"
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

## 6. Get Active Pending Action for Session
**Endpoint**: `GET /v1/chat/sessions/:sessionId/action/pending`

Returns the currently pending action record awaiting confirmation in the session, or `{ "pending_action": null }`.

### Response (200 OK)
```json
{
  "pending_action": {
    "id": "8ec9239b-af5f-4944-92bb-bda777e09592",
    "session_id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
    "action_type": "change_worker_category",
    "status": "PENDING",
    "display_summary": {
      "action": "Change Worker Category",
      "workerName": "Arif Ahmed",
      "currentCategory": "B",
      "newCategory": "A",
      "reason": "Outstanding performance in urgent wedding staffing"
    },
    "expires_at": "2026-09-13T01:00:00.000Z",
    "created_at": "2026-09-13T00:50:00.000Z"
  }
}
```

---

## 7. Get Action Details by ID
**Endpoint**: `GET /v1/chat/actions/:actionId`

Returns the full status and history of any action proposed by the caller.

---

## 8. Confirm and Execute Pending Action
**Endpoint**: `POST /v1/chat/actions/:actionId/confirm`

Atomically claims the action, verifies that the underlying database entity state has not become stale, executes the corresponding Supabase RPC, verifies the updated state via read-after-write, and returns execution results.

### Response (200 OK)
```json
{
  "action_id": "8ec9239b-af5f-4944-92bb-bda777e09592",
  "session_id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
  "action_type": "change_worker_category",
  "status": "SUCCEEDED",
  "display_summary": {
    "action": "Change Worker Category",
    "workerName": "Arif Ahmed",
    "currentCategory": "B",
    "newCategory": "A"
  },
  "result_summary": {
    "worker_id": "22222222-2222-4222-8222-222222222222",
    "old_category": "B",
    "new_category": "A",
    "status": "SUCCESS"
  },
  "message": "Action 'change_worker_category' completed successfully."
}
```

### Error Responses
- `400 Bad Request`: `ACTION_EXPIRED` (TTL elapsed).
- `403 Forbidden`: `ACTION_FORBIDDEN` (caller is not the action owner).
- `404 Not Found`: `ACTION_NOT_FOUND` (unknown action ID).
- `409 Conflict`: `ACTION_ALREADY_RESOLVED` (action was already confirmed or cancelled).
- `409 Conflict`: `ACTION_STALE` (underlying entity state was modified before confirmation).

---

## 9. Cancel Pending Action
**Endpoint**: `POST /v1/chat/actions/:actionId/cancel`

Cancels a pending action and frees the session to accept new write proposals.

### Request Body (Optional)
```json
{
  "reason": "Admin decided to postpone this promotion."
}
```

### Response (200 OK)
```json
{
  "action_id": "8ec9239b-af5f-4944-92bb-bda777e09592",
  "session_id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
  "action_type": "change_worker_category",
  "status": "CANCELLED",
  "display_summary": { ... },
  "message": "Action 'change_worker_category' was cancelled."
}
```
