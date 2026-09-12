import type { FastifyPluginAsync } from "fastify";
import { getConfig, type AppConfig } from "../../config/env.js";

export interface HealthRoutesOptions {
  config?: AppConfig;
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (
  fastify,
  opts,
) => {
  const resolveConfig = () => opts.config ?? getConfig();

  /**
   * Liveness probe: checks process availability.
   * No authentication required.
   */
  fastify.get("/healthz", async (_request, reply) => {
    return reply.status(200).send({
      status: "ok",
      service: "oslava-admin-ai",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  /**
   * Readiness probe: checks that configuration is valid and service is ready to accept traffic.
   * No service-role access required.
   */
  fastify.get("/readyz", async (_request, reply) => {
    try {
      const config = resolveConfig();
      if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY) {
        return reply.status(503).send({
          status: "not_ready",
          service: "oslava-admin-ai",
          reason: "Configuration missing required Supabase settings",
          timestamp: new Date().toISOString(),
        });
      }

      return reply.status(200).send({
        status: "ready",
        service: "oslava-admin-ai",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return reply.status(503).send({
        status: "not_ready",
        service: "oslava-admin-ai",
        reason: err instanceof Error ? err.message : "Initialization incomplete",
        timestamp: new Date().toISOString(),
      });
    }
  });
};
