import type {
  AccountStatus,
  AppRole,
  WorkerCategory,
} from "./auth.types.js";

export interface WorkerSearchResultDto {
  worker_id: string;
  worker_number: number | null;
  full_name: string;
  category: WorkerCategory | null;
  account_status: AccountStatus;
  reliability_score: number | null;
}

export interface WorkerDetailDto {
  worker_id: string;
  worker_number: number | null;
  full_name: string;
  role: AppRole;
  account_status: AccountStatus;
  category: WorkerCategory | null;
  last_worker_category: WorkerCategory | null;
  profile_completed_at: string | null;
  reliability_score: number | null;
  reliability_state: string | null;
  reliability_sample_count: number | null;
  reliability_present_count: number | null;
  reliability_late_count: number | null;
  reliability_absent_count: number | null;
  reliability_worker_cancellation_count: number | null;
  reliability_completed_event_count: number | null;
  reliability_performance_event_count: number | null;
  reliability_performance_average: number | null;
  experience_level: string | null;
  education_status: string | null;
  has_previous_experience: boolean | null;
  experience_details: string | null;
}

export interface WorkerHistoryEntryDto {
  history_type: string;
  action: string;
  old_value: string | null;
  new_value: string | null;
  actor_id: string | null;
  actor_role: AppRole | null;
  reason: string | null;
  created_at: string;
}

export interface SearchWorkersParams {
  query?: string;
  category?: WorkerCategory;
  account_status?: AccountStatus;
  limit?: number;
  offset?: number;
}
