import { randomUUID } from "node:crypto";
import {
  ChatTraceRecord,
  ITraceRepository,
  ToolExecutionRecord,
} from "../contracts/repository.interfaces.js";
import {
  defaultInMemoryChatStore,
  InMemoryChatStore,
} from "./in-memory-store.js";

export class MemoryTraceRepository implements ITraceRepository {
  constructor(
    private readonly store: InMemoryChatStore = defaultInMemoryChatStore,
  ) {}

  async recordToolExecution(exec: ToolExecutionRecord): Promise<void> {
    const id = exec.id || randomUUID();
    this.store.toolExecutions.push({ ...exec, id });
  }

  async recordChatTrace(trace: ChatTraceRecord): Promise<void> {
    const id = trace.id || randomUUID();
    const now = trace.createdAt || new Date();
    this.store.traces.push({ ...trace, id, createdAt: now });
  }

  async getToolExecutionsBySession(
    sessionId: string,
  ): Promise<ToolExecutionRecord[]> {
    return this.store.toolExecutions.filter((e) => e.sessionId === sessionId);
  }

  async getChatTracesBySession(sessionId: string): Promise<ChatTraceRecord[]> {
    return this.store.traces.filter((t) => t.sessionId === sessionId);
  }

  async clear(): Promise<void> {
    this.store.toolExecutions.length = 0;
    this.store.traces.length = 0;
  }
}
