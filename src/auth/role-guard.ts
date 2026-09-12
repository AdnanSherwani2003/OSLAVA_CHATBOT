import type { AppRole, AccountStatus, AllowedAdminRole } from "../domain/auth.types.js";
import { ALLOWED_ADMIN_ROLES } from "../domain/auth.types.js";
import { RoleForbiddenError, AccountRestrictedError } from "../domain/errors.js";

/**
 * Validates that the profile has an administrative role (ADMIN or SUPER_ADMIN).
 * Throws RoleForbiddenError otherwise.
 */
export function assertAdminRole(role: AppRole): asserts role is AllowedAdminRole {
  if (!ALLOWED_ADMIN_ROLES.includes(role as AllowedAdminRole)) {
    throw new RoleForbiddenError(
      `Access denied: role '${role}' is not permitted to access the admin chatbot. Allowed roles: ${ALLOWED_ADMIN_ROLES.join(", ")}.`,
    );
  }
}

/**
 * Validates that the account status is strictly ACTIVE.
 * Throws AccountRestrictedError otherwise.
 */
export function assertActiveAccount(status: AccountStatus): void {
  if (status !== "ACTIVE") {
    throw new AccountRestrictedError(
      `Access denied: account status is '${status}'. Only ACTIVE accounts can access the chatbot service.`,
    );
  }
}

/**
 * Combines role and status validation for admin operations.
 */
export function enforceAdminAccess(
  role: AppRole,
  status: AccountStatus,
): AllowedAdminRole {
  assertAdminRole(role);
  assertActiveAccount(status);
  return role;
}
