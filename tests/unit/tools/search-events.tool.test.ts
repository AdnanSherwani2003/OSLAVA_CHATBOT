import { describe, it, expect, vi } from "vitest";
import { SearchEventsTool } from "../../../src/tools/reads/search-events.tool.js";
import type { ToolExecutionContext } from "../../../src/tools/tool.types.js";
import type { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import type { EventSummaryDto } from "../../../src/domain/event.types.js";
import {
  resolveTodayDate,
  resolveTomorrowDate,
} from "../../../src/shared/business-time.js";

describe("SearchEventsTool", () => {
  const tool = new SearchEventsTool();

  const mockEvents: EventSummaryDto[] = [
    {
      id: "evt-1",
      title: "Royal Wedding Reception",
      event_type: "Banquet",
      venue_name: "Palace Hotel",
      event_date: "2026-10-10",
      reporting_at: "2026-10-10T16:00:00Z",
      required_worker_count: 20,
      daily_wage: 350,
      currency_code: "INR",
      event_status: "PUBLISHED",
      recruitment_status: "OPEN",
      tier_strategy: "STANDARD",
      version: 1,
    },
    {
      id: "evt-2",
      title: "Corporate Tech Summit",
      event_type: "Conference",
      venue_name: "Tech Park Arena",
      event_date: "2026-10-05",
      reporting_at: "2026-10-05T08:00:00Z",
      required_worker_count: 10,
      daily_wage: 300,
      currency_code: "INR",
      event_status: "UPCOMING",
      recruitment_status: "FULL",
      tier_strategy: "URGENT",
      version: 1,
    },
    {
      id: "evt-3",
      title: "Music Festival VIP Lounge",
      event_type: "Hospitality",
      venue_name: "City Stadium",
      event_date: "2026-10-15",
      reporting_at: "2026-10-15T12:00:00Z",
      required_worker_count: 30,
      daily_wage: 400,
      currency_code: "INR",
      event_status: "DRAFT",
      recruitment_status: "NOT_OPEN",
      tier_strategy: "CUSTOM",
      version: 1,
    },
  ];

  function createMockContext(events: EventSummaryDto[] = mockEvents): ToolExecutionContext {
    return {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_test",
      },
      gateway: {
        getAdminEvents: vi.fn().mockResolvedValue(events),
      } as unknown as OslavaGateway,
      requestId: "req_test",
    };
  }

  it("returns all events chronologically sorted up to default limit", async () => {
    const context = createMockContext();
    const result = await tool.execute(context, {});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(3);
      // evt-2 is Oct 5, evt-1 is Oct 10, evt-3 is Oct 15
      expect(result.data[0]?.id).toBe("evt-2");
      expect(result.data[1]?.id).toBe("evt-1");
      expect(result.data[2]?.id).toBe("evt-3");
    }
  });

  it("filters events by case-insensitive query matching title", async () => {
    const context = createMockContext();
    const result = await tool.execute(context, { query: "tech summit" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe("evt-2");
    }
  });

  it("filters events by case-insensitive query matching event_type", async () => {
    const context = createMockContext();
    const result = await tool.execute(context, { query: "banquet" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe("evt-1");
    }
  });

  it("filters events by case-insensitive venue name", async () => {
    const context = createMockContext();
    const result = await tool.execute(context, { venue: "palace" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.venue_name).toBe("Palace Hotel");
    }
  });

  it("filters events by status enums", async () => {
    const context = createMockContext();
    const result = await tool.execute(context, {
      event_status: "PUBLISHED",
      recruitment_status: "OPEN",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe("evt-1");
    }
  });

  it("filters events by date range against event_date", async () => {
    const context = createMockContext();
    const result = await tool.execute(context, {
      start_date: "2026-10-06",
      end_date: "2026-10-12",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe("evt-1"); // Oct 10
    }
  });

  it("rejects invalid date range where start_date > end_date", async () => {
    const context = createMockContext();
    await expect(
      tool.execute(context, {
        start_date: "2026-10-20",
        end_date: "2026-10-10",
      }),
    ).rejects.toThrowError(/start_date must be on or before end_date/);
  });

  it("enforces max limit constraint (max 25)", async () => {
    const context = createMockContext();
    await expect(
      tool.execute(context, {
        limit: 30,
      }),
    ).rejects.toThrowError(/Validation failed/);
  });

  it("resolves relative date phrases ('today', 'tomorrow') using Asia/Kolkata business dates", async () => {
    const today = resolveTodayDate();
    const tomorrow = resolveTomorrowDate();

    const dateMockEvents: EventSummaryDto[] = [
      {
        ...mockEvents[0],
        id: "evt-today",
        title: "Today Event",
        event_date: today,
        reporting_at: `${today}T10:00:00Z`,
      },
      {
        ...mockEvents[1],
        id: "evt-tomorrow",
        title: "Tomorrow Event",
        event_date: tomorrow,
        reporting_at: `${tomorrow}T10:00:00Z`,
      },
    ];

    const context = createMockContext(dateMockEvents);

    // Filter "today"
    const resultToday = await tool.execute(context, {
      start_date: "today",
      end_date: "today",
    });
    expect(resultToday.success).toBe(true);
    if (resultToday.success) {
      expect(resultToday.data).toHaveLength(1);
      expect(resultToday.data[0]?.id).toBe("evt-today");
    }

    // Filter "tomorrow"
    const resultTomorrow = await tool.execute(context, {
      start_date: "tomorrow",
      end_date: "tomorrow",
    });
    expect(resultTomorrow.success).toBe(true);
    if (resultTomorrow.success) {
      expect(resultTomorrow.data).toHaveLength(1);
      expect(resultTomorrow.data[0]?.id).toBe("evt-tomorrow");
    }
  });
});
