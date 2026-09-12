import { randomUUID } from "node:crypto";
import { getPool } from "../database.js";
import {
  ChatMessage,
  ChatRole,
  IMessageRepository,
} from "../contracts/repository.interfaces.js";

export class PostgresMessageRepository implements IMessageRepository {
  async createMessage(msg: {
    id?: string;
    sessionId: string;
    requestId: string;
    role: ChatRole;
    content: string;
  }): Promise<ChatMessage> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresMessageRepository] Database pool is not initialized.",
      );
    }

    const id = msg.id || randomUUID();
    const now = new Date();

    const res = await pool.query<{
      id: string;
      session_id: string;
      request_id: string;
      role: ChatRole;
      content: string;
      created_at: Date;
    }>(
      `INSERT INTO chat_messages (id, session_id, request_id, role, content, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, session_id, request_id, role, content, created_at`,
      [id, msg.sessionId, msg.requestId, msg.role, msg.content, now],
    );
    const row = res.rows[0];
    return {
      id: row.id,
      sessionId: row.session_id,
      requestId: row.request_id,
      role: row.role,
      content: row.content,
      createdAt: new Date(row.created_at),
    };
  }

  async getMessagesBySessionId(
    sessionId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<ChatMessage[]> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresMessageRepository] Database pool is not initialized.",
      );
    }

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const res = await pool.query<{
      id: string;
      session_id: string;
      request_id: string;
      role: ChatRole;
      content: string;
      created_at: Date;
    }>(
      `SELECT id, session_id, request_id, role, content, created_at
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [sessionId, limit, offset],
    );
    return res.rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      requestId: r.request_id,
      role: r.role,
      content: r.content,
      createdAt: new Date(r.created_at),
    }));
  }

  async getRecentMessages(
    sessionId: string,
    limit: number,
  ): Promise<ChatMessage[]> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresMessageRepository] Database pool is not initialized.",
      );
    }

    const res = await pool.query<{
      id: string;
      session_id: string;
      request_id: string;
      role: ChatRole;
      content: string;
      created_at: Date;
    }>(
      `SELECT id, session_id, request_id, role, content, created_at
       FROM (
         SELECT id, session_id, request_id, role, content, created_at
         FROM chat_messages
         WHERE session_id = $1
         ORDER BY created_at DESC
         LIMIT $2
       ) sub
       ORDER BY created_at ASC`,
      [sessionId, limit],
    );
    return res.rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      requestId: r.request_id,
      role: r.role,
      content: r.content,
      createdAt: new Date(r.created_at),
    }));
  }

  async clear(): Promise<void> {
    const pool = getPool();
    if (pool) {
      await pool.query("TRUNCATE TABLE chat_messages CASCADE");
    }
  }
}
