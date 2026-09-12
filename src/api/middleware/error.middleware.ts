import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError, InternalError } from "../../domain/errors.js";
import { logger } from "../../observability/logger.js";

/**
 * Global Fastify error handler ensuring standardized JSON error envelopes across all failures.
 * Guarantees zero stack trace exposure and strictly masks internal implementation details.
 */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const requestId = request.requestId || "req_unknown";

  // 1. Domain / Business AppError
  if (error instanceof AppError) {
    reply.status(error.statusCode).send(error.toResponse(requestId));
    return;
  }

  const fastifyErr = error as FastifyError;
  const statusCode = fastifyErr.statusCode || 500;
  const errorCode = fastifyErr.code;

  // 2. Request Payload Size Limit Exceeded (413)
  if (statusCode === 413 || errorCode === "FST_ERR_CTP_BODY_TOO_LARGE") {
    reply.status(413).send({
      error: {
        code: "INVALID_INPUT",
        message: "Request payload exceeds maximum size limit (100KB).",
        retryable: false,
        request_id: requestId,
      },
    });
    return;
  }

  // 3. Unsupported Content-Type / Media Type (415)
  if (
    statusCode === 415 ||
    errorCode === "FST_ERR_CTP_INVALID_MEDIA_TYPE" ||
    errorCode === "FST_ERR_CTP_UNSUPPORTED_MEDIA_TYPE"
  ) {
    reply.status(415).send({
      error: {
        code: "INVALID_INPUT",
        message: "Unsupported Media Type. Expected application/json.",
        retryable: false,
        request_id: requestId,
      },
    });
    return;
  }

  // 4. Malformed JSON Body (400)
  if (
    (statusCode === 400 &&
      (error instanceof SyntaxError ||
        fastifyErr.message?.toLowerCase().includes("json") ||
        errorCode === "FST_ERR_CTP_EMPTY_JSON_BODY")) ||
    (fastifyErr.message && /unexpected token|JSON/i.test(fastifyErr.message))
  ) {
    reply.status(400).send({
      error: {
        code: "INVALID_INPUT",
        message: "Malformed JSON request body.",
        retryable: false,
        request_id: requestId,
      },
    });
    return;
  }

  // 5. Fastify Schema Validation Failures (400)
  if ("validation" in fastifyErr && Array.isArray(fastifyErr.validation)) {
    reply.status(400).send({
      error: {
        code: "INVALID_INPUT",
        message: fastifyErr.message || "Invalid input parameters.",
        retryable: false,
        request_id: requestId,
      },
    });
    return;
  }

  // 6. Route Not Found (404)
  if (statusCode === 404) {
    reply.status(404).send({
      error: {
        code: "ENTITY_NOT_FOUND",
        message: "Route not found.",
        retryable: false,
        request_id: requestId,
      },
    });
    return;
  }

  // 7. Rate Limit (429) fallback if surfaced as error
  if (statusCode === 429) {
    reply.status(429).send({
      error: {
        code: "INVALID_INPUT",
        message: fastifyErr.message || "Rate limit exceeded. Please retry later.",
        retryable: true,
        request_id: requestId,
      },
    });
    return;
  }

  // 8. Unexpected Server Errors (500)
  // Log full stack trace and error metadata internally for ops debugging
  logger.error({
    requestId,
    err: {
      message: error.message,
      name: error.name,
      stack: error.stack,
    },
    message: "Unhandled exception during request processing",
  });

  // Never leak internal stack traces, DB connection strings, or system paths to clients
  const fallback = new InternalError();
  reply.status(fallback.statusCode).send(fallback.toResponse(requestId));
}
