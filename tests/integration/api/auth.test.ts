import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildApp } from "../../../src/app.js";
import { parseConfig } from "../../../src/config/env.js";
import { AuthService } from "../../../src/auth/auth.service.js";
import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("API: /v1/auth/me Integration", () => {
  let app: FastifyInstance;

  // Profiles mock table
  const mockProfiles: Record<string, {
    id: string;
    worker_number?: number;
    role: string;
    full_name: string;
    account_status: string;
  }> = {
    "admin-token": {
      id: "usr-admin-1",
      worker_number: 101,
      role: "ADMIN",
      full_name: "Admin Alice",
      account_status: "ACTIVE",
    },
    "superadmin-token": {
      id: "usr-super-1",
      role: "SUPER_ADMIN",
      full_name: "Super Admin Bob",
      account_status: "ACTIVE",
    },
    "worker-token": {
      id: "usr-worker-1",
      role: "WORKER",
      full_name: "Worker Charlie",
      account_status: "ACTIVE",
    },
    "suspended-admin-token": {
      id: "usr-admin-2",
      role: "ADMIN",
      full_name: "Suspended Dave",
      account_status: "SUSPENDED",
    },
    "pending-admin-token": {
      id: "usr-admin-3",
      role: "ADMIN",
      full_name: "Pending Eve",
      account_status: "PENDING_APPROVAL",
    },
  };

  beforeAll(async () => {
    const config = parseConfig({
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      NODE_ENV: "test",
    });

    const mockBaseClient = {
      auth: {
        getUser: vi.fn().mockImplementation(async (jwt: string) => {
          const profile = mockProfiles[jwt];
          if (!profile) {
            return { data: { user: null }, error: new Error("Invalid JWT") };
          }
          return { data: { user: { id: profile.id } }, error: null };
        }),
      },
    } as unknown as SupabaseClient;

    const mockScopedClientFactory = vi.fn().mockImplementation((jwt: string) => {
      const profile = mockProfiles[jwt];
      return {
        rpc: vi.fn().mockImplementation(async (rpcName: string) => {
          if (rpcName === "my_profile" && profile) {
            return {
              data: [
                {
                  id: profile.id,
                  worker_number: profile.worker_number ?? null,
                  role: profile.role,
                  full_name: profile.full_name,
                  initials: "XX",
                  phone_e164: "+15550000000",
                  profile_photo_path: null,
                  profile_completed_at: "2026-09-01T00:00:00Z",
                  account_status: profile.account_status,
                  category: null,
                  last_worker_category: null,
                },
              ],
              error: null,
            };
          }
          return { data: null, error: new Error("RPC not found") };
        }),
      } as unknown as SupabaseClient;
    });

    const authService = new AuthService(
      () => mockBaseClient,
      mockScopedClientFactory,
    );

    app = await buildApp({ config, authService });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 401 AUTH_REQUIRED when Authorization header is missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error).toEqual({
      code: "AUTH_REQUIRED",
      message: "Authorization header is missing.",
      retryable: false,
      request_id: expect.stringMatching(/^req_/),
    });
  });

  it("returns 401 AUTH_INVALID when Authorization header is malformed", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: "Basic not-a-bearer",
      },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe("AUTH_INVALID");
  });

  it("returns 401 AUTH_INVALID when JWT is unknown or invalid", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: "Bearer invalid-or-expired-token",
      },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe("AUTH_INVALID");
    expect(body.error.message).toBe("Invalid or expired session token.");
  });

  it("returns 200 with safe profile for valid ADMIN", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: "Bearer admin-token",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.request_id).toBeDefined();
    expect(body).toMatchObject({
      user_id: "usr-admin-1",
      role: "ADMIN",
      display_name: "Admin Alice",
      account_status: "ACTIVE",
      worker_number: 101,
    });

    // Ensure sensitive data is never returned
    expect(body.accessToken).toBeUndefined();
    expect(body.token).toBeUndefined();
    expect(body.raw).toBeUndefined();
  });

  it("returns 200 with safe profile for valid SUPER_ADMIN", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: "Bearer superadmin-token",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.request_id).toBeDefined();
    expect(body).toMatchObject({
      user_id: "usr-super-1",
      role: "SUPER_ADMIN",
      display_name: "Super Admin Bob",
      account_status: "ACTIVE",
    });
  });

  it("returns 403 ROLE_FORBIDDEN for non-admin role (WORKER)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: "Bearer worker-token",
      },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error.code).toBe("ROLE_FORBIDDEN");
    expect(body.error.message).toContain("role 'WORKER' is not permitted");
  });

  it("returns 403 ACCOUNT_RESTRICTED for SUSPENDED admin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: "Bearer suspended-admin-token",
      },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error.code).toBe("ACCOUNT_RESTRICTED");
    expect(body.error.message).toContain("account status is 'SUSPENDED'");
  });

  it("returns 403 ACCOUNT_RESTRICTED for PENDING_APPROVAL admin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: "Bearer pending-admin-token",
      },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error.code).toBe("ACCOUNT_RESTRICTED");
    expect(body.error.message).toContain("account status is 'PENDING_APPROVAL'");
  });

  it("never includes tokens or secrets in error messages", async () => {
    const secretToken = "super-secret-token-123456";
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: `Bearer ${secretToken}`,
      },
    });

    expect(res.statusCode).toBe(401);
    const rawResponse = res.body;
    expect(rawResponse.includes(secretToken)).toBe(false);
  });
});
