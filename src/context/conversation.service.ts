import {
  ChatSession,
  ISessionRepository,
  sessionRepository,
} from "../persistence/repositories/session.repository.js";
import {
  ChatMessage,
  ChatRole,
  IMessageRepository,
  messageRepository,
} from "../persistence/repositories/message.repository.js";
import {
  IStateRepository,
  stateRepository,
} from "../persistence/repositories/state.repository.js";
import {
  ITraceRepository,
  traceRepository,
} from "../persistence/repositories/trace.repository.js";
import { SessionState } from "./context.types.js";
import {
  SessionForbiddenError,
  SessionNotFoundError,
} from "../domain/errors.js";

export class ConversationService {
  constructor(
    private readonly sessionRepo: ISessionRepository = sessionRepository,
    private readonly messageRepo: IMessageRepository = messageRepository,
    private readonly stateRepo: IStateRepository = stateRepository,
    private readonly traceRepo: ITraceRepository = traceRepository,
  ) {}

  async createSession(userId: string, id?: string): Promise<ChatSession> {
    return this.sessionRepo.createSession(userId, id);
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    return this.sessionRepo.getSessionById(sessionId);
  }

  async verifySessionAccess(
    sessionId: string,
    userId: string,
  ): Promise<ChatSession> {
    const session = await this.sessionRepo.getSessionById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    if (session.userId !== userId) {
      throw new SessionForbiddenError(sessionId);
    }
    return session;
  }

  async listSessions(userId: string, limit = 50): Promise<ChatSession[]> {
    return this.sessionRepo.listSessionsByUserId(userId, limit);
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.sessionRepo.touchSession(sessionId);
  }

  async appendMessage(
    sessionId: string,
    requestId: string,
    role: ChatRole,
    content: string,
  ): Promise<ChatMessage> {
    const msg = await this.messageRepo.createMessage({
      sessionId,
      requestId,
      role,
      content,
    });
    await this.sessionRepo.touchSession(sessionId);
    return msg;
  }

  async getMessages(
    sessionId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<ChatMessage[]> {
    return this.messageRepo.getMessagesBySessionId(sessionId, options);
  }

  async getRecentHistory(
    sessionId: string,
    limit: number,
  ): Promise<ChatMessage[]> {
    return this.messageRepo.getRecentMessages(sessionId, limit);
  }

  async getState(sessionId: string): Promise<SessionState | null> {
    const s = await this.stateRepo.getStateBySessionId(sessionId);
    if (!s) return null;
    return {
      sessionId: s.sessionId,
      currentEventId: s.currentEventId,
      currentEventLabel: s.currentEventLabel,
      currentWorkerId: s.currentWorkerId,
      currentWorkerLabel: s.currentWorkerLabel,
      recentEventResults: s.recentEventResults || [],
      recentWorkerResults: s.recentWorkerResults || [],
    };
  }

  async saveState(state: SessionState): Promise<SessionState> {
    const saved = await this.stateRepo.upsertState({
      sessionId: state.sessionId,
      currentEventId: state.currentEventId,
      currentEventLabel: state.currentEventLabel,
      currentWorkerId: state.currentWorkerId,
      currentWorkerLabel: state.currentWorkerLabel,
      recentEventResults: state.recentEventResults,
      recentWorkerResults: state.recentWorkerResults,
    });
    return {
      sessionId: saved.sessionId,
      currentEventId: saved.currentEventId,
      currentEventLabel: saved.currentEventLabel,
      currentWorkerId: saved.currentWorkerId,
      currentWorkerLabel: saved.currentWorkerLabel,
      recentEventResults: saved.recentEventResults,
      recentWorkerResults: saved.recentWorkerResults,
    };
  }

  get traceRepository(): ITraceRepository {
    return this.traceRepo;
  }
}

export const conversationService = new ConversationService();
