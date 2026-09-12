import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { getConfig, type AppConfig } from "../../config/env.js";

export type RateLimitCategory = "chat" | "action" | "session" | "general";

interface TokenBucket {
  tokens: number;
  lastRefillMs: number;
}

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor() {
    // Periodically clean up stale buckets (older than 10 minutes)
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of this.buckets.entries()) {
        if (now - bucket.lastRefillMs > 600_000) {
          this.buckets.delete(key);
        }
      }
    }, 60_000);

    // Unref cleanup timer so it doesn't hold open node process
    if (cleanupInterval.unref) {
      cleanupInterval.unref();
    }
  }

  public reset(): void {
    this.buckets.clear();
  }

  public consume(
    key: string,
    capacity: number,
    windowSeconds: number,
  ): {
    allowed: boolean;
    remaining: number;
    resetSeconds: number;
    limit: number;
  } {
    const now = Date.now();
    const refillRatePerMs = capacity / (windowSeconds * 1000);

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefillMs: now };
      this.buckets.set(key, bucket);
    } else {
      const elapsedMs = now - bucket.lastRefillMs;
      const refilledTokens = elapsedMs * refillRatePerMs;
      bucket.tokens = Math.min(capacity, bucket.tokens + refilledTokens);
      bucket.lastRefillMs = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      const resetSeconds = Math.ceil(
        (capacity - bucket.tokens) / (refillRatePerMs * 1000),
      );
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetSeconds: Math.max(1, resetSeconds),
        limit: capacity,
      };
    }

    // Rate limit exceeded
    const missingTokens = 1 - bucket.tokens;
    const retryAfterSeconds = Math.ceil(missingTokens / (refillRatePerMs * 1000));

    return {
      allowed: false,
      remaining: 0,
      resetSeconds: Math.max(1, retryAfterSeconds),
      limit: capacity,
    };
  }
}

export const rateLimiterInstance = new InMemoryRateLimiter();

export function classifyRequestCategory(
  method: string,
  url: string,
): RateLimitCategory | null {
  const path = url.split("?")[0];

  // Exempt health & readiness probes and metrics from aggressive rate limiting
  if (
    path === "/healthz" ||
    path === "/readyz" ||
    path === "/metrics"
  ) {
    return null;
  }

  if (method === "POST") {
    if (/^\/v1\/chat\/sessions\/[^/]+\/messages$/.test(path)) {
      return "chat";
    }
    if (/^\/v1\/chat\/actions\/[^/]+\/(confirm|cancel)$/.test(path)) {
      return "action";
    }
    if (path === "/v1/chat/sessions") {
      return "session";
    }
  }

  return "general";
}

export interface RateLimiterPluginOptions {
  config?: AppConfig;
  limiter?: InMemoryRateLimiter;
}

const rateLimiterPluginAsync: FastifyPluginAsync<RateLimiterPluginOptions> =
  async (fastify, opts) => {
    const limiter = opts.limiter || rateLimiterInstance;

    fastify.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
      const config = opts.config || getConfig();
      const category = classifyRequestCategory(request.method, request.url);

      if (!category) {
        return; // Exempt
      }

      let limit: number;
      let windowSeconds: number;

      switch (category) {
        case "chat":
          limit = config.CHAT_RATE_LIMIT_REQUESTS;
          windowSeconds = config.CHAT_RATE_LIMIT_WINDOW_SECONDS;
          break;
        case "action":
          limit = config.ACTION_RATE_LIMIT_REQUESTS;
          windowSeconds = config.ACTION_RATE_LIMIT_WINDOW_SECONDS;
          break;
        case "session":
          limit = config.SESSION_RATE_LIMIT_REQUESTS;
          windowSeconds = config.SESSION_RATE_LIMIT_WINDOW_SECONDS;
          break;
        case "general":
        default:
          limit = config.GENERAL_RATE_LIMIT_REQUESTS;
          windowSeconds = config.GENERAL_RATE_LIMIT_WINDOW_SECONDS;
          break;
      }

      // Identify caller: prioritize authenticated user ID, fallback to client IP
      const actorId = request.actor?.userId;
      const identity = actorId ? `user:${actorId}` : `ip:${request.ip}`;
      const bucketKey = `${identity}:${category}`;

      const result = limiter.consume(bucketKey, limit, windowSeconds);

      // Set standard RateLimit headers
      reply.header("RateLimit-Limit", result.limit);
      reply.header("RateLimit-Remaining", result.remaining);
      reply.header("RateLimit-Reset", result.resetSeconds);

      if (!result.allowed) {
        reply.header("Retry-After", result.resetSeconds);
        const requestId = request.requestId || "req_unknown";

        return reply.status(429).send({
          error: {
            code: "INVALID_INPUT",
            message: `Rate limit exceeded for ${category} operations. Please retry in ${result.resetSeconds} seconds.`,
            retryable: true,
            request_id: requestId,
          },
        });
      }
    });
  };

export const rateLimiterPlugin = fp(rateLimiterPluginAsync, {
  name: "rate-limiter",
});
