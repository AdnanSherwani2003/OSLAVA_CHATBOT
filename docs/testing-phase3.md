# Phase 3 Testing & Persistence Modes

## Overview
Phase 3 supports two distinct persistence modes to maximize developer velocity while providing production-grade scalability:
1. **Memory Mode (`CHAT_PERSISTENCE_MODE=memory`)**: In-memory repositories. Zero external DB, Docker, or connection pools. Default for development and test.
2. **Postgres Mode (`CHAT_PERSISTENCE_MODE=postgres`)**: Dedicated PostgreSQL database with SQL schema migrations and persistent connection pooling.

---

## 1. LOCAL LOGIC TEST MODE (Recommended for Local Dev)

In this mode:
- Chat sessions, messages, entity context, traces, and tool execution logs live in an application-scoped in-memory store.
- State persists across requests within the same server process and clears when the process restarts.

### Configuration
```env
NODE_ENV=development
CHAT_PERSISTENCE_MODE=memory
# DATABASE_URL is NOT required
```

### What It Requires:
- Node.js (v20+)
- Groq API key (`GROQ_API_KEY`) for live AI conversations
- Supabase credentials (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) only if accessing live Oslava read tools

### What It Does NOT Require:
- PostgreSQL
- Docker
- `DATABASE_URL`
- `npm run db:migrate` (if executed, safely skips with informational message)

### Running Dev Server in Memory Mode:
```bash
npm run dev
```

---

## 2. PRODUCTION / STAGING MODE (`CHAT_PERSISTENCE_MODE=postgres`)

In this mode:
- All chat sessions, messages, session states, tool executions, and traces are persisted to PostgreSQL.
- Requires a running PostgreSQL instance and `DATABASE_URL`.

### Configuration
```env
NODE_ENV=production
CHAT_PERSISTENCE_MODE=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/oslava_chatbot
```

### Setup & Migrations
1. Start PostgreSQL (e.g. via local Docker Compose):
```bash
docker compose -f docker-compose.dev.yml up -d
```

2. Run database migrations:
```bash
npm run db:migrate
```

3. Start server:
```bash
npm run start
```

---

## 3. Running Automated Tests
All 126 unit and integration tests run entirely in memory with zero external database dependencies or network calls:
```bash
npm test
npm run typecheck
npm run build
```

---

## 4. Live Groq Testing (Optional)
To run live completions against Groq Cloud:
```bash
GROQ_API_KEY=gsk_your_key_here npm run test:groq
```
*(Only executed when `GROQ_API_KEY` is provided)*
