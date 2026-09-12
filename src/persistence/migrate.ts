import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { getConfig } from "../config/env.js";
import { logger } from "../observability/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  const config = getConfig();

  if (config.CHAT_PERSISTENCE_MODE === "memory") {
    const msg =
      "Chat persistence mode is memory; database migrations are not required.";
    logger.info(`[Migration] ${msg}`);
    console.log(msg);
    return;
  }

  if (!config.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required to run migrations when CHAT_PERSISTENCE_MODE is 'postgres'.",
    );
  }

  const client = new Client({ connectionString: config.DATABASE_URL });
  await client.connect();
  logger.info("[Migration] Connected to PostgreSQL database");

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrationsDir = path.join(__dirname, "migrations");
    if (!fs.existsSync(migrationsDir)) {
      logger.info("[Migration] No migrations directory found");
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows: appliedRows } = await client.query<{ version: string }>(
      "SELECT version FROM schema_migrations",
    );
    const appliedSet = new Set(appliedRows.map((r) => r.version));

    for (const file of files) {
      if (appliedSet.has(file)) {
        logger.info(`[Migration] Already applied: ${file}`);
        continue;
      }

      logger.info(`[Migration] Applying: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [file],
        );
        await client.query("COMMIT");
        logger.info(`[Migration] Successfully applied: ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        logger.error({ err, file }, `[Migration] Failed to apply: ${file}`);
        throw err;
      }
    }

    logger.info("[Migration] All migrations up to date.");
  } finally {
    await client.end();
  }
}

// Allow direct execution: `tsx src/persistence/migrate.ts`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration error:", err);
      process.exit(1);
    });
}
