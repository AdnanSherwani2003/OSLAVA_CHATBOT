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
    expect(config.APP_TIMEZONE).toBe("Asia/Kolkata");
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

  it("parses default rate limits and allows overrides", () => {
    const config = parseConfig(validBase);
    expect(config.CHAT_RATE_LIMIT_REQUESTS).toBe(20);
    expect(config.CHAT_RATE_LIMIT_WINDOW_SECONDS).toBe(60);
    expect(config.ACTION_RATE_LIMIT_REQUESTS).toBe(10);
    expect(config.ACTION_RATE_LIMIT_WINDOW_SECONDS).toBe(60);
    expect(config.SESSION_RATE_LIMIT_REQUESTS).toBe(10);
    expect(config.SESSION_RATE_LIMIT_WINDOW_SECONDS).toBe(60);
    expect(config.GENERAL_RATE_LIMIT_REQUESTS).toBe(100);

    const overridden = parseConfig({
      ...validBase,
      CHAT_RATE_LIMIT_REQUESTS: "50",
      CHAT_RATE_LIMIT_WINDOW_SECONDS: "120",
    });
    expect(overridden.CHAT_RATE_LIMIT_REQUESTS).toBe(50);
    expect(overridden.CHAT_RATE_LIMIT_WINDOW_SECONDS).toBe(120);
  });

  it("enforces postgres persistence in production unless ephemeral override is true", () => {
    // 1. Production with memory mode and no override should fail
    expect(() =>
      parseConfig({
        ...validBase,
        NODE_ENV: "production",
        CHAT_PERSISTENCE_MODE: "memory",
      }),
    ).toThrowError(/Production environment requires CHAT_PERSISTENCE_MODE=postgres/);

    // 2. Production with memory mode and explicit ephemeral override should pass
    const ephemeralAllowed = parseConfig({
      ...validBase,
      NODE_ENV: "production",
      CHAT_PERSISTENCE_MODE: "memory",
      ALLOW_EPHEMERAL_PRODUCTION_PERSISTENCE: "true",
    });
    expect(ephemeralAllowed.CHAT_PERSISTENCE_MODE).toBe("memory");
    expect(ephemeralAllowed.ALLOW_EPHEMERAL_PRODUCTION_PERSISTENCE).toBe(true);

    // 3. Production with postgres and valid DATABASE_URL should pass
    const prodPostgres = parseConfig({
      ...validBase,
      NODE_ENV: "production",
      CHAT_PERSISTENCE_MODE: "postgres",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/oslava",
    });
    expect(prodPostgres.CHAT_PERSISTENCE_MODE).toBe("postgres");
  });

  it("validates APP_TIMEZONE accept valid IANA identifier and rejects invalid strings", () => {
    const validCustom = parseConfig({
      ...validBase,
      APP_TIMEZONE: "America/New_York",
    });
    expect(validCustom.APP_TIMEZONE).toBe("America/New_York");

    expect(() =>
      parseConfig({
        ...validBase,
        APP_TIMEZONE: "Invalid/Not_A_Timezone",
      }),
    ).toThrowError(/APP_TIMEZONE must be a valid IANA timezone identifier/);
  });

  it("defaults DATABASE_POOL_MAX to 3 and parses integer overrides", () => {
    const config = parseConfig(validBase);
    expect(config.DATABASE_POOL_MAX).toBe(3);

    const custom = parseConfig({
      ...validBase,
      DATABASE_POOL_MAX: "5",
    });
    expect(custom.DATABASE_POOL_MAX).toBe(5);
  });
});
