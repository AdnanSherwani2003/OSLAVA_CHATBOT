import type { FastifyPluginAsync } from "fastify";
import { getConfig, type AppConfig } from "../../config/env.js";
import { isDatabaseConnected } from "../../persistence/database.js";
import { metrics } from "../../observability/metrics.js";

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
   * In memory mode, verifies configuration and memory persistence readiness.
   * In postgres mode, additionally verifies database connectivity.
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

      if (config.CHAT_PERSISTENCE_MODE === "postgres") {
        const connected = await isDatabaseConnected();
        if (!connected) {
          return reply.status(503).send({
            status: "not_ready",
            service: "oslava-admin-ai",
            reason: "PostgreSQL database not connected",
            timestamp: new Date().toISOString(),
          });
        }
      }

      return reply.status(200).send({
        status: "ready",
        service: "oslava-admin-ai",
        persistence: config.CHAT_PERSISTENCE_MODE,
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

  /**
   * Operational metrics endpoint: returns aggregated counters and latency statistics.
   * Guaranteed zero PII or credentials.
   */
  fastify.get("/metrics", async (_request, reply) => {
    return reply.status(200).send(metrics.getSnapshot());
  });
};
