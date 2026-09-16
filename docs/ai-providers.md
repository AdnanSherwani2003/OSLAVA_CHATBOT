# AI Provider Architecture: OpenAI Primary with Groq Fallback

## Overview
The Oslava Admin AI Chatbot uses a resilient, two-tier AI provider architecture:
- **Primary Provider**: OpenAI API using `gpt-4o-mini`
- **Fallback Provider**: Groq API using `openai/gpt-oss-120b`

All model turns attempt OpenAI first. If OpenAI experiences an eligible provider failure (such as rate limits, timeouts, service outages, or invalid responses), the system automatically, seamlessly, and transparently falls back to Groq.

> [!NOTE]
> **Client Transparency**: This multi-provider architecture is entirely internal to the backend. The public `/v1` HTTP API, request/response envelopes, and Flutter integration package remain frozen and unchanged.

---

## Architecture

```
                       ToolLoop Turn
                             │
                             ▼
                 [FallbackModelProvider]
                             │
             ┌───────────────┴───────────────┐
             │ 1. Attempt Primary Invocation │
             ▼                               ▼
     [OpenAIProvider]                  [Error Raised?]
     Model: gpt-4o-mini                      │
             │                               │
             ├────── Success ────────────────┤
             │                               ▼
             │                      [Eligible AI Failure?]
             │                      (429, 5xx, timeout, invalid)
             │                               │
             │                     ┌─────────┴─────────┐
             │                    YES                  NO
             │                     │                   │
             │                     ▼                   ▼
             │             [GroqProvider]         Rethrow Error
             │       Model: openai/gpt-oss-120b   (No Fallback)
             │                     │
             ▼                     ▼
       Return Turn Response to ToolLoop
```

---

## Fallback Rules & Boundaries

### 1. Eligible Failures for Fallback
Fallback from OpenAI to Groq is triggered **strictly** for AI provider infrastructure failures:
- `ModelUnavailableError`: HTTP 5xx, network errors, socket hang-ups (`ECONNRESET`, `ETIMEDOUT`).
- `ModelTimeoutError`: OpenAI inference took longer than `OPENAI_TIMEOUT_MS` (30s).
- `ModelRateLimitedError`: HTTP 429 quota/rate limit reached on OpenAI.
- `ModelInvalidResponseError`: OpenAI returned an unparseable or empty choices array.

### 2. Strict No-Fallback Boundaries
Fallback is **NEVER** triggered by:
- Supabase database errors
- Neon PostgreSQL connection issues
- Business/domain rule rejections
- Invalid user input or validation errors
- Unsupported chatbot operations
- Tool execution failures
- Action stale or expired states
- Entity not found

The fallback layer wraps **model completion invocation only**. It never retries or duplicates already executed tools, staged actions, or database mutations.

---

## Retry Strategy & Latency Bounds

To prevent compounding latency delays:
1. **OpenAI Provider**: Configured to fail fast into normalized errors without an internal multi-retry chain.
2. **Fallback Layer**: Exactly one transition from OpenAI to Groq. Never alternates recursively.
3. **Groq Provider**: Retains a single transient retry for transient network hiccups or 429 backoff before throwing.

---

## Observability & Operational Metrics

### Chat Trace Recording
Every completed or failed turn records a trace in the PostgreSQL `chat_traces` table:
- **`provider`**:
  - `"openai"`: Primary provider served the turn.
  - `"groq"`: Fallback provider served the turn.
  - `"openai->groq"`: Turn required fallback transition.
- **`model`**: Actual model used (`gpt-4o-mini` or `openai/gpt-oss-120b`).

### Structured Fallback Logging
Whenever fallback triggers, the backend emits a structured log without exposing secrets:
```json
{
  "level": "warn",
  "primaryProvider": "openai",
  "fallbackProvider": "groq",
  "primaryErrorCode": "MODEL_RATE_LIMITED",
  "fallbackReason": "OpenAI rate limit exceeded.",
  "msg": "[FallbackModelProvider] Primary AI provider failed; falling back to secondary provider"
}
```

### In-Memory Metrics (`/metrics`)
The operational `/metrics` endpoint exposes real-time provider counters:
- `openai_model_calls_total`
- `groq_model_calls_total`
- `fallback_activations_total`
- `primary_provider_failures_total`
- `fallback_provider_failures_total`

---

## Turn Planning & Tool Execution Hardening

### 1. Hybrid Turn Planning (`TurnPlanner`)
To prevent the model from answering live Oslava operational questions from memory or prematurely concluding before gathering sufficient data, the system evaluates incoming user requests through [TurnPlanner](file:///d:/OSLAVA_CHATBOT/src/ai/turn-planner.ts):
- Analyzes intent across the frozen V1 capability set: Dashboard overview, Event search/details/report, Worker search/details/history, Write intents, and Unsupported operations.
- Verifies context grounding: If the referenced worker or event is already active in session context (or supplied via UUID), redundant searches are skipped.
- Handles compound queries: Compound requests (e.g., "Find Arif, show his details and history") are decomposed into full execution sequences.

### 2. Required Tool Completeness Check
Before accepting the model's final prose response:
- The system verifies that all planned tool objectives were fulfilled by executed tools.
- If the model emits premature prose without satisfying required data objectives, `ToolLoop` intercepts the response and re-prompts the model with a deterministic instruction reminding it of the missing tool objective (up to 2 recovery attempts).

### 3. Duplicate Tool Execution Protection
- Successful read tool invocations are cached per turn using a canonical signature: `${toolName}:${canonicalJson(args)}`.
- If the model repeats an identical read tool call with the same arguments, the cached result is returned immediately without re-querying the gateway or database.
- Distinct queries (e.g. `search_events(date=today)` vs `search_events(date=tomorrow)`) execute normally.
- Write intent staging is never cached.

---

## Timeout Hierarchy & Turn Deadlines

To prevent request hangs and ensure bounded completion:
1. **HTTP Connection Level (`REQUEST_TIMEOUT_MS: 60000`)**: Fastify connection/request timeout.
2. **Chat Turn Level (`CHAT_TURN_TIMEOUT_MS: 45000`)**: Single overarching deadline for model + tool executions.
3. **Primary Model Level (`OPENAI_TIMEOUT_MS: 20000`)**: Bounded OpenAI invocation budget.
4. **Fallback Model Level (`GROQ_TIMEOUT_MS: 20000`)**: Bounded Groq invocation budget.
5. **Tool Execution Level (`TOOL_EXECUTION_TIMEOUT_MS: 10000`)**: Bounded single-tool timeout preventing hanging gateway/RPC calls.

Dynamic remaining turn budget is propagated into each model call and tool execution. If remaining budget is less than 2 seconds, the call fails fast with `MODEL_TIMEOUT` (`retryable: true`) rather than launching doomed requests.

---

## Best-Effort Observability Isolation

Telemetry writes (`recordChatTrace`, `recordToolExecution`, metrics) are strictly isolated in `try/catch` blocks:
- A database connection failure or write failure during tracing will **never** replace a successful user response.
- A tracing failure during an error state will **never** replace the real provider or tool error with an internal error.

---

## Configuration & Environment Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | String (Secret) | `undefined` | OpenAI API key. Required in production. |
| `OPENAI_MODEL` | String | `gpt-4o-mini` | Primary model identifier. |
| `OPENAI_MAX_OUTPUT_TOKENS` | Number | `2000` | Max tokens for OpenAI completions. |
| `OPENAI_TIMEOUT_MS` | Number | `20000` | OpenAI request timeout in milliseconds. |
| `GROQ_API_KEY` | String (Secret) | `undefined` | Groq Cloud API key. Required for fallback. |
| `GROQ_MODEL` | String | `openai/gpt-oss-120b` | Fallback model identifier. |
| `GROQ_REASONING_EFFORT` | `low` \| `medium` \| `high` | `medium` | Desired reasoning depth for Groq. |
| `GROQ_MAX_OUTPUT_TOKENS` | Number | `2000` | Max tokens for Groq completions. |
| `GROQ_TIMEOUT_MS` | Number | `20000` | Groq request timeout in milliseconds. |
| `AI_PRIMARY_PROVIDER` | `openai` \| `groq` | `openai` | Primary provider to attempt first. |
| `AI_FALLBACK_PROVIDER` | `openai` \| `groq` \| `none` | `groq` | Fallback provider to use on failure. |
| `AI_FALLBACK_ENABLED` | Boolean | `true` | Enables/disables automatic fallback. |
| `AI_MAX_TOOL_CALLS` | Number | `8` | Maximum tool calls per chat turn. |
| `CHAT_TURN_TIMEOUT_MS` | Number | `45000` | End-to-end chat turn execution budget. |
| `TOOL_EXECUTION_TIMEOUT_MS` | Number | `10000` | Maximum execution time per tool invocation. |
| `REQUEST_TIMEOUT_MS` | Number | `60000` | Fastify HTTP connection timeout. |
