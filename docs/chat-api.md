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

### Response (200 OK)
```json
{
  "sessions": [
    {
      "id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
      "user_id": "41624b51-cf49-43c2-8419-74e2d3126f58",
      "status": "ACTIVE",
      "created_at": "2026-09-12T18:00:00.000Z",
      "updated_at": "2026-09-12T18:05:00.000Z",
      "last_activity_at": "2026-09-12T18:05:00.000Z"
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
  "session": {
    "id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
    "user_id": "41624b51-cf49-43c2-8419-74e2d3126f58",
    "status": "ACTIVE",
    "created_at": "2026-09-12T18:00:00.000Z",
    "updated_at": "2026-09-12T18:05:00.000Z",
    "last_activity_at": "2026-09-12T18:05:00.000Z"
  },
  "session_state": {
    "current_event_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "current_event_label": "Corporate Gala 2026",
    "current_worker_id": "a5c962b9-e1b7-4389-980b-044198188177",
    "current_worker_label": "John Doe",
    "recent_events": [
      {
        "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "title": "Corporate Gala 2026",
        "date": "2026-09-20",
        "status": "PUBLISHED"
      }
    ],
    "recent_workers": [
      {
        "id": "a5c962b9-e1b7-4389-980b-044198188177",
        "fullName": "John Doe",
        "category": "A",
        "status": "ACTIVE"
      }
    ]
  }
}
```

---

## 4. Get Message History
**Endpoint**: `GET /v1/chat/sessions/:sessionId/messages?limit=50&offset=0`

### Response (200 OK)
```json
{
  "messages": [
    {
      "id": "7b0932c0-cf52-47a6-9db4-7a1a09dcefcb",
      "session_id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
      "role": "USER",
      "content": "Show me events happening this weekend",
      "created_at": "2026-09-12T18:01:00.000Z"
    },
    {
      "id": "d0fbc021-ef78-43d9-951b-10332309ec91",
      "session_id": "c3a64982-f5e1-4547-9751-2eeffcb029a1",
      "role": "ASSISTANT",
      "content": "I found 2 events scheduled for this weekend:\n1. Corporate Gala 2026\n2. Charity Auction",
      "created_at": "2026-09-12T18:01:02.000Z"
    }
  ]
}
```

---

## 5. Send Message (Run Agent Turn)
**Endpoint**: `POST /v1/chat/sessions/:sessionId/messages`

### Request Body
```json
{
  "message": "What is the staffing status for the Corporate Gala?"
}
```

### Response (200 OK)
```json
{
  "message_id": "d0fbc021-ef78-43d9-951b-10332309ec91",
  "response": {
    "type": "message",
    "content": "The Corporate Gala 2026 requires 12 workers. Currently 10 workers are confirmed, leaving 2 vacant spots."
  },
  "session_state": {
    "current_event_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "current_event_label": "Corporate Gala 2026",
    "current_worker_id": null,
    "current_worker_label": null
  }
}
```

---

## Curl Example
```bash
# 1. Create a new session
SESSION_ID=$(curl -s -X POST http://localhost:3000/v1/chat/sessions \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" | jq -r '.session.id')

# 2. Send a message
curl -s -X POST http://localhost:3000/v1/chat/sessions/$SESSION_ID/messages \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is today'\''s dashboard summary?"}' | jq
```
