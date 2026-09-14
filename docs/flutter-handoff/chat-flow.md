# Flutter Handoff: Chat Messaging & UI State Flow

- **Production API**: `https://oslava-chatbot.vercel.app`
- **Authoritative Contract**: [API-CONTRACT-V1.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/API-CONTRACT-V1.md)

## 1. Creating and Loading Sessions

### Initialize or Resume a Chat Session
1. **List existing sessions**: `GET /v1/chat/sessions`
2. **Create new session**: `POST /v1/chat/sessions`
3. **Load messages**: `GET /v1/chat/sessions/:sessionId/messages?limit=50&offset=0`

### Checking for Pending Action on Screen Open
When entering a chat screen, check if there is an unresolved action waiting for confirmation:
```http
GET /v1/chat/sessions/:sessionId/action/pending
```
If `pending_action` is not null, immediately render the confirmation card at the bottom of the chat list.

---

## 2. Sending a Message

```http
POST /v1/chat/sessions/:sessionId/messages
{
  "message": "Find workers named Arif"
}
```

The response contains a top-level envelope. Inspect `response.type`:

### Type 1: `message` (Standard Assistant Text)
```json
{
  "request_id": "req_318e8a60bb4a43aebc914e9f758410ca",
  "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
  "message_id": "84c8a2b5-1234-4567-89ab-cdef01234567",
  "response": {
    "type": "message",
    "content": "I found 2 workers matching 'Arif':\n1. Arif Khan (Category C)\n2. Arif Ahmed (Category B)"
  },
  "session_state": {
    "current_event_id": null,
    "current_event_label": null,
    "current_worker_id": null,
    "current_worker_label": null
  }
}
```
**UI Action**: Append a new assistant message bubble to the list view with markdown rendering.

---

### Type 2: `entity_selection_required` (Disambiguation)
When the user's intent is clear but references multiple matching entities (e.g., "Promote Arif" when two exist):
```json
{
  "request_id": "req_79c836d5e1284ebcb895fa784860bca1",
  "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
  "message_id": "84c8a2b5-1234-4567-89ab-cdef01234567",
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
**UI Action**: Render `content` and present interactive selection chips or a bottom sheet using `selection.options`.
When the user taps an option, send their selection as the next message:
```dart
sendMessage("Arif Ahmed");
```

---

### Type 3: `confirmation_required` (Mutation Staged)
When an action is proposed:
```json
{
  "request_id": "req_55b0a216d12f45888d30e3184f4f4699",
  "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
  "message_id": "84c8a2b5-1234-4567-89ab-cdef01234567",
  "response": {
    "type": "confirmation_required",
    "content": "I have staged a category change for Arif Ahmed from B to A.",
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
**UI Action**: Display the confirmation card with **Confirm** and **Cancel** buttons. (See `confirmation-flow.md`).

> [!WARNING]
> Natural-language replies such as `"yes"`, `"okay"`, `"confirm"`, or `"do it"` must **NEVER** cause Flutter to call the confirm endpoint.
> Only an explicit tap on the Confirmation UI button may call `/v1/chat/actions/:actionId/confirm`.

