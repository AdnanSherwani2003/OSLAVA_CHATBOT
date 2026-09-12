export * from "../contracts/repository.interfaces.js";
import { getDefaultPersistence } from "../persistence.factory.js";
import { ISessionRepository } from "../contracts/repository.interfaces.js";

export const sessionRepository: ISessionRepository = {
  createSession: (userId, id) => getDefaultPersistence().sessionRepo.createSession(userId, id),
  getSessionById: (id) => getDefaultPersistence().sessionRepo.getSessionById(id),
  listSessionsByUserId: (userId, limit) => getDefaultPersistence().sessionRepo.listSessionsByUserId(userId, limit),
  touchSession: (id) => getDefaultPersistence().sessionRepo.touchSession(id),
  clear: () => getDefaultPersistence().sessionRepo.clear(),
};
