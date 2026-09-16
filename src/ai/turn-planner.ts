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

export type ResponseObjective =
  | "DASHBOARD"
  | "SEARCH_EVENTS"
  | "EVENT_DETAILS"
  | "EVENT_REPORT"
  | "SEARCH_WORKERS"
  | "WORKER_DETAILS"
  | "WORKER_HISTORY";

export interface TurnPlan {
  readonly objectives: CapabilityObjective[];
  readonly requiredReadTools: V1ReadToolName[];
  readonly allowedTools: V1ToolName[];
  readonly requiredResponseObjectives: ResponseObjective[];
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
      /\bedit\s+(the\s+)?event\b/i,
      /\bcancel\s+(the\s+)?event\b/i,
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
        requiredResponseObjectives: [],
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
        requiredResponseObjectives: [],
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

    // 4. Conversational Prefix & Plural Collection Detection (Requirement 1, 2, B)
    const conversationalPrefixRegex =
      /^(?:please\s+)?(?:can\s+you\s+)?(?:tell\s+me\s+about|what\s+about|what\s+can\s+you\s+tell\s+me\s+about|info\s+(?:on|about)|information\s+(?:on|about)|details\s+(?:on|for|about))\s+/i;
    const hasConversationalPrefix = conversationalPrefixRegex.test(text);
    const targetAfterPrefix = hasConversationalPrefix
      ? text.replace(conversationalPrefixRegex, "").trim().replace(/[?.!]+$/, "").trim()
      : "";

    // Plural collection queries (Requirement 1 & 2):
    const isPluralEventCollection =
      (hasConversationalPrefix &&
        /^(?:the\s+)?(?:upcoming\s+)?(?:scheduled\s+)?(?:active\s+)?events$/i.test(targetAfterPrefix)) ||
      /^(?:please\s+)?(?:can\s+you\s+)?(?:list|show(?:\s+me)?|find|search|display|get)\s+(?:the\s+)?(?:upcoming\s+)?(?:scheduled\s+)?(?:active\s+)?events\b/i.test(text) ||
      /\b(?:what|which)\s+(?:upcoming\s+)?events\s+(?:are\s+there|exist|do\s+we\s+have)\b/i.test(text) ||
      /\b(?:all|upcoming|scheduled)\s+events\b/i.test(text);

    const isPluralWorkerCollection =
      (hasConversationalPrefix &&
        /^(?:the\s+)?(?:all\s+)?(?:active\s+)?(?:available\s+)?(?:workers|staff|personnel|crew|employees)$/i.test(targetAfterPrefix)) ||
      /^(?:please\s+)?(?:can\s+you\s+)?(?:list|show(?:\s+me)?|find|search|display|get)\s+(?:the\s+)?(?:all\s+)?(?:active\s+)?(?:available\s+)?(?:workers|staff|personnel|crew|employees)\b/i.test(text) ||
      /\b(?:what|which)\s+(?:workers|staff|personnel|crew|employees)\s+(?:are\s+there|exist|do\s+we\s+have)\b/i.test(text) ||
      /\b(?:all|active|available)\s+(?:workers|staff|personnel|crew|employees)\b/i.test(text);

    // Grounding Check from active state (Requirement 2: Plural collection queries MUST win over active context!)
    const workerGrounded =
      !isPluralWorkerCollection &&
      Boolean(state?.currentWorkerId || (hasExplicitUuid && /\bworker\b/i.test(text)));
    const eventGrounded =
      !isPluralEventCollection &&
      Boolean(
        state?.currentEventId ||
          (hasExplicitUuid && (/\bevent\b/i.test(text) || /\bhall\b/i.test(text))),
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
    const hasExplicitDetailsWord = /\b(details?|profile|reliability|score|allowance)\b/i.test(text);
    const hasSearchVerbs = /\b(find|search|lookup|look up|get|list|show|upcoming)\b/i.test(text);
    const hasOrdinalSelection = /\b(first|second|third|1st|2nd|3rd|select)\b/i.test(text);

    // Check for possessive proper nouns (e.g. "Arif's details" vs "VM Hall's details"):
    const hasPossessiveNoun = /\b([a-z0-9-]+)'s\b/i.test(text);

    // Specific entity target parsing after conversational prefix (Requirement B):
    const eventResidual = hasConversationalPrefix
      ? targetAfterPrefix.replace(/\b(the|a|an|all|upcoming|scheduled|active|events?|functions?|halls?)\b/gi, "").trim()
      : "";
    const workerResidual = hasConversationalPrefix
      ? targetAfterPrefix.replace(/\b(the|a|an|all|active|available|workers?|staff|employees?|personnel|crew)\b/gi, "").trim()
      : "";

    const hasSpecificEventTarget =
      !isPluralEventCollection &&
      (hasExplicitDetailsWord ||
        (hasConversationalPrefix &&
          (hasNeuterPronoun ||
            /\b(?:hall|function|wedding|ceremony|banquet|convention|reception|gathering|shifts?)\b/i.test(targetAfterPrefix) ||
            Boolean(state?.currentEventLabel && text.includes(state.currentEventLabel.toLowerCase())) ||
            (hasExplicitEventAnchor && eventResidual.length > 0))));

    const hasSpecificWorkerTarget =
      !isPluralWorkerCollection &&
      (hasExplicitDetailsWord ||
        (hasConversationalPrefix &&
          (hasPersonPronoun ||
            /\bworker\s+(?:number\s+|#\s*)?[a-z0-9-]+\b/i.test(text) ||
            hasPossessiveNoun ||
            Boolean(state?.currentWorkerLabel && text.includes(state.currentWorkerLabel.toLowerCase())) ||
            (hasExplicitWorkerAnchor && workerResidual.length > 0))));

    const hasDetailsAction =
      hasExplicitDetailsWord ||
      (hasConversationalPrefix && (hasSpecificEventTarget || hasSpecificWorkerTarget));

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
            requiredResponseObjectives: [],
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

    // In multi-domain queries (both event and worker domains present), resolve actions per domain
    // to prevent cross-domain contamination (e.g. event details contaminating worker with details).
    let eventHasDetails = hasDetailsAction;
    let eventHasReport = hasReportAction;
    let workerHasDetails = hasDetailsAction;
    let workerHasHistory = hasHistoryAction;

    if (hasEventDomain && hasWorkerDomain) {
      const clauses = text
        .split(/\b(?:and|also|plus|with|\&)\b|[,;]/i)
        .map((c) => c.trim())
        .filter(Boolean);

      let specificEventDetails = false;
      let specificEventReport = false;
      let specificWorkerDetails = false;
      let specificWorkerHistory = false;
      let hasDomainSpecificClause = false;

      const eventAnchorRegex =
        /\b(event|events|hall(\s+function)?|functions?|wedding|ceremony|banquet|convention|reception|gathering|shifts?)\b/i;
      const workerAnchorRegex =
        /\b(workers?|staff|staffing|employees?|crew|contractors?|personnel|[a-z0-9-]+'s)\b/i;

      for (const clause of clauses) {
        const cHasEvent =
          eventAnchorRegex.test(clause) ||
          Boolean(
            state?.currentEventLabel &&
              clause.includes(state.currentEventLabel.toLowerCase()),
          );
        const cHasWorker =
          workerAnchorRegex.test(clause) ||
          Boolean(
            state?.currentWorkerLabel &&
              clause.includes(state.currentWorkerLabel.toLowerCase()),
          );

        const cDetails =
          /\b(details?|profile|reliability|score|allowance)\b/i.test(clause);
        const cReport =
          /\b(report|summary\s+report|post-event|attendance\s+report)\b/i.test(
            clause,
          );
        const cHistory =
          /\b(history|track\s+record|past\s+assignments|audit)\b/i.test(clause);

        if (cHasEvent && !cHasWorker) {
          hasDomainSpecificClause = true;
          if (cDetails) specificEventDetails = true;
          if (cReport) specificEventReport = true;
        } else if (cHasWorker && !cHasEvent) {
          hasDomainSpecificClause = true;
          if (cDetails) specificWorkerDetails = true;
          if (cHistory) specificWorkerHistory = true;
        }
      }

      if (hasDomainSpecificClause) {
        eventHasDetails = specificEventDetails;
        eventHasReport = specificEventReport;
        workerHasDetails = specificWorkerDetails;
        workerHasHistory = specificWorkerHistory;
      }
    }

    // 7. Assign Event Capabilities (if hasEventDomain)
    if (hasEventDomain) {
      const isEventOrdinal = hasOrdinalSelection && Boolean(state?.recentEventResults?.length);
      if (eventHasDetails || isEventOrdinal) {
        objectives.push("EVENT_DETAILS");
        if (!eventGrounded && !isEventOrdinal) {
          if (!objectives.includes("SEARCH_EVENTS")) {
            objectives.unshift("SEARCH_EVENTS");
          }
          if (!requiredReadTools.includes("search_events")) {
            requiredReadTools.push("search_events");
          }
        }
        requiredReadTools.push("get_event_details");
      }

      if (eventHasReport) {
        objectives.push("EVENT_REPORT");
        if (!eventGrounded) {
          if (!objectives.includes("SEARCH_EVENTS")) {
            objectives.unshift("SEARCH_EVENTS");
          }
          if (!requiredReadTools.includes("search_events")) {
            requiredReadTools.push("search_events");
          }
        }
        requiredReadTools.push("get_event_report");
      }

      // If search explicitly requested or ungrounded event query without details/report
      const explicitSearch = /\b(find|search|lookup|look up|list|upcoming)\b/i.test(text);
      if (
        (explicitSearch || (!eventHasReport && !eventHasDetails && !isWriteIntent)) &&
        !eventGrounded &&
        !isEventOrdinal
      ) {
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
      const isWorkerOrdinal = hasOrdinalSelection && Boolean(state?.recentWorkerResults?.length);
      if (workerHasDetails || isWorkerOrdinal) {
        objectives.push("WORKER_DETAILS");
        if (!workerGrounded && !isWorkerOrdinal) {
          if (!objectives.includes("SEARCH_WORKERS")) {
            objectives.unshift("SEARCH_WORKERS");
          }
          if (!requiredReadTools.includes("search_workers")) {
            requiredReadTools.push("search_workers");
          }
        }
        requiredReadTools.push("get_worker_details");
      }

      if (workerHasHistory) {
        objectives.push("WORKER_HISTORY");
        if (!workerGrounded) {
          if (!objectives.includes("SEARCH_WORKERS")) {
            objectives.unshift("SEARCH_WORKERS");
          }
          if (!requiredReadTools.includes("search_workers")) {
            requiredReadTools.push("search_workers");
          }
        }
        requiredReadTools.push("get_worker_history");
      }

      const explicitSearch = /\b(find|search|lookup|look up|get|list|show)\b/i.test(text);
      if (
        (explicitSearch || (!workerHasHistory && !workerHasDetails && !isWriteIntent)) &&
        !workerGrounded &&
        !isWorkerOrdinal
      ) {
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
        if (isPluralEventCollection) {
          allowedSet.add("search_events");
        } else if (isPluralWorkerCollection) {
          allowedSet.add("search_workers");
        } else if (hasEventDomain && !hasWorkerDomain) {
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

    const conversationalActive = isConversational && !isUnsupported && !isConfirmation;
    const requiredResponseObjectives = deriveResponseObjectives(
      objectives,
      isWriteIntent,
      isUnsupported,
      isConfirmation,
      conversationalActive,
    );

    return {
      objectives,
      requiredReadTools,
      allowedTools,
      requiredResponseObjectives,
      isUnsupported,
      isWriteIntent,
      isConfirmation,
      isConversational: conversationalActive,
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

export const OBJECTIVE_DISPLAY_NAMES: Record<
  ResponseObjective,
  { title: string; heading: string }
> = {
  WORKER_DETAILS: {
    title: "Worker Details",
    heading: "### Worker Details",
  },
  WORKER_HISTORY: {
    title: "Worker History",
    heading: "### Worker History",
  },
  EVENT_DETAILS: {
    title: "Event Details",
    heading: "### Event Details",
  },
  EVENT_REPORT: {
    title: "Event Report",
    heading: "### Event Report",
  },
  DASHBOARD: {
    title: "Operational Overview",
    heading: "### Operational Overview",
  },
  SEARCH_WORKERS: {
    title: "Worker Search Results",
    heading: "### Worker Search Results",
  },
  SEARCH_EVENTS: {
    title: "Event Search Results",
    heading: "### Event Search Results",
  },
};

/**
 * Derives deterministic user-facing response requirements from TurnPlan objectives.
 * Search objectives are treated as prerequisite retrieval steps and omitted from
 * final response requirements when a specific details/history/report objective was targeted.
 */
export function deriveResponseObjectives(
  objectives: CapabilityObjective[],
  isWriteIntent: boolean,
  isUnsupported: boolean,
  isConfirmation: boolean,
  isConversational: boolean,
): ResponseObjective[] {
  if (isWriteIntent || isUnsupported || isConfirmation || isConversational) {
    return [];
  }

  const responseObjs: ResponseObjective[] = [];

  // Dashboard
  if (objectives.includes("DASHBOARD")) {
    responseObjs.push("DASHBOARD");
  }

  // Event Domain
  const hasEventDetails = objectives.includes("EVENT_DETAILS");
  const hasEventReport = objectives.includes("EVENT_REPORT");
  const hasEventSearch = objectives.includes("SEARCH_EVENTS");

  if (hasEventDetails) {
    responseObjs.push("EVENT_DETAILS");
  }
  if (hasEventReport) {
    responseObjs.push("EVENT_REPORT");
  }
  // Search events is terminal only if neither details nor report were requested
  if (hasEventSearch && !hasEventDetails && !hasEventReport) {
    responseObjs.push("SEARCH_EVENTS");
  }

  // Worker Domain
  const hasWorkerDetails = objectives.includes("WORKER_DETAILS");
  const hasWorkerHistory = objectives.includes("WORKER_HISTORY");
  const hasWorkerSearch = objectives.includes("SEARCH_WORKERS");

  if (hasWorkerDetails) {
    responseObjs.push("WORKER_DETAILS");
  }
  if (hasWorkerHistory) {
    responseObjs.push("WORKER_HISTORY");
  }
  // Search workers is terminal only if neither details nor history were requested
  if (hasWorkerSearch && !hasWorkerDetails && !hasWorkerHistory) {
    responseObjs.push("SEARCH_WORKERS");
  }

  return responseObjs;
}

export interface ResponseCoverageResult {
  readonly isCovered: boolean;
  readonly coveredObjectives: ResponseObjective[];
  readonly missingObjectives: ResponseObjective[];
}

/**
 * Validates whether all required user-facing response objectives are covered
 * in the final synthesized prose.
 */
export function validateResponseCoverage(
  requiredObjectives: ResponseObjective[],
  content: string,
): ResponseCoverageResult {
  if (!requiredObjectives || requiredObjectives.length === 0) {
    return {
      isCovered: true,
      coveredObjectives: [],
      missingObjectives: [],
    };
  }

  // 1. Valid refusal detection: If model provided the standardized unsupported refusal verbatim, accept it
  if (content.includes("That action isn't available through the chatbot yet")) {
    return {
      isCovered: true,
      coveredObjectives: [...requiredObjectives],
      missingObjectives: [],
    };
  }

  // 2. Gateway / Tool Error Reporting or Validation: If model is reporting a gateway/retrieval failure or invalid argument
  if (
    /\b(invalid|please specify|unable to|error|failed|issue|temporary issue|could not|service\s+is\s+currently\s+unavailable|try again shortly|connecting to the database)\b/i.test(
      content,
    )
  ) {
    return {
      isCovered: true,
      coveredObjectives: [...requiredObjectives],
      missingObjectives: [],
    };
  }

  const coveredObjectives: ResponseObjective[] = [];
  const missingObjectives: ResponseObjective[] = [];
  const isMulti = requiredObjectives.length > 1;

  for (const obj of requiredObjectives) {
    let covered = false;
    switch (obj) {
      case "WORKER_DETAILS": {
        const headingRegex =
          /(?:^|\n)\s*(?:(?:#+\s*|\*\*\s*)Worker (?:Details|Profile)\b|Worker (?:Details|Profile)\s*[:\-\n—])/i;
        if (headingRegex.test(content)) {
          covered = true;
        } else if (
          !isMulti &&
          /\b(worker|name|category|tier|phone|status|reliability|score|worker\s+details|profile|details|staff|personnel)\b/i.test(
            content,
          )
        ) {
          covered = true;
        }
        break;
      }

      case "WORKER_HISTORY": {
        const headingRegex =
          /(?:^|\n)\s*(?:(?:#+\s*|\*\*\s*)(?:Worker\s+)?History\b|(?:Worker\s+)?History\s*[:\-\n—])/i;
        if (headingRegex.test(content)) {
          covered = true;
        } else if (
          !isMulti &&
          /\b(history|shift|assignment|attended|absent|worked|no\s+.*history|history\s+record|track\s+record|actions?\s+in\s+history|log|records?|promoted|demoted|promotion|demotion|supervisor|category_change)\b/i.test(
            content,
          )
        ) {
          covered = true;
        }
        break;
      }

      case "EVENT_DETAILS": {
        const headingRegex =
          /(?:^|\n)\s*(?:(?:#+\s*|\*\*\s*)Event (?:Details|Information)\b|Event (?:Details|Information)\s*[:\-\n—])/i;
        if (headingRegex.test(content)) {
          covered = true;
        } else if (
          isMulti &&
          /\b(scheduled\s+for|venue:|date:)/i.test(content) &&
          /\b(details?|profile|event)\b/i.test(content)
        ) {
          covered = true;
        } else if (
          !isMulti &&
          /\b(event|event\s+date|venue|status|reporting|scheduled|workers?|requires?|shifts?|details?|conference|hall|function)\b/i.test(
            content,
          )
        ) {
          covered = true;
        }
        break;
      }

      case "EVENT_REPORT": {
        const headingRegex =
          /(?:^|\n)\s*(?:(?:#+\s*|\*\*\s*)Event Report\b|Event Report\s*[:\-\n—])/i;
        if (headingRegex.test(content)) {
          covered = true;
        } else if (isMulti && /\b(report\s+shows|event\s+report|staffing\s+report)\b/i.test(content)) {
          covered = true;
        } else if (
          !isMulti &&
          /\b(total_shifts|allocated|attended|staffing|event\s+report|report|report\s+shows|attended_workers)\b/i.test(
            content,
          )
        ) {
          covered = true;
        }
        break;
      }

      case "DASHBOARD": {
        const headingRegex =
          /(?:^|\n)\s*(?:(?:#+\s*|\*\*\s*)(?:Operational\s+Overview|Dashboard|Today'?s\s+Overview)\b|(?:Operational\s+Overview|Dashboard|Today'?s\s+Overview)\s*[:\-\n—])/i;
        if (headingRegex.test(content)) {
          covered = true;
        } else if (
          !isMulti &&
          /\b(overview|today|dashboard|events?\s+scheduled|metrics|status|happening)\b/i.test(
            content,
          )
        ) {
          covered = true;
        }
        break;
      }

      case "SEARCH_WORKERS": {
        const headingRegex =
          /(?:^|\n)\s*(?:(?:#+\s*|\*\*\s*)(?:Worker\s+Search\s+Results|Workers?\s+Found|Search\s+Results)\b|(?:Worker\s+Search\s+Results|Workers?\s+Found|Search\s+Results)\s*[:\-\n—])/i;
        if (headingRegex.test(content)) {
          covered = true;
        } else if (
          !isMulti &&
          /\b(worker|workers|found|matching|no\s+workers|workers?\s+found|here\s+are\s+the|search\s+results|found\s+two\s+workers|search_workers)\b/i.test(
            content,
          )
        ) {
          covered = true;
        }
        break;
      }

      case "SEARCH_EVENTS": {
        const headingRegex =
          /(?:^|\n)\s*(?:(?:#+\s*|\*\*\s*)(?:Event\s+Search\s+Results|Events?\s+Found|Upcoming\s+Events|Search\s+Results)\b|(?:Event\s+Search\s+Results|Events?\s+Found|Upcoming\s+Events|Search\s+Results)\s*[:\-\n—])/i;
        if (headingRegex.test(content)) {
          covered = true;
        } else if (
          !isMulti &&
          /\b(event|events|found|upcoming|no\s+events|events?\s+found|here\s+are\s+the|search\s+results|search_events)\b/i.test(
            content,
          )
        ) {
          covered = true;
        }
        break;
      }
    }

    if (covered) {
      coveredObjectives.push(obj);
    } else {
      missingObjectives.push(obj);
    }
  }

  return {
    isCovered: missingObjectives.length === 0,
    coveredObjectives,
    missingObjectives,
  };
}

/**
 * Builds the internal system instruction for the dedicated final synthesis phase.
 */
export function buildSynthesisInstruction(
  requiredObjectives: ResponseObjective[],
): string {
  const objectiveList = requiredObjectives
    .map((obj, i) => `${i + 1}. ${OBJECTIVE_DISPLAY_NAMES[obj].title}`)
    .join("\n");

  const canonicalHeadings = requiredObjectives
    .map((obj) => OBJECTIVE_DISPLAY_NAMES[obj].heading)
    .join("\n");

  return (
    `[System: All required data has been retrieved. Provide your final answer now.\n` +
    `Your final response MUST cover ALL of the following:\n${objectiveList}\n\n` +
    `Format each section clearly using the following markdown headings:\n${canonicalHeadings}\n\n` +
    `Use only the successful tool outputs already present in context.\n` +
    `Do not omit any requested section.\n` +
    `If a tool returned empty data (e.g. no history or no records), explicitly state that no records were found under that section.\n` +
    `Do not call more tools.\n` +
    `Do not invent missing data.]`
  );
}

/**
 * Builds the internal retry instruction for bounded resynthesis when response coverage is incomplete.
 */
export function buildResynthesisInstruction(
  requiredObjectives: ResponseObjective[],
  missingObjectives: ResponseObjective[],
): string {
  const missingTitles = missingObjectives
    .map((obj) => OBJECTIVE_DISPLAY_NAMES[obj].title)
    .join(", ");

  const allList = requiredObjectives
    .map((obj) => `- ${OBJECTIVE_DISPLAY_NAMES[obj].title}`)
    .join("\n");

  const canonicalHeadings = requiredObjectives
    .map((obj) => OBJECTIVE_DISPLAY_NAMES[obj].heading)
    .join("\n");

  return (
    `[System: The previous draft omitted ${missingTitles}.\n` +
    `Rewrite the final response and include BOTH/ALL of the following:\n${allList}\n\n` +
    `Format each section clearly using these canonical markdown headings:\n${canonicalHeadings}\n\n` +
    `Use only existing verified tool outputs already present in context.\n` +
    `If a section has no records (e.g. empty history), explicitly state that no records were found under that section.\n` +
    `Do not call tools.\n` +
    `Do not invent missing data.]`
  );
}

export const turnPlanner = new TurnPlanner();
