# Write Capabilities & Intents (Phase 4)

## Supported Write Capabilities

Phase 4 introduces 4 strictly audited write intents.

| Intent Tool | Target Entity | Rule / Constraint | Supabase RPC |
| :--- | :--- | :--- | :--- |
| `change_worker_category` | Worker Profile | Exactly 1-step change (`F <-> C <-> B <-> A`). Active worker only. Reason required. | `public.change_worker_category(p_worker_id, p_new_category, p_reason, p_notes)` |
| `publish_event` | Event | Must be in `DRAFT` status. Reason required. Increments `version`. | `public.publish_event(p_event_id, p_reason)` |
| `complete_event` | Event | Must be in `IN_PROGRESS` status. Reason required. Increments `version`. | `public.complete_event(p_event_id, p_reason)` |
| `close_event` | Event | Must be in `COMPLETED` status. Reason required. Increments `version`. | `public.close_event(p_event_id, p_reason)` |

---

## Tool Contracts

### 1. `change_worker_category`
```json
{
  "name": "change_worker_category",
  "parameters": {
    "type": "object",
    "required": ["worker_id", "new_category", "reason"],
    "properties": {
      "worker_id": { "type": "string", "format": "uuid" },
      "new_category": { "type": "string", "enum": ["A", "B", "C", "F"] },
      "reason": { "type": "string", "minLength": 3 },
      "notes": { "type": "string" }
    },
    "additionalProperties": false
  }
}
```

### 2. `publish_event`
```json
{
  "name": "publish_event",
  "parameters": {
    "type": "object",
    "required": ["event_id", "reason"],
    "properties": {
      "event_id": { "type": "string", "format": "uuid" },
      "reason": { "type": "string", "minLength": 3 }
    },
    "additionalProperties": false
  }
}
```

### 3. `complete_event`
```json
{
  "name": "complete_event",
  "parameters": {
    "type": "object",
    "required": ["event_id", "reason"],
    "properties": {
      "event_id": { "type": "string", "format": "uuid" },
      "reason": { "type": "string", "minLength": 3 }
    },
    "additionalProperties": false
  }
}
```

### 4. `close_event`
```json
{
  "name": "close_event",
  "parameters": {
    "type": "object",
    "required": ["event_id", "reason"],
    "properties": {
      "event_id": { "type": "string", "format": "uuid" },
      "reason": { "type": "string", "minLength": 3 }
    },
    "additionalProperties": false
  }
}
```

---

## Prohibited & Unsupported Mutations

Any other operational write request (such as event creation, cancellation, leader assignment, registration approval, worker deletion, or wage updates) is **strictly unsupported**.

When requested, the agent is instructed to decline politely and verbatim output:
> *"That action isn't available through the chatbot yet."*
