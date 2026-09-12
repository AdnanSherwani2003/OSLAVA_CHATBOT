import type { AllowedAdminRole, AccountStatus } from "../domain/auth.types.js";

/**
 * Immutable security context associated with an authenticated request.
 * Contains verified identity and authorization details.
 */
export interface ActorContext {
  userId: string;
  role: AllowedAdminRole;
  accountStatus: AccountStatus;
  displayName: string;
  workerNumber?: number;
  accessToken: string;
  requestId: string;
}
