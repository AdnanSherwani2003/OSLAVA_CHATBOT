import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../../src/app.js";
import { parseConfig } from "../../../src/config/env.js";
import type { FastifyInstance } from "fastify";

describe("API: Health & Readiness Endpoints", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config = parseConfig({
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-key",
      NODE_ENV: "test",
    });
    app = await buildApp({ config });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /healthz returns 200 with liveness metadata and request ID header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("oslava-admin-ai");
    expect(typeof body.timestamp).toBe("string");
    expect(typeof body.uptime).toBe("number");
    expect(res.headers["x-request-id"]).toMatch(/^req_/);
  });

  it("GET /readyz returns 200 when properly configured", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/readyz",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ready");
    expect(body.service).toBe("oslava-admin-ai");
  });
});
