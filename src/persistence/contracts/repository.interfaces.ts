export interface ChatSession {
  id: string;
  userId: string;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
}

export interface ISessionRepository {
  createSession(userId: string, id?: string): Promise<ChatSession>;
  getSessionById(id: string): Promise<ChatSession | null>;
  listSessionsByUserId(userId: string, limit?: number): Promise<ChatSession[]>;
  touchSession(id: string): Promise<void>;
  clear(): Promise<void>;
}

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

export interface ChatSessionState {
  sessionId: string;
  currentEventId: string | null;
  currentEventLabel: string | null;
  currentWorkerId: string | null;
  currentWorkerLabel: string | null;
  recentEventResults: any[];
  recentWorkerResults: any[];
  updatedAt: Date;
}

export interface IStateRepository {
  getStateBySessionId(sessionId: string): Promise<ChatSessionState | null>;
  upsertState(
    state: Omit<ChatSessionState, "updatedAt">,
  ): Promise<ChatSessionState>;
  clear(): Promise<void>;
}

export interface ToolExecutionRecord {
  id?: string;
  requestId: string;
  sessionId?: string | null;
  userId: string;
  toolName: string;
  argumentsRedacted: Record<string, unknown>;
  status: "SUCCESS" | "ERROR";
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  errorCode?: string | null;
}

export interface ChatTraceRecord {
  id?: string;
  requestId: string;
  sessionId?: string | null;
  userId: string;
  provider: string;
  model: string;
  reasoningEffort?: string | null;
  toolCallCount: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  durationMs: number;
  outcome: string;
  createdAt?: Date;
}

export interface ITraceRepository {
  recordToolExecution(exec: ToolExecutionRecord): Promise<void>;
  recordChatTrace(trace: ChatTraceRecord): Promise<void>;
  getToolExecutionsBySession(sessionId: string): Promise<ToolExecutionRecord[]>;
  getChatTracesBySession(sessionId: string): Promise<ChatTraceRecord[]>;
  clear(): Promise<void>;
}

export interface IActionRepository {
  createAction(params: import("../../actions/action.types.js").CreateActionParams): Promise<import("../../actions/action.types.js").PendingActionRecord>;
  getActionById(id: string): Promise<import("../../actions/action.types.js").PendingActionRecord | null>;
  getActivePendingActionBySession(sessionId: string): Promise<import("../../actions/action.types.js").PendingActionRecord | null>;
  claimActionForExecution(id: string, executionRequestId: string): Promise<import("../../actions/action.types.js").PendingActionRecord | null>;
  updateActionStatus(id: string, update: import("../../actions/action.types.js").UpdateActionStatusParams): Promise<import("../../actions/action.types.js").PendingActionRecord>;
  cancelAction(id: string): Promise<import("../../actions/action.types.js").PendingActionRecord>;
  clear(): Promise<void>;
}

