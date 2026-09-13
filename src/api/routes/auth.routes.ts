import type { FastifyPluginAsync } from "fastify";
import { requireAdminAuth } from "../middleware/auth.middleware.js";
import type { AuthMeResponse } from "../../domain/auth.types.js";
import type { AuthService } from "../../auth/auth.service.js";

export interface AuthRoutesOptions {
  authService?: AuthService;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  fastify,
  opts,
) => {
  const authMiddleware = requireAdminAuth(opts.authService);

  /**
   * Protected verification endpoint: validates caller identity, role, and active status.
   * Returns safe actor profile.
   */
  fastify.get<{ Reply: AuthMeResponse }>(
    "/v1/auth/me",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const actor = request.actor!;

      const response: AuthMeResponse = {
        request_id: request.requestId,
        user_id: actor.userId,
        role: actor.role,
        display_name: actor.displayName,
        account_status: "ACTIVE",
        ...(actor.workerNumber !== undefined && {
          worker_number: actor.workerNumber,
        }),
      };

      return reply.status(200).send(response);
    },
  );
};
