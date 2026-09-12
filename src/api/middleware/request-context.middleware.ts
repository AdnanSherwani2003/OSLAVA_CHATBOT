import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { generateRequestId } from "../../shared/ids.js";
import { logger } from "../../observability/logger.js";
import type { ActorContext } from "../../auth/actor-context.js";
import type { OslavaGateway } from "../../integrations/supabase/oslava.gateway.js";
import type { SupabaseClient } from "@supabase/supabase-js";

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
    startTime: [number, number];
    actor?: ActorContext;
    gateway?: OslavaGateway;
    supabase?: SupabaseClient;
  }
}

const requestContextPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const incomingId = request.headers["x-request-id"];
      const requestId =
        typeof incomingId === "string" && incomingId.trim().length > 0
          ? incomingId.trim()
          : generateRequestId();

      request.requestId = requestId;
      request.startTime = process.hrtime();

      reply.header("x-request-id", requestId);
    },
  );

  fastify.addHook(
    "onResponse",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const [seconds, nanoseconds] = process.hrtime(request.startTime);
      const durationMs = (seconds * 1000 + nanoseconds / 1e6).toFixed(2);

      logger.info({
        requestId: request.requestId,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs: `${durationMs}ms`,
        userId: request.actor?.userId,
        role: request.actor?.role,
      });
    },
  );
};

export default fp(requestContextPlugin, {
  name: "request-context",
});
