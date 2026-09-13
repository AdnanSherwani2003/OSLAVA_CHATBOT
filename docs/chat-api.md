# Chat API Documentation (Frozen V1 Contract)

> [!NOTE]
> For the authoritative master contract reference and Flutter integration guide, see [docs/flutter-handoff/API-CONTRACT-V1.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/API-CONTRACT-V1.md) and [docs/openapi.yaml](file:///d:/OSLAVA_CHATBOT/docs/openapi.yaml).

All Chat API endpoints require authentication with a valid Supabase JWT for an **ACTIVE** user with role **ADMIN** or **SUPER_ADMIN**.

Headers required:
- `Authorization: Bearer <supabase_jwt>`
- `Content-Type: application/json`

All responses return a top-level JSON envelope containing `request_id`.

---

## 1. Create a Chat Session
**Endpoint**: `POST /v1/chat/sessions`

### Response (201 Created)
```json
{
  "request_id": "req_88540c4900da44658a5433a0e69b5cfa",
  "session": {
    "id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
    "user_id": "41624b51-cf49-43c2-8419-74e2d3126f58",
    "status": "ACTIVE",
    "created_at": "2026-09-14T02:00:00.000Z",
    "updated_at": "2026-09-14T02:00:00.000Z",
    "last_activity_at": "2026-09-14T02:00:00.000Z"
  }
}
```

---

## 2. List Chat Sessions
**Endpoint**: `GET /v1/chat/sessions`

Returns all active and archived sessions created by the caller, sorted by `last_activity_at DESC`.

### Response (200 OK)
```json
{
  "request_id": "req_b28d08c581a84f39b1a03f421fbc3432",
  "sessions": [
    {
      "id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
      "user_id": "41624b51-cf49-43c2-8419-74e2d3126f58",
      "status": "ACTIVE",
      "created_at": "2026-09-14T02:00:00.000Z",
      "updated_at": "2026-09-14T02:00:00.000Z",
      "last_activity_at": "2026-09-14T02:00:00.000Z"
    }
  ]
}
```

---

## 3. Get Session Details & Active State
**Endpoint**: `GET /v1/chat/sessions/:sessionId`

Returns session metadata and current active entity state.

### Response (200 OK)
```json
{
  "request_id": "req_748fbc01d94b434cb27f88414b0bca22",
  "session": {
    "id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
    "user_id": "41624b51-cf49-43c2-8419-74e2d3126f58",
    "status": "ACTIVE",
    "created_at": "2026-09-14T02:00:00.000Z",
    "updated_at": "2026-09-14T02:00:00.000Z",
    "last_activity_at": "2026-09-14T02:00:00.000Z"
  },
  "session_state": {
    "current_event_id": "aaaa1111-1111-4aaa-8aaa-111111111111",
    "current_event_label": "Taj Palace Wedding",
    "current_worker_id": null,
    "current_worker_label": null,
    "recent_events": [],
    "recent_workers": []
  }
}
```

---

## 4. Get Message History
**Endpoint**: `GET /v1/chat/sessions/:sessionId/messages?limit=50&offset=0`

### Response (200 OK)
```json
{
  "request_id": "req_8604724b0a7d4dcf8ffbe31011406450",
  "session_id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
  "messages": [
    {
      "id": "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
      "session_id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
      "role": "USER",
      "content": "Show tomorrow's events",
      "created_at": "2026-09-14T02:01:00.000Z"
    },
    {
      "id": "f9e8d7c6-b5a4-49e8-8d7c-6b5a4f3e2d1c",
      "session_id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
      "role": "ASSISTANT",
      "content": "Tomorrow we have 1 event scheduled: **Taj Palace Wedding** (Draft, 12 workers needed).",
      "created_at": "2026-09-14T02:01:02.000Z"
    }
  ]
}
```

---

## 5. Send Message (Run Agent Turn)
**Endpoint**: `POST /v1/chat/sessions/:sessionId/messages`

### Standard Read Turn Response (200 OK)
```json
{
  "request_id": "req_318e8a60bb4a43aebc914e9f758410ca",
  "session_id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
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
  "request_id": "req_55b0a216d12f45888d30e3184f4f4699",
  "session_id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
  "message_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "response": {
    "type": "confirmation_required",
    "content": "I have staged a category change for worker **Arif Ahmed** (Worker #1002) from category **B** to **A**.\n\nReason: \"Outstanding performance in urgent wedding staffing\"\n\nPlease review and confirm or cancel this action.",
    "action": {
      "id": "8ec9239b-af5f-4944-92bb-bda777e09592",
      "type": "change_worker_category",
      "status": "PENDING",
      "expires_at": "2026-09-14T02:15:00.000Z",
      "summary": {
        "action": "Change Worker Category",
        "workerId": "22222222-2222-4222-8222-222222222222",
        "workerName": "Arif Ahmed",
        "workerNumber": 1002,
        "currentCategory": "B",
        "newCategory": "A",
        "reason": "Outstanding performance in urgent wedding staffing",
        "notes": null
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

## 6. Get Active Pending Action for Session
**Endpoint**: `GET /v1/chat/sessions/:sessionId/action/pending`

Returns the currently pending action record awaiting confirmation in the session, or `{ "request_id": "...", "session_id": "...", "pending_action": null }`.

### Response (200 OK)
```json
{
  "request_id": "req_847101bbd0674e2d83769165d4b8e219",
  "session_id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
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
    "expires_at": "2026-09-14T02:15:00.000Z",
    "created_at": "2026-09-14T02:05:00.000Z"
  }
}
```

---

## 7. Get Action Details by ID
**Endpoint**: `GET /v1/chat/actions/:actionId`

Returns public metadata and timestamps of any action proposed by the caller.

---

## 8. Confirm and Execute Pending Action
**Endpoint**: `POST /v1/chat/actions/:actionId/confirm`

Atomically claims the action, verifies that the underlying database entity state has not become stale, executes the corresponding Supabase RPC, verifies the updated state via read-after-write, and returns execution results.

### Response (200 OK)
```json
{
  "request_id": "req_d39589d107a94488be6dae766e4a689b",
  "session_id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
  "response": {
    "type": "action_completed",
    "content": "Action 'change_worker_category' completed successfully.",
    "action": {
      "id": "8ec9239b-af5f-4944-92bb-bda777e09592",
      "type": "change_worker_category",
      "status": "SUCCEEDED",
      "summary": {
        "action": "Change Worker Category",
        "workerName": "Arif Ahmed",
        "currentCategory": "B",
        "newCategory": "A"
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

## 9. Cancel Pending Action
**Endpoint**: `POST /v1/chat/actions/:actionId/cancel`

Cancels a pending action and frees the session to accept new write proposals.

### Response (200 OK)
```json
{
  "request_id": "req_45690184b23847e38466bbd08a5c43d2",
  "session_id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
  "response": {
    "type": "action_cancelled",
    "content": "Action 'change_worker_category' was cancelled.",
    "action": {
      "id": "8ec9239b-af5f-4944-92bb-bda777e09592",
      "type": "change_worker_category",
      "status": "CANCELLED",
      "summary": {
        "workerName": "Arif Ahmed",
        "currentCategory": "B",
        "newCategory": "A"
      }
    }
  }
}
```
