import { describe, it, expect, vi } from "vitest";
import { OslavaGateway } from "../../../src/integrations/supabase/oslava.gateway.js";
import { AuthInvalidError, SupabaseUnavailableError } from "../../../src/domain/errors.js";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("OslavaGateway", () => {
  it("calls my_profile RPC and returns formatted UserProfileRecord", async () => {
    const mockRow = {
      id: "usr-456",
      worker_number: "204",
      role: "ADMIN",
      full_name: "John Admin",
      initials: "JA",
      phone_e164: "+15559876543",
      profile_photo_path: "usr-456/photo.jpg",
      profile_completed_at: "2026-09-01T00:00:00Z",
      account_status: "ACTIVE",
      category: null,
      last_worker_category: null,
    };

    const rpcMock = vi.fn().mockResolvedValue({
      data: [mockRow],
      error: null,
    });

    const mockClient = {
      rpc: rpcMock,
    } as unknown as SupabaseClient;

    const gateway = new OslavaGateway(mockClient);
    const profile = await gateway.getMyProfile();

    expect(rpcMock).toHaveBeenCalledWith("my_profile");
    expect(profile).toEqual({
      userId: "usr-456",
      workerNumber: 204,
      role: "ADMIN",
      fullName: "John Admin",
      initials: "JA",
      phoneE164: "+15559876543",
      accountStatus: "ACTIVE",
      category: null,
    });
  });

  it("throws AuthInvalidError if RPC returns null or empty row", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });

    const mockClient = {
      rpc: rpcMock,
    } as unknown as SupabaseClient;

    const gateway = new OslavaGateway(mockClient);
    await expect(gateway.getMyProfile()).rejects.toThrow(AuthInvalidError);
  });

  it("maps connection failure into SupabaseUnavailableError", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "fetch failed", code: "ECONNREFUSED" },
    });

    const mockClient = {
      rpc: rpcMock,
    } as unknown as SupabaseClient;

    const gateway = new OslavaGateway(mockClient);
    await expect(gateway.getMyProfile()).rejects.toThrow(SupabaseUnavailableError);
  });
});
