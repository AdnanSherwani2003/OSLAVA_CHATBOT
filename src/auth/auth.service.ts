import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createBaseSupabaseClient,
  createUserScopedSupabaseClient,
} from "../integrations/supabase/client.factory.js";
import { OslavaGateway } from "../integrations/supabase/oslava.gateway.js";
import type { ActorContext } from "./actor-context.js";
import { enforceAdminAccess } from "./role-guard.js";
import { AuthRequiredError, AuthInvalidError } from "../domain/errors.js";

export interface AuthenticatedSession {
  actor: ActorContext;
  gateway: OslavaGateway;
  supabaseClient: SupabaseClient;
}

export class AuthService {
  constructor(
    private readonly baseClientFactory: () => SupabaseClient = createBaseSupabaseClient,
    private readonly scopedClientFactory: (jwt: string) => SupabaseClient = createUserScopedSupabaseClient,
  ) {}

  /**
   * Validates the Bearer token, fetches the user's Oslava profile,
   * enforces ADMIN/SUPER_ADMIN and ACTIVE constraints, and constructs the ActorContext.
   */
  public async authenticate(
    authHeader: string | undefined,
    requestId: string,
  ): Promise<AuthenticatedSession> {
    const token = this.extractBearerToken(authHeader);

    const baseClient = this.baseClientFactory();
    const { data: authData, error: authError } =
      await baseClient.auth.getUser(token);

    if (authError || !authData?.user) {
      throw new AuthInvalidError("Invalid or expired session token.");
    }

    const authUserId = authData.user.id;

    // Create a request-scoped Supabase client that propagates the original Bearer JWT
    const scopedClient = this.scopedClientFactory(token);
    const gateway = new OslavaGateway(scopedClient);

    // Call my_profile via the caller-scoped client
    const profile = await gateway.getMyProfile();

    if (profile.userId !== authUserId) {
      throw new AuthInvalidError(
        "Token subject does not match profile identifier.",
      );
    }

    // Role and account status verification
    const allowedRole = enforceAdminAccess(profile.role, profile.accountStatus);

    const actor: ActorContext = {
      userId: profile.userId,
      role: allowedRole,
      accountStatus: profile.accountStatus,
      displayName: profile.fullName,
      workerNumber: profile.workerNumber ?? undefined,
      accessToken: token,
      requestId,
    };

    return {
      actor,
      gateway,
      supabaseClient: scopedClient,
    };
  }

  /**
   * Extracts and validates the Bearer token from the Authorization header.
   */
  public extractBearerToken(authHeader: string | undefined): string {
    if (!authHeader || authHeader.trim().length === 0) {
      throw new AuthRequiredError("Authorization header is missing.");
    }

    const parts = authHeader.trim().split(/\s+/);
    if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer") {
      throw new AuthInvalidError(
        "Invalid Authorization header format. Expected 'Bearer <token>'.",
      );
    }

    const token = parts[1];
    if (!token || token.length === 0) {
      throw new AuthInvalidError("Bearer token cannot be empty.");
    }

    return token;
  }
}
