import { describe, it, expect, vi } from "vitest";
import { GetEventReportTool } from "../../../src/tools/reads/get-event-report.tool.js";
import type { ToolExecutionContext } from "../../../src/tools/tool.types.js";
import type { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import type {
  AuditHistoryItemDto,
  EventReportSummaryDto,
  StaffingReportItemDto,
} from "../../../src/domain/report.types.js";
import { InvalidInputError } from "../../../src/domain/errors.js";

describe("GetEventReportTool", () => {
  const tool = new GetEventReportTool();
  const eventId = "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";

  const mockSummary: EventReportSummaryDto = {
    event_id: eventId,
    title: "Annual Gala",
    event_type: "Banquet",
    venue_name: "Palace",
    event_date: "2026-10-15",
    reporting_at: "2026-10-15T16:00:00Z",
    work_starts_at: "2026-10-15T17:00:00Z",
    expected_ends_at: "2026-10-15T23:00:00Z",
    required_worker_count: 20,
    confirmed_worker_count: 18,
    daily_wage: 350,
    allowance_total: 50,
    total_worker_pay_display: 400,
    currency_code: "INR",
    event_status: "COMPLETED",
    recruitment_status: "CLOSED",
    attendance_total: 18,
    attendance_not_marked: 0,
    attendance_present: 17,
    attendance_late: 1,
    attendance_absent: 0,
  };

  const mockStaffing: StaffingReportItemDto[] = [
    {
      assignment_id: "asg-1",
      worker_id: "usr-w-1",
      worker_number: 101,
      full_name: "Alice",
      category_at_confirmation: "A",
      assignment_status: "COMPLETED",
      confirmed_at: "2026-10-10T10:00:00Z",
      attendance_status: "PRESENT",
      attendance_marked_at: "2026-10-15T16:05:00Z",
      attendance_notes: null,
      daily_wage: 350,
      allowance_total: 50,
      total_pay_display: 400,
      currency_code: "INR",
    },
  ];

  const mockAudit: AuditHistoryItemDto[] = [
    {
      history_source: "event_history",
      action: "COMPLETED",
      actor_id: "usr-admin-1",
      actor_role: "ADMIN",
      entity_type: "event",
      entity_id: eventId,
      reason: "Event closed",
      created_at: "2026-10-15T23:30:00Z",
    },
  ];

  function createMockContext() {
    const gateway = {
      getEventReportSummary: vi.fn().mockResolvedValue(mockSummary),
      getEventStaffingReport: vi.fn().mockResolvedValue(mockStaffing),
      getEventAuditHistory: vi.fn().mockResolvedValue(mockAudit),
    } as unknown as OslavaGateway;

    const context: ToolExecutionContext = {
      actor: {
        userId: "usr-admin-1",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Admin Alice",
        accessToken: "jwt",
        requestId: "req_rep",
      },
      gateway,
      requestId: "req_rep",
    };

    return { context, gateway };
  }

  it("section=summary calls ONLY getEventReportSummary", async () => {
    const { context, gateway } = createMockContext();
    const result = await tool.execute(context, {
      event_id: eventId,
      section: "summary",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.section).toBe("summary");
      expect(result.data.summary).toEqual(mockSummary);
      expect(result.data.staffing).toBeUndefined();
      expect(result.data.audit).toBeUndefined();
    }

    expect(gateway.getEventReportSummary).toHaveBeenCalledWith(eventId);
    expect(gateway.getEventStaffingReport).not.toHaveBeenCalled();
    expect(gateway.getEventAuditHistory).not.toHaveBeenCalled();
  });

  it("section=staffing calls ONLY getEventStaffingReport", async () => {
    const { context, gateway } = createMockContext();
    const result = await tool.execute(context, {
      event_id: eventId,
      section: "staffing",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.section).toBe("staffing");
      expect(result.data.staffing).toEqual(mockStaffing);
      expect(result.data.summary).toBeUndefined();
      expect(result.data.audit).toBeUndefined();
    }

    expect(gateway.getEventStaffingReport).toHaveBeenCalledWith(eventId);
    expect(gateway.getEventReportSummary).not.toHaveBeenCalled();
    expect(gateway.getEventAuditHistory).not.toHaveBeenCalled();
  });

  it("section=audit calls ONLY getEventAuditHistory with filters", async () => {
    const { context, gateway } = createMockContext();
    const result = await tool.execute(context, {
      event_id: eventId,
      section: "audit",
      audit_action_filter: "COMPLETE",
      limit: 25,
      offset: 0,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.section).toBe("audit");
      expect(result.data.audit).toEqual(mockAudit);
      expect(result.data.summary).toBeUndefined();
      expect(result.data.staffing).toBeUndefined();
    }

    expect(gateway.getEventAuditHistory).toHaveBeenCalledWith({
      eventId,
      actionFilter: "COMPLETE",
      roleFilter: undefined,
      limit: 25,
      offset: 0,
    });
    expect(gateway.getEventReportSummary).not.toHaveBeenCalled();
    expect(gateway.getEventStaffingReport).not.toHaveBeenCalled();
  });

  it("section=full calls all three and bundles results", async () => {
    const { context, gateway } = createMockContext();
    const result = await tool.execute(context, {
      event_id: eventId,
      section: "full",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.section).toBe("full");
      expect(result.data.summary).toEqual(mockSummary);
      expect(result.data.staffing).toEqual(mockStaffing);
      expect(result.data.audit).toEqual(mockAudit);
    }

    expect(gateway.getEventReportSummary).toHaveBeenCalledWith(eventId);
    expect(gateway.getEventStaffingReport).toHaveBeenCalledWith(eventId);
    expect(gateway.getEventAuditHistory).toHaveBeenCalledWith({
      eventId,
      actionFilter: undefined,
      roleFilter: undefined,
      limit: 50,
      offset: 0,
    });
  });

  it("rejects invalid section enum value", async () => {
    const { context } = createMockContext();
    await expect(
      tool.execute(context, { event_id: eventId, section: "invalid_section" as any }),
    ).rejects.toThrow(InvalidInputError);
  });
});
