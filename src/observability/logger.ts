import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL || "info";

export const logger = pino({
  level: logLevel,
  redact: {
    paths: [
      // Request Headers
      "req.headers.authorization",
      "req.headers.apikey",
      "headers.authorization",
      "headers.apikey",
      "authorization",

      // Credentials & Tokens
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

      // Sensitive PII
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
  transport: !isProduction
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});
