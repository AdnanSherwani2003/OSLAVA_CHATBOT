import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { getConfig, type AppConfig } from "./config/env.js";
import requestContextPlugin from "./api/middleware/request-context.middleware.js";
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
 * Fastify application factory.
 */
export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? getConfig();

  const app = Fastify({
    logger: false, // Logging is handled via our structured request-context middleware
    connectionTimeout: config.REQUEST_TIMEOUT_MS,
    requestTimeout: config.REQUEST_TIMEOUT_MS,
  });

  // CORS configuration
  await app.register(cors, {
    origin:
      config.CORS_ORIGINS === "*"
        ? true
        : config.CORS_ORIGINS.split(",").map((s) => s.trim()),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  });

  // Request context & correlation IDs
  await app.register(requestContextPlugin);

  // Global error handler
  app.setErrorHandler(errorHandler);

  // Routes
  await app.register(healthRoutes, { config });
  await app.register(authRoutes, { authService: options.authService });
  await app.register(chatRoutes, {
    authService: options.authService,
    conversationService: options.conversationService,
    agentService: options.agentService,
  });

  return app;
}
