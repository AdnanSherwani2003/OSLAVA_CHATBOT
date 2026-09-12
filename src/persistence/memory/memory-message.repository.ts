import { randomUUID } from "node:crypto";
import {
  ChatMessage,
  ChatRole,
  IMessageRepository,
} from "../contracts/repository.interfaces.js";
import {
  defaultInMemoryChatStore,
  InMemoryChatStore,
} from "./in-memory-store.js";

export class MemoryMessageRepository implements IMessageRepository {
  constructor(
    private readonly store: InMemoryChatStore = defaultInMemoryChatStore,
  ) {}

  async createMessage(msg: {
    id?: string;
    sessionId: string;
    requestId: string;
    role: ChatRole;
    content: string;
  }): Promise<ChatMessage> {
    const id = msg.id || randomUUID();
    const created: ChatMessage = {
      id,
      sessionId: msg.sessionId,
      requestId: msg.requestId,
      role: msg.role,
      content: msg.content,
      createdAt: new Date(),
    };

    this.store.messages.push(created);
    return created;
  }

  async getMessagesBySessionId(
    sessionId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<ChatMessage[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    return this.store.messages
      .filter((m) => m.sessionId === sessionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(offset, offset + limit);
  }

  async getRecentMessages(
    sessionId: string,
    limit: number,
  ): Promise<ChatMessage[]> {
    const matched = this.store.messages
      .filter((m) => m.sessionId === sessionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return matched.slice(-limit);
  }

  async clear(): Promise<void> {
    this.store.messages.length = 0;
  }
}
