# Oslava Admin AI Chatbot — Flutter Developer Checklist

This pre-release verification checklist is designed for Flutter engineers integrating the Oslava Admin AI Chatbot into the mobile application.

Before submitting a pull request or cutting a production release, ensure that all items below are verified and passing.

---

## 1. Configuration & Security

- [ ] **production base URL configured**
  - Base URL is set to `https://oslava-chatbot.vercel.app` via app environment configuration (e.g. `AppEnvironment.chatbotBaseUrl`).
  - No legacy or staging URLs (`api-chatbot.oslava.com`, etc.) remain in client code.

- [ ] **existing Supabase JWT forwarded**
  - All protected API calls pass `Authorization: Bearer <supabase_access_token>`.
  - Token is dynamically extracted via `Supabase.instance.client.auth.currentSession?.accessToken`.

- [ ] **no backend secrets included in Flutter**
  - Verified that `GROQ_API_KEY`, `DATABASE_URL`, Neon credentials, and Vercel secrets are not present in `.env`, constants, assets, or Git history.

- [ ] **no service-role key included in Flutter**
  - Flutter app only holds the public/anon Supabase key. The `service_role` key is strictly kept in the backend environment.

- [ ] **timezone handling verified**
  - Client sends natural language queries ("today", "tomorrow") without manual pre-conversion to UTC.
  - Backend timezone (`Asia/Kolkata`) resolves time queries accurately.

---

## 2. Authentication & Admin Authorization

- [ ] **/v1/auth/me tested**
  - Successfully returns active admin profile and confirms `ADMIN` or `SUPER_ADMIN` role with `ACTIVE` status.
  - Correctly blocks or handles non-admin test users with `403 ROLE_FORBIDDEN`.

- [ ] **401 refresh flow implemented**
  - When backend responds with `401 AUTH_INVALID`, client executes `Supabase.instance.client.auth.refreshSession()`.
  - The failed request is retried once with the new access token before reporting an error.

---

## 3. Session & Message Lifecycle

- [ ] **session creation works**
  - Calling `POST /v1/chat/sessions` creates a session and returns a valid UUID `session.id`.

- [ ] **session list works**
  - Calling `GET /v1/chat/sessions` returns all sessions belonging to the authenticated admin.

- [ ] **message history works**
  - Calling `GET /v1/chat/sessions/:sessionId/messages` populates the chat list with existing user and assistant turns.

- [ ] **send message works**
  - Calling `POST /v1/chat/sessions/:sessionId/messages` dispatches user prompts and renders AI responses.

- [ ] **markdown assistant messages render**
  - Assistant responses (`type == "message"`) render formatted Markdown (bold, lists, headings) cleanly.

---

## 4. Entity Disambiguation & Confirmation Flow

- [ ] **entity selection renders**
  - When receiving `type == "entity_selection_required"`, UI displays interactive options.
  - Tapping an option dispatches the option's `display_name` as the next message (without forged IDs).

- [ ] **pending action is restored on screen reload**
  - On chat screen load or app resume, `GET /v1/chat/sessions/:sessionId/action/pending` is invoked.
  - If a pending action exists, the confirmation card is rendered immediately.

- [ ] **confirmation card renders**
  - When receiving `type == "confirmation_required"`, card renders action summary, 10-minute expiry countdown, and action buttons.

- [ ] **explicit confirm button wired**
  - Primary button calls `POST /v1/chat/actions/:actionId/confirm`.
  - Never triggered by natural language phrases like "yes" or "confirm" in the chat input.

- [ ] **cancel button wired**
  - Secondary button calls `POST /v1/chat/actions/:actionId/cancel`.

- [ ] **duplicate confirm taps blocked**
  - Confirm and Cancel buttons are disabled immediately upon first tap while network call is in flight.

---

## 5. Reliability, Error Handling & Diagnostics

- [ ] **retryable server errors handled**
  - Network errors with `error.retryable == true` (e.g. `MODEL_UNAVAILABLE`, `MODEL_RATE_LIMITED`, `MODEL_TIMEOUT`) show retry affordances.
  - Non-retryable errors show user-friendly feedback without infinite retry loops.

- [ ] **request_id logged**
  - Every failed HTTP response's `request_id` is captured and printed in diagnostic debug logs.

- [ ] **unsupported actions remain plain refusals**
  - Admin requests for out-of-scope actions (e.g. "Create an event", "Assign worker") show plain assistant refusal messages.
  - No custom UI or buttons exist for unsupported actions.

- [ ] **production read-only smoke test completed**
  - Read queries, session navigation, and history loading have been verified against `https://oslava-chatbot.vercel.app` without performing unauthorized write mutations.
