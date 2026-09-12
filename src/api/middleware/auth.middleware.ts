import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { AuthService } from "../../auth/auth.service.js";

const defaultAuthService = new AuthService();

/**
 * Fastify preHandler hook that enforces Supabase JWT authentication,
 * ADMIN/SUPER_ADMIN role authorization, and ACTIVE account status.
 * Attaches the ActorContext and request-scoped OslavaGateway to FastifyRequest.
 */
export function requireAdminAuth(
  authService: AuthService = defaultAuthService,
): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    const session = await authService.authenticate(
      authHeader,
      request.requestId,
    );

    request.actor = session.actor;
    request.gateway = session.gateway;
    request.supabase = session.supabaseClient;
  };
}
