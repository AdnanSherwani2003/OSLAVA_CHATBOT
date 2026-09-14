# Flutter Handoff: Error Envelope & Error Codes Contract

- **Production API**: `https://oslava-chatbot.vercel.app`
- **Authoritative Contract**: [API-CONTRACT-V1.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/API-CONTRACT-V1.md)

All API errors adhere to one single uniform JSON structure. Always capture and log `request_id` for diagnostics.

```json
{
  "error": {
    "code": "STRING_ERROR_CODE",
    "message": "Human-readable explanation of what happened.",
    "retryable": false,
    "request_id": "req_84c8a2b5-1234"
  }
}
```

---

## Complete Error Code Reference

### 1. Authentication & Authorization
| Code | HTTP | Description | Action for Flutter |
|---|---|---|---|
| `AUTH_REQUIRED` | 401 | Missing `Authorization` header. | Supply valid Supabase Bearer token. |
| `AUTH_INVALID` | 401 | Token expired or signature invalid. | Refresh Supabase session and retry. |
| `ROLE_FORBIDDEN` | 403 | User is not `ADMIN` or `SUPER_ADMIN`. | Block access; show Admin requirement notice. |
| `ACCOUNT_RESTRICTED` | 403 | User account is not `ACTIVE`. | Notify user to contact administrator. |

### 2. Client Inputs & Entity Grounding
| Code | HTTP | Description | Action for Flutter |
|---|---|---|---|
| `INVALID_INPUT` | 400 | Payload validation failure or malformed JSON. | Correct request format or parameter value. |
| `ENTITY_NOT_FOUND` | 404 | Worker, event, session, or route not found. | Display not found notice. |
| `DOMAIN_REJECTED` | 422 | Business rule rejected (e.g. attempting 2-step category jump). | Display message from error envelope. |

### 3. Session & Chat Context
| Code | HTTP | Description | Action for Flutter |
|---|---|---|---|
| `SESSION_NOT_FOUND` | 404 | Provided `sessionId` does not exist. | Create a new session. |
| `SESSION_FORBIDDEN` | 403 | Session belongs to another admin. | Disallow access; switch to user's own session. |

### 4. Write Confirmation Lifecycle
| Code | HTTP | Description | Action for Flutter |
|---|---|---|---|
| `ACTION_NOT_FOUND` | 404 | Action ID does not exist. | Dismiss card. |
| `ACTION_FORBIDDEN` | 403 | Action was staged by another admin. | Disallow confirm/cancel. |
| `ACTION_EXPIRED` | 400 | 10-minute TTL has elapsed. | Disable confirm button; show expired label. |
| `ACTION_ALREADY_RESOLVED` | 409 | Action was already executed or cancelled. | Disable buttons; refresh view. |
| `ACTION_STALE` | 409 | Worker category or event status changed out-of-band. | Abort mutation; notify user of new state. |
| `PENDING_ACTION_EXISTS` | 409 | Another action is already pending confirmation in this session. | Prompt user to confirm/cancel current pending action first. |
| `ACTION_EXECUTION_FAILED` | 500 | Database RPC failed during execution. | Display failure message. |
| `ACTION_OUTCOME_UNKNOWN` | 500 | Mutation timed out; state uncertain. | Prompt user to manually verify in events/workers view. |

### 5. AI Model & Infrastructure
| Code | HTTP | Description | Action for Flutter |
|---|---|---|---|
| `MODEL_UNAVAILABLE` | 503 | AI provider is unreachable. | Show temporary outage message; offer retry. |
| `MODEL_RATE_LIMITED` | 429 | AI rate limit reached. | Retry after a few seconds (`retryable: true`). |
| `MODEL_TIMEOUT` | 504 | AI model inference timed out. | Retry with a shorter or simpler prompt. |
| `MODEL_INVALID_RESPONSE` | 502 | AI output format was unparseable. | Offer retry. |
| `TOOL_LIMIT_EXCEEDED` | 429 | Exceeded 5 tool calls per turn. | Clarify question to reduce query breadth. |
| `SUPABASE_UNAVAILABLE` | 503 | Database gateway temporarily unavailable. | Retry when connection is restored. |
| `INTERNAL_ERROR` | 500 | Unexpected server exception. | Generic error banner with `request_id`. |
