export const EVENT_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "UPCOMING",
  "IN_PROGRESS",
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const RECRUITMENT_STATUSES = [
  "NOT_OPEN",
  "OPEN",
  "FULL",
  "CLOSED",
] as const;
export type RecruitmentStatus = (typeof RECRUITMENT_STATUSES)[number];

export const TIER_STRATEGIES = [
  "STANDARD",
  "URGENT",
  "EMERGENCY",
  "CUSTOM",
] as const;
export type TierStrategy = (typeof TIER_STRATEGIES)[number];

export const LEADER_ROLES = ["CAPTAIN", "SUPERVISOR"] as const;
export type LeaderRole = (typeof LEADER_ROLES)[number];

export interface AdminDashboardDto {
  today_event_count: number;
  draft_count: number;
  published_count: number;
  upcoming_count: number;
  in_progress_count: number;
  completed_count: number;
  open_review_flag_count: number;
  required_today_count: number;
  confirmed_today_count: number;
  vacant_today_count: number;
}

export interface EventSummaryDto {
  id: string;
  title: string;
  event_type: string;
  venue_name: string;
  event_date: string;
  reporting_at: string;
  required_worker_count: number;
  daily_wage: number;
  currency_code: string;
  event_status: EventStatus;
  recruitment_status: RecruitmentStatus;
  tier_strategy: TierStrategy;
  version: number;
}

export interface EventLeaderDto {
  user_id: string;
  full_name: string;
  leader_role: LeaderRole;
}

export interface EventRequirementDto {
  id: string;
  name: string;
  description: string | null;
  is_mandatory: boolean;
  acknowledgement_required: boolean;
  extra_allowance_amount: number;
  display_order: number;
}

export interface EventAllowanceDto {
  id: string;
  label: string;
  description: string | null;
  amount: number;
  display_order: number;
}

export interface EventDetailDto {
  id: string;
  title: string;
  event_type: string;
  venue_name: string;
  maps_url: string | null;
  event_date: string;
  reporting_at: string;
  work_starts_at: string;
  expected_ends_at: string;
  required_worker_count: number;
  confirmed_count: number;
  waitlist_count: number;
  daily_wage: number;
  currency_code: string;
  event_status: EventStatus;
  recruitment_status: RecruitmentStatus;
  tier_strategy: TierStrategy;
  version: number;
  instructions: string | null;
  dress_code: string | null;
  open_review_flags: number;
  leaders: EventLeaderDto[];
  requirements: EventRequirementDto[];
  allowances: EventAllowanceDto[];
}

export interface SearchEventsParams {
  query?: string;
  start_date?: string;
  end_date?: string;
  event_status?: EventStatus;
  recruitment_status?: RecruitmentStatus;
  venue?: string;
  limit?: number;
}
