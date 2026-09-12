import { describe, it, expect, vi } from "vitest";
import { AuthService } from "../../../src/auth/auth.service.js";
import {
  AuthRequiredError,
  AuthInvalidError,
  RoleForbiddenError,
  AccountRestrictedError,
} from "../../../src/domain/errors.js";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("AuthService", () => {
  const service = new AuthService();

  describe("extractBearerToken", () => {
    it("throws AuthRequiredError when header is missing or empty", () => {
      expect(() => service.extractBearerToken(undefined)).toThrow(
        AuthRequiredError,
      );
      expect(() => service.extractBearerToken("")).toThrow(AuthRequiredError);
      expect(() => service.extractBearerToken("   ")).toThrow(
        AuthRequiredError,
      );
    });

    it("throws AuthInvalidError when header is not 'Bearer <token>'", () => {
      expect(() => service.extractBearerToken("Basic abc")).toThrow(
        AuthInvalidError,
      );
      expect(() => service.extractBearerToken("Bearer")).toThrow(
        AuthInvalidError,
      );
      expect(() => service.extractBearerToken("Bearer   ")).toThrow(
        AuthInvalidError,
      );
      expect(() => service.extractBearerToken("Bearer token extra")).toThrow(
        AuthInvalidError,
      );
    });

    it("extracts token correctly with standard Bearer format", () => {
      expect(service.extractBearerToken("Bearer my-jwt-token")).toBe(
        "my-jwt-token",
      );
      expect(service.extractBearerToken("bearer lowercase-bearer")).toBe(
        "lowercase-bearer",
      );
    });
  });

  describe("authenticate", () => {
    function createMockClients(options: {
      authUserId?: string;
      authError?: Error | null;
      profileData?: Record<string, unknown> | null;
      profileError?: Error | null;
    }) {
      const capturedTokens: string[] = [];

      const mockBaseClient = {
        auth: {
          getUser: vi.fn().mockImplementation(async (token: string) => {
            if (options.authError) {
              return { data: { user: null }, error: options.authError };
            }
            if (!options.authUserId) {
              return {
                data: { user: null },
                error: new Error("Invalid token"),
              };
            }
            return {
              data: {
                user: { id: options.authUserId, email: "admin@oslava.test" },
              },
              error: null,
            };
          }),
        },
      } as unknown as SupabaseClient;

      const mockScopedClient = {
        rpc: vi.fn().mockImplementation(async (rpcName: string) => {
          if (rpcName === "my_profile") {
            if (options.profileError) {
              return { data: null, error: options.profileError };
            }
            return { data: options.profileData, error: null };
          }
          return { data: null, error: new Error("Unknown RPC") };
        }),
      } as unknown as SupabaseClient;

      const scopedClientFactory = vi
        .fn()
        .mockImplementation((token: string) => {
          capturedTokens.push(token);
          return mockScopedClient;
        });

      return {
        baseClient: mockBaseClient,
        scopedClient: mockScopedClient,
        scopedClientFactory,
        capturedTokens,
      };
    }

    it("throws AuthInvalidError if token validation fails at Supabase Auth", async () => {
      const { baseClient, scopedClientFactory } = createMockClients({
        authError: new Error("JWT expired"),
      });

      const authService = new AuthService(
        () => baseClient,
        scopedClientFactory,
      );

      await expect(
        authService.authenticate("Bearer expired-jwt", "req_1"),
      ).rejects.toThrow(AuthInvalidError);
    });

    it("throws RoleForbiddenError if caller role is WORKER", async () => {
      const userId = "usr-worker-1";
      const { baseClient, scopedClientFactory } = createMockClients({
        authUserId: userId,
        profileData: {
          id: userId,
          worker_number: 101,
          role: "WORKER",
          full_name: "Worker Alice",
          account_status: "ACTIVE",
        },
      });

      const authService = new AuthService(
        () => baseClient,
        scopedClientFactory,
      );

      await expect(
        authService.authenticate("Bearer worker-jwt", "req_2"),
      ).rejects.toThrow(RoleForbiddenError);
    });

    it("throws AccountRestrictedError if caller is ADMIN but SUSPENDED", async () => {
      const userId = "usr-admin-1";
      const { baseClient, scopedClientFactory } = createMockClients({
        authUserId: userId,
        profileData: {
          id: userId,
          role: "ADMIN",
          full_name: "Admin Bob",
          account_status: "SUSPENDED",
        },
      });

      const authService = new AuthService(
        () => baseClient,
        scopedClientFactory,
      );

      await expect(
        authService.authenticate("Bearer admin-jwt", "req_3"),
      ).rejects.toThrow(AccountRestrictedError);
    });

    it("succeeds for ACTIVE ADMIN and sets ActorContext properly", async () => {
      const userId = "usr-admin-2";
      const { baseClient, scopedClientFactory, capturedTokens } =
        createMockClients({
          authUserId: userId,
          profileData: {
            id: userId,
            worker_number: 42,
            role: "ADMIN",
            full_name: "Admin Sarah",
            initials: "AS",
            phone_e164: "+15551234567",
            account_status: "ACTIVE",
          },
        });

      const authService = new AuthService(
        () => baseClient,
        scopedClientFactory,
      );

      const session = await authService.authenticate(
        "Bearer valid-admin-jwt",
        "req_4",
      );

      expect(session.actor).toEqual({
        userId,
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Sarah",
        workerNumber: 42,
        accessToken: "valid-admin-jwt",
        requestId: "req_4",
      });

      // Verify request-scoped client received caller's original JWT
      expect(capturedTokens).toEqual(["valid-admin-jwt"]);
      expect(session.gateway).toBeDefined();
    });

    it("succeeds for ACTIVE SUPER_ADMIN", async () => {
      const userId = "usr-superadmin-1";
      const { baseClient, scopedClientFactory } = createMockClients({
        authUserId: userId,
        profileData: {
          id: userId,
          role: "SUPER_ADMIN",
          full_name: "Super Admin Carl",
          account_status: "ACTIVE",
        },
      });

      const authService = new AuthService(
        () => baseClient,
        scopedClientFactory,
      );

      const session = await authService.authenticate(
        "Bearer super-jwt",
        "req_5",
      );
      expect(session.actor.role).toBe("SUPER_ADMIN");
      expect(session.actor.displayName).toBe("Super Admin Carl");
    });
  });
});
