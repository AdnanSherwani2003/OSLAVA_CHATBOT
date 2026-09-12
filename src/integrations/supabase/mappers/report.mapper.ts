import type {
  EventAuditHistoryRow,
  EventReportSummaryRow,
  EventStaffingReportRow,
} from "../contracts.js";
import type {
  AuditHistoryItemDto,
  EventReportSummaryDto,
  StaffingReportItemDto,
} from "../../../domain/report.types.js";

function toNumber(val: number | string | null | undefined, defaultValue = 0): number {
  if (val === null || val === undefined) return defaultValue;
  const num = typeof val === "number" ? val : Number(val);
  return Number.isNaN(num) ? defaultValue : num;
}

function toNullableNumber(val: number | string | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  const num = typeof val === "number" ? val : Number(val);
  return Number.isNaN(num) ? null : num;
}

export function mapEventReportSummaryRowToDto(
  row: EventReportSummaryRow,
): EventReportSummaryDto {
  return {
    event_id: row.event_id,
    title: row.title,
    event_type: row.event_type,
    venue_name: row.venue_name,
    event_date: row.event_date,
    reporting_at: row.reporting_at,
    work_starts_at: row.work_starts_at,
    expected_ends_at: row.expected_ends_at,
    required_worker_count: toNumber(row.required_worker_count),
    confirmed_worker_count: toNumber(row.confirmed_worker_count),
    daily_wage: toNumber(row.daily_wage),
    allowance_total: toNumber(row.allowance_total),
    total_worker_pay_display: toNumber(row.total_worker_pay_display),
    currency_code: row.currency_code,
    event_status: row.event_status,
    recruitment_status: row.recruitment_status,
    attendance_total: toNumber(row.attendance_total),
    attendance_not_marked: toNumber(row.attendance_not_marked),
    attendance_present: toNumber(row.attendance_present),
    attendance_late: toNumber(row.attendance_late),
    attendance_absent: toNumber(row.attendance_absent),
  };
}

/**
 * Maps raw staffing row to a sanitized DTO.
 * Explicitly excludes phone_e164.
 */
export function mapEventStaffingReportRowToDto(
  row: EventStaffingReportRow,
): StaffingReportItemDto {
  return {
    assignment_id: row.assignment_id,
    worker_id: row.worker_id,
    worker_number: toNullableNumber(row.worker_number),
    full_name: row.full_name,
    category_at_confirmation: row.category_at_confirmation,
    assignment_status: row.assignment_status,
    confirmed_at: row.confirmed_at,
    attendance_status: row.attendance_status,
    attendance_marked_at: row.attendance_marked_at,
    attendance_notes: row.attendance_notes,
    daily_wage: toNumber(row.daily_wage),
    allowance_total: toNumber(row.allowance_total),
    total_pay_display: toNumber(row.total_pay_display),
    currency_code: row.currency_code,
  };
}

/**
 * Maps raw audit row to a sanitized DTO.
 * Excludes large raw before/after JSON blobs.
 */
export function mapEventAuditHistoryRowToDto(
  row: EventAuditHistoryRow,
): AuditHistoryItemDto {
  return {
    history_source: row.history_source,
    action: row.action,
    actor_id: row.actor_id,
    actor_role: row.actor_role,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    reason: row.reason,
    created_at: row.created_at,
  };
}
