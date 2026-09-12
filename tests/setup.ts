// Global test setup for Vitest
// Ensures unit & integration tests run in a hermetic test environment without requiring a local .env file.

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://test.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || "test-publishable-key-for-unit-tests";
process.env.CHAT_PERSISTENCE_MODE =
  process.env.CHAT_PERSISTENCE_MODE || "memory";
process.env.GROQ_API_KEY =
  process.env.GROQ_API_KEY || "test-groq-key-for-unit-tests";
process.env.APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";
