import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAdminAuth } from "../middleware/auth.middleware.js";
import { AuthService } from "../../auth/auth.service.js";
import { conversationService, ConversationService } from "../../context/conversation.service.js";
import { agentService, AgentService } from "../../ai/agent.service.js";
import { uuidSchema, validateInput } from "../../guardrails/input-validation.js";

export interface ChatRoutesOptions {
  authService?: AuthService;
  conversationService?: ConversationService;
  agentService?: AgentService;
}

const sendMessageBodySchema = z
  .object({
    message: z.string().trim().min(1, "Message must not be empty"),
  })
  .strict();

const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const chatRoutes: FastifyPluginAsync<ChatRoutesOptions> = async (
  fastify,
  opts,
) => {
  const authMiddleware = requireAdminAuth(opts.authService);
  const convService = opts.conversationService || conversationService;
  const aiService = opts.agentService || agentService;

  // 1. Create new session
  fastify.post(
    "/v1/chat/sessions",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const actor = request.actor!;
      const session = await convService.createSession(actor.userId);

      return reply.status(201).send({
        session: {
          id: session.id,
          user_id: session.userId,
          status: session.status,
          created_at: session.createdAt.toISOString(),
          updated_at: session.updatedAt.toISOString(),
          last_activity_at: session.lastActivityAt.toISOString(),
        },
      });
    },
  );

  // 2. List caller's sessions
  fastify.get(
    "/v1/chat/sessions",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const actor = request.actor!;
      const sessions = await convService.listSessions(actor.userId);

      return reply.status(200).send({
        sessions: sessions.map((s) => ({
          id: s.id,
          user_id: s.userId,
          status: s.status,
          created_at: s.createdAt.toISOString(),
          updated_at: s.updatedAt.toISOString(),
          last_activity_at: s.lastActivityAt.toISOString(),
        })),
      });
    },
  );

  // 3. Get session details & current entity state
  fastify.get<{ Params: { sessionId: string } }>(
    "/v1/chat/sessions/:sessionId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const actor = request.actor!;
      const sessionId = validateInput(uuidSchema, request.params.sessionId);

      const session = await convService.verifySessionAccess(
        sessionId,
        actor.userId,
      );
      const state = await convService.getState(sessionId);

      return reply.status(200).send({
        session: {
          id: session.id,
          user_id: session.userId,
          status: session.status,
          created_at: session.createdAt.toISOString(),
          updated_at: session.updatedAt.toISOString(),
          last_activity_at: session.lastActivityAt.toISOString(),
        },
        session_state: state
          ? {
              current_event_id: state.currentEventId,
              current_event_label: state.currentEventLabel,
              current_worker_id: state.currentWorkerId,
              current_worker_label: state.currentWorkerLabel,
              recent_events: state.recentEventResults,
              recent_workers: state.recentWorkerResults,
            }
          : null,
      });
    },
  );

  // 4. Get message history for a session
  fastify.get<{ Params: { sessionId: string } }>(
    "/v1/chat/sessions/:sessionId/messages",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const actor = request.actor!;
      const sessionId = validateInput(uuidSchema, request.params.sessionId);
      const query = validateInput(messagesQuerySchema, request.query);

      await convService.verifySessionAccess(sessionId, actor.userId);
      const messages = await convService.getMessages(sessionId, {
        limit: query.limit,
        offset: query.offset,
      });

      return reply.status(200).send({
        messages: messages.map((m) => ({
          id: m.id,
          session_id: m.sessionId,
          role: m.role,
          content: m.content,
          created_at: m.createdAt.toISOString(),
        })),
      });
    },
  );

  // 5. Send message and trigger agent turn
  fastify.post<{ Params: { sessionId: string } }>(
    "/v1/chat/sessions/:sessionId/messages",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const actor = request.actor!;
      const gateway = request.gateway!;
      const sessionId = validateInput(uuidSchema, request.params.sessionId);
      const body = validateInput(sendMessageBodySchema, request.body);

      const result = await aiService.executeUserTurn({
        sessionId,
        userPrompt: body.message,
        requestId: request.requestId,
        gateway,
        actor,
      });

      return reply.status(200).send({
        message_id: result.messageId,
        response: result.response,
        session_state: result.state
          ? {
              current_event_id: result.state.currentEventId,
              current_event_label: result.state.currentEventLabel,
              current_worker_id: result.state.currentWorkerId,
              current_worker_label: result.state.currentWorkerLabel,
            }
          : null,
      });
    },
  );
};
