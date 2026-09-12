export * from "../contracts/repository.interfaces.js";
import { getDefaultPersistence } from "../persistence.factory.js";
import { IMessageRepository } from "../contracts/repository.interfaces.js";

export const messageRepository: IMessageRepository = {
  createMessage: (msg) => getDefaultPersistence().messageRepo.createMessage(msg),
  getMessagesBySessionId: (sessionId, options) => getDefaultPersistence().messageRepo.getMessagesBySessionId(sessionId, options),
  getRecentMessages: (sessionId, limit) => getDefaultPersistence().messageRepo.getRecentMessages(sessionId, limit),
  clear: () => getDefaultPersistence().messageRepo.clear(),
};
