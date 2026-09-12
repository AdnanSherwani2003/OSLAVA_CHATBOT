# Groq Model Provider Integration

## Model Specification
- **Provider**: Groq Cloud SDK (`groq-sdk`)
- **Model**: `openai/gpt-oss-120b` (configurable via `GROQ_MODEL`)
- **Reasoning Effort**: `low`, `medium`, or `high` (default: `medium`, configurable via `GROQ_REASONING_EFFORT`)
- **Temperature**: `0.1` (low temperature for deterministic, factual tool invocation)
- **Max Output Tokens**: `2000` (configurable via `GROQ_MAX_OUTPUT_TOKENS`)
- **Timeout**: `30000ms` (configurable via `GROQ_TIMEOUT_MS`)

---

## Configuration & Environment Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | String (Secret) | `undefined` | Groq Cloud API key. Required for live LLM requests. |
| `GROQ_MODEL` | String | `openai/gpt-oss-120b` | Model identifier on Groq. |
| `GROQ_REASONING_EFFORT`| `low` \| `medium` \| `high` | `medium` | Desired reasoning depth. |
| `GROQ_MAX_OUTPUT_TOKENS`| Number | `2000` | Maximum completion token budget per call. |
| `GROQ_TIMEOUT_MS` | Number | `30000` | HTTP request timeout in milliseconds. |
| `CHAT_HISTORY_MESSAGE_LIMIT` | Number | `16` | Sliding window of recent session messages passed into context. |

---

## Tool Calling Configuration
- **Sequential Tool Calling**: `parallel_tool_calls: false` is enforced on every request. This ensures that tool invocations happen one-by-one, enabling exact state tracking, entity resolution, and bounded loop counting.
- **JSON Schema Cleanliness**: Tool schemas are generated dynamically via `zod-to-json-schema` targeting OpenAI schema formatting with `$schema` removed.

---

## Error Handling & Resilience
1. **Transient Retries**:
   - On HTTP 429 (`rate_limit_exceeded`): Waits 1200ms and retries once. If still 429, throws `ModelRateLimitedError` (HTTP 429 to client with `retryable: true`).
   - On HTTP 5xx or connection resets (`ECONNRESET`, `ETIMEDOUT`): Retries once after 500ms. If still failing, throws `ModelUnavailableError` (HTTP 503 to client).
2. **Timeouts**:
   - Handled via `AbortController`. If Groq does not respond within `GROQ_TIMEOUT_MS`, throws `ModelTimeoutError` (HTTP 504 Gateway Timeout).
3. **Chain-of-Thought & Reasoning Privacy**:
   - Any `<think>...</think>` blocks or reasoning tokens emitted by models are stripped prior to saving assistant messages or returning to the client.
