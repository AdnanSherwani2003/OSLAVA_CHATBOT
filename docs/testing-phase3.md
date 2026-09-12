# Phase 3 Testing Strategy

## Overview
Phase 3 introduces end-to-end testing across 4 key dimensions:
1. **Persistence Repositories**: Dual-mode storage (PostgreSQL and in-memory test store).
2. **Context & Guardrails**: Hallucination guards, ordinal resolution, pronoun tracking, state reduction.
3. **AI Layer**: Groq provider error handling, transient retries, bounded tool loop (max 5), write interception.
4. **Chat API Integration**: Fastify route testing with mock authentication and session isolation.

---

## Running the Automated Tests

### 1. Fast, Self-Contained Test Suite (No External DB or API Key Required)
All 119 unit and integration tests run entirely offline with zero external network calls or database dependencies:
```bash
npm test
```

### 2. Typecheck & Build Validation
```bash
npm run typecheck
npm run build
```

---

## Local PostgreSQL Testing (Optional)
To test against a real PostgreSQL instance:

1. Start PostgreSQL 16 via Docker:
```bash
docker compose -f docker-compose.dev.yml up -d
```

2. Run the database migration runner:
```bash
DATABASE_URL=postgres://oslava_user:oslava_password@localhost:5432/oslava_chatbot npm run db:migrate
```

3. Start the application:
```bash
DATABASE_URL=postgres://oslava_user:oslava_password@localhost:5432/oslava_chatbot npm run dev
```

---

## Live Groq Testing (Optional)
To run live end-to-end completions against Groq Cloud:
```bash
GROQ_API_KEY=gsk_your_key_here npm run test:groq
```
*(Only runs when `GROQ_API_KEY` is explicitly provided)*
