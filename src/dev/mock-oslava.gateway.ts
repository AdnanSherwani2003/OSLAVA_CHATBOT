import { OslavaGateway } from "../integrations/supabase/oslava.gateway.js";
import type { AppRole, UserProfileRecord, WorkerCategory } from "../domain/auth.types.js";
import type {
  AdminDashboardDto,
  EventDetailDto,
  EventSummaryDto,
} from "../domain/event.types.js";
import type {
  SearchWorkersParams,
  WorkerDetailDto,
  WorkerHistoryEntryDto,
  WorkerSearchResultDto,
} from "../domain/worker.types.js";
import type {
  AuditHistoryItemDto,
  EventReportSummaryDto,
  StaffingReportItemDto,
} from "../domain/report.types.js";
import { DomainRejectedError, EntityNotFoundError } from "../domain/errors.js";
import {
  MOCK_ADMIN_PROFILE,
  MOCK_DASHBOARD,
  MOCK_EVENTS,
  MOCK_EVENT_DETAILS,
  MOCK_EVENT_REPORTS,
  MOCK_WORKERS,
  MOCK_WORKER_DETAILS,
  MOCK_WORKER_HISTORY,
} from "./mock-data.js";

const CATEGORY_RANKS: Record<WorkerCategory, number> = {
  A: 1,
  B: 2,
  C: 3,
  F: 4,
};

export class MockOslavaGateway extends OslavaGateway {
  // Stateful in-memory stores
  public workers: WorkerSearchResultDto[];
  public workerDetails: Record<string, WorkerDetailDto>;
  public workerHistory: Record<string, WorkerHistoryEntryDto[]>;
  public events: EventSummaryDto[];
  public eventDetails: Record<string, EventDetailDto>;
  public eventReports: Record<
    string,
    {
      summary: EventReportSummaryDto;
      staffing: StaffingReportItemDto[];
      audit: AuditHistoryItemDto[];
    }
  >;

  constructor() {
    // Pass dummy SupabaseClient instance to satisfy super constructor
    super({} as any);
    this.workers = JSON.parse(JSON.stringify(MOCK_WORKERS));
    this.workerDetails = JSON.parse(JSON.stringify(MOCK_WORKER_DETAILS));
    this.workerHistory = JSON.parse(JSON.stringify(MOCK_WORKER_HISTORY));
    this.events = JSON.parse(JSON.stringify(MOCK_EVENTS));
    this.eventDetails = JSON.parse(JSON.stringify(MOCK_EVENT_DETAILS));
    this.eventReports = JSON.parse(JSON.stringify(MOCK_EVENT_REPORTS));
  }

  public resetMockData(): void {
    this.workers = JSON.parse(JSON.stringify(MOCK_WORKERS));
    this.workerDetails = JSON.parse(JSON.stringify(MOCK_WORKER_DETAILS));
    this.workerHistory = JSON.parse(JSON.stringify(MOCK_WORKER_HISTORY));
    this.events = JSON.parse(JSON.stringify(MOCK_EVENTS));
    this.eventDetails = JSON.parse(JSON.stringify(MOCK_EVENT_DETAILS));
    this.eventReports = JSON.parse(JSON.stringify(MOCK_EVENT_REPORTS));
  }

  public override async getMyProfile(): Promise<UserProfileRecord> {
    return MOCK_ADMIN_PROFILE;
  }

  public override async getAdminDashboard(): Promise<AdminDashboardDto> {
    return MOCK_DASHBOARD;
  }

  public override async getAdminEvents(): Promise<EventSummaryDto[]> {
    return this.events;
  }

  public override async getAdminEventDetail(
    eventId: string,
  ): Promise<EventDetailDto> {
    const detail = this.eventDetails[eventId];
    if (!detail) {
      throw new EntityNotFoundError(`Event with ID '${eventId}' was not found.`);
    }
    return detail;
  }

  public override async searchWorkers(
    params: SearchWorkersParams,
  ): Promise<WorkerSearchResultDto[]> {
    let results = [...this.workers];

    if (params.query) {
      const q = params.query.toLowerCase().trim();
      results = results.filter(
        (w) =>
          w.full_name.toLowerCase().includes(q) ||
          (w.worker_number !== null && String(w.worker_number).includes(q)),
      );
    }

    if (params.category) {
      results = results.filter((w) => w.category === params.category);
    }

    if (params.account_status) {
      results = results.filter((w) => w.account_status === params.account_status);
    }

    const offset = params.offset || 0;
    const limit = params.limit || 10;
    return results.slice(offset, offset + limit);
  }

  public override async getWorkerDetail(
    workerId: string,
  ): Promise<WorkerDetailDto> {
    const detail = this.workerDetails[workerId];
    if (!detail) {
      throw new EntityNotFoundError(`Worker profile with ID '${workerId}' was not found.`);
    }
    return detail;
  }

  public override async getWorkerHistory(
    workerId: string,
  ): Promise<WorkerHistoryEntryDto[]> {
    return this.workerHistory[workerId] || [];
  }

  public override async getEventReportSummary(
    eventId: string,
  ): Promise<EventReportSummaryDto> {
    const report = this.eventReports[eventId];
    if (report?.summary) {
      return report.summary;
    }

    const event = this.eventDetails[eventId];
    if (!event) {
      throw new EntityNotFoundError(`Report summary for event '${eventId}' was not found.`);
    }

    return {
      event_id: event.id,
      title: event.title,
      event_type: event.event_type,
      venue_name: event.venue_name,
      event_date: event.event_date,
      reporting_at: event.reporting_at,
      work_starts_at: event.work_starts_at,
      expected_ends_at: event.expected_ends_at,
      required_worker_count: event.required_worker_count,
      confirmed_worker_count: event.confirmed_count || 0,
      daily_wage: event.daily_wage,
      allowance_total: 0,
      total_worker_pay_display: event.required_worker_count * event.daily_wage,
      currency_code: event.currency_code,
      event_status: event.event_status,
      recruitment_status: event.recruitment_status,
      attendance_total: event.confirmed_count || 0,
      attendance_not_marked: 0,
      attendance_present: event.confirmed_count || 0,
      attendance_late: 0,
      attendance_absent: 0,
    };
  }

  public override async getEventStaffingReport(
    eventId: string,
  ): Promise<StaffingReportItemDto[]> {
    return this.eventReports[eventId]?.staffing || [];
  }

  public override async getEventAuditHistory(params: {
    eventId: string;
    actionFilter?: string;
    roleFilter?: AppRole;
    limit?: number;
    offset?: number;
  }): Promise<AuditHistoryItemDto[]> {
    let auditList = this.eventReports[params.eventId]?.audit || [];
    if (params.actionFilter) {
      const af = params.actionFilter.toLowerCase();
      auditList = auditList.filter((a) => a.action.toLowerCase().includes(af));
    }
    if (params.roleFilter) {
      auditList = auditList.filter((a) => a.actor_role === params.roleFilter);
    }
    return auditList;
  }

  // =========================================================================
  // Phase 4: Stateful Mutations (Executes only when confirmed)
  // =========================================================================

  public override async changeWorkerCategory(params: {
    workerId: string;
    newCategory: WorkerCategory;
    reason: string;
    notes?: string;
  }): Promise<{ worker_id: string; old_category: string; new_category: string }> {
    const detail = this.workerDetails[params.workerId];
    if (!detail) {
      throw new EntityNotFoundError(`Worker profile with ID '${params.workerId}' was not found.`);
    }

    if (detail.account_status !== "ACTIVE") {
      throw new DomainRejectedError("Category changes require an active Worker account.");
    }

    if (!detail.category) {
      throw new DomainRejectedError("Target Worker has no active category.");
    }

    if (detail.category === params.newCategory) {
      throw new DomainRejectedError("New category must differ from current category.");
    }

    const currentRank = CATEGORY_RANKS[detail.category as WorkerCategory];
    const newRank = CATEGORY_RANKS[params.newCategory];
    if (Math.abs(currentRank - newRank) !== 1) {
      throw new DomainRejectedError("Category changes must move exactly one step.");
    }

    const oldCategory = detail.category;
    detail.category = params.newCategory;
    detail.last_worker_category = oldCategory;

    // Update in list
    const workerInList = this.workers.find((w) => w.worker_id === params.workerId);
    if (workerInList) {
      workerInList.category = params.newCategory;
    }

    // Add history entry
    if (!this.workerHistory[params.workerId]) {
      this.workerHistory[params.workerId] = [];
    }
    this.workerHistory[params.workerId].unshift({
      history_type: "TIER_CHANGE",
      action: newRank < currentRank ? "TIER_PROMOTED" : "TIER_DEMOTED",
      old_value: oldCategory,
      new_value: params.newCategory,
      actor_id: MOCK_ADMIN_PROFILE.userId,
      actor_role: "ADMIN",
      reason: params.reason,
      created_at: new Date().toISOString(),
    });

    return {
      worker_id: params.workerId,
      old_category: oldCategory,
      new_category: params.newCategory,
    };
  }

  public override async publishEvent(params: {
    eventId: string;
    reason: string;
  }): Promise<void> {
    const detail = this.eventDetails[params.eventId];
    if (!detail) {
      throw new EntityNotFoundError(`Event with ID '${params.eventId}' was not found.`);
    }

    if (detail.event_status !== "DRAFT") {
      throw new DomainRejectedError("Only draft events can be published.");
    }

    detail.event_status = "PUBLISHED";
    detail.recruitment_status = "OPEN";
    detail.version += 1;

    const eventInList = this.events.find((e) => e.id === params.eventId);
    if (eventInList) {
      eventInList.event_status = "PUBLISHED";
      eventInList.recruitment_status = "OPEN";
      eventInList.version += 1;
    }
  }

  public override async completeEvent(params: {
    eventId: string;
    reason: string;
  }): Promise<void> {
    const detail = this.eventDetails[params.eventId];
    if (!detail) {
      throw new EntityNotFoundError(`Event with ID '${params.eventId}' was not found.`);
    }

    if (detail.event_status !== "IN_PROGRESS") {
      throw new DomainRejectedError("Only in-progress events can be completed.");
    }

    detail.event_status = "COMPLETED";
    detail.recruitment_status = "CLOSED";
    detail.version += 1;

    const eventInList = this.events.find((e) => e.id === params.eventId);
    if (eventInList) {
      eventInList.event_status = "COMPLETED";
      eventInList.recruitment_status = "CLOSED";
      eventInList.version += 1;
    }
  }

  public override async closeEvent(params: {
    eventId: string;
    reason: string;
  }): Promise<void> {
    const detail = this.eventDetails[params.eventId];
    if (!detail) {
      throw new EntityNotFoundError(`Event with ID '${params.eventId}' was not found.`);
    }

    if (detail.event_status !== "COMPLETED") {
      throw new DomainRejectedError("Only completed events can be closed.");
    }

    detail.event_status = "CLOSED";
    detail.recruitment_status = "CLOSED";
    detail.version += 1;

    const eventInList = this.events.find((e) => e.id === params.eventId);
    if (eventInList) {
      eventInList.event_status = "CLOSED";
      eventInList.recruitment_status = "CLOSED";
      eventInList.version += 1;
    }
  }
}
