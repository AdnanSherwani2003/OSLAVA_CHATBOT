# Oslava Admin AI Chatbot — Flutter Handoff Package

Welcome to the Flutter Developer handoff package for the Oslava Admin AI Chatbot backend.

This package contains everything you need to integrate the chatbot directly into the Flutter mobile application without inspecting or modifying backend source code.

## Package Contents

0. **[Authoritative Frozen V1 API Contract](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/API-CONTRACT-V1.md)** — **The single authoritative master contract specification for all 10 endpoints.**
1. [Authentication Guide](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/authentication.md) — Supabase JWT forwarding and token lifecycle.
2. [Chat Flow & UI Routing](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/chat-flow.md) — How messages, entity disambiguation, and response types work.
3. [Confirmation Card Flow](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/confirmation-flow.md) — Staging write intents, rendering confirmation cards, and executing mutations.
4. [Error Codes Contract](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/error-codes.md) — Complete specification of all possible backend error codes and recommended UI behavior.
5. [Concrete Response DTOs](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/response-examples.md) — Copy-pasteable JSON examples for every response schema.
6. [OpenAPI Quick Reference](file:///d:/OSLAVA_CHATBOT/docs/flutter-handoff/openapi-reference.md) — Summary of all frozen V1 endpoints.

## Base URLs
- **Local Staging**: `http://localhost:3000` (or `http://10.0.2.2:3000` on Android Emulator)
- **Hosted Staging**: Provided by devops team via environment config
