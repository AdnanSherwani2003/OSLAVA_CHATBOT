import { describe, it, expect, vi } from "vitest";
import { GetWorkerDetailsTool } from "../../../src/tools/reads/get-worker-details.tool.js";
import type { ToolExecutionContext } from "../../../src/tools/tool.types.js";
import type { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import type { WorkerDetailDto } from "../../../src/domain/worker.types.js";
import { EntityNotFoundError, InvalidInputError } from "../../../src/domain/errors.js";

describe("GetWorkerDetailsTool", () => {
  const tool = new GetWorkerDetailsTool();
  const validWorkerId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

  it("fetches operational details for a valid worker ID", async () => {
    const mockDetail: WorkerDetailDto = {
      worker_id: validWorkerId,
      worker_number: 105,
      full_name: "Daniel Craig",
      role: "WORKER",
      account_status: "ACTIVE",
      category: "A",
      last_worker_category: null,
      profile_completed_at: "2026-08-01T00:00:00Z",
      reliability_score: 96.0,
      reliability_state: "EXCELLENT",
      reliability_sample_count: 12,
      reliability_present_count: 12,
      reliability_late_count: 0,
      reliability_absent_count: 0,
      reliability_worker_cancellation_count: 0,
      reliability_completed_event_count: 12,
      reliability_performance_event_count: 6,
      reliability_performance_average: 4.9,
      experience_level: "EXPERIENCED",
      education_status: "Graduate",
      has_previous_experience: true,
      experience_details: "Lead banquet server",
    };

    const mockGateway = {
      getWorkerDetail: vi.fn().mockResolvedValue(mockDetail),
    } as unknown as OslavaGateway;

    const context: ToolExecutionContext = {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_wd",
      },
      gateway: mockGateway,
      requestId: "req_wd",
    };

    const result = await tool.execute(context, { worker_id: validWorkerId });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.full_name).toBe("Daniel Craig");
      expect(result.data.reliability_score).toBe(96.0);
    }
    expect(mockGateway.getWorkerDetail).toHaveBeenCalledWith(validWorkerId);
  });

  it("rejects invalid worker_id format", async () => {
    const context: ToolExecutionContext = {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_wd",
      },
      gateway: {} as OslavaGateway,
      requestId: "req_wd",
    };

    await expect(
      tool.execute(context, { worker_id: "not-uuid" }),
    ).rejects.toThrow(InvalidInputError);
  });

  it("propagates EntityNotFoundError when worker does not exist", async () => {
    const mockGateway = {
      getWorkerDetail: vi.fn().mockRejectedValue(new EntityNotFoundError("Worker not found")),
    } as unknown as OslavaGateway;

    const context: ToolExecutionContext = {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_wd",
      },
      gateway: mockGateway,
      requestId: "req_wd",
    };

    await expect(
      tool.execute(context, { worker_id: validWorkerId }),
    ).rejects.toThrow(EntityNotFoundError);
  });
});
