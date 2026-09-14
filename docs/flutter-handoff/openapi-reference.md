# Flutter Handoff: OpenAPI Quick Reference

- **Production API**: `https://oslava-chatbot.vercel.app`
- **Authoritative Contract**: [API-CONTRACT-V1.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/API-CONTRACT-V1.md)
- **Machine-Readable OpenAPI 3.1.0 Spec**: [openapi.yaml](file:///d:/OSLAVA_CHATBOT/docs/openapi.yaml)

## Base URLs
- **Production**: `https://oslava-chatbot.vercel.app`
- **Local Dev / Android Emulator**: `http://10.0.2.2:3000`
- **Local Dev / iOS Simulator**: `http://localhost:3000`

## Endpoint Summary

| Endpoint | Method | Security | Tag | Summary |
|---|---|---|---|---|
| `/v1/chat/sessions` | `POST` | Bearer JWT | Application | 1. Creates new chat session |
| `/v1/chat/sessions` | `GET` | Bearer JWT | Application | 2. Lists chat sessions owned by caller |
| `/v1/chat/sessions/:sessionId` | `GET` | Bearer JWT | Application | 3. Fetches session & entity context |
| `/v1/chat/sessions/:sessionId/messages` | `GET` | Bearer JWT | Application | 4. Fetches historical messages |
| `/v1/chat/sessions/:sessionId/messages` | `POST` | Bearer JWT | Application | 5. Sends user prompt / triggers turn |
| `/v1/chat/sessions/:sessionId/action/pending` | `GET` | Bearer JWT | Application | 6. Fetches unresolved pending action |
| `/v1/chat/actions/:actionId` | `GET` | Bearer JWT | Application | 7. Fetches action record by ID |
| `/v1/chat/actions/:actionId/confirm` | `POST` | Bearer JWT | Application | 8. Executes pending mutation |
| `/v1/chat/actions/:actionId/cancel` | `POST` | Bearer JWT | Application | 9. Cancels pending mutation |
| `/v1/auth/me` | `GET` | Bearer JWT | Application | 10. Validates caller Admin profile |
| `/healthz` | `GET` | Public | Operational | Liveness probe (uptime check) |
| `/readyz` | `GET` | Public | Operational | Readiness probe (database readiness) |
| `/metrics` | `GET` | Public | Operational | Anonymized counters & latency metrics |

## Common Request Headers
```http
Authorization: Bearer <Supabase_JWT_Access_Token>
Content-Type: application/json
```

## Common Response Headers
- `x-request-id`: Trace ID assigned to the request
- `RateLimit-Limit`: Maximum permitted requests in current window
- `RateLimit-Remaining`: Remaining request allowance
- `RateLimit-Reset`: Seconds until quota refills
- `Retry-After`: Seconds to back off when HTTP 429 is encountered
