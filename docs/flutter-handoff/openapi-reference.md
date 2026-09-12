# Flutter Handoff: OpenAPI Quick Reference

The full machine-readable specification is available at [docs/openapi.yaml](file:///d:/OSLAVA_CHATBOT/docs/openapi.yaml).

## Endpoint Summary

| Endpoint | Method | Security | Summary |
|---|---|---|---|
| `/healthz` | `GET` | Public | Liveness probe (uptime check) |
| `/readyz` | `GET` | Public | Readiness probe (database readiness) |
| `/metrics` | `GET` | Public | Anonymized counters & latency metrics |
| `/v1/auth/me` | `GET` | Bearer JWT | Validates caller Admin profile |
| `/v1/chat/sessions` | `POST` | Bearer JWT | Creates new chat session |
| `/v1/chat/sessions` | `GET` | Bearer JWT | Lists chat sessions owned by caller |
| `/v1/chat/sessions/:sessionId` | `GET` | Bearer JWT | Fetches session & entity context |
| `/v1/chat/sessions/:sessionId/messages` | `GET` | Bearer JWT | Fetches historical messages |
| `/v1/chat/sessions/:sessionId/messages` | `POST` | Bearer JWT | Sends user prompt / triggers turn |
| `/v1/chat/sessions/:sessionId/action/pending` | `GET` | Bearer JWT | Fetches unresolved pending action |
| `/v1/chat/actions/:actionId` | `GET` | Bearer JWT | Fetches action record by ID |
| `/v1/chat/actions/:actionId/confirm` | `POST` | Bearer JWT | Executes pending mutation |
| `/v1/chat/actions/:actionId/cancel` | `POST` | Bearer JWT | Cancels pending mutation |

## Common Request Headers
```http
Authorization: Bearer <Supabase_JWT_Access_Token>
Content-Type: application/json
```

## Common Response Headers
- `RateLimit-Limit`: Maximum permitted requests in current window
- `RateLimit-Remaining`: Remaining request allowance
- `RateLimit-Reset`: Seconds until quota refills
- `Retry-After`: Seconds to back off when HTTP 429 is encountered
