import { describe, it, expect, vi } from "vitest";
import { GetDashboardTool } from "../../../src/tools/reads/get-dashboard.tool.js";
import type { ToolExecutionContext } from "../../../src/tools/tool.types.js";
import type { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import type { AdminDashboardDto } from "../../../src/domain/event.types.js";

describe("GetDashboardTool", () => {
  const tool = new GetDashboardTool();

  it("invokes gateway.getAdminDashboard() and returns normalized metrics", async () => {
    const mockDashboard: AdminDashboardDto = {
      today_event_count: 3,
      draft_count: 1,
      published_count: 2,
      upcoming_count: 2,
      in_progress_count: 1,
      completed_count: 4,
      open_review_flag_count: 0,
      required_today_count: 15,
      confirmed_today_count: 12,
      vacant_today_count: 3,
    };

    const mockGateway = {
      getAdminDashboard: vi.fn().mockResolvedValue(mockDashboard),
    } as unknown as OslavaGateway;

    const context: ToolExecutionContext = {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_1",
      },
      gateway: mockGateway,
      requestId: "req_1",
    };

    const result = await tool.execute(context, {});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(mockDashboard);
    }
    expect(mockGateway.getAdminDashboard).toHaveBeenCalledOnce();
  });

  it("rejects non-empty or invalid input schemas", async () => {
    const mockGateway = {
      getAdminDashboard: vi.fn(),
    } as unknown as OslavaGateway;

    const context: ToolExecutionContext = {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_1",
      },
      gateway: mockGateway,
      requestId: "req_1",
    };

    await expect(
      tool.execute(context, { unexpected_param: "invalid" } as any),
    ).rejects.toThrowError(/Validation failed/);
  });
});
