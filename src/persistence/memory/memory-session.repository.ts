import { randomUUID } from "node:crypto";
import {
  ChatSession,
  ISessionRepository,
} from "../contracts/repository.interfaces.js";
import {
  defaultInMemoryChatStore,
  InMemoryChatStore,
} from "./in-memory-store.js";

export class MemorySessionRepository implements ISessionRepository {
  constructor(
    private readonly store: InMemoryChatStore = defaultInMemoryChatStore,
  ) {}

  async createSession(userId: string, id?: string): Promise<ChatSession> {
    const sessionId = id || randomUUID();
    const now = new Date();

    const session: ChatSession = {
      id: sessionId,
      userId,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
    };

    this.store.sessions.set(sessionId, session);
    return session;
  }

  async getSessionById(id: string): Promise<ChatSession | null> {
    return this.store.sessions.get(id) || null;
  }

  async listSessionsByUserId(
    userId: string,
    limit = 50,
  ): Promise<ChatSession[]> {
    return Array.from(this.store.sessions.values())
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())
      .slice(0, limit);
  }

  async touchSession(id: string): Promise<void> {
    const session = this.store.sessions.get(id);
    if (session) {
      const now = new Date();
      session.lastActivityAt = now;
      session.updatedAt = now;
    }
  }

  async clear(): Promise<void> {
    this.store.sessions.clear();
  }
}
