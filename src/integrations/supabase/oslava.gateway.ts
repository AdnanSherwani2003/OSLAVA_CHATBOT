import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppRole,
  MyProfileRow,
  UserProfileRecord,
} from "../../domain/auth.types.js";
import type {
  AdminDashboardDto,
  EventDetailDto,
  EventSummaryDto,
} from "../../domain/event.types.js";
import type {
  SearchWorkersParams,
  WorkerDetailDto,
  WorkerHistoryEntryDto,
  WorkerSearchResultDto,
} from "../../domain/worker.types.js";
import type {
  AuditHistoryItemDto,
  EventReportSummaryDto,
  StaffingReportItemDto,
} from "../../domain/report.types.js";
import { AuthInvalidError, EntityNotFoundError } from "../../domain/errors.js";
import { mapSupabaseError } from "./supabase.errors.js";
import type {
  AdminDashboardRow,
  AdminEventDetailRow,
  AdminEventListRow,
  EventAuditHistoryRow,
  EventReportSummaryRow,
  EventStaffingReportRow,
  WorkerDirectoryRow,
  WorkerHistoryRow,
  WorkerProfileDetailRow,
} from "./contracts.js";
import {
  mapDashboardRowToDto,
  mapEventDetailRowToDto,
  mapEventListRowToDto,
} from "./mappers/event.mapper.js";
import {
  mapWorkerDirectoryRowToDto,
  mapWorkerHistoryRowToDto,
  mapWorkerProfileDetailRowToDto,
} from "./mappers/worker.mapper.js";
import {
  mapEventAuditHistoryRowToDto,
  mapEventReportSummaryRowToDto,
  mapEventStaffingReportRowToDto,
} from "./mappers/report.mapper.js";

/**
 * Gateway providing domain-specific access to the Oslava Supabase backend.
 * Uses a request-scoped Supabase client initialized with the caller's JWT.
 */
export class OslavaGateway {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Fetches the profile of the currently authenticated caller via the `my_profile` RPC.
   * Supabase executes the function under security definer / auth.uid() using the caller's JWT.
   */
  public async getMyProfile(): Promise<UserProfileRecord> {
    try {
      const { data, error } = await this.client.rpc("my_profile");

      if (error) {
        throw mapSupabaseError(error);
      }

      const row: MyProfileRow | null = Array.isArray(data)
        ? (data[0] as MyProfileRow | undefined) ?? null
        : (data as MyProfileRow | null);

      if (!row || !row.id) {
        throw new AuthInvalidError("Profile not found for authenticated user.");
      }

      return {
        userId: row.id,
        workerNumber:
          row.worker_number != null ? Number(row.worker_number) : null,
        role: row.role,
        fullName: row.full_name,
        initials: row.initials,
        phoneE164: row.phone_e164,
        accountStatus: row.account_status,
        category: row.category,
      };
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Fetches high-level operational KPIs for administrators.
   */
  public async getAdminDashboard(): Promise<AdminDashboardDto> {
    try {
      const { data, error } = await this.client.rpc("admin_event_dashboard");
      if (error) throw mapSupabaseError(error);

      const row: AdminDashboardRow | null = Array.isArray(data)
        ? (data[0] as AdminDashboardRow | undefined) ?? null
        : (data as AdminDashboardRow | null);

      if (!row) {
        throw new EntityNotFoundError("Admin event dashboard not available.");
      }

      return mapDashboardRowToDto(row);
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Fetches raw list of admin events.
   */
  public async getAdminEvents(): Promise<EventSummaryDto[]> {
    try {
      const { data, error } = await this.client.rpc("admin_event_list");
      if (error) throw mapSupabaseError(error);

      const rows = (data as AdminEventListRow[]) || [];
      return rows.map(mapEventListRowToDto);
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Fetches detailed admin event breakdown by UUID.
   */
  public async getAdminEventDetail(eventId: string): Promise<EventDetailDto> {
    try {
      const { data, error } = await this.client.rpc("admin_event_detail", {
        p_event_id: eventId,
      });
      if (error) throw mapSupabaseError(error);

      const row = (Array.isArray(data) ? data[0] : data) as AdminEventDetailRow | null;
      if (!row || !row.id) {
        throw new EntityNotFoundError(`Event with ID '${eventId}' was not found.`);
      }

      return mapEventDetailRowToDto(row);
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Searches the worker directory with optional filters and pagination.
   */
  public async searchWorkers(
    params: SearchWorkersParams,
  ): Promise<WorkerSearchResultDto[]> {
    try {
      const { data, error } = await this.client.rpc("worker_directory", {
        p_search_text: params.query?.trim() || null,
        p_account_filter: params.account_status ?? null,
        p_category_filter: params.category ?? null,
        p_result_limit: params.limit ?? 10,
        p_result_offset: params.offset ?? 0,
      });

      if (error) throw mapSupabaseError(error);

      const rows = (data as WorkerDirectoryRow[]) || [];
      return rows.map(mapWorkerDirectoryRowToDto);
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Fetches sanitized operational details for a specific worker by user ID.
   */
  public async getWorkerDetail(workerId: string): Promise<WorkerDetailDto> {
    try {
      const { data, error } = await this.client.rpc("worker_profile_detail", {
        p_target_user_id: workerId,
      });
      if (error) throw mapSupabaseError(error);

      const row: WorkerProfileDetailRow | null = Array.isArray(data)
        ? (data[0] as WorkerProfileDetailRow | undefined) ?? null
        : (data as WorkerProfileDetailRow | null);

      if (!row || !row.user_id) {
        throw new EntityNotFoundError(
          `Worker profile with ID '${workerId}' was not found.`,
        );
      }

      return mapWorkerProfileDetailRowToDto(row);
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Fetches chronological audit history for a specific worker.
   */
  public async getWorkerHistory(
    workerId: string,
  ): Promise<WorkerHistoryEntryDto[]> {
    try {
      const { data, error } = await this.client.rpc("worker_history", {
        p_target_user_id: workerId,
      });
      if (error) throw mapSupabaseError(error);

      const rows = (data as WorkerHistoryRow[]) || [];
      return rows.map(mapWorkerHistoryRowToDto);
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Fetches event operations report summary.
   */
  public async getEventReportSummary(
    eventId: string,
  ): Promise<EventReportSummaryDto> {
    try {
      const { data, error } = await this.client.rpc("event_report_summary", {
        p_event_id: eventId,
      });
      if (error) throw mapSupabaseError(error);

      const row: EventReportSummaryRow | null = Array.isArray(data)
        ? (data[0] as EventReportSummaryRow | undefined) ?? null
        : (data as EventReportSummaryRow | null);

      if (!row || !row.event_id) {
        throw new EntityNotFoundError(
          `Report summary for event '${eventId}' was not found.`,
        );
      }

      return mapEventReportSummaryRowToDto(row);
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Fetches event staffing report rows (excluding PII).
   */
  public async getEventStaffingReport(
    eventId: string,
  ): Promise<StaffingReportItemDto[]> {
    try {
      const { data, error } = await this.client.rpc("event_staffing_report", {
        p_event_id: eventId,
      });
      if (error) throw mapSupabaseError(error);

      const rows = (data as EventStaffingReportRow[]) || [];
      return rows.map(mapEventStaffingReportRowToDto);
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Fetches filtered audit history entries for an event.
   */
  public async getEventAuditHistory(params: {
    eventId: string;
    actionFilter?: string;
    roleFilter?: AppRole;
    limit?: number;
    offset?: number;
  }): Promise<AuditHistoryItemDto[]> {
    try {
      const { data, error } = await this.client.rpc(
        "event_audit_history_filtered",
        {
          p_event_id: params.eventId,
          p_action_filter: params.actionFilter?.trim() || null,
          p_actor_role_filter: params.roleFilter ?? null,
          p_limit: params.limit ?? 50,
          p_offset: params.offset ?? 0,
        },
      );
      if (error) throw mapSupabaseError(error);

      const rows = (data as EventAuditHistoryRow[]) || [];
      return rows.map(mapEventAuditHistoryRowToDto);
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Phase 4: Promotes or demotes a worker by exactly one category step.
   * Requires confirming admin authorization and mandatory operational reason.
   */
  public async changeWorkerCategory(params: {
    workerId: string;
    newCategory: import("../../domain/auth.types.js").WorkerCategory;
    reason: string;
    notes?: string;
  }): Promise<{ worker_id: string; old_category: string; new_category: string }> {
    try {
      const { data, error } = await this.client.rpc("change_worker_category", {
        p_worker_id: params.workerId,
        p_new_category: params.newCategory,
        p_reason: params.reason,
        p_notes: params.notes || null,
      });
      if (error) throw mapSupabaseError(error);

      const row = Array.isArray(data) ? data[0] : data;
      return {
        worker_id: row?.worker_id || params.workerId,
        old_category: row?.old_category,
        new_category: row?.new_category || params.newCategory,
      };
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Phase 4: Publishes a draft event and initializes tier release schedules.
   */
  public async publishEvent(params: {
    eventId: string;
    reason: string;
  }): Promise<void> {
    try {
      const { error } = await this.client.rpc("publish_event", {
        p_event_id: params.eventId,
        p_reason: params.reason,
      });
      if (error) throw mapSupabaseError(error);
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Phase 4: Marks an in-progress event as completed.
   */
  public async completeEvent(params: {
    eventId: string;
    reason: string;
  }): Promise<void> {
    try {
      const { error } = await this.client.rpc("complete_event", {
        p_event_id: params.eventId,
        p_reason: params.reason,
      });
      if (error) throw mapSupabaseError(error);
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Phase 4: Closes a completed event.
   */
  public async closeEvent(params: {
    eventId: string;
    reason: string;
  }): Promise<void> {
    try {
      const { error } = await this.client.rpc("close_event", {
        p_event_id: params.eventId,
        p_reason: params.reason,
      });
      if (error) throw mapSupabaseError(error);
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }
}

