# Flutter Handoff: Confirmation Card & Two-Phase Mutation Flow

The Oslava Admin AI Chatbot uses an **absolute two-phase write safety model**.

> [!IMPORTANT]
> The AI model **NEVER** mutates database state directly.
> Asking the bot to "promote Arif" merely creates a **pending action** with status `PENDING`.
> Only an explicit HTTP POST request from the Flutter app executing the confirmation endpoint can perform the database write.

---

## 1. The Confirmation Card Component

When `type === "confirmation_required"` is received, render a card containing:
1. **Action Title**:
   - `change_worker_category`: "Confirm Worker Category Change"
   - `publish_event`: "Confirm Publish Event"
   - `complete_event`: "Confirm Complete Event"
   - `close_event`: "Confirm Close Event"
2. **Details Summary**: From `displaySummary`.
3. **Countdown Timer**: Using `expiresAt` (actions expire in 10 minutes).
4. **Action Buttons**:
   - Primary: **Confirm Change**
   - Secondary: **Cancel**

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
  "action_id": "baa8a85d-e77c-40fc-ac31-29e3959c4afa",
  "session_id": "sess_12345",
  "action_type": "change_worker_category",
  "status": "SUCCEEDED",
  "display_summary": {
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
  "action_id": "baa8a85d-e77c-40fc-ac31-29e3959c4afa",
  "session_id": "sess_12345",
  "action_type": "change_worker_category",
  "status": "CANCELLED",
  "display_summary": { ... },
  "message": "Action 'change_worker_category' was cancelled."
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
