# Vercel Production Environment Variables Inventory

This document lists all environment variables required for deploying the **Oslava Admin AI Chatbot Backend** to Vercel (Fluid Compute / Serverless Function runtime).

> **IMPORTANT SECURITY DIRECTIVE**: 
> - **Never** hardcode real secrets or connection strings in code or documentation files.
> - Enter these values securely in the **Vercel Project Settings → Environment Variables** dashboard for the **Production** (and optionally Preview) environment.

---

## 1. Required Production Variables

| Variable Name | Required Value / Format | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables strict production validations and security rules. |
| `APP_TIMEZONE` | `Asia/Kolkata` | Centralized IANA timezone for all business date interpretations (Kerala, India operations). |
| `SUPABASE_URL` | `https://<your-project>.supabase.co` | Oslava Supabase gateway project URL. |
| `SUPABASE_PUBLISHABLE_KEY` | `<your-supabase-publishable-or-anon-key>` | Public client key for authenticating admin JWT tokens. Never use service-role key. |
| `CHAT_PERSISTENCE_MODE` | `postgres` | Enforces durable PostgreSQL persistence for chatbot state. |
| `DATABASE_URL` | `postgresql://<user>:<password>@<neon-pooler-host>/<db>?sslmode=require` | Dedicated Neon PostgreSQL **pooled** connection string. |
| `GROQ_API_KEY` | `<secret>` | API key from Groq console for LLM inference. |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Production model identifier. |
| `GROQ_REASONING_EFFORT` | `medium` | Reasoning effort level (`low`, `medium`, `high`). |
| `GROQ_MAX_OUTPUT_TOKENS` | `2000` | Maximum token ceiling for model generation turns. |
| `GROQ_TIMEOUT_MS` | `30000` | Timeout in milliseconds for Groq model API calls. |
| `CHAT_HISTORY_MESSAGE_LIMIT` | `16` | Bounded sliding window limit for contextual session history. |
| `ACTION_CONFIRMATION_TTL_SECONDS` | `600` | Expiration window (10 minutes) for pending write actions awaiting confirmation. |
| `REQUEST_TIMEOUT_MS` | `15000` | Hard timeout ceiling (15 seconds) for HTTP request lifecycle. |
| `LOG_LEVEL` | `info` | Structured logging verbosity (`trace`, `debug`, `info`, `warn`, `error`). |
| `ALLOW_EPHEMERAL_PRODUCTION_PERSISTENCE` | `false` | Strict guard ensuring memory mode cannot be accidentally activated in production. |
| `CORS_ORIGINS` | `*` | Allowed CORS origins (or comma-separated domain list for Flutter web/admin clients). |

---

## 2. Serverless Database Connection Pool Optimization

In Vercel Fluid Compute, functions scale horizontally. The application pool size is cap-limited per instance to avoid exhausting Neon pooled connections.

| Variable Name | Default Value | Recommended for Vercel | Description |
| :--- | :--- | :--- | :--- |
| `DATABASE_POOL_MAX` | `3` | `3` | Maximum active `pg.Pool` clients per serverless function instance. Prevents pool starvation on Neon. |

---

## 3. Production Rate Limiting Variables & Defaults

The chatbot backend implements tiered, in-memory sliding window rate limits per capability area. These variables can optionally be customized in Vercel:

| Variable Name | Default Value | Description |
| :--- | :--- | :--- |
| `CHAT_RATE_LIMIT_REQUESTS` | `20` | Max chat turn requests per window per user. |
| `CHAT_RATE_LIMIT_WINDOW_SECONDS` | `60` | Time window in seconds for chat requests (default: 1 minute). |
| `ACTION_RATE_LIMIT_REQUESTS` | `10` | Max action confirmation requests per window per user. |
| `ACTION_RATE_LIMIT_WINDOW_SECONDS` | `60` | Time window in seconds for action confirmations. |
| `SESSION_RATE_LIMIT_REQUESTS` | `10` | Max session creation requests per window per user. |
| `SESSION_RATE_LIMIT_WINDOW_SECONDS` | `60` | Time window in seconds for session creations. |
| `GENERAL_RATE_LIMIT_REQUESTS` | `100` | Max general API requests per window (health checks, etc.). |
| `GENERAL_RATE_LIMIT_WINDOW_SECONDS` | `60` | Time window in seconds for general endpoints. |

---

## 4. Deployment Verification Notes

1. **Database Migrations**:
   - Database migrations (`npm run db:migrate`) have already been executed against Neon.
   - Do **NOT** execute migrations in Vercel build or start hooks. Migrations remain an explicit, out-of-band operational step.
2. **Readiness Probe**:
   - Following deployment, verify `GET /readyz`.
   - The response should be:
     ```json
     {
       "status": "ready",
       "service": "oslava-admin-ai",
       "persistence": "postgres",
       "timestamp": "..."
     }
     ```
