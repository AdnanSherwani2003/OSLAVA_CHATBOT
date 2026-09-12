# Testing Phase 4: Confirmation Engine & Write Intents

## 1. Interactive CLI Confirmation Testing

Run the interactive terminal interface:

```bash
npm run chat
```

### Example Test Flows

#### Flow 1: Proposing and Confirming a Worker Category Change
1. Find a worker:
   ```text
   You > search workers named Arif
   ```
2. Inspect worker details:
   ```text
   You > show details for Arif Ahmed
   ```
3. Request category change with a clear operational reason:
   ```text
   You > promote Arif Ahmed to category A because of outstanding shift punctuality
   ```
   *The assistant returns a confirmation card and stages the action with a 600s TTL.*
4. Check pending status:
   ```text
   You > /pending
   ```
5. Confirm and execute the mutation:
   ```text
   You > /confirm
   ```
   *The mutation executes via the gateway, and the updated status is displayed.*
6. Inspect the worker again to verify the mutation took effect:
   ```text
   You > show details for Arif Ahmed
   ```
   *Category is now A.*

#### Flow 2: Proposing and Cancelling an Action
1. Stage an action:
   ```text
   You > publish the Tech Conference event because the schedule is finalised
   ```
2. Cancel the action:
   ```text
   You > /cancel
   ```
3. Check pending:
   ```text
   You > /pending
   ```
   *Returns: No pending actions awaiting confirmation in this session.*

#### Flow 3: Natural Language Safety
1. Stage an action.
2. In chat, type:
   ```text
   You > yes, please confirm it
   ```
   *The assistant explains that natural language cannot confirm changes and instructs you to click the button or run `/confirm <actionId>`.*

---

## 2. Automated Test Verification

Run all test suites:

```bash
npm test
```

Current test suite contains **198 passing tests** across 33 test files:
- `tests/unit/actions/action-proposal.test.ts` (11 tests): 1-step category transition, single-pending check, reason validation, DRAFT/IN_PROGRESS/COMPLETED status guards.
- `tests/unit/actions/action-confirmation.test.ts` (10 tests): confirm and cancel lifecycles, expiration checks, authorization, atomic claiming, stale-state detection.
- `tests/unit/actions/action-execution.test.ts` (5 tests): read-after-write verification, unknown outcome handling, no blind retries.
- `tests/unit/actions/action-schemas.test.ts` (8 tests): strict zod validation.
- `tests/unit/actions/security-boundary.test.ts` (3 tests): isolation of `ActionExecutionService` and proof that write intent tools cannot mutate data directly.
- `tests/integration/api/chat-actions.test.ts` (3 tests): HTTP endpoints for `/v1/chat/actions/:actionId/confirm`, `/cancel`, `/pending`.
