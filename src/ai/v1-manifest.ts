/**
 * V1 Capability Manifest - Oslava Admin AI Chatbot
 *
 * This file serves as the single immutable source of truth for all tools
 * exposed to the LLM agent in V1.
 *
 * Scope Freeze:
 * - Exactly 7 Read tools
 * - Exactly 4 Write Intent tools
 * - ZERO V2 tools (no event creation/editing, no worker assignment, no attendance,
 *   no registration approvals, no generic SQL/RPC).
 */

export const V1_READ_TOOLS = [
  "get_dashboard",
  "search_events",
  "get_event_details",
  "search_workers",
  "get_worker_details",
  "get_worker_history",
  "get_event_report",
] as const;

export const V1_WRITE_INTENT_TOOLS = [
  "change_worker_category",
  "publish_event",
  "complete_event",
  "close_event",
] as const;

export type V1ReadToolName = (typeof V1_READ_TOOLS)[number];
export type V1WriteIntentToolName = (typeof V1_WRITE_INTENT_TOOLS)[number];
export type V1ToolName = V1ReadToolName | V1WriteIntentToolName;

export const V1_ALL_TOOLS: readonly V1ToolName[] = Object.freeze([
  ...V1_READ_TOOLS,
  ...V1_WRITE_INTENT_TOOLS,
]);

export interface V1CapabilityDescriptor {
  readonly name: V1ToolName;
  readonly category: "READ" | "WRITE_INTENT";
  readonly description: string;
  readonly requiredProperties: readonly string[];
}

export const V1_CAPABILITY_REGISTRY: Record<V1ToolName, V1CapabilityDescriptor> =
  Object.freeze({
    get_dashboard: {
      name: "get_dashboard",
      category: "READ",
      description:
        "Fetch real-time executive dashboard KPIs, upcoming event stats, worker metrics, and critical alerts.",
      requiredProperties: [],
    },
    search_events: {
      name: "search_events",
      category: "READ",
      description:
        "Search and filter events by name, date range, status, venue, or location.",
      requiredProperties: [],
    },
    get_event_details: {
      name: "get_event_details",
      category: "READ",
      description:
        "Fetch detailed operational info, assignments, shifts, and leader details for a specific event.",
      requiredProperties: ["event_id"],
    },
    search_workers: {
      name: "search_workers",
      category: "READ",
      description:
        "Search and filter field workers by name, skills, category, or status.",
      requiredProperties: [],
    },
    get_worker_details: {
      name: "get_worker_details",
      category: "READ",
      description:
        "Fetch complete profile, current category, performance metrics, and status for a worker.",
      requiredProperties: ["worker_id"],
    },
    get_worker_history: {
      name: "get_worker_history",
      category: "READ",
      description:
        "Retrieve historical event assignments, attendance logs, and performance track record for a worker.",
      requiredProperties: ["worker_id"],
    },
    get_event_report: {
      name: "get_event_report",
      category: "READ",
      description:
        "Generate post-event operational summary, attendance analysis, leader feedback, and incident report.",
      requiredProperties: ["event_id", "section"],
    },
    change_worker_category: {
      name: "change_worker_category",
      category: "WRITE_INTENT",
      description:
        "PROPOSE changing a worker's performance category (F <-> C <-> B <-> A) by exactly one step. This initiates a pending action that requires explicit confirmation.",
      requiredProperties: ["worker_id", "new_category", "reason"],
    },
    publish_event: {
      name: "publish_event",
      category: "WRITE_INTENT",
      description:
        "PROPOSE publishing a draft event to open it for operational scheduling. This initiates a pending action that requires explicit confirmation.",
      requiredProperties: ["event_id", "reason"],
    },
    complete_event: {
      name: "complete_event",
      category: "WRITE_INTENT",
      description:
        "PROPOSE completing an in-progress event. This initiates a pending action that requires explicit confirmation.",
      requiredProperties: ["event_id", "reason"],
    },
    close_event: {
      name: "close_event",
      category: "WRITE_INTENT",
      description:
        "PROPOSE closing a completed event for final operational archive. This initiates a pending action that requires explicit confirmation.",
      requiredProperties: ["event_id", "reason"],
    },
  });

export function isV1Tool(name: string): name is V1ToolName {
  return (V1_ALL_TOOLS as readonly string[]).includes(name);
}

export function isV1ReadTool(name: string): name is V1ReadToolName {
  return (V1_READ_TOOLS as readonly string[]).includes(name);
}

export function isV1WriteIntentTool(name: string): name is V1WriteIntentToolName {
  return (V1_WRITE_INTENT_TOOLS as readonly string[]).includes(name);
}
