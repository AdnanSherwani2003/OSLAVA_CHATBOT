import type { AppRole, WorkerCategory } from "./auth.types.js";

export const REPORT_SECTIONS = ["summary", "staffing", "audit", "full"] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

export interface EventReportSummaryDto {
  event_id: string;
  title: string;
  event_type: string;
  venue_name: string;
  event_date: string;
  reporting_at: string;
  work_starts_at: string;
  expected_ends_at: string;
  required_worker_count: number;
  confirmed_worker_count: number;
  daily_wage: number;
  allowance_total: number;
  total_worker_pay_display: number;
  currency_code: string;
  event_status: string;
  recruitment_status: string;
  attendance_total: number;
  attendance_not_marked: number;
  attendance_present: number;
  attendance_late: number;
  attendance_absent: number;
}

export interface StaffingReportItemDto {
  assignment_id: string;
  worker_id: string;
  worker_number: number | null;
  full_name: string;
  category_at_confirmation: WorkerCategory | null;
  assignment_status: string;
  confirmed_at: string | null;
  attendance_status: string;
  attendance_marked_at: string | null;
  attendance_notes: string | null;
  daily_wage: number;
  allowance_total: number;
  total_pay_display: number;
  currency_code: string;
}

export interface AuditHistoryItemDto {
  history_source: string;
  action: string;
  actor_id: string | null;
  actor_role: AppRole | null;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  created_at: string;
}

export interface CombinedEventReportDto {
  section: ReportSection;
  summary?: EventReportSummaryDto;
  staffing?: StaffingReportItemDto[];
  audit?: AuditHistoryItemDto[];
}

export interface GetEventReportParams {
  event_id: string;
  section: ReportSection;
  audit_action_filter?: string;
  audit_actor_role_filter?: AppRole;
  limit?: number;
  offset?: number;
}
