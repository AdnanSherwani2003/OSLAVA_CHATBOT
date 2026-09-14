# Flutter Handoff: Confirmation Card & Two-Phase Mutation Flow

- **Production API**: `https://oslava-chatbot.vercel.app`
- **Authoritative Contract**: [API-CONTRACT-V1.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/API-CONTRACT-V1.md)

The Oslava Admin AI Chatbot uses an **absolute two-phase write safety model**.

> [!IMPORTANT]
> The AI model **NEVER** mutates database state directly.
> Asking the bot to "promote Arif" merely creates a **pending action** with status `PENDING`.
> Only an explicit HTTP POST request from the Flutter app executing the confirmation endpoint can perform the database write.
>
> **Natural-language replies such as "yes", "okay", "confirm", or "do it" must NEVER cause Flutter to call the confirm endpoint.** Only an explicit user tap on the UI Confirmation button may call `/confirm`.

---

## 1. The Confirmation Card Component

When `type === "confirmation_required"` is received (or restored via `GET /v1/chat/sessions/:sessionId/action/pending`), render a card containing:
1. **Action Title**:
   - `change_worker_category`: "Confirm Worker Category Change"
   - `publish_event`: "Confirm Publish Event"
   - `complete_event`: "Confirm Complete Event"
   - `close_event`: "Confirm Close Event"
2. **Details Summary**: From `response.action.summary` (or `pending_action.display_summary` when restored from `/pending`).
3. **Countdown Timer**: Using `expires_at` (actions expire in 10 minutes from creation).
4. **Action Buttons**:
   - Primary: **Confirm Change**
   - Secondary: **Cancel**
5. **Duplicate Click Protection**: Both buttons must be disabled immediately upon user tap while the request is in flight.

---

## 2. Confirming the Action

When the user taps **Confirm**, make an HTTP request:

```http
POST /v1/chat/actions/:actionId/confirm
Authorization: Bearer <supabase_access_token>
```

### Success Response (HTTP 200)
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
**UI Action**:
- Replace the confirmation card with a green success badge.
- Append a system confirmation message bubble to the chat timeline.

---

## 3. Cancelling the Action

When the user taps **Cancel**:

```http
POST /v1/chat/actions/:actionId/cancel
Authorization: Bearer <supabase_access_token>
Content-Type: application/json

{
  "reason": "Admin decided to review later"
}
```

### Response (HTTP 200)
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
**UI Action**:
- Remove the confirmation card.
- Append a subtle grey cancellation indicator to the timeline.

---

## 4. Edge Cases to Handle

| Scenario | HTTP Status | Error Code | Recommended Flutter Action |
|---|---|---|---|
| **Expired** | 400 | `ACTION_EXPIRED` | Hide buttons; show "Action expired. Please request again." |
| **Stale State** | 409 | `ACTION_STALE` | Show "Entity state changed in background (e.g. status was updated). Action aborted." |
| **Duplicate Click** | 409 | `ACTION_ALREADY_RESOLVED` | Disable button; show "Action already executed." |
| **Single Pending Constraint** | 409 | `PENDING_ACTION_EXISTS` | If user asks to change another thing while an action is pending, notify them to confirm or cancel the active one first. |
