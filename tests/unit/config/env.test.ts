import { describe, it, expect } from "vitest";
import { parseConfig } from "../../../src/config/env.js";

describe("Config: parseConfig", () => {
  const validBase = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "test-publishable-key-123",
  };

  it("loads default values when optional vars are omitted", () => {
    const config = parseConfig(validBase);
    expect(config.NODE_ENV).toBe("development");
    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe("0.0.0.0");
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.CORS_ORIGINS).toBe("*");
    expect(config.REQUEST_TIMEOUT_MS).toBe(15000);
    expect(config.SUPABASE_URL).toBe("https://example.supabase.co");
    expect(config.SUPABASE_PUBLISHABLE_KEY).toBe("test-publishable-key-123");
  });

  it("supports SUPABASE_ANON_KEY as fallback for publishable key", () => {
    const config = parseConfig({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "legacy-anon-key-456",
    });
    expect(config.SUPABASE_PUBLISHABLE_KEY).toBe("legacy-anon-key-456");
  });

  it("throws when SUPABASE_URL is missing or invalid", () => {
    expect(() =>
      parseConfig({
        SUPABASE_URL: "not-a-valid-url",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
      }),
    ).toThrowError(/SUPABASE_URL must be a valid URL/);
  });

  it("throws when neither publishable nor anon key is provided", () => {
    expect(() =>
      parseConfig({
        SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toThrowError(/Either SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY/);
  });

  it("coerces string PORT and REQUEST_TIMEOUT_MS to numbers", () => {
    const config = parseConfig({
      ...validBase,
      PORT: "8080",
      REQUEST_TIMEOUT_MS: "30000",
    });
    expect(config.PORT).toBe(8080);
    expect(config.REQUEST_TIMEOUT_MS).toBe(30000);
  });
});
