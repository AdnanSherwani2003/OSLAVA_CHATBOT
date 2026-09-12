# Oslava Admin AI Chatbot — V1 Architecture Specification

This document details the architectural components, request flows, and separation of concerns for the V1 standalone chatbot backend.

---

## 1. End-to-End Conversational Read Query Flow

```mermaid
sequenceDiagram
    autonumber
    actor Flutter as Flutter Mobile App
    participant API as Fastify API Gateway
    participant Guard as Auth & Role Guard
    participant Conv as Conversation Service
    participant Agent as Groq Agent (gpt-oss-120b)
    participant Registry as V1 Tool Registry
    participant Tools as Read Tools
    participant Gateway as OslavaGateway
    participant Supabase as Supabase RPCs / Postgres

    Flutter->>API: POST /v1/chat/sessions/:id/messages (with Supabase JWT)
    API->>Guard: Verify JWT & Enforce ACTIVE ADMIN
    Guard-->>API: Verified ActorContext
    API->>Conv: Append user message & retrieve recent context
    Conv-->>API: History + SessionState
    API->>Agent: Run tool loop with System Instructions & State
    loop Tool Loop (Max 5 turns)
        Agent->>Registry: Request tool call (e.g. search_events)
        Registry->>Tools: Execute read tool
        Tools->>Gateway: Fetch data via request-scoped client
        Gateway->>Supabase: Execute read query with caller JWT
        Supabase-->>Gateway: Raw records
        Gateway-->>Tools: Sanitized DTOs (PII minimized)
        Tools-->>Agent: JSON tool result
    end
    Agent-->>Conv: Save updated SessionState & Assistant Message
    Conv-->>API: Stored message record
    API-->>Flutter: HTTP 200 { type: "message", content: "..." }
```

---

## 2. Safe Two-Phase Write & Confirmation Flow

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Flutter Admin User
    participant Agent as Groq Agent / Tool Loop
    participant Intent as Write Intent Tool
    participant Proposal as ActionProposalService
    participant Repo as ActionRepository (Postgres/Memory)
    participant ConfirmAPI as Confirmation API (/v1/chat/actions/:id/confirm)
    participant ConfirmSvc as ActionConfirmationService
    participant ExecSvc as ActionExecutionService (Server Only)
    participant Gateway as OslavaGateway
    participant Supabase as Supabase Mutation RPC

    Note over Admin,Agent: Phase 1: Action Proposal
    Admin->>Agent: "Promote Arif to category A"
    Agent->>Intent: Call change_worker_category
    Intent->>Proposal: Validate 1-step change & mandatory reason
    Proposal->>Gateway: Check current worker state & account status
    Gateway-->>Proposal: Fresh state (Category B, ACTIVE)
    Proposal->>Repo: Create action (status: PENDING, TTL: 600s)
    Repo-->>Intent: PendingActionRecord
    Intent-->>Agent: HALT TOOL LOOP IMMEDIATELY
    Agent-->>Admin: Return { type: "confirmation_required", actionId: "..." }

    Note over Admin,ConfirmAPI: Phase 2: Explicit Confirmation
    Admin->>ConfirmAPI: POST /v1/chat/actions/:id/confirm (Caller JWT)
    ConfirmAPI->>ConfirmSvc: Confirm action (ActionId, UserId)
    ConfirmSvc->>Repo: Atomically claim action (PENDING -> EXECUTING)
    Repo-->>ConfirmSvc: Claim granted (race-protected)
    ConfirmSvc->>Gateway: Check entity freshness (verify still Category B)
    Gateway-->>ConfirmSvc: Fresh entity confirmed unchanged
    ConfirmSvc->>ExecSvc: Execute approved mutation
    ExecSvc->>Gateway: changeWorkerCategory(id, 'A', reason)
    Gateway->>Supabase: Call RPC change_worker_category (caller JWT)
    Supabase-->>Gateway: Mutation success
    ExecSvc->>Gateway: Read-after-write verification
    Gateway-->>ExecSvc: Verify worker is now Category A
    ExecSvc-->>ConfirmSvc: Execution verified
    ConfirmSvc->>Repo: Update action status -> SUCCEEDED
    ConfirmSvc-->>ConfirmAPI: Execution result
    ConfirmAPI-->>Admin: HTTP 200 { status: "SUCCEEDED", message: "..." }
```

---

## 3. Structural Component Hierarchy

```
Flutter App
   │ (Supabase JWT)
   ▼
Fastify API (/v1/...)
   │ (CORS, Helmet, RateLimiter, BodyLimit, ErrorMiddleware)
   ▼
Auth & Role Guard (Active Admin Check)
   │
   ├──────────────────────────────┬──────────────────────────────┐
   ▼                              ▼                              ▼
ConversationService       ActionProposalService       ActionConfirmationService
   │                              │                              │
   ▼                              ▼                              ▼
Groq Agent (gpt-oss-120b)     ActionRepository (PG/Mem)      ActionExecutionService
   │                                                             │ (Server Only)
   ▼                                                             ▼
V1 Tool Registry                                           OslavaGateway
   │                                                             │ (Caller JWT)
   ├──────────────────────────────┐                              ▼
   ▼                              ▼                      Supabase RPCs
7 Read Tools             4 Write Intent Tools
(get_dashboard,           (change_worker_category,
 search_events,            publish_event,
 get_event_details,        complete_event,
 search_workers,           close_event)
 get_worker_details,
 get_worker_history,
 get_event_report)
```

---

## 4. Frozen V1 Architectural Boundaries

- **Zero Direct Mutation from LLM**: No model tool has direct execution privileges on the database.
- **Dedicated Isolation**: `ActionExecutionService` is strictly imported and callable by `ActionConfirmationService`. It is not present in `ToolRegistry` and has no function calling schema.
- **Request-Scoped Gateway**: All database access executes with caller JWT propagation; no service-role secrets are used.
