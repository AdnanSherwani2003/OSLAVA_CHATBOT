import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    env: {
      NODE_ENV: "test",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-publishable-key-for-unit-tests",
      CHAT_PERSISTENCE_MODE: "memory",
      GROQ_API_KEY: "test-groq-key-for-unit-tests",
      APP_TIMEZONE: "Asia/Kolkata",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
