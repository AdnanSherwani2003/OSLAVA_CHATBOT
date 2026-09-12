export * from "../contracts/repository.interfaces.js";
import { getDefaultPersistence } from "../persistence.factory.js";
import { ITraceRepository } from "../contracts/repository.interfaces.js";

export const traceRepository: ITraceRepository = {
  recordToolExecution: (exec) => getDefaultPersistence().traceRepo.recordToolExecution(exec),
  recordChatTrace: (trace) => getDefaultPersistence().traceRepo.recordChatTrace(trace),
  getToolExecutionsBySession: (sessionId) => getDefaultPersistence().traceRepo.getToolExecutionsBySession(sessionId),
  getChatTracesBySession: (sessionId) => getDefaultPersistence().traceRepo.getChatTracesBySession(sessionId),
  clear: () => getDefaultPersistence().traceRepo.clear(),
};
