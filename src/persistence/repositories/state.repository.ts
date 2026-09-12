export * from "../contracts/repository.interfaces.js";
import { getDefaultPersistence } from "../persistence.factory.js";
import { IStateRepository } from "../contracts/repository.interfaces.js";

export const stateRepository: IStateRepository = {
  getStateBySessionId: (sessionId) => getDefaultPersistence().stateRepo.getStateBySessionId(sessionId),
  upsertState: (state) => getDefaultPersistence().stateRepo.upsertState(state),
  clear: () => getDefaultPersistence().stateRepo.clear(),
};
