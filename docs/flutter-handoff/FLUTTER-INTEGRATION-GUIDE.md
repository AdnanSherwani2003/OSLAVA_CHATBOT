# Oslava Admin AI Chatbot — Flutter Integration Guide

This is the definitive, step-by-step practical implementation guide for Flutter engineers integrating the Oslava Admin AI Chatbot into the mobile application.

---

## 1. Safety & Production Testing Policy

> [!CAUTION]
> ### Production Testing Rules
> Production Flutter integration testing must initially use **strictly read-only workflows**:
> - Admin authentication & profile check (`GET /v1/auth/me`)
> - Session creation (`POST /v1/chat/sessions`)
> - Session listing (`GET /v1/chat/sessions`)
> - Conversation history loading (`GET /v1/chat/sessions/:sessionId/messages`)
> - Read-only conversational queries (e.g. "What's happening today?", "Show worker Arif Khan")
> - Entity selection / disambiguation flows
> - Unsupported-action refusal tests (e.g. "Create a new event", "Assign worker to event")
> - Pending-action retrieval (`GET /v1/chat/sessions/:sessionId/action/pending`)
>
> **DO NOT execute real `publish_event`, `complete_event`, `close_event`, or `change_worker_category` production confirmations merely to test Flutter UI.**
> All write mutation UI paths should first be validated using local development mocks or dedicated non-production test environments.

---

## A. Production Configuration

The standalone chatbot backend is deployed and active in production.

### Base URLs
- **Production API**: `https://oslava-chatbot.vercel.app`
- **Local Dev / Android Emulator**: `http://10.0.2.2:3000`
- **Local Dev / iOS Simulator**: `http://localhost:3000`

### Environment Configuration in Flutter
Do **not** hardcode URLs or backend secrets. Expose the base URL via your Flutter configuration or environment layer:

```dart
// lib/core/config/app_environment.dart
class AppEnvironment {
  static const String chatbotBaseUrl = String.fromEnvironment(
    'CHATBOT_BASE_URL',
    defaultValue: 'https://oslava-chatbot.vercel.app',
  );
}
```

### Absolute Zero-Secrets Rule for Flutter
The following secrets belong **strictly** to backend infrastructure and must **NEVER** appear in the Flutter codebase, app assets, or client bundles:
- `GROQ_API_KEY`
- `DATABASE_URL`
- Neon credentials / connection strings
- Supabase `service_role` key (Flutter only ever possesses the client publishable/anon key)
- Vercel deployment secrets or environment variables
- Any internal encryption or signing keys

---

## B. Authentication & Authorization

The chatbot backend has **no separate login system**. It leverages your existing Supabase authentication.

### Token Forwarding
Retrieve the active admin's Supabase JWT access token and include it in every HTTP request:

```dart
import 'package:supabase_flutter/supabase_flutter.dart';

String? getSupabaseAccessToken() {
  return Supabase.instance.client.auth.currentSession?.accessToken;
}
```

### Required Request Headers
Every protected endpoint requires:
```http
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

### Allowed Roles & Account Status
The backend enforces role-based and account-status access control on every turn:
- **Role**: Must be `ADMIN` or `SUPER_ADMIN`
- **Status**: Must be `ACTIVE`

Any request from non-admin roles (e.g. standard `WORKER` or `LEADER`) or non-active accounts is immediately rejected (`403 ROLE_FORBIDDEN` or `403 ACCOUNT_RESTRICTED`).

### Token Expiry & Automatic Refresh (`AUTH_INVALID`)
Supabase access tokens expire periodically (typically after 1 hour). When a token expires, the backend responds with:
- HTTP `401 Unauthorized`
- Error code `AUTH_INVALID`

#### Recommended Flutter Refresh Interceptor
Refresh the Supabase session **once** and retry the original request. Do not log the user out unless the refresh call itself fails:

```dart
Future<http.Response> authenticatedChatbotRequest({
  required String method,
  required Uri uri,
  Map<String, dynamic>? body,
}) async {
  String? token = getSupabaseAccessToken();
  if (token == null) {
    throw Exception('No active Supabase session available.');
  }

  http.Response response = await _send(method, uri, token, body);

  if (response.statusCode == 401) {
    try {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      final errorCode = json['error']?['code'];

      if (errorCode == 'AUTH_INVALID') {
        // Refresh Supabase session once
        final refreshResponse = await Supabase.instance.client.auth.refreshSession();
        final newToken = refreshResponse.session?.accessToken;

        if (newToken != null) {
          // Retry original request with new token
          response = await _send(method, uri, newToken, body);
        }
      }
    } catch (_) {
      // Re-throw or proceed with original response if refresh fails
    }
  }

  return response;
}
```

---

## C. Chat Lifecycle Architecture

Follow this strict lifecycle sequence whenever the Admin Chatbot screen initializes or resumes:

```
                  Chat Screen Loaded / Resumed
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │ 1. Verify Profile: GET /v1/auth/me (optional) │
        └──────────────────────┬───────────────────────┘
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │ 2. Fetch Sessions: GET /v1/chat/sessions      │
        └──────────────────────┬───────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   [Existing Session Found]              [No Existing Session]
            │                                     │
            │                          POST /v1/chat/sessions
            │                                     │
            └──────────────────┬──────────────────┘
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │ 3. Load History:                             │
        │    GET /v1/chat/sessions/:sessionId/messages  │
        └──────────────────────┬───────────────────────┘
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │ 4. RESTORE PENDING ACTION (CRITICAL):        │
        │    GET .../sessions/:sessionId/action/pending │
        └──────────────────────┬───────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
  [pending_action != null]               [pending_action == null]
            │                                     │
  Render Confirmation Card               Show regular message
  with Confirm & Cancel                  input bar
```

### Step-by-Step API Calls

1. **Optionally verify admin profile**:
   ```http
   GET /v1/auth/me
   ```
   Validates permissions and provides the admin's `display_name` and `role`.

2. **List existing sessions**:
   ```http
   GET /v1/chat/sessions
   ```
   Returns sessions owned by the authenticated admin.

3. **Create new session when needed**:
   ```http
   POST /v1/chat/sessions
   ```
   Initializes an empty session. Response provides `session.id`.

4. **Load message history**:
   ```http
   GET /v1/chat/sessions/:sessionId/messages?limit=50&offset=0
   ```
   Populates chronological chat history (`role: "USER" | "ASSISTANT"`).

5. **Always restore pending action**:
   ```http
   GET /v1/chat/sessions/:sessionId/action/pending
   ```
   > [!IMPORTANT]
   > If the user previously staged a write action, closed the app, and reopened it, `pending_action` will contain the unconfirmed proposal.
   > **If `pending_action != null`, immediately render the confirmation card again.**

---

## D. Sending Messages & Response Type Routing

### Send Message Request
```http
POST /v1/chat/sessions/:sessionId/messages
Content-Type: application/json

{
  "message": "What's happening today?"
}
```

### Response Envelope & Public Response Types
The turn response contains:
```json
{
  "request_id": "req_318e8a60bb4a43aebc914e9f758410ca",
  "session_id": "2ff5d0c5-8d62-48a0-9cc4-47ea818cf0f9",
  "message_id": "93424d5b-426c-486a-a82f-8706d860d5b6",
  "response": {
    "type": "<response_type>",
    "content": "..."
  },
  "session_state": { ... }
}
```

Flutter **must switch on `response.type`**.

| Response Type | Trigger Scenario | UI Treatment in Flutter |
|---|---|---|
| `message` | Informational read answer, general Q&A, or status overview. | Render standard Markdown speech bubble on the assistant side. |
| `entity_selection_required` | User referenced an entity with multiple matches (e.g. two workers named "Arif"). | Render assistant question followed by interactive selection chips or a bottom sheet containing `selection.options`. |
| `confirmation_required` | Admin requested a write mutation (e.g. promote worker, publish event). | Render a highlighted Confirmation Card with action summary, countdown timer, and **Confirm** / **Cancel** buttons. |
| `action_completed` | Returned after explicit confirmation via `POST /v1/chat/actions/:actionId/confirm`. | Replace confirmation card with green success status and append confirmation notice. |
| `action_cancelled` | Returned after explicit cancellation via `POST /v1/chat/actions/:actionId/cancel`. | Dismiss confirmation card and append grey cancellation notice. |

---

## E. Entity Selection Flow

When `response.type == "entity_selection_required"`, the payload includes options:

```json
{
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
  }
}
```

### Handling Rules
1. Render each option in `selection.options` as a tappable chip or card showing `display_name` and `subtitle`.
2. When the user taps an option, **send the selected entity's `display_name` as the next normal message**:
   ```dart
   sendMessage(selectedOption.displayName); // e.g. "Arif Ahmed"
   ```
3. **Do not invent or forge internal UUIDs client-side** into the message text. The backend conversational agent uses the display name / worker number to ground the entity deterministically.

---

## F. Two-Phase Confirmation Flow

> [!WARNING]
> ### STRICT SAFETY CONTRACT
> Natural language replies such as:
> - `"yes"`
> - `"okay"`
> - `"confirm"`
> - `"do it"`
>
> **must NEVER cause Flutter to call the confirm endpoint.**
>
> Conversational messages sent to `POST /v1/chat/sessions/:sessionId/messages` are strictly processed as chat turns.
> **Only an explicit tap on the Confirmation UI button may call `/v1/chat/actions/:actionId/confirm`.**

### Confirmation Card Presentation
When `response.type == "confirmation_required"`, render:
1. **Action Title**:
   - `change_worker_category`: "Confirm Worker Category Change"
   - `publish_event`: "Confirm Event Publication"
   - `complete_event`: "Confirm Event Completion"
   - `close_event`: "Confirm Event Closure"
2. **Action Summary**: Render key-value pairs from `response.action.summary`.
3. **Expiry Countdown**: Compute remaining seconds from `response.action.expires_at` (10-minute lifetime). When expired, disable the confirm button.
4. **Action Buttons**:
   - **Confirm Button** (Accent / Primary color)
   - **Cancel Button** (Subtle / Outlined style)
5. **Immediate Button Disabling**: Disable both buttons immediately upon user tap to block duplicate network submissions.

### Executing Confirmation
```http
POST /v1/chat/actions/:actionId/confirm
Authorization: Bearer <supabase_access_token>
```

#### Success Response (`action_completed`)
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

### Executing Cancellation
```http
POST /v1/chat/actions/:actionId/cancel
Authorization: Bearer <supabase_access_token>
Content-Type: application/json

{
  "reason": "Admin decided to review later"
}
```

#### Success Response (`action_cancelled`)
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

## G. Supported V1 Capabilities & Strict Boundaries

The V1 API contract is frozen. Flutter UI must strictly reflect supported capabilities and must **never** render UI or quick-actions prompting unsupported actions.

### 1. Supported Read Capabilities (7 Tools)
- **Dashboard overview**: Today's event counts, total workers required, active recruitment status.
- **Search events**: Filter by date, date range, status, or keyword.
- **Event details**: Timings, location, status, confirmed headcount, supervisors, leaders.
- **Search workers**: Filter by name, worker number, category (A/B/C/D), or status.
- **Worker details**: Rating, phone number, category, performance history, status.
- **Worker history**: Past event attendances, absences, and ratings.
- **Event report**: Post-event completion report, actual vs required headcount, no-show rates.

### 2. Supported Write Actions (Exactly 4 Intents)
1. `change_worker_category`: Transition worker category (e.g. B to A, C to B) with mandatory reason.
2. `publish_event`: Transition event from `DRAFT` to `PUBLISHED`.
3. `complete_event`: Transition event from `PUBLISHED` to `COMPLETED`.
4. `close_event`: Transition event from `COMPLETED` to `CLOSED`.

### 3. Strictly Unsupported Capabilities (Do NOT build UI for these)
The backend chatbot deliberately refuses the following actions in V1:
- ❌ Creating new events
- ❌ Editing event details (dates, venues, times)
- ❌ Cancelling events
- ❌ Assigning workers to events
- ❌ Removing, reassigning, or replacing workers
- ❌ Assigning or removing event leaders or supervisors
- ❌ Opening, closing, or modifying recruitment
- ❌ Changing staffing requirements, headcounts, or wages/allowances
- ❌ Registering or approving new workers
- ❌ Deleting records or arbitrary database mutations

When an admin asks for an unsupported capability, the backend issues an polite refusal explaining that the operation must be completed through the standard admin management screens.

---

## H. Error Handling & Flutter Response Strategies

All errors return the standard error envelope:
```json
{
  "error": {
    "code": "STRING_ERROR_CODE",
    "message": "Human-readable explanation of error.",
    "retryable": false,
    "request_id": "req_8e94a821"
  }
}
```

### Error Code Resolution Matrix

| Error Code | HTTP Status | Retryable | Flutter Handling Strategy |
|---|---|---|---|
| `AUTH_REQUIRED` | 401 | `false` | Missing authorization token. Redirect admin to login screen. |
| `AUTH_INVALID` | 401 | `false` | Supabase JWT expired. Perform automatic `refreshSession()` and retry request once. |
| `ROLE_FORBIDDEN` | 403 | `false` | User is not `ADMIN` or `SUPER_ADMIN`. Block access; display access restriction view. |
| `ACCOUNT_RESTRICTED` | 403 | `false` | Account is suspended or pending approval. Notify user to contact superadmin. |
| `INVALID_INPUT` | 400 | `false` | Malformed request or validation error. Check syntax; display message to user. |
| `SESSION_NOT_FOUND` | 404 | `false` | Session expired or deleted. Create a new session with `POST /v1/chat/sessions`. |
| `SESSION_FORBIDDEN` | 403 | `false` | Session belongs to another admin. Clear session ID and switch to user's sessions. |
| `ACTION_EXPIRED` | 400 | `false` | 10-minute confirmation window lapsed. Disable confirm button; show "Action expired". |
| `ACTION_STALE` | 409 | `false` | Entity state changed out-of-band (e.g. worker category already changed). Dismiss card; refresh chat. |
| `ACTION_ALREADY_RESOLVED` | 409 | `false` | Action was already executed or cancelled. Disable buttons; mark card as resolved. |
| `PENDING_ACTION_EXISTS` | 409 | `false` | Another action is already pending confirmation. Show dialog asking admin to confirm or cancel active action. |
| `MODEL_UNAVAILABLE` | 503 | `true` | AI provider temporarily unavailable. Show retry button in speech bubble. |
| `MODEL_RATE_LIMITED` | 429 | `true` | LLM rate limit encountered. Wait 2-3 seconds and retry automatically. |
| `MODEL_TIMEOUT` | 504 | `true` | Model inference exceeded 30s. Offer user a "Tap to retry" option. |
| `SUPABASE_UNAVAILABLE` | 503 | `true` | Database connection glitch. Wait briefly and allow retry. |
| `INTERNAL_ERROR` | 500 | `false` | Unhandled server error. Display error snackbar and log `request_id`. |

### Diagnostic Logging
Always capture and include `request_id` in Flutter diagnostic logs or crash analytics:
```dart
debugPrint('Chatbot Error [${error['code']}]: ${error['message']} (Request ID: ${error['request_id']})');
```

---

## I. Timezone Contract

- **Backend Business Timezone**: `Asia/Kolkata` (`UTC+05:30`).
- **Date Interpretations**: The backend model evaluates queries like "today", "tomorrow", "this weekend", and "next Monday" according to the `Asia/Kolkata` clock.
- **Client Rule**: Flutter must **not** attempt to convert phrases like "What's happening today?" into UTC calendar timestamps before sending. Transmit the user's natural language verbatim. The backend handles date resolution safely.

---

## J. Networking & UX Best Practices

1. **Loading Indicators**:
   Show an animated typing/thinking bubble in the chat view while `POST /messages` is awaiting a response.
2. **Prevent Duplicate Sends**:
   Disable the send button and input field while an agent turn request is in flight.
3. **Prevent Duplicate Confirmations**:
   Disable both **Confirm** and **Cancel** buttons immediately upon tap to avoid parallel execution calls.
4. **Selective Retries**:
   Only retry failed HTTP requests automatically when `error.retryable == true`. Never retry `400`, `403`, or non-retryable `409` errors.
5. **Preserve Session ID in Local Storage**:
   Persist `sessionId` in Flutter secure storage or `SharedPreferences` so users resume their active conversation across app launches.
6. **Re-check Pending Action on App Resume**:
   Hook into Flutter's `WidgetsBindingObserver.didChangeAppLifecycleState`. When `AppLifecycleState.resumed` occurs, re-fetch `GET /v1/chat/sessions/:sessionId/action/pending` to check if a pending action expired while the app was backgrounded.
7. **Rely on Backend Message History**:
   Do not rely solely on volatile in-memory chat state. Always populate the timeline from `GET /v1/chat/sessions/:sessionId/messages` to ensure consistent synchronization across devices.
