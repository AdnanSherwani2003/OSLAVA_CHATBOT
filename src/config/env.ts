import { z } from "zod";
import dotenv from "dotenv";

// Load local .env if available
dotenv.config();

export const rawEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z
      .string()
      .default("3000")
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().positive()),
    HOST: z.string().default("0.0.0.0"),
    SUPABASE_URL: z.string().url({ message: "SUPABASE_URL must be a valid URL" }).optional(),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
    SUPABASE_ANON_KEY: z.string().min(1).optional(),
    DEV_CLI_MODE: z.string().optional(),
    LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
      .default("info"),
    CORS_ORIGINS: z.string().default("*"),
    REQUEST_TIMEOUT_MS: z
      .string()
      .default("15000")
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().positive()),

    // Operational Timezone
    APP_TIMEZONE: z.string().default("Asia/Kolkata"),

    // Phase 3 Chatbot Persistence
    CHAT_PERSISTENCE_MODE: z.enum(["memory", "postgres"]).optional(),
    DATABASE_URL: z.string().min(1).optional(),

    // Phase 3 Groq Model Provider
    GROQ_API_KEY: z.string().min(1).optional(),
    GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
    GROQ_REASONING_EFFORT: z.enum(["low", "medium", "high"]).default("medium"),
    GROQ_MAX_OUTPUT_TOKENS: z
      .string()
      .default("2000")
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().positive()),
    GROQ_TIMEOUT_MS: z
      .string()
      .default("30000")
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().positive()),
    CHAT_HISTORY_MESSAGE_LIMIT: z
      .string()
      .default("16")
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().positive()),

    // Phase 4 Confirmation TTL
    ACTION_CONFIRMATION_TTL_SECONDS: z
      .string()
      .default("600")
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().positive()),

    // Phase 5 Rate Limiting & Production Hardening
    ALLOW_EPHEMERAL_PRODUCTION_PERSISTENCE: z.string().optional(),
    CHAT_RATE_LIMIT_REQUESTS: z
      .string()
      .default("20")
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().positive()),
    CHAT_RATE_LIMIT_WINDOW_SECONDS: z
      .string()
      .default("60")
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().positive()),
    ACTION_RATE_LIMIT_REQUESTS: z
      .string()
      .default("10")
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().positive()),
    ACTION_RATE_LIMIT_WINDOW_SECONDS: z
      .string()
      .default("60")
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().positive()),
    SESSION_RATE_LIMIT_REQUESTS: z
      .string()
      .default("10")
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().positive()),
    SESSION_RATE_LIMIT_WINDOW_SECONDS: z
      .string()
      .default("60")
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().positive()),
    GENERAL_RATE_LIMIT_REQUESTS: z
      .string()
      .default("100")
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().positive()),
    GENERAL_RATE_LIMIT_WINDOW_SECONDS: z
      .string()
      .default("60")
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().positive()),
  })
  .refine(
    (data) => {
      if (data.DEV_CLI_MODE === "true") return true;
      return Boolean(data.SUPABASE_URL);
    },
    {
      message: "SUPABASE_URL must be a valid URL",
      path: ["SUPABASE_URL"],
    },
  )
  .refine(
    (data) => {
      if (data.DEV_CLI_MODE === "true") return true;
      return Boolean(data.SUPABASE_PUBLISHABLE_KEY || data.SUPABASE_ANON_KEY);
    },
    {
      message:
        "Either SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY must be provided.",
      path: ["SUPABASE_PUBLISHABLE_KEY"],
    },
  )
  .refine(
    (data) => {
      if (data.DEV_CLI_MODE === "true") return true;
      const mode =
        data.CHAT_PERSISTENCE_MODE ||
        (data.NODE_ENV === "production" ? "postgres" : "memory");
      if (mode === "postgres" && !data.DATABASE_URL) {
        return false;
      }
      return true;
    },
    {
      message:
        "DATABASE_URL is required when CHAT_PERSISTENCE_MODE is 'postgres' (or in production).",
      path: ["DATABASE_URL"],
    },
  )
  .refine(
    (data) => {
      if (data.DEV_CLI_MODE === "true") return true;
      if (
        data.NODE_ENV === "production" &&
        data.CHAT_PERSISTENCE_MODE === "memory" &&
        data.ALLOW_EPHEMERAL_PRODUCTION_PERSISTENCE !== "true"
      ) {
        return false;
      }
      return true;
    },
    {
      message:
        "Production environment requires CHAT_PERSISTENCE_MODE=postgres unless ALLOW_EPHEMERAL_PRODUCTION_PERSISTENCE=true is explicitly set.",
      path: ["CHAT_PERSISTENCE_MODE"],
    },
  )
  .refine(
    (data) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: data.APP_TIMEZONE });
        return true;
      } catch {
        return false;
      }
    },
    {
      message:
        "APP_TIMEZONE must be a valid IANA timezone identifier (e.g., 'Asia/Kolkata').",
      path: ["APP_TIMEZONE"],
    },
  )
  .transform((data) => {
    const isDevCli = data.DEV_CLI_MODE === "true";
    const canonicalKey = (data.SUPABASE_PUBLISHABLE_KEY ||
      data.SUPABASE_ANON_KEY ||
      (isDevCli ? "mock-cli-key" : "")) as string;
    const persistenceMode =
      data.CHAT_PERSISTENCE_MODE ||
      (isDevCli
        ? "memory"
        : data.NODE_ENV === "production"
          ? "postgres"
          : "memory");

    return {
      NODE_ENV: data.NODE_ENV,
      PORT: data.PORT,
      HOST: data.HOST,
      SUPABASE_URL: data.SUPABASE_URL || (isDevCli ? "https://mock.oslava.local" : ""),
      SUPABASE_PUBLISHABLE_KEY: canonicalKey,
      DEV_CLI_MODE: isDevCli,
      LOG_LEVEL: data.LOG_LEVEL,
      CORS_ORIGINS: data.CORS_ORIGINS,
      REQUEST_TIMEOUT_MS: data.REQUEST_TIMEOUT_MS,
      APP_TIMEZONE: data.APP_TIMEZONE,
      CHAT_PERSISTENCE_MODE: persistenceMode as "memory" | "postgres",
      DATABASE_URL: data.DATABASE_URL,
      GROQ_API_KEY: data.GROQ_API_KEY,
      GROQ_MODEL: data.GROQ_MODEL,
      GROQ_REASONING_EFFORT: data.GROQ_REASONING_EFFORT,
      GROQ_MAX_OUTPUT_TOKENS: data.GROQ_MAX_OUTPUT_TOKENS,
      GROQ_TIMEOUT_MS: data.GROQ_TIMEOUT_MS,
      CHAT_HISTORY_MESSAGE_LIMIT: data.CHAT_HISTORY_MESSAGE_LIMIT,
      ACTION_CONFIRMATION_TTL_SECONDS: data.ACTION_CONFIRMATION_TTL_SECONDS,
      ALLOW_EPHEMERAL_PRODUCTION_PERSISTENCE:
        data.ALLOW_EPHEMERAL_PRODUCTION_PERSISTENCE === "true",
      CHAT_RATE_LIMIT_REQUESTS: data.CHAT_RATE_LIMIT_REQUESTS,
      CHAT_RATE_LIMIT_WINDOW_SECONDS: data.CHAT_RATE_LIMIT_WINDOW_SECONDS,
      ACTION_RATE_LIMIT_REQUESTS: data.ACTION_RATE_LIMIT_REQUESTS,
      ACTION_RATE_LIMIT_WINDOW_SECONDS: data.ACTION_RATE_LIMIT_WINDOW_SECONDS,
      SESSION_RATE_LIMIT_REQUESTS: data.SESSION_RATE_LIMIT_REQUESTS,
      SESSION_RATE_LIMIT_WINDOW_SECONDS: data.SESSION_RATE_LIMIT_WINDOW_SECONDS,
      GENERAL_RATE_LIMIT_REQUESTS: data.GENERAL_RATE_LIMIT_REQUESTS,
      GENERAL_RATE_LIMIT_WINDOW_SECONDS: data.GENERAL_RATE_LIMIT_WINDOW_SECONDS,
    };
  });

export type AppConfig = z.infer<typeof rawEnvSchema>;

export function parseConfig(
  source: Record<string, string | undefined> = process.env,
): AppConfig {
  const result = rawEnvSchema.safeParse(source);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(
      `[Config] Invalid environment configuration:\n${errorDetails}`,
    );
  }
  return result.data;
}

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = parseConfig(process.env);
  }
  return cachedConfig;
}

export function setCachedConfig(config: AppConfig | null): void {
  cachedConfig = config;
}
