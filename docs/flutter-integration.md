# Oslava Admin AI Chatbot — Flutter Integration Guide

This guide is designed for the Flutter developer integrating the Oslava Admin AI Chatbot into the mobile application.

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
  "message": "Promote Arif to tier A because of great performance"
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

### UI Types:
1. `type: "message"`: Standard conversational response. Render as an assistant speech bubble.
2. `type: "entity_selection_required"`: Disambiguation prompt. Render `question` and a list of selectable chip/list options. When the user taps an option, send its label or ordinal back as a chat message.
3. `type: "confirmation_required"`: Staged mutation. Render a dedicated confirmation dialog/card displaying the summary, expiration timer, and two action buttons: **Confirm** and **Cancel**.

> [!WARNING]
> **CRITICAL**: Do **NOT** attempt to confirm an action by sending the word `"yes"` or `"confirm"` through `POST /messages`.
> Mutations can **ONLY** be executed by calling the dedicated `POST /v1/chat/actions/:actionId/confirm` endpoint.

---

## 4. Confirmation Card Flow

When `type === "confirmation_required"` is received:

```json
{
  "type": "confirmation_required",
  "actionId": "baa8a85d-e77c-40fc-ac31-29e3959c4afa",
  "actionType": "change_worker_category",
  "displaySummary": {
    "workerName": "Arif Ahmed",
    "workerNumber": 1002,
    "currentCategory": "B",
    "newCategory": "A",
    "reason": "Demonstrated exemplary service"
  },
  "content": "I have staged a category change for worker Arif Ahmed...",
  "expiresAt": "2026-09-13T01:30:00.000Z"
}
```

### When User Taps "Confirm":
```dart
final confirmRes = await http.post(
  Uri.parse('$chatbotBaseUrl/v1/chat/actions/$actionId/confirm'),
  headers: {'Authorization': 'Bearer $accessToken'},
);
```

Response:
```json
{
  "action_id": "baa8a85d-e77c-40fc-ac31-29e3959c4afa",
  "status": "SUCCEEDED",
  "message": "Action 'change_worker_category' completed successfully."
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

Response:
```json
{
  "action_id": "baa8a85d-e77c-40fc-ac31-29e3959c4afa",
  "status": "CANCELLED",
  "message": "Action 'change_worker_category' was cancelled."
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
- `AUTH_INVALID` (401): Refresh Supabase session and retry.
- `ROLE_FORBIDDEN` (403): User is not an active Admin. Show access denied notice.
- `ACTION_STALE` (409): Entity changed out-of-band. Dismiss confirmation card and refresh conversation.
- `ACTION_EXPIRED` (400): 10-minute confirmation TTL lapsed. Prompt user to re-request action.
- `ACTION_ALREADY_RESOLVED` (409): Action was already executed or cancelled. Disable buttons.
- `PENDING_ACTION_EXISTS` (409): Staged action already exists. Show pending action card or request cancellation.
