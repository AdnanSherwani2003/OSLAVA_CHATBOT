import { Pool, PoolConfig, QueryResult, QueryResultRow } from "pg";
import { getConfig } from "../config/env.js";
import { logger } from "../observability/logger.js";

let pool: Pool | null = null;

export function getPool(): Pool | null {
  if (pool) {
    return pool;
  }

  try {
    const config = getConfig();
    if (config?.CHAT_PERSISTENCE_MODE === "memory" || !config?.DATABASE_URL) {
      return null;
    }

    const poolConfig: PoolConfig = {
      connectionString: config.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    pool = new Pool(poolConfig);

    pool.on("error", (err) => {
      logger.error({ err }, "[Database] Unexpected idle client error");
    });

    return pool;
  } catch {
    return null;
  }
}

export function setPool(customPool: Pool | null): void {
  pool = customPool;
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[],
): Promise<QueryResult<T>> {
  const currentPool = getPool();
  if (!currentPool) {
    throw new Error("[Database] No active database pool or DATABASE_URL configured.");
  }
  return currentPool.query<T>(text, params);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info("[Database] Connection pool closed");
  }
}

export async function isDatabaseConnected(): Promise<boolean> {
  try {
    const currentPool = getPool();
    if (!currentPool) return false;
    await currentPool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
