import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { getConfig, type AppConfig } from "./config/env.js";
import requestContextPlugin from "./api/middleware/request-context.middleware.js";
import { securityHeadersPlugin } from "./api/middleware/security-headers.js";
import { rateLimiterPlugin } from "./api/middleware/rate-limiter.js";
import { errorHandler } from "./api/middleware/error.middleware.js";
import { healthRoutes } from "./api/routes/health.routes.js";
import { authRoutes } from "./api/routes/auth.routes.js";
import { chatRoutes } from "./api/routes/chat.routes.js";
import type { AuthService } from "./auth/auth.service.js";
import type { ConversationService } from "./context/conversation.service.js";
import type { AgentService } from "./ai/agent.service.js";

export interface BuildAppOptions {
  config?: AppConfig;
  authService?: AuthService;
  conversationService?: ConversationService;
  agentService?: AgentService;
  logger?: boolean;
}

/**
 * Fastify application factory with full Phase 5 production hardening.
 */
export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? getConfig();

  const app = Fastify({
    logger: false, // Logging is handled via structured request-context middleware
    connectionTimeout: config.REQUEST_TIMEOUT_MS,
    requestTimeout: config.REQUEST_TIMEOUT_MS,
    bodyLimit: 100 * 1024, // 100KB request body limit
  });

  // 1. Security Headers (OWASP recommended)
  await app.register(securityHeadersPlugin);

  // 2. CORS configuration
  await app.register(cors, {
    origin:
      config.CORS_ORIGINS === "*"
        ? true
        : config.CORS_ORIGINS.split(",").map((s) => s.trim()),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  });

  // 3. Request context & correlation IDs
  await app.register(requestContextPlugin);

  // 4. Production Rate Limiting
  await app.register(rateLimiterPlugin, { config });

  // 5. Global Error Handler & Safe 404 Handler
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((request, reply) => {
    const requestId = request.requestId || "req_unknown";
    reply.status(404).send({
      error: {
        code: "ENTITY_NOT_FOUND",
        message: "Route not found.",
        retryable: false,
        request_id: requestId,
      },
    });
  });

  // 6. Application Routes
  await app.register(healthRoutes, { config });
  await app.register(authRoutes, { authService: options.authService });
  await app.register(chatRoutes, {
    authService: options.authService,
    conversationService: options.conversationService,
    agentService: options.agentService,
  });

  return app;
}
