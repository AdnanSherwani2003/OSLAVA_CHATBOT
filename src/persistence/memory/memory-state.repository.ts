import {
  ChatSessionState,
  IStateRepository,
} from "../contracts/repository.interfaces.js";
import {
  defaultInMemoryChatStore,
  InMemoryChatStore,
} from "./in-memory-store.js";

export class MemoryStateRepository implements IStateRepository {
  constructor(
    private readonly store: InMemoryChatStore = defaultInMemoryChatStore,
  ) {}

  async getStateBySessionId(
    sessionId: string,
  ): Promise<ChatSessionState | null> {
    return this.store.states.get(sessionId) || null;
  }

  async upsertState(
    state: Omit<ChatSessionState, "updatedAt">,
  ): Promise<ChatSessionState> {
    const fullState: ChatSessionState = {
      ...state,
      recentEventResults: [...(state.recentEventResults || [])],
      recentWorkerResults: [...(state.recentWorkerResults || [])],
      updatedAt: new Date(),
    };

    this.store.states.set(state.sessionId, fullState);
    return fullState;
  }

  async clear(): Promise<void> {
    this.store.states.clear();
  }
}
