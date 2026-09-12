# Oslava Admin AI Chatbot — Final Manual Acceptance Checklist

This checklist provides a step-by-step verification script for quality assurance and staging acceptance.

---

## Test Suite Summary

- [ ] **A. Local Mock CLI Acceptance**
- [ ] **B. Local HTTP API with Staging Supabase**
- [ ] **C. Groq Live Function Calling Validation**
- [ ] **D. Staging Two-Phase Write Confirmation**
- [ ] **E. Flutter Mobile Integration Smoke Test**

---

## A. Local Mock CLI Acceptance

The interactive CLI tests end-to-end conversation, entity grounding, and confirmation loops completely offline using stateful mock data.

### Execution
```bash
npm run chat
```

### Steps & Expected Outcomes:
1. **Welcome Banner**:
   - Verify terminal displays `Oslava Admin AI — Local Development CLI`.
2. **Dashboard Query**:
   - Type: `what's happening today?`
   - *Expected Outcome*: Assistant presents an executive summary of today's events (Taj Palace Wedding, Corporate Meetup) using `get_dashboard`.
3. **Worker Search & Disambiguation**:
   - Type: `find Arif`
   - *Expected Outcome*: Shows 2 workers (Arif Khan #1001, Arif Ahmed #1002).
4. **Ordinal Selection**:
   - Type: `second one`
   - *Expected Outcome*: Selects Arif Ahmed (Category B) and shows profile details.
5. **Worker History**:
   - Type: `show his history`
   - *Expected Outcome*: Displays past assignments and attendance record.
6. **Write Intent & Confirmation Card**:
   - Type: `promote him to A because performance during high-volume wedding was outstanding`
   - *Expected Outcome*: CLI prints a framed confirmation card with Action ID, summary (B -> A), reason, and prompt to `/confirm` or `/cancel`.
7. **Pending Check**:
   - Type: `/pending`
   - *Expected Outcome*: Prints active pending action metadata.
8. **Confirmation**:
   - Type: `/confirm`
   - *Expected Outcome*: Displays `Action executed successfully!`
9. **Verification**:
   - Type: `what category is he now?`
   - *Expected Outcome*: Reports Arif Ahmed is now Category A.

---

## B. Local HTTP API with Staging Supabase

Validates Fastify HTTP layer, Supabase authentication, and request-scoped queries.

### Setup
In `.env`:
```bash
NODE_ENV=development
SUPABASE_URL=https://your-staging.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-staging-anon-key
```
Start server:
```bash
npm run dev
```

### Steps:
1. **Health Check**:
   ```bash
   curl http://localhost:3000/healthz
   ```
   *Expected*: `200 OK`, `status: "ok"`.
2. **Readiness Probe**:
   ```bash
   curl http://localhost:3000/readyz
   ```
   *Expected*: `200 OK`, `status: "ready"`.
3. **Verify Admin Auth Profile**:
   ```bash
   curl http://localhost:3000/v1/auth/me \
     -H "Authorization: Bearer <STAGING_ADMIN_JWT>"
   ```
   *Expected*: `200 OK`, returns user ID and role (`ADMIN` or `SUPER_ADMIN`).
4. **Reject Worker Auth**:
   ```bash
   curl http://localhost:3000/v1/auth/me \
     -H "Authorization: Bearer <WORKER_JWT>"
   ```
   *Expected*: `403 Forbidden`, `error.code: "ROLE_FORBIDDEN"`.

---

## C. Groq Live Validation

Validates live inference with Groq `openai/gpt-oss-120b`.

### Execution
```bash
RUN_LIVE_GROQ_TESTS=true GROQ_API_KEY=gsk_... npm test -- tests/evals/groq-live.eval.test.ts
```

### Verification Criteria:
- Model reliably selects `get_dashboard`, `search_workers`, and `search_events`.
- Model never outputs thinking tags `<think>`.
- Out-of-scope requests (e.g. `create_event`) are politely refused without hallucinating tools.

---

## D. Staging Two-Phase Write Confirmation

> [!CAUTION]
> Never run live mutation tests without dedicated, disposable staging fixture IDs!

### Execution
```bash
RUN_STAGING_E2E_TESTS=true \
OSLAVA_TEST_BASE_URL=http://localhost:3000 \
OSLAVA_TEST_ADMIN_JWT=<admin_token> \
OSLAVA_TEST_WORKER_ID=<disposable_worker_uuid> \
npm test -- tests/integration/staging/staging-e2e.test.ts
```

### Verification Criteria:
- Category promotion creates pending action without mutating Supabase.
- Calling `/confirm` executes the Supabase RPC `change_worker_category`.
- Worker category in Supabase transitions by exactly 1 tier.

---

## E. Flutter Mobile Integration Smoke Test

1. Launch Flutter Admin app connected to backend at `http://10.0.2.2:3000` (Android) or `http://localhost:3000` (iOS).
2. Log in as an Admin user.
3. Open AI Chatbot screen.
4. Send message: `what's happening today?` -> Verify assistant speech bubble appears with formatted markdown.
5. Send message: `find Arif` -> Verify matching workers list appears.
6. Propose category promotion -> Verify styled confirmation card appears with **Confirm** and **Cancel** buttons.
7. Click **Confirm** -> Verify card changes to green success badge and updated category is displayed.
8. Propose draft event publish -> Click **Cancel** -> Verify card is dismissed and event remains in DRAFT.
