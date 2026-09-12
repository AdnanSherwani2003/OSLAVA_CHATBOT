export * from "../contracts/repository.interfaces.js";
import { getDefaultPersistence } from "../persistence.factory.js";
import { IActionRepository } from "../contracts/repository.interfaces.js";

export const actionRepository: IActionRepository = {
  createAction: (params) =>
    getDefaultPersistence().actionRepo.createAction(params),
  getActionById: (id) => getDefaultPersistence().actionRepo.getActionById(id),
  getActivePendingActionBySession: (sessionId) =>
    getDefaultPersistence().actionRepo.getActivePendingActionBySession(sessionId),
  claimActionForExecution: (id, executionRequestId) =>
    getDefaultPersistence().actionRepo.claimActionForExecution(
      id,
      executionRequestId,
    ),
  updateActionStatus: (id, update) =>
    getDefaultPersistence().actionRepo.updateActionStatus(id, update),
  cancelAction: (id) => getDefaultPersistence().actionRepo.cancelAction(id),
  clear: () => getDefaultPersistence().actionRepo.clear(),
};
