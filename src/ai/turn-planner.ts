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
  readonly allowedTools: V1ToolName[];
  readonly isUnsupported: boolean;
  readonly isWriteIntent: boolean;
  readonly isConfirmation: boolean;
  readonly isConversational: boolean;
  readonly workerGrounded: boolean;
  readonly eventGrounded: boolean;
  readonly isAmbiguous?: boolean;
  readonly writeIntentTool?: V1ToolName;
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
   * Evaluates the user prompt against active session context to produce a structured, entity-grounded TurnPlan.
   */
  public planTurn(userPrompt: string, state: SessionState | null): TurnPlan {
    const text = userPrompt.trim().toLowerCase();
    const objectives: CapabilityObjective[] = [];
    const requiredReadTools: V1ReadToolName[] = [];

    // Check UUID presence in prompt
    const hasExplicitUuid = UUID_REGEX.test(userPrompt);

    // 1. Check for Unsupported Operations (Strict Boundary)
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
        allowedTools: [],
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
        allowedTools: [],
        isUnsupported: false,
        isWriteIntent: false,
        isConfirmation: true,
        isConversational: false,
        workerGrounded: false,
        eventGrounded: false,
      };
    }

    // 3. Check for Supported Write Intents
    const isWorkerCategoryWrite =
      /\b(change|upgrade|downgrade|demote|promote)\s+(worker\s+)?(category|tier)\b/i.test(text) ||
      /\b(promote|demote|upgrade|downgrade)\b.*\b(to\s+)?(category\s+)?[a-c]\b/i.test(text) ||
      /\bcategory\s+[a-c]\b/i.test(text);
    const isPublishEventWrite = /\bpublish(\s+this)?\s+event\b/i.test(text);
    const isCompleteEventWrite = /\bcomplete(\s+this)?\s+event\b/i.test(text);
    const isCloseEventWrite = /\bclose(\s+this)?\s+event\b/i.test(text);

    const isWriteIntent =
      isWorkerCategoryWrite ||
      isPublishEventWrite ||
      isCompleteEventWrite ||
      isCloseEventWrite;

    let writeIntentTool: V1ToolName | undefined;
    if (isWorkerCategoryWrite) writeIntentTool = "change_worker_category";
    else if (isPublishEventWrite) writeIntentTool = "publish_event";
    else if (isCompleteEventWrite) writeIntentTool = "complete_event";
    else if (isCloseEventWrite) writeIntentTool = "close_event";

    // 4. Grounding Check from active state
    const workerGrounded = Boolean(
      state?.currentWorkerId || (hasExplicitUuid && /\bworker\b/i.test(text)),
    );
    const eventGrounded = Boolean(
      state?.currentEventId || (hasExplicitUuid && (/\bevent\b/i.test(text) || /\bhall\b/i.test(text))),
    );

    // 5. Entity Domain & Anchor Detection (Requirement 1, 2, 3, 4, 10)
    // Explicit Event Anchors in prompt:
    const hasExplicitEventAnchor =
      /\b(event|events|hall(\s+function)?|functions?|wedding|ceremony|banquet|convention|reception|gathering|shifts?|post-event)\b/i.test(text) ||
      isPublishEventWrite ||
      isCompleteEventWrite ||
      isCloseEventWrite ||
      Boolean(state?.currentEventLabel && text.includes(state.currentEventLabel.toLowerCase()));

    // Explicit Worker Anchors in prompt:
    const hasExplicitWorkerAnchor =
      /\b(workers?|staff|staffing|employees?|crew|contractors?|personnel)\b/i.test(text) ||
      /\bworker\s+(?:number\s+|#\s*)?[a-z0-9-]+\b/i.test(text) ||
      /\bwho\s+is\b/i.test(text) ||
      isWorkerCategoryWrite ||
      /\b(audit|track\s+record|past\s+assignments)\b/i.test(text) ||
      Boolean(state?.currentWorkerLabel && text.includes(state.currentWorkerLabel.toLowerCase()));

    // Pronouns:
    const hasPersonPronoun = /\b(he|him|his|she|her)\b/i.test(text);
    const hasNeuterPronoun = /\b(it|its|this|that)\b/i.test(text);

    // Specific Action Indicators:
    const hasReportAction = /\b(report|summary\s+report|post-event|attendance\s+report)\b/i.test(text);
    const hasHistoryAction = /\b(history|track\s+record|past\s+assignments|audit)\b/i.test(text);
    const hasDetailsAction = /\b(details?|profile|reliability|score|allowance|tell me about)\b/i.test(text);
    const hasSearchVerbs = /\b(find|search|lookup|look up|get|list|show|upcoming)\b/i.test(text);
    const hasOrdinalSelection = /\b(first|second|third|1st|2nd|3rd|select)\b/i.test(text);

    // Check for possessive proper nouns (e.g. "Arif's details" vs "VM Hall's details"):
    const hasPossessiveNoun = /\b([a-z0-9-]+)'s\b/i.test(text);

    // Dashboard query detection:
    const isDashboardOnly =
      /\b(what'?s\s+happening|happening\s+today|today'?s\s+(overview|status|events|metrics)|how\s+are\s+things|dashboard)\b/i.test(text) ||
      (/\btoday\b/i.test(text) && !hasExplicitEventAnchor && !hasExplicitWorkerAnchor && !hasPersonPronoun && !hasReportAction && !hasHistoryAction && !hasDetailsAction);

    // Subject/Entity Resolution:
    let hasEventDomain = false;
    let hasWorkerDomain = false;

    if (hasExplicitEventAnchor && !hasExplicitWorkerAnchor) {
      hasEventDomain = true;
    } else if (hasExplicitWorkerAnchor && !hasExplicitEventAnchor) {
      hasWorkerDomain = true;
    } else if (hasExplicitEventAnchor && hasExplicitWorkerAnchor) {
      // Requirement 4: True multi-entity turn
      hasEventDomain = true;
      hasWorkerDomain = true;
    } else {
      // Neither explicit anchor in prompt: resolve via pronouns, ordinals, or session continuity
      if (hasPersonPronoun && (hasHistoryAction || hasDetailsAction || hasSearchVerbs || isWriteIntent)) {
        hasWorkerDomain = true;
      } else if (hasNeuterPronoun && (hasDetailsAction || hasReportAction || isPublishEventWrite || isCompleteEventWrite || isCloseEventWrite)) {
        hasEventDomain = true;
      } else if (hasHistoryAction) {
        hasWorkerDomain = true;
      } else if (hasReportAction) {
        hasEventDomain = true;
      } else if (hasPossessiveNoun && (hasDetailsAction || hasHistoryAction)) {
        hasWorkerDomain = true;
      } else if (hasOrdinalSelection && state?.recentWorkerResults?.length && !state?.recentEventResults?.length) {
        hasWorkerDomain = true;
      } else if (hasOrdinalSelection && state?.recentEventResults?.length && !state?.recentWorkerResults?.length) {
        hasEventDomain = true;
      } else if (hasDetailsAction || hasSearchVerbs) {
        if (state?.currentEventId && !state?.currentWorkerId) {
          hasEventDomain = true;
        } else if (state?.currentWorkerId && !state?.currentEventId) {
          hasWorkerDomain = true;
        } else if (state?.currentEventId && state?.currentWorkerId) {
          // Ambiguous! Both event and worker exist in session state.
          // Requirement 10: DO NOT GUESS!
          objectives.push("CONVERSATIONAL");
          return {
            objectives,
            requiredReadTools: [],
            allowedTools: [],
            isUnsupported: false,
            isWriteIntent: false,
            isConfirmation: false,
            isConversational: true,
            workerGrounded: false,
            eventGrounded: false,
            isAmbiguous: true,
          };
        }
      }
    }

    // 6. Assign Write Intent Objectives
    if (isWriteIntent) {
      objectives.push("WRITE_INTENT");
      if (isWorkerCategoryWrite) {
        hasWorkerDomain = true;
      } else {
        hasEventDomain = true;
      }
    }

    // 7. Assign Event Capabilities (if hasEventDomain)
    if (hasEventDomain) {
      if (hasDetailsAction) {
        objectives.push("EVENT_DETAILS");
        if (!eventGrounded && !requiredReadTools.includes("search_events")) {
          requiredReadTools.push("search_events");
        }
        requiredReadTools.push("get_event_details");
      }

      if (hasReportAction) {
        objectives.push("EVENT_REPORT");
        if (!eventGrounded && !requiredReadTools.includes("search_events")) {
          requiredReadTools.push("search_events");
        }
        requiredReadTools.push("get_event_report");
      }

      // If search explicitly requested or ungrounded event query without details/report
      const explicitSearch = /\b(find|search|lookup|look up|list|upcoming)\b/i.test(text);
      if ((explicitSearch || (!hasReportAction && !hasDetailsAction && !isWriteIntent)) && !eventGrounded) {
        if (!objectives.includes("SEARCH_EVENTS")) {
          objectives.unshift("SEARCH_EVENTS");
        }
        if (!requiredReadTools.includes("search_events")) {
          requiredReadTools.unshift("search_events");
        }
      }
    }

    // 8. Assign Worker Capabilities (if hasWorkerDomain)
    if (hasWorkerDomain) {
      if (hasDetailsAction) {
        objectives.push("WORKER_DETAILS");
        if (!workerGrounded && !requiredReadTools.includes("search_workers")) {
          requiredReadTools.push("search_workers");
        }
        requiredReadTools.push("get_worker_details");
      }

      if (hasHistoryAction) {
        objectives.push("WORKER_HISTORY");
        if (!workerGrounded && !requiredReadTools.includes("search_workers")) {
          requiredReadTools.push("search_workers");
        }
        requiredReadTools.push("get_worker_history");
      }

      const explicitSearch = /\b(find|search|lookup|look up|get|list|show)\b/i.test(text);
      if ((explicitSearch || (!hasHistoryAction && !hasDetailsAction && !isWriteIntent)) && !workerGrounded) {
        if (!objectives.includes("SEARCH_WORKERS")) {
          objectives.unshift("SEARCH_WORKERS");
        }
        if (!requiredReadTools.includes("search_workers")) {
          requiredReadTools.unshift("search_workers");
        }
      }
    }

    // 9. Assign Dashboard Capabilities
    if (isDashboardOnly || (/\b(what'?s\s+happening|happening\s+today|dashboard)\b/i.test(text))) {
      objectives.push("DASHBOARD");
      if (!requiredReadTools.includes("get_dashboard") && !requiredReadTools.includes("search_events")) {
        requiredReadTools.unshift("get_dashboard");
      }
    }

    // 10. INVARIANT ENFORCEMENT (Requirement 4)
    // If pure event domain, strictly purge any worker capabilities
    if (hasEventDomain && !hasWorkerDomain) {
      for (let i = objectives.length - 1; i >= 0; i--) {
        if (["SEARCH_WORKERS", "WORKER_DETAILS", "WORKER_HISTORY"].includes(objectives[i])) {
          objectives.splice(i, 1);
        }
      }
      for (let i = requiredReadTools.length - 1; i >= 0; i--) {
        if (["search_workers", "get_worker_details", "get_worker_history"].includes(requiredReadTools[i])) {
          requiredReadTools.splice(i, 1);
        }
      }
    }

    // If pure worker domain, strictly purge any event capabilities
    if (hasWorkerDomain && !hasEventDomain) {
      for (let i = objectives.length - 1; i >= 0; i--) {
        if (["SEARCH_EVENTS", "EVENT_DETAILS", "EVENT_REPORT"].includes(objectives[i])) {
          objectives.splice(i, 1);
        }
      }
      for (let i = requiredReadTools.length - 1; i >= 0; i--) {
        if (["search_events", "get_event_details", "get_event_report"].includes(requiredReadTools[i])) {
          requiredReadTools.splice(i, 1);
        }
      }
    }

    // 11. Conversational Fallback
    const isPureGreeting =
      /^(hi|hello|hey|greetings|good morning|good evening|help|what can you do)\b/i.test(text);

    const isConversational =
      isPureGreeting || (objectives.length === 0 && !hasSearchVerbs);

    if (isConversational && objectives.length === 0) {
      objectives.push("CONVERSATIONAL");
    }

    // 12. Derive Allowed Tools Per Turn (Requirement 8 & 9)
    const allowedTools: V1ToolName[] = [];
    if (!isUnsupported && !isConfirmation) {
      const allowedSet = new Set<V1ToolName>();

      if (isWriteIntent && writeIntentTool) {
        // Supported write-intent turn:
        // Expose ONLY the specific write-intent tool requested + prerequisite read tools needed for grounding/fresh state
        allowedSet.add(writeIntentTool);
        if (writeIntentTool === "change_worker_category") {
          allowedSet.add("search_workers");
          allowedSet.add("get_worker_details");
        } else if (
          writeIntentTool === "publish_event" ||
          writeIntentTool === "complete_event" ||
          writeIntentTool === "close_event"
        ) {
          allowedSet.add("search_events");
          allowedSet.add("get_event_details");
        }
      } else {
        // Read-only turn: strictly NO write tools!
        for (const t of requiredReadTools) {
          allowedSet.add(t);
        }
        if (hasEventDomain && !hasWorkerDomain) {
          allowedSet.add("search_events");
          allowedSet.add("get_event_details");
          allowedSet.add("get_event_report");
        } else if (hasWorkerDomain && !hasEventDomain) {
          allowedSet.add("search_workers");
          allowedSet.add("get_worker_details");
          allowedSet.add("get_worker_history");
        } else if (hasEventDomain && hasWorkerDomain) {
          allowedSet.add("search_events");
          allowedSet.add("get_event_details");
          allowedSet.add("get_event_report");
          allowedSet.add("search_workers");
          allowedSet.add("get_worker_details");
          allowedSet.add("get_worker_history");
        } else if (objectives.includes("DASHBOARD")) {
          allowedSet.add("get_dashboard");
          allowedSet.add("search_events");
        } else if (!isConversational) {
          allowedSet.add("search_events");
          allowedSet.add("search_workers");
          allowedSet.add("get_dashboard");
        }
      }
      allowedTools.push(...Array.from(allowedSet));
    }

    return {
      objectives,
      requiredReadTools,
      allowedTools,
      isUnsupported,
      isWriteIntent,
      isConfirmation,
      isConversational: isConversational && !isUnsupported && !isConfirmation,
      workerGrounded,
      eventGrounded,
      writeIntentTool,
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
