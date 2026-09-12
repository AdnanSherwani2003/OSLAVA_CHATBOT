import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL || "info";

export const logger = pino({
  level: logLevel,
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
      "key",
      "secret",
      "*.accessToken",
      "*.access_token",
      "*.token",
      "*.password",
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
