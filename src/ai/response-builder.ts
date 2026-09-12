import type { PendingActionRecord } from "../actions/action.types.js";

export interface EntityOption {
  id: string;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface StandardAgentResponse {
  type: "message";
  content: string;
}

export interface EntitySelectionResponse {
  type: "entity_selection_required";
  entityType: "event" | "worker";
  question: string;
  options: EntityOption[];
}

export interface ConfirmationRequiredResponse {
  type: "confirmation_required";
  actionId: string;
  actionType: string;
  displaySummary: Record<string, unknown>;
  content: string;
  expiresAt: string;
}

export type AgentResponse =
  | StandardAgentResponse
  | EntitySelectionResponse
  | ConfirmationRequiredResponse;

export function buildStandardResponse(content: string): StandardAgentResponse {
  return {
    type: "message",
    content: content.trim(),
  };
}

export function buildDisambiguationResponse(
  entityType: "event" | "worker",
  question: string,
  options: EntityOption[],
): EntitySelectionResponse {
  return {
    type: "entity_selection_required",
    entityType,
    question: question.trim(),
    options,
  };
}

export function buildConfirmationRequiredResponse(
  action: PendingActionRecord,
): ConfirmationRequiredResponse {
  let content = "";
  if (action.actionType === "change_worker_category") {
    content = `I have staged a category change for worker **${action.displaySummary.workerName}** (Worker #${action.displaySummary.workerNumber ?? "N/A"}) from category **${action.displaySummary.currentCategory}** to **${action.displaySummary.newCategory}**.\n\nReason: "${action.displaySummary.reason}"\n\nPlease review and confirm or cancel this action.`;
  } else if (action.actionType === "publish_event") {
    content = `I have staged publishing event **${action.displaySummary.eventTitle}** (current status: ${action.displaySummary.currentStatus} v${action.displaySummary.version}).\n\nReason: "${action.displaySummary.reason}"\n\nPlease review and confirm or cancel this action.`;
  } else if (action.actionType === "complete_event") {
    content = `I have staged marking event **${action.displaySummary.eventTitle}** as COMPLETED (current status: ${action.displaySummary.currentStatus} v${action.displaySummary.version}).\n\nReason: "${action.displaySummary.reason}"\n\nPlease review and confirm or cancel this action.`;
  } else if (action.actionType === "close_event") {
    content = `I have staged closing event **${action.displaySummary.eventTitle}** (current status: ${action.displaySummary.currentStatus} v${action.displaySummary.version}).\n\nReason: "${action.displaySummary.reason}"\n\nPlease review and confirm or cancel this action.`;
  } else {
    content = `Action '${action.actionType}' has been staged and requires your confirmation.\n\nPlease review and confirm or cancel this action.`;
  }

  return {
    type: "confirmation_required",
    actionId: action.id,
    actionType: action.actionType,
    displaySummary: action.displaySummary,
    content,
    expiresAt: new Date(action.expiresAt).toISOString(),
  };
}
