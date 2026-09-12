import type {
  WorkerDirectoryRow,
  WorkerHistoryRow,
  WorkerProfileDetailRow,
} from "../contracts.js";
import type {
  WorkerDetailDto,
  WorkerHistoryEntryDto,
  WorkerSearchResultDto,
} from "../../../domain/worker.types.js";

function toNullableNumber(val: number | string | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  const num = typeof val === "number" ? val : Number(val);
  return Number.isNaN(num) ? null : num;
}

/**
 * Maps raw directory row to a safe search result DTO.
 * Explicitly excludes phone, DOB, address, ID card paths, storage paths, and auth metadata.
 */
export function mapWorkerDirectoryRowToDto(
  row: WorkerDirectoryRow,
): WorkerSearchResultDto {
  return {
    worker_id: row.user_id,
    worker_number: toNullableNumber(row.worker_number),
    full_name: row.full_name,
    category: row.category,
    account_status: row.account_status,
    reliability_score: toNullableNumber(row.reliability_score),
  };
}

/**
 * Maps raw worker profile detail to a sanitized operational DTO.
 * Excludes phone, DOB, home address, native place, and private storage file paths.
 */
export function mapWorkerProfileDetailRowToDto(
  row: WorkerProfileDetailRow,
): WorkerDetailDto {
  return {
    worker_id: row.user_id,
    worker_number: toNullableNumber(row.worker_number),
    full_name: row.full_name,
    role: row.role,
    account_status: row.account_status,
    category: row.category,
    last_worker_category: row.last_worker_category,
    profile_completed_at: row.profile_completed_at,
    reliability_score: toNullableNumber(row.reliability_score),
    reliability_state: row.reliability_state,
    reliability_sample_count: toNullableNumber(row.reliability_sample_count),
    reliability_present_count: toNullableNumber(row.reliability_present_count),
    reliability_late_count: toNullableNumber(row.reliability_late_count),
    reliability_absent_count: toNullableNumber(row.reliability_absent_count),
    reliability_worker_cancellation_count: toNullableNumber(
      row.reliability_worker_cancellation_count,
    ),
    reliability_completed_event_count: toNullableNumber(
      row.reliability_completed_event_count,
    ),
    reliability_performance_event_count: toNullableNumber(
      row.reliability_performance_event_count,
    ),
    reliability_performance_average: toNullableNumber(
      row.reliability_performance_average,
    ),
    experience_level: row.experience_level,
    education_status: row.education_status,
    has_previous_experience: row.has_previous_experience,
    experience_details: row.experience_details,
  };
}

/**
 * Maps raw worker history row to a sanitized DTO.
 * Redacts phone numbers if present in phone-change history.
 */
export function mapWorkerHistoryRowToDto(
  row: WorkerHistoryRow,
): WorkerHistoryEntryDto {
  const isPhoneHistory = row.history_type.toLowerCase() === "phone";

  return {
    history_type: row.history_type,
    action: row.action,
    old_value: isPhoneHistory ? "[REDACTED_PHONE]" : row.old_value,
    new_value: isPhoneHistory ? "[REDACTED_PHONE]" : row.new_value,
    actor_id: row.actor_id,
    actor_role: row.actor_role,
    reason: row.reason,
    created_at: row.created_at,
  };
}
