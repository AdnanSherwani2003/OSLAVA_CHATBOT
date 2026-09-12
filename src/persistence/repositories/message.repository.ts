import { randomUUID } from "node:crypto";
import { getPool } from "../database.js";

export type ChatRole = "USER" | "ASSISTANT" | "SYSTEM_EVENT";

export interface ChatMessage {
  id: string;
  sessionId: string;
  requestId: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
}

export interface IMessageRepository {
  createMessage(msg: {
    id?: string;
    sessionId: string;
    requestId: string;
    role: ChatRole;
    content: string;
  }): Promise<ChatMessage>;
  getMessagesBySessionId(
    sessionId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<ChatMessage[]>;
  getRecentMessages(sessionId: string, limit: number): Promise<ChatMessage[]>;
  clear(): Promise<void>;
}

export class MessageRepository implements IMessageRepository {
  private inMemoryMessages: ChatMessage[] = [];

  async createMessage(msg: {
    id?: string;
    sessionId: string;
    requestId: string;
    role: ChatRole;
    content: string;
  }): Promise<ChatMessage> {
    const id = msg.id || randomUUID();
    const now = new Date();
    const pool = getPool();

    if (pool) {
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

    const created: ChatMessage = {
      id,
      sessionId: msg.sessionId,
      requestId: msg.requestId,
      role: msg.role,
      content: msg.content,
      createdAt: now,
    };
    this.inMemoryMessages.push(created);
    return created;
  }

  async getMessagesBySessionId(
    sessionId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<ChatMessage[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const pool = getPool();

    if (pool) {
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

    return this.inMemoryMessages
      .filter((m) => m.sessionId === sessionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(offset, offset + limit);
  }

  async getRecentMessages(
    sessionId: string,
    limit: number,
  ): Promise<ChatMessage[]> {
    const pool = getPool();
    if (pool) {
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

    const matched = this.inMemoryMessages
      .filter((m) => m.sessionId === sessionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return matched.slice(-limit);
  }

  async clear(): Promise<void> {
    const pool = getPool();
    if (pool) {
      await pool.query("TRUNCATE TABLE chat_messages CASCADE");
    }
    this.inMemoryMessages = [];
  }
}

export const messageRepository = new MessageRepository();
