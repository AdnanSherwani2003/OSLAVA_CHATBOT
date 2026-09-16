import { SessionState } from "../context/context.types.js";
import {
  V1_READ_TOOLS,
  V1_WRITE_INTENT_TOOLS,
  type V1ReadToolName,
  type V1ToolName,
} from "./v1-manifest.js";

export type CapabilityObjective =
  | "DASHBOARD"
  | "SEARCH_EVENTS"
  | "EVENT_DETAILS"
  | "EVENT_REPORT"
  | "SEARCH_WORKERS"
  | "WORKER_DETAILS"
  | "WORKER_HISTORY"
  | "WRITE_INTENT"
  | "UNSUPPORTED_INTENT"
  | "CONFIRMATION_GUIDANCE"
  | "CONVERSATIONAL";

export interface TurnPlan {
  readonly objectives: CapabilityObjective[];
  readonly requiredReadTools: V1ReadToolName[];
  readonly isUnsupported: boolean;
  readonly isWriteIntent: boolean;
  readonly isConfirmation: boolean;
  readonly isConversational: boolean;
  readonly workerGrounded: boolean;
  readonly eventGrounded: boolean;
  readonly extractedEntityName?: string;
}

export interface CompletenessResult {
  readonly isComplete: boolean;
  readonly missingTool?: V1ReadToolName;
  readonly missingObjective?: CapabilityObjective;
  readonly instruction?: string;
}

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export class TurnPlanner {
  /**
   * Evaluates the user prompt against active session context to produce a structured TurnPlan.
   */
  public planTurn(userPrompt: string, state: SessionState | null): TurnPlan {
    const text = userPrompt.trim().toLowerCase();
    const objectives: CapabilityObjective[] = [];
    const requiredReadTools: V1ReadToolName[] = [];

    // Check UUID presence in prompt
    const hasExplicitUuid = UUID_REGEX.test(userPrompt);

    // 1. Check for Unsupported Operations
    const unsupportedPatterns = [
      /\bassign\s+(worker|leader|staff|someone|people)\b/i,
      /\bassign\b.*\bto\b/i,
      /\bremove\s+(worker|leader|staff)\b/i,
      /\bcreate\s+(new\s+)?event\b/i,
      /\bedit\s+event\b/i,
      /\bcancel\s+event\b/i,
      /\bdelete\b/i,
      /\b(open|close|modify|adjust)\s+recruitment\b/i,
      /\b(register|approve|reject)\s+worker\b/i,
      /\bmodify\s+(staffing|allowance|requirements)\b/i,
    ];

    const isUnsupported = unsupportedPatterns.some((pattern) => pattern.test(userPrompt));
    if (isUnsupported) {
      objectives.push("UNSUPPORTED_INTENT");
      return {
        objectives,
        requiredReadTools: [],
        isUnsupported: true,
        isWriteIntent: false,
        isConfirmation: false,
        isConversational: false,
        workerGrounded: false,
        eventGrounded: false,
      };
    }

    // 2. Check for Natural Language Confirmation attempts
    const confirmationPatterns = [
      /^(yes|confirm|proceed|do it|go ahead|approve|apply)$/i,
      /\b(confirm|proceed with|execute)\s+(the\s+)?action\b/i,
    ];
    const isConfirmation = confirmationPatterns.some((pattern) => pattern.test(text));
    if (isConfirmation) {
      objectives.push("CONFIRMATION_GUIDANCE");
      return {
        objectives,
        requiredReadTools: [],
        isUnsupported: false,
        isWriteIntent: false,
        isConfirmation: true,
        isConversational: false,
        workerGrounded: false,
        eventGrounded: false,
      };
    }

    // 3. Check for Supported Write Intents
    const isWriteIntent =
      /\b(change|upgrade|downgrade|demote|promote)\s+(worker\s+)?(category|tier)\b/i.test(text) ||
      /\bpublish\s+event\b/i.test(text) ||
      /\bcomplete\s+event\b/i.test(text) ||
      /\bclose\s+event\b/i.test(text);

    if (isWriteIntent) {
      objectives.push("WRITE_INTENT");
    }

    // 4. Grounding Check from active state
    // Worker is considered grounded if state has currentWorkerId or prompt contains explicit UUID
    const workerGrounded = Boolean(state?.currentWorkerId || (hasExplicitUuid && text.includes("worker")));
    // Event is considered grounded if state has currentEventId or prompt contains explicit UUID
    const eventGrounded = Boolean(state?.currentEventId || (hasExplicitUuid && (text.includes("event") || text.includes("hall"))));

    // 5. Detect Worker Capabilities
    const workerHistoryRequested =
      /\b(worker\s+)?history\b/i.test(text) ||
      /\b(audit|track record|past assignments)\b/i.test(text);
    const workerDetailsRequested =
      /\b(worker\s+)?(detail|details|profile|reliability|score)\b/i.test(text) ||
      /\bwho is\b/i.test(text);
    const workerSearchRequested =
      /\b(find|search|lookup|look up|get|list|show)\s+(worker|workers)\b/i.test(text) ||
      /\bworker\s+[a-z0-9]+/i.test(text);

    if (workerHistoryRequested) {
      objectives.push("WORKER_HISTORY");
      if (!workerGrounded) {
        requiredReadTools.push("search_workers");
      }
      requiredReadTools.push("get_worker_history");
    }

    if (workerDetailsRequested) {
      objectives.push("WORKER_DETAILS");
      if (!workerGrounded && !requiredReadTools.includes("search_workers")) {
        requiredReadTools.push("search_workers");
      }
      requiredReadTools.push("get_worker_details");
    }

    if (workerSearchRequested && !workerHistoryRequested && !workerDetailsRequested) {
      objectives.push("SEARCH_WORKERS");
      if (!requiredReadTools.includes("search_workers")) {
        requiredReadTools.push("search_workers");
      }
    }

    // 6. Detect Event Capabilities
    const eventReportRequested =
      /\b(event\s+)?report\b/i.test(text) ||
      /\b(summary report|post-event|attendance report)\b/i.test(text);
    const eventDetailsRequested =
      /\b(event\s+)?details\b/i.test(text) ||
      /\btell me about\b/i.test(text) ||
      /\b(shifts|allowance|staffing details)\b/i.test(text);
    const eventSearchRequested =
      /\b(find|search|upcoming|events?)\b/i.test(text) &&
      !text.includes("today") &&
      !eventReportRequested &&
      !eventDetailsRequested;

    if (eventReportRequested) {
      objectives.push("EVENT_REPORT");
      if (!eventGrounded && !requiredReadTools.includes("search_events")) {
        requiredReadTools.push("search_events");
      }
      requiredReadTools.push("get_event_report");
    }

    if (eventDetailsRequested) {
      objectives.push("EVENT_DETAILS");
      if (!eventGrounded && !requiredReadTools.includes("search_events")) {
        requiredReadTools.push("search_events");
      }
      requiredReadTools.push("get_event_details");
    }

    if (eventSearchRequested) {
      objectives.push("SEARCH_EVENTS");
      if (!requiredReadTools.includes("search_events")) {
        requiredReadTools.push("search_events");
      }
    }

    // 7. Detect Dashboard / Today Overview Capabilities
    const dashboardRequested =
      /\b(what'?s\s+happening|happening today|today'?s\s+(overview|status|events|metrics)|how are things|dashboard)\b/i.test(text) ||
      (/\btoday\b/i.test(text) && !workerHistoryRequested && !workerDetailsRequested && !workerSearchRequested && !eventReportRequested && !eventDetailsRequested);

    if (dashboardRequested) {
      objectives.push("DASHBOARD");
      // Dashboard objective can be satisfied by get_dashboard or search_events
      if (!requiredReadTools.includes("get_dashboard") && !requiredReadTools.includes("search_events")) {
        requiredReadTools.push("get_dashboard");
      }
    }

    // 8. Conversational / General Inquiries
    const isConversational =
      objectives.length === 0 ||
      /^(hi|hello|hey|greetings|good morning|good evening|help|what can you do)\b/i.test(text);

    if (isConversational && objectives.length === 0) {
      objectives.push("CONVERSATIONAL");
    }

    return {
      objectives,
      requiredReadTools,
      isUnsupported,
      isWriteIntent,
      isConfirmation,
      isConversational,
      workerGrounded,
      eventGrounded,
    };
  }

  /**
   * Validates whether all required data objectives of the turn were satisfied by executed tools.
   */
  public validateTurnCompleteness(
    plan: TurnPlan,
    executedTools: string[],
    state: SessionState | null,
    modelContent: string,
  ): CompletenessResult {
    // Unsupported refusal, confirmation guidance, or general conversational greeting requires no tool
    if (plan.isUnsupported || plan.isConfirmation || plan.isConversational) {
      return { isComplete: true };
    }

    // If model already provided standard unsupported refusal verbatim, accept it
    if (modelContent.includes("That action isn't available through the chatbot yet")) {
      return { isComplete: true };
    }

    // If model staged a write intent or is asking for the operational reason, it's valid
    if (plan.isWriteIntent) {
      const writeToolRan = executedTools.some((t) => (V1_WRITE_INTENT_TOOLS as readonly string[]).includes(t));
      const askedForReason =
        modelContent.toLowerCase().includes("reason") ||
        modelContent.toLowerCase().includes("why");
      if (writeToolRan || askedForReason) {
        return { isComplete: true };
      }
    }

    // Check each required tool objective
    for (const objective of plan.objectives) {
      switch (objective) {
        case "DASHBOARD": {
          const satisfied =
            executedTools.includes("get_dashboard") ||
            executedTools.includes("search_events");
          if (!satisfied) {
            return {
              isComplete: false,
              missingObjective: "DASHBOARD",
              missingTool: "get_dashboard",
              instruction:
                "[System: The user asked for today's operational data or dashboard overview. You must call 'get_dashboard' or 'search_events' before giving your final answer.]",
            };
          }
          break;
        }

        case "SEARCH_WORKERS": {
          const satisfied =
            executedTools.includes("search_workers") ||
            Boolean(state?.currentWorkerId);
          if (!satisfied) {
            return {
              isComplete: false,
              missingObjective: "SEARCH_WORKERS",
              missingTool: "search_workers",
              instruction:
                "[System: The user requested a worker search. You must call 'search_workers' with the worker's name or query before concluding.]",
            };
          }
          break;
        }

        case "WORKER_DETAILS": {
          const satisfied = executedTools.includes("get_worker_details");
          if (!satisfied) {
            return {
              isComplete: false,
              missingObjective: "WORKER_DETAILS",
              missingTool: "get_worker_details",
              instruction:
                "[System: The user requested details for a worker. If ungrounded, search first; then you must call 'get_worker_details' with the worker's ID.]",
            };
          }
          break;
        }

        case "WORKER_HISTORY": {
          const satisfied = executedTools.includes("get_worker_history");
          if (!satisfied) {
            return {
              isComplete: false,
              missingObjective: "WORKER_HISTORY",
              missingTool: "get_worker_history",
              instruction:
                "[System: The user requested history/track record for a worker. You must call 'get_worker_history' with the worker's ID before providing the final answer.]",
            };
          }
          break;
        }

        case "SEARCH_EVENTS": {
          const satisfied =
            executedTools.includes("search_events") ||
            Boolean(state?.currentEventId);
          if (!satisfied) {
            return {
              isComplete: false,
              missingObjective: "SEARCH_EVENTS",
              missingTool: "search_events",
              instruction:
                "[System: The user requested event search. You must call 'search_events' before providing the final response.]",
            };
          }
          break;
        }

        case "EVENT_DETAILS": {
          const satisfied = executedTools.includes("get_event_details");
          if (!satisfied) {
            return {
              isComplete: false,
              missingObjective: "EVENT_DETAILS",
              missingTool: "get_event_details",
              instruction:
                "[System: The user requested event details. If ungrounded, search first; then call 'get_event_details' with the event's ID.]",
            };
          }
          break;
        }

        case "EVENT_REPORT": {
          const satisfied = executedTools.includes("get_event_report");
          if (!satisfied) {
            return {
              isComplete: false,
              missingObjective: "EVENT_REPORT",
              missingTool: "get_event_report",
              instruction:
                "[System: The user requested an event report. You must call 'get_event_report' with the event's ID before answering.]",
            };
          }
          break;
        }
      }
    }

    return { isComplete: true };
  }
}

export const turnPlanner = new TurnPlanner();
