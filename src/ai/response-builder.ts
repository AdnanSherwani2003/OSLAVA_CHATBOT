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

export type AgentResponse = StandardAgentResponse | EntitySelectionResponse;

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
