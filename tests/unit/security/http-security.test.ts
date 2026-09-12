import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../../../src/app.js";
import { parseConfig } from "../../../src/config/env.js";
import { rateLimiterInstance } from "../../../src/api/middleware/rate-limiter.js";
import type { FastifyInstance } from "fastify";

describe("HTTP Security Hardening & Rate Limiting", () => {
  let app: FastifyInstance;

  const testConfig = parseConfig({
    SUPABASE_URL: "https://mock.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "mock-pub-key",
    CHAT_RATE_LIMIT_REQUESTS: "5",
    CHAT_RATE_LIMIT_WINDOW_SECONDS: "60",
    SESSION_RATE_LIMIT_REQUESTS: "3",
    SESSION_RATE_LIMIT_WINDOW_SECONDS: "60",
    GENERAL_RATE_LIMIT_REQUESTS: "10",
    GENERAL_RATE_LIMIT_WINDOW_SECONDS: "60",
  });

  beforeEach(async () => {
    rateLimiterInstance.reset();
    app = await buildApp({ config: testConfig });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("applies OWASP recommended security headers and strips X-Powered-By", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["strict-transport-security"]).toContain("max-age=31536000");
    expect(res.headers["content-security-policy"]).toBe("default-src 'none'");
    expect(res.headers["x-xss-protection"]).toBe("0");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("safely handles 404 route not found with standard error envelope and no stack trace", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/non-existent-endpoint",
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("ENTITY_NOT_FOUND");
    expect(body.error.message).toBe("Route not found.");
    expect(body.error.request_id).toMatch(/^req_/);
    expect(body.error.retryable).toBe(false);
    expect(body.stack).toBeUndefined();
  });

  it("rejects payloads exceeding the 100KB body limit with 413 and clean envelope", async () => {
    // Generate a payload > 100KB (110KB)
    const largePayload = JSON.stringify({
      message: "A".repeat(115 * 1024),
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/sessions",
      headers: {
        "content-type": "application/json",
      },
      payload: largePayload,
    });

    expect(res.statusCode).toBe(413);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("100KB");
    expect(body.stack).toBeUndefined();
  });

  it("safely handles malformed JSON without exposing internal syntax stack traces", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/sessions",
      headers: {
        "content-type": "application/json",
      },
      payload: "{ broken_json: true, ", // Invalid JSON syntax
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("Malformed JSON");
    expect(body.stack).toBeUndefined();
  });

  it("enforces rate limits and sets standard RateLimit and Retry-After headers", async () => {
    // SESSION limit is configured as 3 in testConfig
    // First 3 requests to POST /v1/chat/sessions should succeed (or return 401 without auth, but pass rate limiter)
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/v1/chat/sessions",
        headers: { "content-type": "application/json" },
        payload: {},
      });
      // Will be 401 because no auth header, but headers indicate rate limiter allowed it
      expect(Number(res.headers["ratelimit-limit"])).toBe(3);
      expect(Number(res.headers["ratelimit-remaining"])).toBe(2 - i);
    }

    // 4th request must be rate limited with 429
    const rateLimitedRes = await app.inject({
      method: "POST",
      url: "/v1/chat/sessions",
      headers: { "content-type": "application/json" },
      payload: {},
    });

    expect(rateLimitedRes.statusCode).toBe(429);
    expect(Number(rateLimitedRes.headers["ratelimit-remaining"])).toBe(0);
    expect(rateLimitedRes.headers["retry-after"]).toBeDefined();

    const body = JSON.parse(rateLimitedRes.body);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("Rate limit exceeded");
    expect(body.error.retryable).toBe(true);
  });
});
