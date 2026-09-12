import {
  ChatMessage,
  ChatSession,
  ChatSessionState,
  ChatTraceRecord,
  ToolExecutionRecord,
} from "../contracts/repository.interfaces.js";

export class InMemoryChatStore {
  public readonly sessions = new Map<string, ChatSession>();
  public readonly messages: ChatMessage[] = [];
  public readonly states = new Map<string, ChatSessionState>();
  public readonly toolExecutions: ToolExecutionRecord[] = [];
  public readonly traces: ChatTraceRecord[] = [];
  public readonly actions = new Map<string, import("../../actions/action.types.js").PendingActionRecord>();

  public clear(): void {
    this.sessions.clear();
    this.messages.length = 0;
    this.states.clear();
    this.toolExecutions.length = 0;
    this.traces.length = 0;
    this.actions.clear();
  }
}

export const defaultInMemoryChatStore = new InMemoryChatStore();
