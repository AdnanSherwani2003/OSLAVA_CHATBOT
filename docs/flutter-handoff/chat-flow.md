# Flutter Handoff: Chat Messaging & UI State Flow

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

The response contains a `response` object. Inspect `response.type`:

### Type 1: `message` (Standard Assistant Text)
```json
{
  "message_id": "84c8a2b5-1234-4567-89ab-cdef01234567",
  "response": {
    "type": "message",
    "content": "I found 2 workers matching 'Arif':\n1. Arif Khan (Category C)\n2. Arif Ahmed (Category B)"
  }
}
```
**UI Action**: Append a new assistant message bubble to the list view with markdown rendering.

---

### Type 2: `entity_selection_required` (Disambiguation)
When the user's intent is clear but references multiple matching entities (e.g., "Promote Arif" when two exist):
```json
{
  "message_id": "84c8a2b5-1234-4567-89ab-cdef01234567",
  "response": {
    "type": "entity_selection_required",
    "entityType": "worker",
    "question": "Which worker did you mean?",
    "options": [
      {
        "id": "11111111-1111-4111-8111-111111111111",
        "label": "Arif Khan (Worker #1001, Category C)"
      },
      {
        "id": "22222222-2222-4222-8222-222222222222",
        "label": "Arif Ahmed (Worker #1002, Category B)"
      }
    ]
  }
}
```
**UI Action**: Render `question` and present interactive selection chips or a bottom sheet.
When the user taps an option, send their selection as the next message:
```dart
sendMessage("Arif Ahmed");
```

---

### Type 3: `confirmation_required` (Mutation Staged)
When an action is proposed:
```json
{
  "message_id": "84c8a2b5-1234-4567-89ab-cdef01234567",
  "response": {
    "type": "confirmation_required",
    "actionId": "baa8a85d-e77c-40fc-ac31-29e3959c4afa",
    "actionType": "change_worker_category",
    "displaySummary": {
      "workerName": "Arif Ahmed",
      "workerNumber": 1002,
      "currentCategory": "B",
      "newCategory": "A",
      "reason": "Exemplary performance during banquet"
    },
    "content": "I have staged a category change for Arif Ahmed from B to A.",
    "expiresAt": "2026-09-13T02:15:00.000Z"
  }
}
```
**UI Action**: Display the confirmation card with **Confirm** and **Cancel** buttons. (See `confirmation-flow.md`).
