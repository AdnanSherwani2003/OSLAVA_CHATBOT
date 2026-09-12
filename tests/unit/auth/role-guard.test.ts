import { describe, it, expect } from "vitest";
import {
  assertAdminRole,
  assertActiveAccount,
  enforceAdminAccess,
} from "../../../src/auth/role-guard.js";
import {
  RoleForbiddenError,
  AccountRestrictedError,
} from "../../../src/domain/errors.js";
import type { AppRole, AccountStatus } from "../../../src/domain/auth.types.js";

describe("Role Guard", () => {
  describe("assertAdminRole", () => {
    it("allows ADMIN and SUPER_ADMIN roles", () => {
      expect(() => assertAdminRole("ADMIN")).not.toThrow();
      expect(() => assertAdminRole("SUPER_ADMIN")).not.toThrow();
    });

    it("rejects CAPTAIN, SUPERVISOR, and WORKER roles with RoleForbiddenError", () => {
      const nonAdminRoles: AppRole[] = ["CAPTAIN", "SUPERVISOR", "WORKER"];

      for (const role of nonAdminRoles) {
        expect(() => assertAdminRole(role)).toThrow(RoleForbiddenError);
      }
    });
  });

  describe("assertActiveAccount", () => {
    it("allows ACTIVE account status", () => {
      expect(() => assertActiveAccount("ACTIVE")).not.toThrow();
    });

    it("rejects non-ACTIVE statuses with AccountRestrictedError", () => {
      const restrictedStatuses: AccountStatus[] = [
        "SUSPENDED",
        "DETAINED",
        "BLACKLISTED",
        "INACTIVE",
        "PENDING_APPROVAL",
        "REJECTED",
      ];

      for (const status of restrictedStatuses) {
        expect(() => assertActiveAccount(status)).toThrow(
          AccountRestrictedError,
        );
      }
    });
  });

  describe("enforceAdminAccess", () => {
    it("returns role when ADMIN and ACTIVE", () => {
      expect(enforceAdminAccess("ADMIN", "ACTIVE")).toBe("ADMIN");
      expect(enforceAdminAccess("SUPER_ADMIN", "ACTIVE")).toBe("SUPER_ADMIN");
    });

    it("throws RoleForbiddenError if role is not admin even if ACTIVE", () => {
      expect(() => enforceAdminAccess("WORKER", "ACTIVE")).toThrow(
        RoleForbiddenError,
      );
    });

    it("throws AccountRestrictedError if admin but not ACTIVE", () => {
      expect(() => enforceAdminAccess("ADMIN", "SUSPENDED")).toThrow(
        AccountRestrictedError,
      );
      expect(() => enforceAdminAccess("SUPER_ADMIN", "PENDING_APPROVAL")).toThrow(
        AccountRestrictedError,
      );
    });
  });
});
