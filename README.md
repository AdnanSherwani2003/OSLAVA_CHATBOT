# Oslava Admin AI Chatbot Backend

A standalone, production-ready backend service designed to power the Oslava Admin AI Chatbot.

> **Architecture Boundary Notice**  
> This chatbot backend is a completely separate service hosted in this repository (`Oslava_Chatbot`). The main Flutter mobile application (`oslava-events-app`) is **not** part of this repository. This service interacts with the existing Oslava Supabase backend strictly as an external client and makes **zero modifications** to the main app, schema, RPCs, or Edge Functions.

---

## Implementation Status

- **Phase 1: Foundation → Authentication → Supabase Integration Gateway** — **COMPLETE**
- **Phase 2: 7 Read Capabilities & PII Sanitization** — **COMPLETE**
- **Phase 3: AI Agent, Groq GPT-OSS 120B, Tool Calling & Chat Persistence** — **COMPLETE**
- **Phase 4: Confirmation Engine, 4 Safe Write Intents & CLI Testing** — **COMPLETE**
- **Phase 5: Production Hardening & Admin Observability Metrics** — *Planned*

---

## Phase 3 AI Capabilities & Architecture

### 1. Groq Model Provider (`openai/gpt-oss-120b`)
- Integrated with Groq Cloud SDK (`groq-sdk`) using the `openai/gpt-oss-120b` model.
- Sequential tool calling with `parallel_tool_calls: false`.
- Automated transient retries for HTTP 429 and 5xx errors.
- Internal reasoning / thinking tags stripped before persistence or client transmission.

### 2. Bounded Tool Execution Loop (Max 5)
- Maximum 5 tool calls per user turn to prevent recursion.
- Exposes **strictly the 7 Phase 2 read capabilities**:
  1. `get_dashboard`
  2. `search_events`
  3. `get_event_details`
  4. `search_workers`
  5. `get_worker_details`
  6. `get_worker_history`
  7. `get_event_report`
- Write actions are forbidden in Phase 3. If requested, the agent responds:
  *"That action isn't available through the chatbot yet."*

### 3. Entity Context & Hallucination Guard
- Tracks `currentEventId`, `currentWorkerId`, and recent search results in `chat_session_state`.
- Resolves natural language references (e.g. "first one", "second one", "his history", "its report").
- Rejects ungrounded UUIDs before database execution.

### 4. Dual-Mode Persistence Architecture
- **`memory` mode (Default for dev & test)**:
  - Zero external database required.
  - No PostgreSQL, no Docker, no `DATABASE_URL`.
  - Sessions, message histories, active entity context, and traces live in an application-scoped in-memory store.
  - Server starts instantly with `npm run dev`.
  - `npm run db:migrate` safely skips without error.
- **`postgres` mode (Production & Staging)**:
  - Dedicated PostgreSQL database.
  - Requires `DATABASE_URL` and running PostgreSQL instance.
  - Run schema migrations via `npm run db:migrate`.
  - Automatic connection pool management via `pg`.

---

## Phase 4 Confirmation Engine & Safe Write Intents

Phase 4 implements audited, safe administrative mutations:
1. **Model Write Intents Only**: LLM cannot directly execute mutations or access `ActionExecutionService`.
2. **4 Supported Write Intents**:
   - `change_worker_category` (1-step promotion/demotion: F <-> C <-> B <-> A)
   - `publish_event` (DRAFT -> PUBLISHED / UPCOMING)
   - `complete_event` (IN_PROGRESS -> COMPLETED)
   - `close_event` (COMPLETED -> CLOSED)
3. **Mandatory Operational Reason**: Min 3 characters required. Model is strictly instructed never to fabricate generic reasons.
4. **Immediate Tool-Loop Halt**: Proposing a write action halts the agent loop immediately and returns a deterministic `confirmation_required` response.
5. **Atomic Claiming & Stale-State Detection**: Idempotent duplicate-click protection and pre-execution DB version checking.
6. **Dedicated Confirmation API**:
   - `POST /v1/chat/actions/:actionId/confirm`
   - `POST /v1/chat/actions/:actionId/cancel`
   - `GET /v1/chat/sessions/:sessionId/action/pending`
   - `GET /v1/chat/actions/:actionId`
7. **Interactive CLI Testing**:
   - Run `npm run chat`
   - Commands: `/pending`, `/confirm`, `/cancel`, `/state`, `/reset`, `/help`, `/exit`.

---

## Running the Service

### Mode 1: Local Logic Test Mode (Zero DB Setup)
Ideal for testing chatbot conversation logic, Groq agent tool calls, and frontend integration without launching Docker or PostgreSQL:

1. Configure `.env`:
```env
NODE_ENV=development
CHAT_PERSISTENCE_MODE=memory
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-key
GROQ_API_KEY=gsk_your_key_here
```
*(No `DATABASE_URL` needed)*

2. Start the development server:
```bash
npm run dev
```

### Mode 2: Production / Staging Mode (PostgreSQL Persistence)

1. Configure `.env`:
```env
NODE_ENV=production
CHAT_PERSISTENCE_MODE=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/oslava_chatbot
```

2. Run database migrations:
```bash
npm run db:migrate
```

3. Start server:
```bash
npm start
```

---

## Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Environment mode (`development`, `test`, `production`) |
| `PORT` | No | `3000` | HTTP port |
| `HOST` | No | `0.0.0.0` | Bind host |
| `CHAT_PERSISTENCE_MODE` | No | `memory` (dev/test), `postgres` (prod) | Persistence engine (`memory` or `postgres`) |
| `DATABASE_URL` | If `postgres` mode | - | PostgreSQL connection URL |
| `SUPABASE_URL` | **Yes** | - | URL of the Oslava Supabase project |
| `SUPABASE_PUBLISHABLE_KEY` | **Yes** | - | Supabase publishable/anon public key |
| `SUPABASE_ANON_KEY` | Optional | - | Accepted fallback if your project uses anon key naming |
| `GROQ_API_KEY` | No (for unit tests) | - | Groq Cloud API key for live AI agent |
| `GROQ_MODEL` | No | `openai/gpt-oss-120b` | Groq model identifier |
| `GROQ_REASONING_EFFORT`| No | `medium` | Reasoning effort (`low`, `medium`, `high`) |
| `GROQ_MAX_OUTPUT_TOKENS`| No | `2000` | Token limit for model output |
| `GROQ_TIMEOUT_MS` | No | `30000` | Groq HTTP timeout in ms |
| `CHAT_HISTORY_MESSAGE_LIMIT`| No | `16` | Message history window passed to LLM |
| `ACTION_CONFIRMATION_TTL_SECONDS`| No | `600` | TTL window in seconds for pending action confirmations |
| `LOG_LEVEL` | No | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`) |
| `CORS_ORIGINS` | No | `*` | Allowed CORS origins (comma-separated or `*`) |
| `REQUEST_TIMEOUT_MS` | No | `15000` | Request timeout in milliseconds |

> [!CAUTION]
> **No Service Role Key**: Never provide `SUPABASE_SERVICE_ROLE_KEY`. This service intentionally does not require or accept service-role permissions.

---

## Testing & Quality Assurance

### Run Self-Contained Tests
Runs 198 unit and integration tests completely offline without external databases or network calls:
```bash
npm test
```

### Typecheck & Build
```bash
npm run typecheck
npm run build
```

### Start Production Server
```bash
npm start
```

---

## Authentication Flow

Flutter clients authenticate by passing the Supabase access token in the `Authorization` header:

```http
GET /v1/auth/me HTTP/1.1
Host: localhost:3000
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

### Request Pipeline
1. Extract Bearer token from `Authorization` header.
2. Verify token validity with Supabase Auth (`supabase.auth.getUser(token)`).
3. Create a request-scoped Supabase client with the caller's JWT attached.
4. Call `public.my_profile()` RPC via the scoped client.
5. Enforce that role is `ADMIN` or `SUPER_ADMIN` (otherwise returns `403 ROLE_FORBIDDEN`).
6. Enforce that account status is `ACTIVE` (otherwise returns `403 ACCOUNT_RESTRICTED`).
7. Construct and attach `ActorContext` to Fastify request.

### Safe Response Shape (`GET /v1/auth/me`)
```json
{
  "user_id": "97d3910c-...",
  "role": "ADMIN",
  "display_name": "Jane Admin",
  "account_status": "ACTIVE",
  "worker_number": 102
}
```

---

## Standard Error Response Format

All API errors adhere to a uniform structure:

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authorization header is missing.",
    "retryable": false,
    "request_id": "req_88f98d94e77241cb985d852cb7ec62f1"
  }
}
```

### Error Codes
- `AUTH_REQUIRED` (401)
- `AUTH_INVALID` (401)
- `ROLE_FORBIDDEN` (403)
- `ACCOUNT_RESTRICTED` (403)
- `INVALID_INPUT` (400)
- `SUPABASE_UNAVAILABLE` (503, retryable: true)
- `INTERNAL_ERROR` (500)

---

## Project Structure

```
oslava-admin-ai/
├── src/
│   ├── application.ts                         # Fastify application factory
│   ├── server.ts                              # Entrypoint & graceful shutdown
│   ├── config/
│   │   └── env.ts                             # Strict Zod env validation
│   ├── api/
│   │   ├── routes/
│   │   │   ├── health.routes.ts               # /healthz & /readyz
│   │   │   └── auth.routes.ts                 # /v1/auth/me
│   │   └── middleware/
│   │       ├── auth.middleware.ts             # Supabase JWT authentication
│   │       ├── request-context.middleware.ts  # Request IDs & logging
│   │       └── error.middleware.ts            # Standard error envelope
│   ├── auth/
│   │   ├── actor-context.ts                   # Immutable security context
│   │   ├── auth.service.ts                    # Auth & profile verification
│   │   └── role-guard.ts                      # ADMIN & ACTIVE assertions
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.factory.ts              # Request-scoped client factory
│   │       ├── oslava.gateway.ts              # Gateway calling my_profile
│   │       ├── supabase.errors.ts             # Error mapping
│   │       └── contracts.ts                   # RPC return types
│   ├── domain/
│   │   ├── auth.types.ts                      # Domain roles & enums
│   │   └── errors.ts                          # Error hierarchy
│   ├── observability/
│   │   └── logger.ts                          # Pino logger with redaction
│   └── shared/
│       └── ids.ts                             # UUID request ID generator
├── tests/
│   ├── unit/
│   │   ├── auth/                              # Role guard & auth service tests
│   │   ├── config/                            # Environment parsing tests
│   │   └── integrations/                      # Client factory & gateway tests
│   └── integration/
│       └── api/                               # Health & auth integration tests
├── docs/
│   └── oslava-backend-contracts.md            # Verified Oslava contracts
├── .env.example
├── .gitignore
├── Dockerfile
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```
