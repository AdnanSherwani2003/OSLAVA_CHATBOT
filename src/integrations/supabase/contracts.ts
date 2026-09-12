import type {
  AccountStatus,
  AppRole,
  MyProfileRow,
  WorkerCategory,
} from "../../domain/auth.types.js";
import type {
  EventStatus,
  LeaderRole,
  RecruitmentStatus,
  TierStrategy,
} from "../../domain/event.types.js";

/**
 * Expected response structure from PostgREST when executing `my_profile` RPC.
 */
export type MyProfileRpcResult = MyProfileRow[] | MyProfileRow | null;

/**
 * Raw row returned by `admin_event_dashboard` RPC.
 */
export interface AdminDashboardRow {
  today_event_count: number | string | null;
  draft_count: number | string | null;
  published_count: number | string | null;
  upcoming_count: number | string | null;
  in_progress_count: number | string | null;
  completed_count: number | string | null;
  open_review_flag_count: number | string | null;
  required_today_count: number | string | null;
  confirmed_today_count: number | string | null;
  vacant_today_count: number | string | null;
}

/**
 * Raw row returned by `admin_event_list` RPC.
 */
export interface AdminEventListRow {
  id: string;
  title: string;
  event_type: string;
  venue_name: string;
  event_date: string;
  reporting_at: string;
  required_worker_count: number | string;
  daily_wage: number | string;
  currency_code: string;
  event_status: EventStatus;
  recruitment_status: RecruitmentStatus;
  tier_strategy: TierStrategy;
  version: number | string;
}

export interface AdminEventDetailLeader {
  user_id: string;
  full_name: string;
  leader_role: LeaderRole;
}

export interface AdminEventDetailRequirement {
  id: string;
  name: string;
  description: string | null;
  is_mandatory: boolean;
  acknowledgement_required: boolean;
  extra_allowance_amount: number | string;
  display_order: number | string;
}

export interface AdminEventDetailAllowance {
  id: string;
  label: string;
  description: string | null;
  amount: number | string;
  display_order: number | string;
}

/**
 * Raw JSONB object returned by `admin_event_detail` RPC.
 */
export interface AdminEventDetailRow {
  id: string;
  title: string;
  event_type: string;
  venue_name: string;
  maps_url: string | null;
  event_date: string;
  timezone_name: string;
  reporting_at: string;
  work_starts_at: string;
  expected_ends_at: string;
  required_worker_count: number | string;
  daily_wage: number | string;
  currency_code: string;
  instructions: string | null;
  dress_code: string | null;
  event_status: EventStatus;
  recruitment_status: RecruitmentStatus;
  tier_strategy: TierStrategy;
  version: number | string;
  confirmed_count: number | string;
  waitlist_count: number | string;
  open_review_flags: number | string;
  leaders: AdminEventDetailLeader[] | null;
  requirements: AdminEventDetailRequirement[] | null;
  allowances: AdminEventDetailAllowance[] | null;
}

/**
 * Raw row returned by `worker_directory` RPC.
 */
export interface WorkerDirectoryRow {
  user_id: string;
  worker_number: number | string | null;
  full_name: string;
  initials: string | null;
  phone_e164: string | null;
  profile_photo_path: string | null;
  role: AppRole;
  account_status: AccountStatus;
  category: WorkerCategory | null;
  last_worker_category: WorkerCategory | null;
  reliability_score: number | string | null;
  reliability_state: string | null;
  reliability_sample_count: number | string | null;
  reliability_present_count: number | string | null;
  reliability_late_count: number | string | null;
  reliability_absent_count: number | string | null;
  reliability_worker_cancellation_count: number | string | null;
  reliability_completed_event_count: number | string | null;
  reliability_performance_event_count: number | string | null;
  reliability_performance_average: number | string | null;
  reliability_config_version: number | string | null;
  profile_completed_at: string | null;
  date_of_birth: string | null;
  address: string | null;
  native_place: string | null;
  height_cm: number | string | null;
  education_status: string | null;
  has_previous_experience: boolean | null;
  experience_details: string | null;
  registration_type: string | null;
  requested_category: WorkerCategory | null;
  id_card_file_path: string | null;
  experience_level: string | null;
}

/**
 * Raw row returned by `worker_profile_detail` RPC.
 */
export interface WorkerProfileDetailRow {
  user_id: string;
  worker_number: number | string | null;
  full_name: string;
  initials: string | null;
  phone_e164: string | null;
  profile_photo_path: string | null;
  role: AppRole;
  account_status: AccountStatus;
  category: WorkerCategory | null;
  last_worker_category: WorkerCategory | null;
  date_of_birth: string | null;
  address: string | null;
  native_place: string | null;
  height_cm: number | string | null;
  education_status: string | null;
  has_previous_experience: boolean | null;
  experience_details: string | null;
  reliability_score: number | string | null;
  reliability_state: string | null;
  reliability_sample_count: number | string | null;
  reliability_present_count: number | string | null;
  reliability_late_count: number | string | null;
  reliability_absent_count: number | string | null;
  reliability_worker_cancellation_count: number | string | null;
  reliability_completed_event_count: number | string | null;
  reliability_performance_event_count: number | string | null;
  reliability_performance_average: number | string | null;
  reliability_config_version: number | string | null;
  reliability_computed_at: string | null;
  profile_completed_at: string | null;
  registration_type: string | null;
  requested_category: WorkerCategory | null;
  id_card_file_path: string | null;
  experience_level: string | null;
}

/**
 * Raw row returned by `worker_history` RPC.
 */
export interface WorkerHistoryRow {
  history_type: string;
  action: string;
  old_value: string | null;
  new_value: string | null;
  actor_id: string | null;
  actor_role: AppRole | null;
  reason: string | null;
  created_at: string;
}

/**
 * Raw row returned by `event_report_summary` RPC.
 */
export interface EventReportSummaryRow {
  event_id: string;
  title: string;
  event_type: string;
  venue_name: string;
  event_date: string;
  reporting_at: string;
  work_starts_at: string;
  expected_ends_at: string;
  required_worker_count: number | string;
  confirmed_worker_count: number | string;
  daily_wage: number | string;
  allowance_total: number | string;
  total_worker_pay_display: number | string;
  currency_code: string;
  event_status: string;
  recruitment_status: string;
  attendance_total: number | string;
  attendance_not_marked: number | string;
  attendance_present: number | string;
  attendance_late: number | string;
  attendance_absent: number | string;
}

/**
 * Raw row returned by `event_staffing_report` RPC.
 */
export interface EventStaffingReportRow {
  assignment_id: string;
  worker_id: string;
  worker_number: number | string | null;
  full_name: string;
  phone_e164: string | null;
  category_at_confirmation: WorkerCategory | null;
  assignment_status: string;
  confirmed_at: string | null;
  attendance_status: string;
  attendance_marked_at: string | null;
  attendance_notes: string | null;
  daily_wage: number | string;
  allowance_total: number | string;
  total_pay_display: number | string;
  currency_code: string;
}

/**
 * Raw row returned by `event_audit_history_filtered` RPC.
 */
export interface EventAuditHistoryRow {
  history_source: string;
  action: string;
  actor_id: string | null;
  actor_role: AppRole | null;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  before_values: Record<string, unknown> | null;
  after_values: Record<string, unknown> | null;
  created_at: string;
}
