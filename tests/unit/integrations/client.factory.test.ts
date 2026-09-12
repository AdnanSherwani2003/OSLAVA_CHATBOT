import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createBaseSupabaseClient,
  createUserScopedSupabaseClient,
} from "../../../src/integrations/supabase/client.factory.js";
import { setCachedConfig, parseConfig } from "../../../src/config/env.js";

describe("Supabase Client Factory", () => {
  beforeEach(() => {
    setCachedConfig(
      parseConfig({
        SUPABASE_URL: "https://mock.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "mock-pub-key",
      }),
    );
  });

  afterEach(() => {
    setCachedConfig(null);
  });

  it("creates base Supabase client without Authorization header", () => {
    const client = createBaseSupabaseClient();
    expect(client).toBeDefined();
    // @ts-expect-error accessing private property for verification
    const headers = client.rest?.headers as Headers | undefined;
    expect(headers?.get("Authorization")).toBeNull();
  });

  it("creates user-scoped client propagating the caller JWT", () => {
    const jwt = "caller-secret-jwt";
    const client = createUserScopedSupabaseClient(jwt);
    expect(client).toBeDefined();
    // @ts-expect-error accessing internal headers for verification
    const headers = client.rest?.headers as Headers | undefined;
    expect(headers?.get("Authorization")).toBe(`Bearer ${jwt}`);
  });

  it("instantiates distinct client objects for separate calls", () => {
    const clientA = createUserScopedSupabaseClient("jwt-a");
    const clientB = createUserScopedSupabaseClient("jwt-b");
    expect(clientA).not.toBe(clientB);
  });
});
