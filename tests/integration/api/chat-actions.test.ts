import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { buildApp } from "../../../src/application.js";
import { parseConfig, setCachedConfig } from "../../../src/config/env.js";
import { AuthService } from "../../../src/auth/auth.service.js";
import { ConversationService } from "../../../src/context/conversation.service.js";
import { ActionProposalService } from "../../../src/actions/action-proposal.service.js";
import { ActionConfirmationService } from "../../../src/actions/action-confirmation.service.js";
import { ActionExecutionService } from "../../../src/actions/action-execution.service.js";
import { actionRepository } from "../../../src/persistence/repositories/action.repository.js";
import { sessionRepository } from "../../../src/persistence/repositories/session.repository.js";
import { messageRepository } from "../../../src/persistence/repositories/message.repository.js";
import { stateRepository } from "../../../src/persistence/repositories/state.repository.js";
import { traceRepository } from "../../../src/persistence/repositories/trace.repository.js";
import { MockOslavaGateway } from "../../../src/dev/mock-oslava.gateway.js";
import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("API: /v1/chat Actions Confirmation & Execution Integration", () => {
  let app: FastifyInstance;
  let convService: ConversationService;
  let proposalService: ActionProposalService;
  let confirmationService: ActionConfirmationService;
  let executionService: ActionExecutionService;
  let mockGateway: MockOslavaGateway;

  const userAliceId = "11111111-1111-1111-1111-111111111111";
  const userBobId = "22222222-2222-2222-2222-222222222222";

  // Real mock IDs from mock-data.ts
  const arifAhmedId = "22222222-2222-4222-8222-222222222222"; // Category B, ACTIVE
  const draftEventId = "eeee5555-5555-4eee-8eee-555555555555"; // DRAFT, v1

  const mockProfiles: Record<string, any> = {
    "alice-token": {
      id: userAliceId,
      worker_number: 101,
      role: "ADMIN",
      full_name: "Admin Alice",
      account_status: "ACTIVE",
    },
    "bob-token": {
      id: userBobId,
      worker_number: 102,
      role: "ADMIN",
      full_name: "Admin Bob",
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
          if (rpcName === "admin_event_detail") {
            const e = mockGateway.eventDetails[params.p_event_id];
            if (!e) return { data: null, error: null };
            return {
              data: [e],
              error: null,
            };
          }
          if (rpcName === "change_worker_category") {
            const res = await mockGateway.changeWorkerCategory({
              workerId: params.p_worker_id,
              newCategory: params.p_new_category,
              reason: params.p_reason,
              notes: params.p_notes,
            });
            return { data: [res], error: null };
          }
          if (rpcName === "publish_event") {
            await mockGateway.publishEvent({
              eventId: params.p_event_id,
              reason: params.p_reason,
            });
            return { data: null, error: null };
          }
          return { data: null, error: new Error("RPC not found: " + rpcName) };
        }),
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "events") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockImplementation(async () => {
                    return {
                      data: mockGateway.eventDetails[draftEventId],
                      error: null,
                    };
                  }),
                }),
              }),
            };
          }
          if (table === "worker_profiles") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockImplementation(async () => {
                    const w = mockGateway.workerDetails[arifAhmedId];
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

    app = await buildApp({
      config,
      authService,
      conversationService: convService,
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
  });

  it("GET /v1/chat/sessions/:sessionId/action/pending returns null when no active pending action", async () => {
    const session = await convService.createSession(userAliceId);

    const res = await app.inject({
      method: "GET",
      url: `/v1/chat/sessions/${session.id}/action/pending`,
      headers: { authorization: "Bearer alice-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.pending_action).toBeNull();
  });

  it("proposes, retrieves, and confirms an action via API endpoints", async () => {
    const session = await convService.createSession(userAliceId);

    // 1. Propose action
    const proposed = await proposalService.proposeAction({
      sessionId: session.id,
      userId: userAliceId,
      actionType: "change_worker_category",
      args: {
        worker_id: arifAhmedId,
        new_category: "A",
        reason: "Proven capability and punctual performance",
      },
      gateway: mockGateway,
      createdRequestId: "req-api-prop-1",
    });

    // 2. GET pending action for session
    const pendingRes = await app.inject({
      method: "GET",
      url: `/v1/chat/sessions/${session.id}/action/pending`,
      headers: { authorization: "Bearer alice-token" },
    });

    expect(pendingRes.statusCode).toBe(200);
    const pendingBody = JSON.parse(pendingRes.body);
    expect(pendingBody.pending_action).not.toBeNull();
    expect(pendingBody.pending_action.id).toBe(proposed.id);
    expect(pendingBody.pending_action.action_type).toBe("change_worker_category");

    // 3. GET action by ID
    const actionRes = await app.inject({
      method: "GET",
      url: `/v1/chat/actions/${proposed.id}`,
      headers: { authorization: "Bearer alice-token" },
    });

    expect(actionRes.statusCode).toBe(200);
    const actionBody = JSON.parse(actionRes.body);
    expect(actionBody.action.id).toBe(proposed.id);
    expect(actionBody.action.status).toBe("PENDING");

    // 4. Another user (Bob) cannot confirm Alice's action (403 ACTION_FORBIDDEN)
    const bobConfirmRes = await app.inject({
      method: "POST",
      url: `/v1/chat/actions/${proposed.id}/confirm`,
      headers: { authorization: "Bearer bob-token" },
    });

    expect(bobConfirmRes.statusCode).toBe(403);
    const bobBody = JSON.parse(bobConfirmRes.body);
    expect(bobBody.error.code).toBe("ACTION_FORBIDDEN");

    // 5. Alice confirms her own action
    const aliceConfirmRes = await app.inject({
      method: "POST",
      url: `/v1/chat/actions/${proposed.id}/confirm`,
      headers: { authorization: "Bearer alice-token" },
    });

    expect(aliceConfirmRes.statusCode).toBe(200);
    const aliceBody = JSON.parse(aliceConfirmRes.body);
    expect(aliceBody.request_id).toBeDefined();
    expect(aliceBody.session_id).toBe(session.id);
    expect(aliceBody.response.type).toBe("action_completed");
    expect(aliceBody.response.action.status).toBe("SUCCEEDED");
    expect(aliceBody.response.action.id).toBe(proposed.id);

    // 6. Confirming again returns 409 ACTION_ALREADY_RESOLVED
    const reConfirmRes = await app.inject({
      method: "POST",
      url: `/v1/chat/actions/${proposed.id}/confirm`,
      headers: { authorization: "Bearer alice-token" },
    });

    expect(reConfirmRes.statusCode).toBe(409);
    const reConfirmBody = JSON.parse(reConfirmRes.body);
    expect(reConfirmBody.error.code).toBe("ACTION_ALREADY_RESOLVED");
  });

  it("cancels an action and prevents subsequent confirmation", async () => {
    const session = await convService.createSession(userAliceId);

    const proposed = await proposalService.proposeAction({
      sessionId: session.id,
      userId: userAliceId,
      actionType: "publish_event",
      args: {
        event_id: draftEventId,
        reason: "Publishing draft event",
      },
      gateway: mockGateway,
      createdRequestId: "req-api-cancel-1",
    });

    // Cancel action
    const cancelRes = await app.inject({
      method: "POST",
      url: `/v1/chat/actions/${proposed.id}/cancel`,
      headers: { authorization: "Bearer alice-token" },
      payload: { reason: "Admin reconsidered schedule" },
    });

    expect(cancelRes.statusCode).toBe(200);
    const cancelBody = JSON.parse(cancelRes.body);
    expect(cancelBody.request_id).toBeDefined();
    expect(cancelBody.session_id).toBe(session.id);
    expect(cancelBody.response.type).toBe("action_cancelled");
    expect(cancelBody.response.action.status).toBe("CANCELLED");

    // Subsequent confirm should fail with 409
    const confirmRes = await app.inject({
      method: "POST",
      url: `/v1/chat/actions/${proposed.id}/confirm`,
      headers: { authorization: "Bearer alice-token" },
    });

    expect(confirmRes.statusCode).toBe(409);
    expect(JSON.parse(confirmRes.body).error.code).toBe("ACTION_ALREADY_RESOLVED");
  });
});
