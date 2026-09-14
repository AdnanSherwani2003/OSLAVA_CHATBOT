# Oslava Admin AI Chatbot — Flutter Integration Guide

> [!IMPORTANT]
> **Primary Guides**:
> - **[FLUTTER-INTEGRATION-GUIDE.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/FLUTTER-INTEGRATION-GUIDE.md)**: Comprehensive, step-by-step practical integration manual.
> - **[API-CONTRACT-V1.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/API-CONTRACT-V1.md)**: Authoritative frozen V1 master contract.
> - **[FLUTTER-DEVELOPER-CHECKLIST.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/FLUTTER-DEVELOPER-CHECKLIST.md)**: Pre-release verification checklist.

## Base URLs
- **Production API**: `https://oslava-chatbot.vercel.app`
- **Local Dev / Android Emulator**: `http://10.0.2.2:3000`
- **Local Dev / iOS Simulator**: `http://localhost:3000`

---

## 1. Authentication & Token Forwarding

The Flutter app **already owns the Supabase user session**. You do **not** need to perform a separate login or obtain a new token specifically for the chatbot.

### How to Authenticate
Pass the user's active Supabase session access token in the `Authorization` header for **every** chatbot backend request:

```http
Authorization: Bearer <current_supabase_access_token>
```

### In Dart / Flutter:
```dart
final session = Supabase.instance.client.auth.currentSession;
final accessToken = session?.accessToken;

final response = await http.post(
  Uri.parse('$chatbotBaseUrl/v1/chat/sessions/$sessionId/messages'),
  headers: {
    'Authorization': 'Bearer $accessToken',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({'message': userPrompt}),
);
```

### Handling Token Expiration (`401 AUTH_INVALID`)
- If the backend returns HTTP 401 with error code `AUTH_INVALID`, the Supabase access token has expired or is invalid.
- Call Supabase's standard session refresh:
  ```dart
  await Supabase.instance.client.auth.refreshSession();
  ```
- Then retry the request with the refreshed token.
- **DO NOT** persist or manage a separate JWT store for the chatbot.

---

## 2. API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v1/auth/me` | Verify active Admin credentials and profile |
| `POST` | `/v1/chat/sessions` | Create a new chat session |
| `GET` | `/v1/chat/sessions` | List active sessions for caller |
| `GET` | `/v1/chat/sessions/:sessionId` | Get session details & entity state |
| `GET` | `/v1/chat/sessions/:sessionId/messages` | Load historical messages (`?limit=50&offset=0`) |
| `POST` | `/v1/chat/sessions/:sessionId/messages` | Send message and execute AI agent turn |
| `GET` | `/v1/chat/sessions/:sessionId/action/pending` | Check active pending action for session |
| `GET` | `/v1/chat/actions/:actionId` | Get action details |
| `POST` | `/v1/chat/actions/:actionId/confirm` | **Explicitly execute** pending mutation |
| `POST` | `/v1/chat/actions/:actionId/cancel` | Cancel pending mutation |

---

## 3. Conversational Message Flow

When the user types a message in Flutter, send:
```http
POST /v1/chat/sessions/:sessionId/messages
{
  "message": "Promote Arif to category A because of exemplary performance"
}
```

The response contains a `response.type` field determining how Flutter renders the UI:

### Flow Branching
```
                      POST /messages
                            │
                            ▼
              ┌───────────────────────────┐
              │ Inspect 'response.type'   │
              └─────────────┬─────────────┘
                            │
      ┌─────────────────────┼─────────────────────┐
      ▼                     ▼                     ▼
type: "message"    type: "entity_selection_   type: "confirmation_required"
Render text bubble      required"              Render confirmation card
                   Render selectable chips     with Confirm / Cancel buttons
```

### Supported Response Types:
1. `type: "message"`: Standard conversational response. Render as an assistant speech bubble with Markdown support.
2. `type: "entity_selection_required"`: Disambiguation prompt. Render `content` and selectable chip/list options from `selection.options`. When the user taps an option, send its `display_name` back as the next chat message.
3. `type: "confirmation_required"`: Staged mutation. Render a dedicated confirmation card displaying the summary, expiration timer, and two action buttons: **Confirm** and **Cancel**.
4. `type: "action_completed"`: Result of explicit confirmation. Render green success confirmation status.
5. `type: "action_cancelled"`: Result of explicit cancellation. Render grey cancellation notice.

> [!WARNING]
> **CRITICAL**: Do **NOT** attempt to confirm an action by sending conversational words like `"yes"`, `"okay"`, or `"confirm"` through `POST /messages`.
> Mutations can **ONLY** be executed by calling the dedicated `POST /v1/chat/actions/:actionId/confirm` endpoint.

---

## 4. Confirmation Card Flow

When `type === "confirmation_required"` is received:

```json
{
  "request_id": "req_55b0a216d12f45888d30e3184f4f4699",
  "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
  "message_id": "b304cbca-e2e7-402b-a36c-92d6e3c63d59",
  "response": {
    "type": "confirmation_required",
    "content": "I have staged a category change for worker Arif Ahmed from B to A.",
    "action": {
      "id": "baa8a85d-e77c-40fc-ac31-29e3959c4afa",
      "type": "change_worker_category",
      "status": "PENDING",
      "expires_at": "2026-09-14T02:15:00.000Z",
      "summary": {
        "workerName": "Arif Ahmed",
        "workerNumber": 1002,
        "currentCategory": "B",
        "newCategory": "A",
        "reason": "Exemplary performance during banquet"
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

### When User Taps "Confirm":
```dart
final confirmRes = await http.post(
  Uri.parse('$chatbotBaseUrl/v1/chat/actions/$actionId/confirm'),
  headers: {'Authorization': 'Bearer $accessToken'},
);
```

Response (`HTTP 200 OK`):
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
        "reason": "Exemplary performance during banquet"
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

### When User Taps "Cancel":
```dart
final cancelRes = await http.post(
  Uri.parse('$chatbotBaseUrl/v1/chat/actions/$actionId/cancel'),
  headers: {
    'Authorization': 'Bearer $accessToken',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({'reason': 'Admin decided to postpone'}),
);
```

Response (`HTTP 200 OK`):
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
        "reason": "Exemplary performance during banquet"
      }
    }
  }
}
```

---

## 5. Standard Error Handling

Every non-2xx response from the chatbot returns a single standardized JSON envelope:

```json
{
  "error": {
    "code": "ACTION_STALE",
    "message": "Worker state changed since proposal. Expected category 'B', current is 'C'.",
    "retryable": false,
    "request_id": "req_8e94a821-3a0c"
  }
}
```

### Key Error Codes for Flutter:
- `AUTH_REQUIRED` (401): Missing authorization header. Redirect to login.
- `AUTH_INVALID` (401): Refresh Supabase session and retry.
- `ROLE_FORBIDDEN` (403): User is not an active Admin. Show access denied notice.
- `ACCOUNT_RESTRICTED` (403): Admin account is suspended or inactive.
- `ACTION_STALE` (409): Entity changed out-of-band. Dismiss confirmation card and refresh conversation.
- `ACTION_EXPIRED` (400): 10-minute confirmation TTL lapsed. Prompt user to re-request action.
- `ACTION_ALREADY_RESOLVED` (409): Action was already executed or cancelled. Disable buttons.
- `PENDING_ACTION_EXISTS` (409): Staged action already exists. Show pending action card or request cancellation.
- `MODEL_UNAVAILABLE` / `MODEL_RATE_LIMITED` / `MODEL_TIMEOUT` (503/429/504): `retryable: true`. Offer user retry affordance.
- `INTERNAL_ERROR` (500): Server error. Log `request_id` for investigation.
