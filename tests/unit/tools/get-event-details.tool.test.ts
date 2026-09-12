import { describe, it, expect, vi } from "vitest";
import { GetEventDetailsTool } from "../../../src/tools/reads/get-event-details.tool.js";
import type { ToolExecutionContext } from "../../../src/tools/tool.types.js";
import type { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import type { EventDetailDto } from "../../../src/domain/event.types.js";
import { EntityNotFoundError, InvalidInputError } from "../../../src/domain/errors.js";

describe("GetEventDetailsTool", () => {
  const tool = new GetEventDetailsTool();

  const validUuid = "123e4567-e89b-12d3-a456-426614174000";

  it("fetches event details successfully for a valid event ID", async () => {
    const mockDetail: EventDetailDto = {
      id: validUuid,
      title: "Charity Dinner",
      event_type: "Banquet",
      venue_name: "Grand Ballroom",
      maps_url: null,
      event_date: "2026-11-01",
      reporting_at: "2026-11-01T17:00:00Z",
      work_starts_at: "2026-11-01T18:00:00Z",
      expected_ends_at: "2026-11-01T23:00:00Z",
      required_worker_count: 15,
      confirmed_count: 10,
      waitlist_count: 2,
      daily_wage: 350,
      currency_code: "INR",
      event_status: "PUBLISHED",
      recruitment_status: "OPEN",
      tier_strategy: "STANDARD",
      version: 1,
      instructions: "No phones on service floor",
      dress_code: "Black trousers and shirt",
      open_review_flags: 0,
      leaders: [],
      requirements: [],
      allowances: [],
    };

    const mockGateway = {
      getAdminEventDetail: vi.fn().mockResolvedValue(mockDetail),
    } as unknown as OslavaGateway;

    const context: ToolExecutionContext = {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_detail",
      },
      gateway: mockGateway,
      requestId: "req_detail",
    };

    const result = await tool.execute(context, { event_id: validUuid });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Charity Dinner");
    }
    expect(mockGateway.getAdminEventDetail).toHaveBeenCalledWith(validUuid);
  });

  it("rejects malformed event_id that is not a valid UUID", async () => {
    const context: ToolExecutionContext = {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_detail",
      },
      gateway: {} as OslavaGateway,
      requestId: "req_detail",
    };

    await expect(
      tool.execute(context, { event_id: "not-a-valid-uuid" }),
    ).rejects.toThrow(InvalidInputError);
  });

  it("propagates EntityNotFoundError when event is not found", async () => {
    const mockGateway = {
      getAdminEventDetail: vi.fn().mockRejectedValue(new EntityNotFoundError("Event not found")),
    } as unknown as OslavaGateway;

    const context: ToolExecutionContext = {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_detail",
      },
      gateway: mockGateway,
      requestId: "req_detail",
    };

    await expect(
      tool.execute(context, { event_id: validUuid }),
    ).rejects.toThrow(EntityNotFoundError);
  });
});
