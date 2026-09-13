# Flutter Handoff: Concrete Response DTO Examples

This document provides exact, copy-pasteable JSON responses for every response type in the Oslava Admin AI Chatbot API.

All response envelopes contain `request_id` and, where applicable, `session_id`, `message_id`, `response`, and `session_state`.

---

## 1. Normal Message Response (`type: "message"`)
Returned when the agent answers a question using read tools.

```json
{
  "request_id": "req_318e8a60bb4a43aebc914e9f758410ca",
  "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
  "message_id": "93424d5b-426c-486a-a82f-8706d860d5b6",
  "response": {
    "type": "message",
    "content": "Today we have **2 events** scheduled:\n- **Taj Palace Wedding**: 15 workers confirmed, banquet starts at 4:00 PM.\n- **Corporate Meetup**: 8 workers confirmed, reporting at 8:00 AM."
  },
  "session_state": {
    "current_event_id": "aaaa1111-1111-4aaa-8aaa-111111111111",
    "current_event_label": "Taj Palace Wedding",
    "current_worker_id": null,
    "current_worker_label": null
  }
}
```

---

## 2. Entity Selection Required (`type: "entity_selection_required"`)
Returned when an entity reference is ambiguous and needs user selection.

```json
{
  "request_id": "req_79c836d5e1284ebcb895fa784860bca1",
  "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
  "message_id": "e9365e12-881c-4ce1-8072-a169b2d86a41",
  "response": {
    "type": "entity_selection_required",
    "content": "I found multiple workers matching that query. Which one would you like to inspect?",
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

---

## 3. Confirmation Required (`type: "confirmation_required"`)
Returned when a write action is staged for admin confirmation.

```json
{
  "request_id": "req_55b0a216d12f45888d30e3184f4f4699",
  "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
  "message_id": "b304cbca-e2e7-402b-a36c-92d6e3c63d59",
  "response": {
    "type": "confirmation_required",
    "content": "I have staged a category change for worker **Arif Ahmed** (Worker #1002) from category **B** to **A**.\n\nReason: \"Demonstrated exemplary service during high-volume wedding\"\n\nPlease review and confirm or cancel this action.",
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
        "reason": "Demonstrated exemplary service during high-volume wedding"
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

## 4. Action Completed / Executed (`POST /v1/chat/actions/:actionId/confirm`)
Returned upon explicit confirmation.

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
        "reason": "Demonstrated exemplary service"
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

## 5. Action Cancelled (`POST /v1/chat/actions/:actionId/cancel`)
Returned upon explicit cancellation.

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
        "reason": "Demonstrated exemplary service"
      }
    }
  }
}
```

---

## 6. Standard Error Response
Returned on any 4xx / 5xx error.

```json
{
  "error": {
    "code": "ACTION_STALE",
    "message": "Worker state changed since proposal. Expected category 'B', current is 'C'.",
    "retryable": false,
    "request_id": "req_84c8a2b5d123"
  }
}
```
