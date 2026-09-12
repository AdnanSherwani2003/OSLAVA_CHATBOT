import { randomUUID } from "node:crypto";
import { getPool } from "../database.js";
import {
  ChatSession,
  ISessionRepository,
} from "../contracts/repository.interfaces.js";

export class PostgresSessionRepository implements ISessionRepository {
  async createSession(userId: string, id?: string): Promise<ChatSession> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresSessionRepository] Database pool is not initialized.",
      );
    }

    const sessionId = id || randomUUID();
    const now = new Date();

    const res = await pool.query<{
      id: string;
      user_id: string;
      status: "ACTIVE" | "ARCHIVED";
      created_at: Date;
      updated_at: Date;
      last_activity_at: Date;
    }>(
      `INSERT INTO chat_sessions (id, user_id, status, created_at, updated_at, last_activity_at)
       VALUES ($1, $2, 'ACTIVE', $3, $3, $3)
       RETURNING id, user_id, status, created_at, updated_at, last_activity_at`,
      [sessionId, userId, now],
    );
    const row = res.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastActivityAt: new Date(row.last_activity_at),
    };
  }

  async getSessionById(id: string): Promise<ChatSession | null> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresSessionRepository] Database pool is not initialized.",
      );
    }

    const res = await pool.query<{
      id: string;
      user_id: string;
      status: "ACTIVE" | "ARCHIVED";
      created_at: Date;
      updated_at: Date;
      last_activity_at: Date;
    }>(
      `SELECT id, user_id, status, created_at, updated_at, last_activity_at
       FROM chat_sessions WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastActivityAt: new Date(row.last_activity_at),
    };
  }

  async listSessionsByUserId(
    userId: string,
    limit = 50,
  ): Promise<ChatSession[]> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresSessionRepository] Database pool is not initialized.",
      );
    }

    const res = await pool.query<{
      id: string;
      user_id: string;
      status: "ACTIVE" | "ARCHIVED";
      created_at: Date;
      updated_at: Date;
      last_activity_at: Date;
    }>(
      `SELECT id, user_id, status, created_at, updated_at, last_activity_at
       FROM chat_sessions WHERE user_id = $1 ORDER BY last_activity_at DESC LIMIT $2`,
      [userId, limit],
    );
    return res.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastActivityAt: new Date(row.last_activity_at),
    }));
  }

  async touchSession(id: string): Promise<void> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresSessionRepository] Database pool is not initialized.",
      );
    }

    const now = new Date();
    await pool.query(
      `UPDATE chat_sessions SET last_activity_at = $1, updated_at = $1 WHERE id = $2`,
      [now, id],
    );
  }

  async clear(): Promise<void> {
    const pool = getPool();
    if (pool) {
      await pool.query("TRUNCATE TABLE chat_sessions CASCADE");
    }
  }
}
