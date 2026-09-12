import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

/**
 * Fastify plugin enforcing essential HTTP security headers.
 * Protects against MIME-sniffing, clickjacking, cross-site leaks, and inline execution.
 */
const securityHeaders: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
    reply.header("Content-Security-Policy", "default-src 'none'");
    reply.header("X-XSS-Protection", "0");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cross-Origin-Opener-Policy", "same-origin");
    reply.header("Cross-Origin-Resource-Policy", "same-origin");
    reply.raw.removeHeader("X-Powered-By");
  });
};

export const securityHeadersPlugin = fp(securityHeaders, {
  name: "security-headers",
});
