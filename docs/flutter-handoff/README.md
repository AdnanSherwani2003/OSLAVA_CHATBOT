# Oslava Admin AI Chatbot — Flutter Handoff Package

Welcome to the Flutter developer handoff package for the standalone Oslava Admin AI Chatbot backend.

This directory is the official integration package for incorporating the chatbot into the Oslava Flutter mobile application.

---

## Production API

- **Production Base URL**: `https://oslava-chatbot.vercel.app`
- **Local Dev / Android Emulator**: `http://10.0.2.2:3000` (or `http://localhost:3000` on iOS Simulator)

Configure this through your Flutter application environment/config constants (e.g. `AppEnvironment.chatbotBaseUrl`). Never hardcode secrets.

---

## Authoritative Contract Rule

> [!IMPORTANT]
> **Authoritative Contract**: [API-CONTRACT-V1.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/API-CONTRACT-V1.md)
>
> `API-CONTRACT-V1.md` is the single source of truth for all 10 frozen V1 HTTP endpoints, status codes, and request/response JSON envelopes.
> **If any supporting document, guide, or example ever conflicts with `API-CONTRACT-V1.md`, the frozen API contract wins.**

---

## START HERE: Reading Order

Follow these documents in order for a seamless, defect-free integration:

1. **[FLUTTER-INTEGRATION-GUIDE.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/FLUTTER-INTEGRATION-GUIDE.md)** — **Primary step-by-step developer guide** covering production configuration, Supabase authentication reuse, full chat lifecycle, message handling, confirmation flows, error strategies, and network UX.
2. **[API-CONTRACT-V1.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/API-CONTRACT-V1.md)** — **Authoritative Frozen V1 REST API specification** with master definitions for all 10 endpoints, schemas, and error envelopes.
3. **[authentication.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/authentication.md)** — Supabase JWT forwarding, role validation (`ACTIVE` `ADMIN`/`SUPER_ADMIN`), and automatic 401 session refresh handling.
4. **[chat-flow.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/chat-flow.md)** — Message turn dispatching, UI branching by `response.type`, and entity disambiguation.
5. **[confirmation-flow.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/confirmation-flow.md)** — Two-phase mutation staging, rendering confirmation cards, and executing explicit confirm/cancel calls.
6. **[error-codes.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/error-codes.md)** — Exhaustive dictionary of all backend error codes and recommended Flutter UX behaviors.
7. **[response-examples.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/response-examples.md)** — Exact copy-pasteable JSON response DTOs for every response type.
8. **[openapi-reference.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/openapi-reference.md)** — Quick reference table summarizing methods, paths, and headers.
9. **[../openapi.yaml](file:///d:/OSLAVA_CHATBOT/docs/openapi.yaml)** — Full machine-readable OpenAPI 3.1.0 specification.
10. **[FLUTTER-DEVELOPER-CHECKLIST.md](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/FLUTTER-DEVELOPER-CHECKLIST.md)** — Comprehensive pre-release verification checklist for Flutter engineers.
