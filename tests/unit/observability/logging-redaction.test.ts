import { describe, it, expect } from "vitest";
import pino from "pino";

describe("Observability: Production Log Redaction", () => {
  it("redacts sensitive authentication headers, keys, passwords, and worker PII", () => {
    let loggedOutput = "";

    const testLogger = pino(
      {
        level: "info",
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.apikey",
            "headers.authorization",
            "headers.apikey",
            "authorization",
            "accessToken",
            "access_token",
            "token",
            "password",
            "secret",
            "GROQ_API_KEY",
            "groqApiKey",
            "apiKey",
            "api_key",
            "*.accessToken",
            "*.access_token",
            "*.token",
            "*.password",
            "*.secret",
            "*.apiKey",
            "*.api_key",
            "*.GROQ_API_KEY",
            "phone",
            "phoneNumber",
            "phone_number",
            "email",
            "*.phone",
            "*.phoneNumber",
            "*.phone_number",
            "*.email",
          ],
          censor: "[REDACTED]",
        },
      },
      {
        write: (str) => {
          loggedOutput += str;
        },
      },
    );

    const payload = {
      user_id: "usr_123",
      authorization: "Bearer eyJhbGciOi...",
      GROQ_API_KEY: "gsk_supersecretkey",
      password: "SuperSecretPassword123",
      nested: {
        token: "tok_secret_value",
        apiKey: "pk_secret_123",
        phone: "+1234567890",
        email: "worker@example.com",
      },
      safeField: "safe_public_data",
    };

    testLogger.info(payload, "Processing request");

    const parsed = JSON.parse(loggedOutput);
    expect(parsed.user_id).toBe("usr_123");
    expect(parsed.safeField).toBe("safe_public_data");

    // Assert redacted values
    expect(parsed.authorization).toBe("[REDACTED]");
    expect(parsed.GROQ_API_KEY).toBe("[REDACTED]");
    expect(parsed.password).toBe("[REDACTED]");
    expect(parsed.nested.token).toBe("[REDACTED]");
    expect(parsed.nested.apiKey).toBe("[REDACTED]");
    expect(parsed.nested.phone).toBe("[REDACTED]");
    expect(parsed.nested.email).toBe("[REDACTED]");

    // Verify raw secret strings are nowhere in the raw logged string
    expect(loggedOutput).not.toContain("eyJhbGciOi");
    expect(loggedOutput).not.toContain("gsk_supersecretkey");
    expect(loggedOutput).not.toContain("SuperSecretPassword123");
    expect(loggedOutput).not.toContain("tok_secret_value");
    expect(loggedOutput).not.toContain("pk_secret_123");
    expect(loggedOutput).not.toContain("+1234567890");
    expect(loggedOutput).not.toContain("worker@example.com");
  });
});
