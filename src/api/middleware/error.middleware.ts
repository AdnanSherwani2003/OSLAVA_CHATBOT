import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError, InternalError } from "../../domain/errors.js";
import { logger } from "../../observability/logger.js";

/**
 * Global Fastify error handler ensuring standardized JSON error envelopes.
 */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const requestId = request.requestId || "req_unknown";

  if (error instanceof AppError) {
    reply.status(error.statusCode).send(error.toResponse(requestId));
    return;
  }

  // Handle Fastify schema validation errors
  if ("validation" in error && Array.isArray(error.validation)) {
    reply.status(400).send({
      error: {
        code: "INVALID_INPUT",
        message: error.message || "Invalid input parameters.",
        retryable: false,
        request_id: requestId,
      },
    });
    return;
  }

  // Handle 404 Not Found
  if ("statusCode" in error && error.statusCode === 404) {
    reply.status(404).send({
      error: {
        code: "INVALID_INPUT",
        message: "Route not found.",
        retryable: false,
        request_id: requestId,
      },
    });
    return;
  }

  // Log unexpected errors internally with full stack traces
  logger.error({
    requestId,
    err: {
      message: error.message,
      name: error.name,
      stack: error.stack,
    },
    message: "Unhandled exception during request processing",
  });

  // Never leak internal stack traces or PostgreSQL details to clients
  const fallback = new InternalError();
  reply.status(fallback.statusCode).send(fallback.toResponse(requestId));
}
