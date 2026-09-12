import { describe, it, expect } from "vitest";
import {
  mapDashboardRowToDto,
  mapEventDetailRowToDto,
  mapEventListRowToDto,
} from "../../../src/integrations/supabase/mappers/event.mapper.js";
import {
  mapWorkerDirectoryRowToDto,
  mapWorkerHistoryRowToDto,
  mapWorkerProfileDetailRowToDto,
} from "../../../src/integrations/supabase/mappers/worker.mapper.js";
import {
  mapEventAuditHistoryRowToDto,
  mapEventReportSummaryRowToDto,
  mapEventStaffingReportRowToDto,
} from "../../../src/integrations/supabase/mappers/report.mapper.js";
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
} from "../../../src/integrations/supabase/contracts.js";

describe("Mappers & PII Sanitization", () => {
  describe("Event Mappers", () => {
    it("maps AdminDashboardRow safely handling nulls and string numbers", () => {
      const raw: AdminDashboardRow = {
        today_event_count: "3",
        draft_count: 1,
        published_count: null,
        upcoming_count: 2,
        in_progress_count: 0,
        completed_count: "5",
        open_review_flag_count: 0,
        required_today_count: "10",
        confirmed_today_count: "8",
        vacant_today_count: 2,
      };

      const dto = mapDashboardRowToDto(raw);
      expect(dto).toEqual({
        today_event_count: 3,
        draft_count: 1,
        published_count: 0,
        upcoming_count: 2,
        in_progress_count: 0,
        completed_count: 5,
        open_review_flag_count: 0,
        required_today_count: 10,
        confirmed_today_count: 8,
        vacant_today_count: 2,
      });
    });

    it("maps AdminEventListRow to EventSummaryDto", () => {
      const raw: AdminEventListRow = {
        id: "evt-123",
        title: "Gala Night",
        event_type: "Catering",
        venue_name: "Grand Ballroom",
        event_date: "2026-10-01",
        reporting_at: "2026-10-01T17:00:00Z",
        required_worker_count: "15",
        daily_wage: "250.00",
        currency_code: "INR",
        event_status: "PUBLISHED",
        recruitment_status: "OPEN",
        tier_strategy: "STANDARD",
        version: "2",
      };

      const dto = mapEventListRowToDto(raw);
      expect(dto).toEqual({
        id: "evt-123",
        title: "Gala Night",
        event_type: "Catering",
        venue_name: "Grand Ballroom",
        event_date: "2026-10-01",
        reporting_at: "2026-10-01T17:00:00Z",
        required_worker_count: 15,
        daily_wage: 250,
        currency_code: "INR",
        event_status: "PUBLISHED",
        recruitment_status: "OPEN",
        tier_strategy: "STANDARD",
        version: 2,
      });
    });

    it("maps AdminEventDetailRow with requirements, allowances, and leaders", () => {
      const raw: AdminEventDetailRow = {
        id: "evt-456",
        title: "Conference Lunch",
        event_type: "Service",
        venue_name: "Convention Center",
        maps_url: "https://maps.google.com/?q=convention",
        event_date: "2026-10-05",
        timezone_name: "Asia/Kolkata",
        reporting_at: "2026-10-05T09:00:00Z",
        work_starts_at: "2026-10-05T10:00:00Z",
        expected_ends_at: "2026-10-05T18:00:00Z",
        required_worker_count: 20,
        daily_wage: 300,
        currency_code: "INR",
        instructions: "Arrive on time",
        dress_code: "Black uniform",
        event_status: "PUBLISHED",
        recruitment_status: "OPEN",
        tier_strategy: "STANDARD",
        version: 1,
        confirmed_count: 12,
        waitlist_count: 3,
        open_review_flags: 0,
        leaders: [
          {
            user_id: "usr-lead-1",
            full_name: "Captain Steve",
            leader_role: "CAPTAIN",
          },
        ],
        requirements: [
          {
            id: "req-1",
            name: "Non-slip shoes",
            description: "Safety footwear",
            is_mandatory: true,
            acknowledgement_required: true,
            extra_allowance_amount: "50",
            display_order: 1,
          },
        ],
        allowances: [
          {
            id: "alw-1",
            label: "Travel Allowance",
            description: null,
            amount: "100",
            display_order: 1,
          },
        ],
      };

      const dto = mapEventDetailRowToDto(raw);
      expect(dto.id).toBe("evt-456");
      expect(dto.leaders).toHaveLength(1);
      expect(dto.leaders[0]?.full_name).toBe("Captain Steve");
      expect(dto.requirements[0]?.extra_allowance_amount).toBe(50);
      expect(dto.allowances[0]?.amount).toBe(100);
    });
  });

  describe("Worker Mappers & PII Sanitization", () => {
    it("mapWorkerDirectoryRowToDto strips phone, DOB, address, and ID card path", () => {
      const raw: WorkerDirectoryRow = {
        user_id: "usr-w-101",
        worker_number: "501",
        full_name: "Alice Johnson",
        initials: "AJ",
        phone_e164: "+15551234567",
        profile_photo_path: "usr-w-101/photo.jpg",
        role: "WORKER",
        account_status: "ACTIVE",
        category: "A",
        last_worker_category: null,
        reliability_score: "94.5",
        reliability_state: "EXCELLENT",
        reliability_sample_count: 10,
        reliability_present_count: 9,
        reliability_late_count: 1,
        reliability_absent_count: 0,
        reliability_worker_cancellation_count: 0,
        reliability_completed_event_count: 10,
        reliability_performance_event_count: 5,
        reliability_performance_average: 4.8,
        reliability_config_version: 1,
        profile_completed_at: "2026-09-01T00:00:00Z",
        date_of_birth: "1995-05-12",
        address: "123 Main St, Springfield",
        native_place: "Capital City",
        height_cm: 175,
        education_status: "Graduate",
        has_previous_experience: true,
        experience_details: "5 years banquet service",
        registration_type: "PHONE",
        requested_category: "A",
        id_card_file_path: "usr-w-101/id_card.pdf",
        experience_level: "EXPERIENCED",
      };

      const dto = mapWorkerDirectoryRowToDto(raw);

      // Verify sanitized properties
      expect(dto).toEqual({
        worker_id: "usr-w-101",
        worker_number: 501,
        full_name: "Alice Johnson",
        category: "A",
        account_status: "ACTIVE",
        reliability_score: 94.5,
      });

      // Verify sensitive PII is completely excluded
      expect((dto as any).phone_e164).toBeUndefined();
      expect((dto as any).date_of_birth).toBeUndefined();
      expect((dto as any).address).toBeUndefined();
      expect((dto as any).native_place).toBeUndefined();
      expect((dto as any).id_card_file_path).toBeUndefined();
      expect((dto as any).profile_photo_path).toBeUndefined();
    });

    it("mapWorkerProfileDetailRowToDto preserves operational fields while stripping PII", () => {
      const raw: WorkerProfileDetailRow = {
        user_id: "usr-w-102",
        worker_number: 502,
        full_name: "Bob Builder",
        initials: "BB",
        phone_e164: "+15559876543",
        profile_photo_path: "usr-w-102/avatar.jpg",
        role: "WORKER",
        account_status: "ACTIVE",
        category: "B",
        last_worker_category: "C",
        date_of_birth: "1998-11-20",
        address: "456 Oak Avenue",
        native_place: "Riverdale",
        height_cm: 180,
        education_status: "Undergraduate",
        has_previous_experience: true,
        experience_details: "2 years event setup",
        reliability_score: "88.0",
        reliability_state: "GOOD",
        reliability_sample_count: 8,
        reliability_present_count: 7,
        reliability_late_count: 1,
        reliability_absent_count: 0,
        reliability_worker_cancellation_count: 0,
        reliability_completed_event_count: 8,
        reliability_performance_event_count: 4,
        reliability_performance_average: "4.2",
        reliability_config_version: 1,
        reliability_computed_at: "2026-09-10T00:00:00Z",
        profile_completed_at: "2026-08-15T00:00:00Z",
        registration_type: "PHONE",
        requested_category: "B",
        id_card_file_path: "usr-w-102/id.jpg",
        experience_level: "INTERMEDIATE",
      };

      const dto = mapWorkerProfileDetailRowToDto(raw);

      // Operational fields must be present
      expect(dto.worker_id).toBe("usr-w-102");
      expect(dto.full_name).toBe("Bob Builder");
      expect(dto.category).toBe("B");
      expect(dto.last_worker_category).toBe("C");
      expect(dto.reliability_score).toBe(88.0);
      expect(dto.reliability_present_count).toBe(7);
      expect(dto.experience_details).toBe("2 years event setup");

      // Sensitive fields must be omitted
      expect((dto as any).phone_e164).toBeUndefined();
      expect((dto as any).date_of_birth).toBeUndefined();
      expect((dto as any).address).toBeUndefined();
      expect((dto as any).native_place).toBeUndefined();
      expect((dto as any).id_card_file_path).toBeUndefined();
      expect((dto as any).profile_photo_path).toBeUndefined();
    });

    it("mapWorkerHistoryRowToDto redacts phone numbers when history_type is phone", () => {
      const rawCategory: WorkerHistoryRow = {
        history_type: "category",
        action: "PROMOTED",
        old_value: "B",
        new_value: "A",
        actor_id: "usr-admin-1",
        actor_role: "ADMIN",
        reason: "Excellent attendance",
        created_at: "2026-09-05T10:00:00Z",
      };

      const rawPhone: WorkerHistoryRow = {
        history_type: "phone",
        action: "PHONE_CHANGED",
        old_value: "+15551112222",
        new_value: "+15553334444",
        actor_id: "usr-admin-1",
        actor_role: "ADMIN",
        reason: "SIM lost",
        created_at: "2026-09-06T10:00:00Z",
      };

      const dtoCategory = mapWorkerHistoryRowToDto(rawCategory);
      expect(dtoCategory.old_value).toBe("B");
      expect(dtoCategory.new_value).toBe("A");

      const dtoPhone = mapWorkerHistoryRowToDto(rawPhone);
      expect(dtoPhone.old_value).toBe("[REDACTED_PHONE]");
      expect(dtoPhone.new_value).toBe("[REDACTED_PHONE]");
    });
  });

  describe("Report Mappers", () => {
    it("mapEventStaffingReportRowToDto strictly excludes phone_e164", () => {
      const raw: EventStaffingReportRow = {
        assignment_id: "asg-1",
        worker_id: "usr-w-201",
        worker_number: 105,
        full_name: "Charlie Worker",
        phone_e164: "+15554445555",
        category_at_confirmation: "A",
        assignment_status: "CONFIRMED",
        confirmed_at: "2026-09-08T12:00:00Z",
        attendance_status: "PRESENT",
        attendance_marked_at: "2026-09-08T17:05:00Z",
        attendance_notes: "Arrived early",
        daily_wage: "300.00",
        allowance_total: "50.00",
        total_pay_display: "350.00",
        currency_code: "INR",
      };

      const dto = mapEventStaffingReportRowToDto(raw);
      expect(dto.assignment_id).toBe("asg-1");
      expect(dto.full_name).toBe("Charlie Worker");
      expect(dto.daily_wage).toBe(300);
      expect(dto.total_pay_display).toBe(350);

      // Verify phone is not present
      expect((dto as any).phone_e164).toBeUndefined();
    });

    it("mapEventAuditHistoryRowToDto excludes before_values and after_values blobs", () => {
      const raw: EventAuditHistoryRow = {
        history_source: "event_history",
        action: "STATUS_CHANGED",
        actor_id: "usr-admin-1",
        actor_role: "ADMIN",
        entity_type: "event",
        entity_id: "evt-123",
        reason: "Published on schedule",
        before_values: { status: "DRAFT", internal_note: "secret" },
        after_values: { status: "PUBLISHED", internal_note: "secret" },
        created_at: "2026-09-09T08:00:00Z",
      };

      const dto = mapEventAuditHistoryRowToDto(raw);
      expect(dto.action).toBe("STATUS_CHANGED");
      expect(dto.reason).toBe("Published on schedule");

      // Verify raw JSON blobs are omitted
      expect((dto as any).before_values).toBeUndefined();
      expect((dto as any).after_values).toBeUndefined();
    });
  });
});
