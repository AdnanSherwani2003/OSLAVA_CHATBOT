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
    SUPABASE_URL: z.string().url({ message: "SUPABASE_URL must be a valid URL" }),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
    SUPABASE_ANON_KEY: z.string().min(1).optional(),
    LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
      .default("info"),
    CORS_ORIGINS: z.string().default("*"),
    REQUEST_TIMEOUT_MS: z
      .string()
      .default("15000")
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().positive()),

    // Phase 3 Chatbot Database
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
  })
  .refine(
    (data) => Boolean(data.SUPABASE_PUBLISHABLE_KEY || data.SUPABASE_ANON_KEY),
    {
      message:
        "Either SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY must be provided.",
      path: ["SUPABASE_PUBLISHABLE_KEY"],
    },
  )
  .transform((data) => {
    const canonicalKey = (data.SUPABASE_PUBLISHABLE_KEY ||
      data.SUPABASE_ANON_KEY) as string;
    return {
      NODE_ENV: data.NODE_ENV,
      PORT: data.PORT,
      HOST: data.HOST,
      SUPABASE_URL: data.SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: canonicalKey,
      LOG_LEVEL: data.LOG_LEVEL,
      CORS_ORIGINS: data.CORS_ORIGINS,
      REQUEST_TIMEOUT_MS: data.REQUEST_TIMEOUT_MS,
      DATABASE_URL: data.DATABASE_URL,
      GROQ_API_KEY: data.GROQ_API_KEY,
      GROQ_MODEL: data.GROQ_MODEL,
      GROQ_REASONING_EFFORT: data.GROQ_REASONING_EFFORT,
      GROQ_MAX_OUTPUT_TOKENS: data.GROQ_MAX_OUTPUT_TOKENS,
      GROQ_TIMEOUT_MS: data.GROQ_TIMEOUT_MS,
      CHAT_HISTORY_MESSAGE_LIMIT: data.CHAT_HISTORY_MESSAGE_LIMIT,
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
