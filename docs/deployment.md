# Oslava Admin AI Chatbot — Production Deployment Guide

This guide describes operational requirements, environment configuration, database setup, and scaling best practices for deploying the Oslava Admin AI Chatbot in production.

---

## 1. System Requirements & Runtime

- **Node.js**: `22.x LTS` (or Docker image based on `node:22-alpine`)
- **Memory**: Minimum 512MB RAM (1GB recommended)
- **CPU**: 1 vCPU (2 vCPUs recommended for concurrent LLM tool loops)
- **Database**: Dedicated PostgreSQL 15+ database instance (required in production)

---

## 2. Production Persistence & Database

> [!IMPORTANT]
> **Production Persistence Rule**:
> In `NODE_ENV=production`, the service **requires** `CHAT_PERSISTENCE_MODE=postgres` and a valid `DATABASE_URL`.
> If `CHAT_PERSISTENCE_MODE=memory` is provided in production, the application will refuse to start unless `ALLOW_EPHEMERAL_PRODUCTION_PERSISTENCE=true` is explicitly configured.

### Database Migrations
Run schema migrations prior to starting the production application:
```bash
npm run db:migrate
```
This applies `001_initial_schema.sql` (sessions, messages, state, traces) and `002_pending_actions.sql` (pending actions).

---

## 3. Environment Configuration

Ensure the following environment variables are securely injected via your secrets manager (e.g. AWS Secrets Manager, GCP Secret Manager, Doppler, or Kubernetes Secrets):

```bash
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
LOG_LEVEL=info

# Supabase Gateway (User JWT verification & RPC calls)
# DO NOT inject service-role key. Chatbot runs strictly under caller JWT.
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key

# Chatbot Persistence
CHAT_PERSISTENCE_MODE=postgres
DATABASE_URL=postgresql://user:password@pg-host:5432/oslava_chatbot?sslmode=require

# Primary AI Provider (OpenAI)
OPENAI_API_KEY=sk-your-production-openai-api-key
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_OUTPUT_TOKENS=2000
OPENAI_TIMEOUT_MS=20000

# Fallback AI Provider (Groq)
GROQ_API_KEY=gsk_your_production_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b
GROQ_REASONING_EFFORT=medium
GROQ_MAX_OUTPUT_TOKENS=2000
GROQ_TIMEOUT_MS=20000

# AI Provider Routing
AI_PRIMARY_PROVIDER=openai
AI_FALLBACK_PROVIDER=groq
AI_FALLBACK_ENABLED=true
AI_MAX_TOOL_CALLS=8

# Conversation & Write TTL
CHAT_HISTORY_MESSAGE_LIMIT=16
ACTION_CONFIRMATION_TTL_SECONDS=600

# Networking & Timeouts
REQUEST_TIMEOUT_MS=60000
CHAT_TURN_TIMEOUT_MS=45000
TOOL_EXECUTION_TIMEOUT_MS=10000
CORS_ORIGINS=https://admin.oslava.com,https://app.oslava.com

CHAT_RATE_LIMIT_REQUESTS=20
CHAT_RATE_LIMIT_WINDOW_SECONDS=60
ACTION_RATE_LIMIT_REQUESTS=10
ACTION_RATE_LIMIT_WINDOW_SECONDS=60
SESSION_RATE_LIMIT_REQUESTS=10
SESSION_RATE_LIMIT_WINDOW_SECONDS=60
GENERAL_RATE_LIMIT_REQUESTS=100
GENERAL_RATE_LIMIT_WINDOW_SECONDS=60
```

---

## 4. Docker Deployment

### Building the Image
```bash
docker build -t oslava-admin-ai:1.0.0 .
```

### Running the Container
```bash
docker run -d \
  --name oslava-chatbot \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env.production \
  oslava-admin-ai:1.0.0
```

---

## 5. Health & Readiness Probes

Configure your load balancer / orchestrator (e.g. Kubernetes, AWS ECS, GCP Cloud Run) with the following probes:

- **Liveness Probe**: `GET /healthz`
  - Verifies Node event loop and HTTP server responsiveness.
  - Interval: 15s, Timeout: 3s.
- **Readiness Probe**: `GET /readyz`
  - Verifies Supabase configuration and PostgreSQL database connectivity.
  - **Does NOT** trigger expensive Groq AI calls on probe requests.
  - Interval: 10s, Timeout: 5s.

---

## 6. Multi-Instance Scaling & Production Considerations

### Shared Persistence
When scaling to multiple container replicas, `CHAT_PERSISTENCE_MODE=postgres` ensures:
- All chat sessions, messages, and state context are shared across instances.
- Pending action records are stored in PostgreSQL with row-level atomic locking (`UPDATE ... WHERE status = 'PENDING'`), guaranteeing that concurrent confirmations across different container replicas cannot double-execute.

### Rate Limiting Considerations
The V1 rate limiter operates **in-memory per container process**:
- For single-instance deployments, the built-in limiter provides complete protection.
- When running across multiple replicas behind a load balancer, each instance enforces its own bucket. If strict cluster-wide rate limiting is required, configure rate limiting at your reverse proxy (e.g. Cloudflare, NGINX, or AWS ALB) or transition to a shared Redis store in V2.

### Reverse Proxy & SSL Termination
Deploy behind a reverse proxy (e.g. NGINX, Cloudflare, Traefik, or AWS ALB) enforcing:
- HTTPS / TLS 1.3 termination.
- Standard client IP forwarding headers (`X-Forwarded-For`, `X-Real-IP`).
- Request body limits (matching backend 100KB limit).
