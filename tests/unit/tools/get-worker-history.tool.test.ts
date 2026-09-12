import { describe, it, expect, vi } from "vitest";
import { GetWorkerHistoryTool } from "../../../src/tools/reads/get-worker-history.tool.js";
import type { ToolExecutionContext } from "../../../src/tools/tool.types.js";
import type { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import type { WorkerHistoryEntryDto } from "../../../src/domain/worker.types.js";
import { InvalidInputError } from "../../../src/domain/errors.js";

describe("GetWorkerHistoryTool", () => {
  const tool = new GetWorkerHistoryTool();
  const validWorkerId = "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22";

  it("fetches history and applies limit slicing server-side", async () => {
    const mockHistory: WorkerHistoryEntryDto[] = [
      {
        history_type: "category",
        action: "PROMOTED",
        old_value: "B",
        new_value: "A",
        actor_id: "usr-admin-1",
        actor_role: "ADMIN",
        reason: "Great work",
        created_at: "2026-09-08T10:00:00Z",
      },
      {
        history_type: "account",
        action: "STATUS_CHANGED",
        old_value: "PENDING_APPROVAL",
        new_value: "ACTIVE",
        actor_id: "usr-admin-1",
        actor_role: "ADMIN",
        reason: "Approved registration",
        created_at: "2026-09-01T10:00:00Z",
      },
      {
        history_type: "role",
        action: "ROLE_CHANGED",
        old_value: "WORKER",
        new_value: "WORKER",
        actor_id: "usr-admin-1",
        actor_role: "ADMIN",
        reason: "Initial role",
        created_at: "2026-08-30T10:00:00Z",
      },
    ];

    const mockGateway = {
      getWorkerHistory: vi.fn().mockResolvedValue(mockHistory),
    } as unknown as OslavaGateway;

    const context: ToolExecutionContext = {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_wh",
      },
      gateway: mockGateway,
      requestId: "req_wh",
    };

    // Request limit of 2
    const result = await tool.execute(context, {
      worker_id: validWorkerId,
      limit: 2,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]?.action).toBe("PROMOTED");
      expect(result.data[1]?.action).toBe("STATUS_CHANGED");
    }
  });

  it("handles empty worker history safely", async () => {
    const mockGateway = {
      getWorkerHistory: vi.fn().mockResolvedValue([]),
    } as unknown as OslavaGateway;

    const context: ToolExecutionContext = {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_wh",
      },
      gateway: mockGateway,
      requestId: "req_wh",
    };

    const result = await tool.execute(context, {
      worker_id: validWorkerId,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });

  it("enforces limit bounds (1 - 100)", async () => {
    const context: ToolExecutionContext = {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_wh",
      },
      gateway: {} as OslavaGateway,
      requestId: "req_wh",
    };

    await expect(
      tool.execute(context, { worker_id: validWorkerId, limit: 0 }),
    ).rejects.toThrow(InvalidInputError);

    await expect(
      tool.execute(context, { worker_id: validWorkerId, limit: 150 }),
    ).rejects.toThrow(InvalidInputError);
  });
});
