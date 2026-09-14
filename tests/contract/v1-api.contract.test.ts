import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { buildApp } from "../../src/application.js";
import { parseConfig, setCachedConfig } from "../../src/config/env.js";
import { AuthService } from "../../src/auth/auth.service.js";
import { ConversationService } from "../../src/context/conversation.service.js";
import { ActionProposalService } from "../../src/actions/action-proposal.service.js";
import { ActionConfirmationService } from "../../src/actions/action-confirmation.service.js";
import { ActionExecutionService } from "../../src/actions/action-execution.service.js";
import { AgentService } from "../../src/ai/agent.service.js";
import { ToolLoop } from "../../src/ai/tool-loop.js";
import { ModelProvider } from "../../src/ai/model.provider.js";
import { sessionRepository } from "../../src/persistence/repositories/session.repository.js";
import { messageRepository } from "../../src/persistence/repositories/message.repository.js";
import { stateRepository } from "../../src/persistence/repositories/state.repository.js";
import { traceRepository } from "../../src/persistence/repositories/trace.repository.js";
import { actionRepository } from "../../src/persistence/repositories/action.repository.js";
import { MockOslavaGateway } from "../../src/dev/mock-oslava.gateway.js";
import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSessionResponseSchema,
  listSessionsResponseSchema,
  getSessionDetailResponseSchema,
  getMessagesResponseSchema,
  sendMessageResponseSchema,
  getPendingActionResponseSchema,
  getActionDetailResponseSchema,
  confirmActionResponseSchema,
  cancelActionResponseSchema,
  authMeResponseSchema,
  errorEnvelopeSchema,
  healthzResponseSchema,
  readyzResponseSchema,
} from "../../src/api/contracts/v1-api.schemas.js";

describe("Authoritative V1 API Contract Freeze Verification", () => {
  let app: FastifyInstance;
  let convService: ConversationService;
  let agentService: AgentService;
  let proposalService: ActionProposalService;
  let confirmationService: ActionConfirmationService;
  let executionService: ActionExecutionService;
  let mockGateway: MockOslavaGateway;
  let mockModel: ModelProvider;

  const adminUserId = "11111111-1111-1111-1111-111111111111";
  const workerTargetId = "22222222-2222-4222-8222-222222222222"; // Arif Ahmed, Category B

  const mockProfiles: Record<string, any> = {
    "admin-token": {
      id: adminUserId,
      worker_number: 101,
      role: "ADMIN",
      full_name: "Admin Alice",
      account_status: "ACTIVE",
    },
    "other-admin-token": {
      id: "99999999-9999-9999-9999-999999999999",
      worker_number: 999,
      role: "ADMIN",
      full_name: "Other Admin",
      account_status: "ACTIVE",
    },
    "worker-token": {
      id: "33333333-3333-3333-3333-333333333333",
      worker_number: 301,
      role: "WORKER",
      full_name: "Worker Charlie",
      account_status: "ACTIVE",
    },
  };

  beforeAll(async () => {
    const config = parseConfig({
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      NODE_ENV: "test",
      CHAT_PERSISTENCE_MODE: "memory",
    });
    setCachedConfig(config);

    mockGateway = new MockOslavaGateway();

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
        rpc: vi.fn().mockImplementation(async (rpcName: string, params: any) => {
          if (rpcName === "my_profile" && profile) {
            return {
              data: [
                {
                  id: profile.id,
                  worker_number: profile.worker_number ?? null,
                  role: profile.role,
                  full_name: profile.full_name,
                  initials: "AA",
                  phone_e164: "+15550000001",
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
          if (rpcName === "worker_profile_detail") {
            const w = mockGateway.workerDetails[params.p_target_user_id];
            if (!w) return { data: null, error: null };
            return {
              data: [
                {
                  user_id: w.worker_id,
                  worker_number: w.worker_number,
                  full_name: w.full_name,
                  role: w.role,
                  account_status: w.account_status,
                  category: w.category,
                  last_worker_category: w.last_worker_category,
                  profile_completed_at: w.profile_completed_at,
                  reliability_score: w.reliability_score,
                  reliability_state: w.reliability_state,
                  reliability_sample_count: w.reliability_sample_count,
                  reliability_present_count: w.reliability_present_count,
                  reliability_late_count: w.reliability_late_count,
                  reliability_absent_count: w.reliability_absent_count,
                  reliability_worker_cancellation_count:
                    w.reliability_worker_cancellation_count,
                  reliability_completed_event_count:
                    w.reliability_completed_event_count,
                  reliability_performance_event_count:
                    w.reliability_performance_event_count,
                  reliability_performance_average:
                    w.reliability_performance_average,
                  experience_level: w.experience_level,
                  education_status: w.education_status,
                  has_previous_experience: w.has_previous_experience,
                  experience_details: w.experience_details,
                },
              ],
              error: null,
            };
          }
          if (rpcName === "change_worker_category") {
            const res = await mockGateway.changeWorkerCategory({
              workerId: params.p_worker_id,
              newCategory: params.p_new_category,
              reason: params.p_reason,
            });
            return { data: [res], error: null };
          }
          return { data: null, error: new Error("RPC not found: " + rpcName) };
        }),
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "worker_profiles") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockImplementation(async () => {
                    const w = mockGateway.workerDetails[workerTargetId];
                    return { data: w, error: null };
                  }),
                }),
              }),
            };
          }
          return { select: vi.fn().mockReturnValue({ eq: vi.fn() }) };
        }),
      };
    });

    const authService = new AuthService(
      () => mockBaseClient,
      mockScopedClientFactory as any,
    );

    convService = new ConversationService(
      sessionRepository,
      messageRepository,
      stateRepository,
      traceRepository,
    );

    executionService = new ActionExecutionService();
    proposalService = new ActionProposalService(actionRepository);
    confirmationService = new ActionConfirmationService(
      actionRepository,
      executionService,
      convService,
    );

    mockModel = {
      chat: vi.fn().mockImplementation(async (opts) => {
        const lastMsg = opts.messages[opts.messages.length - 1]?.content || "";
        if (lastMsg.toLowerCase().includes("promote arif")) {
          return {
            content: null,
            toolCalls: [
              {
                id: "tc_cwc_contract",
                type: "function",
                function: {
                  name: "change_worker_category",
                  arguments: JSON.stringify({
                    worker_id: workerTargetId,
                    new_category: "A",
                    reason: "Top tier attendance",
                  }),
                },
              },
            ],
            model: "openai/gpt-oss-120b",
          };
        }
        return {
          content: "I am ready to assist with events and workers.",
          toolCalls: [],
          model: "openai/gpt-oss-120b",
        };
      }),
    };

    const toolLoop = new ToolLoop(5);
    agentService = new AgentService(
      mockModel,
      convService,
      toolLoop,
      confirmationService,
    );

    app = await buildApp({
      config,
      authService,
      conversationService: convService,
      agentService,
      actionConfirmationService: confirmationService,
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    mockGateway.resetMockData();
    await actionRepository.clear();
    await sessionRepository.clear();
    await messageRepository.clear();
    await stateRepository.clear();
    await traceRepository.clear();
  });

  // ==========================================================================
  // 1. POST /v1/chat/sessions
  // ==========================================================================
  it("POST /v1/chat/sessions strictly complies with createSessionResponseSchema", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/sessions",
      headers: { authorization: "Bearer admin-token" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    const parsed = createSessionResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.session.user_id).toBe(adminUserId);
  });

  // ==========================================================================
  // 2. GET /v1/chat/sessions
  // ==========================================================================
  it("GET /v1/chat/sessions strictly complies with listSessionsResponseSchema", async () => {
    await convService.createSession(adminUserId);
    await convService.createSession(adminUserId);

    const res = await app.inject({
      method: "GET",
      url: "/v1/chat/sessions",
      headers: { authorization: "Bearer admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = listSessionsResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.sessions).toHaveLength(2);
  });

  // ==========================================================================
  // 3. GET /v1/chat/sessions/:sessionId
  // ==========================================================================
  it("GET /v1/chat/sessions/:sessionId strictly complies with getSessionDetailResponseSchema", async () => {
    const session = await convService.createSession(adminUserId);

    const res = await app.inject({
      method: "GET",
      url: `/v1/chat/sessions/${session.id}`,
      headers: { authorization: "Bearer admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = getSessionDetailResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.session.id).toBe(session.id);
  });

  // ==========================================================================
  // 4. GET /v1/chat/sessions/:sessionId/messages
  // ==========================================================================
  it("GET /v1/chat/sessions/:sessionId/messages strictly complies with getMessagesResponseSchema", async () => {
    const session = await convService.createSession(adminUserId);
    await convService.appendMessage(session.id, "req_msg_1", "USER", "Hello");
    await convService.appendMessage(
      session.id,
      "req_msg_2",
      "ASSISTANT",
      "Hi there",
    );

    const res = await app.inject({
      method: "GET",
      url: `/v1/chat/sessions/${session.id}/messages`,
      headers: { authorization: "Bearer admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = getMessagesResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.messages).toHaveLength(2);
    expect(body.session_id).toBe(session.id);
  });

  // ==========================================================================
  // 5. POST /v1/chat/sessions/:sessionId/messages (Turn Payloads)
  // ==========================================================================
  it("POST /v1/chat/sessions/:sessionId/messages [message] strictly complies with sendMessageResponseSchema", async () => {
    const session = await convService.createSession(adminUserId);

    const res = await app.inject({
      method: "POST",
      url: `/v1/chat/sessions/${session.id}/messages`,
      headers: { authorization: "Bearer admin-token" },
      payload: { message: "Hello assistant" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = sendMessageResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.response.type).toBe("message");
    expect(body.session_id).toBe(session.id);
  });

  it("POST /v1/chat/sessions/:sessionId/messages [confirmation_required] strictly complies with sendMessageResponseSchema", async () => {
    const session = await convService.createSession(adminUserId);
    await convService.saveState({
      sessionId: session.id,
      currentWorkerId: workerTargetId,
      currentWorkerLabel: "Arif Ahmed",
      recentWorkerResults: [
        {
          id: workerTargetId,
          fullName: "Arif Ahmed",
          workerNumber: 201,
          category: "B",
        },
      ],
      recentEventResults: [],
      currentEventId: null,
      currentEventLabel: null,
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/chat/sessions/${session.id}/messages`,
      headers: { authorization: "Bearer admin-token" },
      payload: { message: "promote Arif to A" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = sendMessageResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.response.type).toBe("confirmation_required");
    if (body.response.type === "confirmation_required") {
      expect(body.response.action.id).toBeDefined();
      expect(body.response.action.type).toBe("change_worker_category");
      expect(body.response.action.status).toBe("PENDING");
      expect(body.response.action.summary).toBeDefined();
      expect(body.response.action.expires_at).toBeDefined();
    }
  });

  it("entity_selection_required payload strictly complies with sendMessageResponseSchema", async () => {
    const session = await convService.createSession(adminUserId);
    const disambig = {
      request_id: "req_sel_1",
      session_id: session.id,
      message_id: "00000000-0000-4000-8000-000000000001",
      response: {
        type: "entity_selection_required",
        content: "Multiple workers found. Please choose:",
        selection: {
          entity_type: "worker",
          options: [
            {
              id: workerTargetId,
              display_name: "Arif Ahmed",
              subtitle: "Worker #201 • Category B",
            },
          ],
        },
      },
      session_state: null,
    };

    const parsed = sendMessageResponseSchema.safeParse(disambig);
    expect(parsed.success).toBe(true);
  });

  // ==========================================================================
  // 6. GET /v1/chat/sessions/:sessionId/action/pending
  // ==========================================================================
  it("GET /v1/chat/sessions/:sessionId/action/pending [null] strictly complies with getPendingActionResponseSchema", async () => {
    const session = await convService.createSession(adminUserId);

    const res = await app.inject({
      method: "GET",
      url: `/v1/chat/sessions/${session.id}/action/pending`,
      headers: { authorization: "Bearer admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = getPendingActionResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.pending_action).toBeNull();
  });

  it("GET /v1/chat/sessions/:sessionId/action/pending [active] strictly complies with getPendingActionResponseSchema", async () => {
    const session = await convService.createSession(adminUserId);
    await proposalService.proposeAction({
      sessionId: session.id,
      userId: adminUserId,
      actionType: "change_worker_category",
      args: {
        worker_id: workerTargetId,
        new_category: "A",
        reason: "Active service",
      },
      gateway: mockGateway,
      createdRequestId: "req_prop_active",
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/chat/sessions/${session.id}/action/pending`,
      headers: { authorization: "Bearer admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = getPendingActionResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.pending_action).not.toBeNull();
    expect(body.pending_action?.status).toBe("PENDING");
  });

  // ==========================================================================
  // 7. GET /v1/chat/actions/:actionId
  // ==========================================================================
  it("GET /v1/chat/actions/:actionId strictly complies with getActionDetailResponseSchema", async () => {
    const session = await convService.createSession(adminUserId);
    const proposed = await proposalService.proposeAction({
      sessionId: session.id,
      userId: adminUserId,
      actionType: "change_worker_category",
      args: {
        worker_id: workerTargetId,
        new_category: "A",
        reason: "Inspect detail test",
      },
      gateway: mockGateway,
      createdRequestId: "req_prop_inspect",
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/chat/actions/${proposed.id}`,
      headers: { authorization: "Bearer admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = getActionDetailResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.action.id).toBe(proposed.id);
    expect(body.action.status).toBe("PENDING");
    // Ensure raw internal arguments are not leaked
    expect((body.action as any).arguments).toBeUndefined();
  });

  // ==========================================================================
  // 8. POST /v1/chat/actions/:actionId/confirm
  // ==========================================================================
  it("POST /v1/chat/actions/:actionId/confirm strictly complies with confirmActionResponseSchema", async () => {
    const session = await convService.createSession(adminUserId);
    const proposed = await proposalService.proposeAction({
      sessionId: session.id,
      userId: adminUserId,
      actionType: "change_worker_category",
      args: {
        worker_id: workerTargetId,
        new_category: "A",
        reason: "Promotion execution test",
      },
      gateway: mockGateway,
      createdRequestId: "req_prop_confirm",
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/chat/actions/${proposed.id}/confirm`,
      headers: { authorization: "Bearer admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = confirmActionResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.response.type).toBe("action_completed");
    expect(body.response.action.id).toBe(proposed.id);
    expect(body.response.action.status).toBe("SUCCEEDED");
  });

  // ==========================================================================
  // 9. POST /v1/chat/actions/:actionId/cancel
  // ==========================================================================
  it("POST /v1/chat/actions/:actionId/cancel strictly complies with cancelActionResponseSchema", async () => {
    const session = await convService.createSession(adminUserId);
    const proposed = await proposalService.proposeAction({
      sessionId: session.id,
      userId: adminUserId,
      actionType: "change_worker_category",
      args: {
        worker_id: workerTargetId,
        new_category: "A",
        reason: "Cancellation test",
      },
      gateway: mockGateway,
      createdRequestId: "req_prop_cancel",
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/chat/actions/${proposed.id}/cancel`,
      headers: { authorization: "Bearer admin-token" },
      payload: { reason: "Need more data" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = cancelActionResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.response.type).toBe("action_cancelled");
    expect(body.response.action.id).toBe(proposed.id);
    expect(body.response.action.status).toBe("CANCELLED");
  });

  // ==========================================================================
  // 10. GET /v1/auth/me
  // ==========================================================================
  it("GET /v1/auth/me strictly complies with authMeResponseSchema", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: "Bearer admin-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = authMeResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.user_id).toBe(adminUserId);
    expect(body.role).toBe("ADMIN");
    expect(body.account_status).toBe("ACTIVE");
  });

  // ==========================================================================
  // Operational Endpoints (/healthz, /readyz)
  // ==========================================================================
  it("GET /healthz strictly complies with healthzResponseSchema", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = healthzResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  it("GET /readyz strictly complies with readyzResponseSchema", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/readyz",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = readyzResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  // ==========================================================================
  // Standard Error Envelopes (400, 401, 403, 404, 409)
  // ==========================================================================
  describe("Standard Error Envelope Compliance", () => {
    it("400 Bad Request error returns standardized error envelope", async () => {
      const session = await convService.createSession(adminUserId);
      const res = await app.inject({
        method: "POST",
        url: `/v1/chat/sessions/${session.id}/messages`,
        headers: { authorization: "Bearer admin-token" },
        payload: { message: "   " },
      });

      expect(res.statusCode).toBe(400);
      const parsed = errorEnvelopeSchema.safeParse(res.json());
      expect(parsed.success).toBe(true);
      expect(res.json().error.code).toBe("INVALID_INPUT");
    });

    it("401 Unauthorized returns standardized error envelope", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/auth/me",
      });

      expect(res.statusCode).toBe(401);
      const parsed = errorEnvelopeSchema.safeParse(res.json());
      expect(parsed.success).toBe(true);
      expect(res.json().error.code).toBe("AUTH_REQUIRED");
    });

    it("403 Forbidden returns standardized error envelope", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/auth/me",
        headers: { authorization: "Bearer worker-token" },
      });

      expect(res.statusCode).toBe(403);
      const parsed = errorEnvelopeSchema.safeParse(res.json());
      expect(parsed.success).toBe(true);
      expect(res.json().error.code).toBe("ROLE_FORBIDDEN");
    });

    it("404 Not Found returns standardized error envelope", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/chat/sessions/00000000-0000-4000-8000-000000000099",
        headers: { authorization: "Bearer admin-token" },
      });

      expect(res.statusCode).toBe(404);
      const parsed = errorEnvelopeSchema.safeParse(res.json());
      expect(parsed.success).toBe(true);
      expect(res.json().error.code).toBe("SESSION_NOT_FOUND");
    });

    it("409 Conflict returns standardized error envelope", async () => {
      const session = await convService.createSession(adminUserId);
      const proposed = await proposalService.proposeAction({
        sessionId: session.id,
        userId: adminUserId,
        actionType: "change_worker_category",
        args: {
          worker_id: workerTargetId,
          new_category: "A",
          reason: "Double confirm conflict test",
        },
        gateway: mockGateway,
        createdRequestId: "req_prop_conflict",
      });

      // Confirm first time
      await app.inject({
        method: "POST",
        url: `/v1/chat/actions/${proposed.id}/confirm`,
        headers: { authorization: "Bearer admin-token" },
      });

      // Confirm second time (triggers 409)
      const reConfirmRes = await app.inject({
        method: "POST",
        url: `/v1/chat/actions/${proposed.id}/confirm`,
        headers: { authorization: "Bearer admin-token" },
      });

      expect(reConfirmRes.statusCode).toBe(409);
      const parsed = errorEnvelopeSchema.safeParse(reConfirmRes.json());
      expect(parsed.success).toBe(true);
      expect(reConfirmRes.json().error.code).toBe("ACTION_ALREADY_RESOLVED");
    });
  });
});
