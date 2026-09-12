import { AppConfig, getConfig } from "../config/env.js";
import {
  IActionRepository,
  IMessageRepository,
  ISessionRepository,
  IStateRepository,
  ITraceRepository,
} from "./contracts/repository.interfaces.js";
import {
  defaultInMemoryChatStore,
  InMemoryChatStore,
} from "./memory/in-memory-store.js";
import { MemoryMessageRepository } from "./memory/memory-message.repository.js";
import { MemorySessionRepository } from "./memory/memory-session.repository.js";
import { MemoryStateRepository } from "./memory/memory-state.repository.js";
import { MemoryTraceRepository } from "./memory/memory-trace.repository.js";
import { MemoryActionRepository } from "./memory/memory-action.repository.js";
import { PostgresMessageRepository } from "./postgres/postgres-message.repository.js";
import { PostgresSessionRepository } from "./postgres/postgres-session.repository.js";
import { PostgresStateRepository } from "./postgres/postgres-state.repository.js";
import { PostgresTraceRepository } from "./postgres/postgres-trace.repository.js";
import { PostgresActionRepository } from "./postgres/postgres-action.repository.js";

export interface PersistenceBundle {
  sessionRepo: ISessionRepository;
  messageRepo: IMessageRepository;
  stateRepo: IStateRepository;
  traceRepo: ITraceRepository;
  actionRepo: IActionRepository;
}

export function createPersistence(
  config?: AppConfig,
  customStore?: InMemoryChatStore,
): PersistenceBundle {
  const currentConfig = config ?? getConfig();

  if (currentConfig.CHAT_PERSISTENCE_MODE === "postgres") {
    if (!currentConfig.DATABASE_URL) {
      throw new Error(
        "[PersistenceFactory] DATABASE_URL is required when CHAT_PERSISTENCE_MODE is 'postgres'.",
      );
    }
    return {
      sessionRepo: new PostgresSessionRepository(),
      messageRepo: new PostgresMessageRepository(),
      stateRepo: new PostgresStateRepository(),
      traceRepo: new PostgresTraceRepository(),
      actionRepo: new PostgresActionRepository(),
    };
  }

  // Memory mode (default for development and test)
  const store = customStore ?? defaultInMemoryChatStore;
  return {
    sessionRepo: new MemorySessionRepository(store),
    messageRepo: new MemoryMessageRepository(store),
    stateRepo: new MemoryStateRepository(store),
    traceRepo: new MemoryTraceRepository(store),
    actionRepo: new MemoryActionRepository(store),
  };
}

let defaultBundle: PersistenceBundle | null = null;

export function getDefaultPersistence(): PersistenceBundle {
  if (!defaultBundle) {
    defaultBundle = createPersistence();
  }
  return defaultBundle;
}

export function resetDefaultPersistence(): void {
  defaultBundle = null;
}
