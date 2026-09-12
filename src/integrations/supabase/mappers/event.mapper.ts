import type {
  AdminDashboardRow,
  AdminEventDetailRow,
  AdminEventListRow,
} from "../contracts.js";
import type {
  AdminDashboardDto,
  EventAllowanceDto,
  EventDetailDto,
  EventLeaderDto,
  EventRequirementDto,
  EventSummaryDto,
} from "../../../domain/event.types.js";

function toNumber(val: number | string | null | undefined, defaultValue = 0): number {
  if (val === null || val === undefined) return defaultValue;
  const num = typeof val === "number" ? val : Number(val);
  return Number.isNaN(num) ? defaultValue : num;
}

export function mapDashboardRowToDto(row: AdminDashboardRow): AdminDashboardDto {
  return {
    today_event_count: toNumber(row.today_event_count),
    draft_count: toNumber(row.draft_count),
    published_count: toNumber(row.published_count),
    upcoming_count: toNumber(row.upcoming_count),
    in_progress_count: toNumber(row.in_progress_count),
    completed_count: toNumber(row.completed_count),
    open_review_flag_count: toNumber(row.open_review_flag_count),
    required_today_count: toNumber(row.required_today_count),
    confirmed_today_count: toNumber(row.confirmed_today_count),
    vacant_today_count: toNumber(row.vacant_today_count),
  };
}

export function mapEventListRowToDto(row: AdminEventListRow): EventSummaryDto {
  return {
    id: row.id,
    title: row.title,
    event_type: row.event_type,
    venue_name: row.venue_name,
    event_date: row.event_date,
    reporting_at: row.reporting_at,
    required_worker_count: toNumber(row.required_worker_count),
    daily_wage: toNumber(row.daily_wage),
    currency_code: row.currency_code,
    event_status: row.event_status,
    recruitment_status: row.recruitment_status,
    tier_strategy: row.tier_strategy,
    version: toNumber(row.version),
  };
}

export function mapEventDetailRowToDto(row: AdminEventDetailRow): EventDetailDto {
  const leaders: EventLeaderDto[] = (row.leaders || []).map((l) => ({
    user_id: l.user_id,
    full_name: l.full_name,
    leader_role: l.leader_role,
  }));

  const requirements: EventRequirementDto[] = (row.requirements || []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    is_mandatory: Boolean(r.is_mandatory),
    acknowledgement_required: Boolean(r.acknowledgement_required),
    extra_allowance_amount: toNumber(r.extra_allowance_amount),
    display_order: toNumber(r.display_order),
  }));

  const allowances: EventAllowanceDto[] = (row.allowances || []).map((a) => ({
    id: a.id,
    label: a.label,
    description: a.description ?? null,
    amount: toNumber(a.amount),
    display_order: toNumber(a.display_order),
  }));

  return {
    id: row.id,
    title: row.title,
    event_type: row.event_type,
    venue_name: row.venue_name,
    maps_url: row.maps_url ?? null,
    event_date: row.event_date,
    reporting_at: row.reporting_at,
    work_starts_at: row.work_starts_at,
    expected_ends_at: row.expected_ends_at,
    required_worker_count: toNumber(row.required_worker_count),
    confirmed_count: toNumber(row.confirmed_count),
    waitlist_count: toNumber(row.waitlist_count),
    daily_wage: toNumber(row.daily_wage),
    currency_code: row.currency_code,
    event_status: row.event_status,
    recruitment_status: row.recruitment_status,
    tier_strategy: row.tier_strategy,
    version: toNumber(row.version),
    instructions: row.instructions ?? null,
    dress_code: row.dress_code ?? null,
    open_review_flags: toNumber(row.open_review_flags),
    leaders,
    requirements,
    allowances,
  };
}
