import { describe, it, expect, vi } from "vitest";
import { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EntityNotFoundError } from "../../../src/domain/errors.js";

describe("OslavaGateway: Read Methods", () => {
  function createMockClient(rpcImplementation: (name: string, params?: any) => Promise<{ data: any; error: any }>) {
    return {
      rpc: vi.fn().mockImplementation(rpcImplementation),
    } as unknown as SupabaseClient;
  }

  it("getAdminDashboard calls admin_event_dashboard RPC", async () => {
    const mockRow = {
      today_event_count: 5,
      draft_count: 1,
      published_count: 2,
      upcoming_count: 2,
      in_progress_count: 0,
      completed_count: 10,
      open_review_flag_count: 0,
      required_today_count: 20,
      confirmed_today_count: 18,
      vacant_today_count: 2,
    };

    const client = createMockClient(async (name) => {
      if (name === "admin_event_dashboard") {
        return { data: [mockRow], error: null };
      }
      return { data: null, error: new Error("RPC not found") };
    });

    const gateway = new OslavaGateway(client);
    const dashboard = await gateway.getAdminDashboard();

    expect(dashboard.today_event_count).toBe(5);
    expect(client.rpc).toHaveBeenCalledWith("admin_event_dashboard");
  });

  it("getAdminEvents calls admin_event_list RPC", async () => {
    const client = createMockClient(async (name) => {
      if (name === "admin_event_list") {
        return {
          data: [
            {
              id: "evt-1",
              title: "Test Event",
              event_type: "Banquet",
              venue_name: "Venue",
              event_date: "2026-10-01",
              reporting_at: "2026-10-01T10:00:00Z",
              required_worker_count: 10,
              daily_wage: 300,
              currency_code: "INR",
              event_status: "PUBLISHED",
              recruitment_status: "OPEN",
              tier_strategy: "STANDARD",
              version: 1,
            },
          ],
          error: null,
        };
      }
      return { data: null, error: new Error("RPC not found") };
    });

    const gateway = new OslavaGateway(client);
    const events = await gateway.getAdminEvents();

    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe("evt-1");
    expect(client.rpc).toHaveBeenCalledWith("admin_event_list");
  });

  it("getAdminEventDetail calls admin_event_detail with p_event_id", async () => {
    const eventId = "123e4567-e89b-12d3-a456-426614174000";
    const client = createMockClient(async (name, params) => {
      if (name === "admin_event_detail" && params.p_event_id === eventId) {
        return {
          data: {
            id: eventId,
            title: "Detailed Event",
            event_type: "Concert",
            venue_name: "Arena",
            maps_url: null,
            event_date: "2026-11-01",
            timezone_name: "Asia/Kolkata",
            reporting_at: "2026-11-01T15:00:00Z",
            work_starts_at: "2026-11-01T16:00:00Z",
            expected_ends_at: "2026-11-01T22:00:00Z",
            required_worker_count: 50,
            daily_wage: 400,
            currency_code: "INR",
            instructions: null,
            dress_code: null,
            event_status: "PUBLISHED",
            recruitment_status: "OPEN",
            tier_strategy: "STANDARD",
            version: 1,
            confirmed_count: 40,
            waitlist_count: 5,
            open_review_flags: 0,
            leaders: [],
            requirements: [],
            allowances: [],
          },
          error: null,
        };
      }
      return { data: null, error: new Error("event not found") };
    });

    const gateway = new OslavaGateway(client);
    const detail = await gateway.getAdminEventDetail(eventId);

    expect(detail.id).toBe(eventId);
    expect(client.rpc).toHaveBeenCalledWith("admin_event_detail", {
      p_event_id: eventId,
    });
  });

  it("getAdminEventDetail throws EntityNotFoundError on missing event", async () => {
    const client = createMockClient(async () => {
      return { data: null, error: { message: "event not found" } };
    });

    const gateway = new OslavaGateway(client);
    await expect(
      gateway.getAdminEventDetail("123e4567-e89b-12d3-a456-426614174000"),
    ).rejects.toThrow(EntityNotFoundError);
  });

  it("searchWorkers calls worker_directory RPC with mapped parameters", async () => {
    const client = createMockClient(async (name, params) => {
      if (name === "worker_directory") {
        expect(params).toEqual({
          p_search_text: "Sam",
          p_account_filter: "ACTIVE",
          p_category_filter: "B",
          p_result_limit: 15,
          p_result_offset: 5,
        });
        return { data: [], error: null };
      }
      return { data: null, error: new Error("RPC not found") };
    });

    const gateway = new OslavaGateway(client);
    await gateway.searchWorkers({
      query: "Sam",
      account_status: "ACTIVE",
      category: "B",
      limit: 15,
      offset: 5,
    });
  });

  it("getWorkerDetail throws EntityNotFoundError when worker does not exist", async () => {
    const client = createMockClient(async (name) => {
      if (name === "worker_profile_detail") {
        return { data: [], error: null };
      }
      return { data: null, error: new Error("RPC not found") };
    });

    const gateway = new OslavaGateway(client);
    await expect(
      gateway.getWorkerDetail("123e4567-e89b-12d3-a456-426614174000"),
    ).rejects.toThrow(EntityNotFoundError);
  });

  it("getEventReportSummary throws EntityNotFoundError when report is not found", async () => {
    const client = createMockClient(async (name) => {
      if (name === "event_report_summary") {
        return { data: [], error: null };
      }
      return { data: null, error: new Error("RPC not found") };
    });

    const gateway = new OslavaGateway(client);
    await expect(
      gateway.getEventReportSummary("123e4567-e89b-12d3-a456-426614174000"),
    ).rejects.toThrow(EntityNotFoundError);
  });
});
