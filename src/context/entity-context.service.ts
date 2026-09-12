import { SessionState } from "./context.types.js";

export class EntityContextService {
  /**
   * Validates whether a given UUID entity reference is grounded in the current conversation,
   * recent tool outputs in this turn, or the user's prompt.
   * If an ungrounded UUID is detected, it is flagged as a hallucination.
   */
  validateEntityReference(
    entityId: string,
    entityType: "EVENT" | "WORKER",
    state: SessionState | null,
    userPrompt: string,
    turnToolOutputs: any[] = [],
  ): boolean {
    if (!entityId || typeof entityId !== "string") {
      return false;
    }

    const lowerId = entityId.trim().toLowerCase();

    // 1. Literal presence in user prompt
    if (userPrompt.toLowerCase().includes(lowerId)) {
      return true;
    }

    // 2. Presence in session state
    if (state) {
      if (entityType === "EVENT") {
        if (state.currentEventId?.toLowerCase() === lowerId) {
          return true;
        }
        if (
          state.recentEventResults.some(
            (e) => e.id.toLowerCase() === lowerId,
          )
        ) {
          return true;
        }
      } else if (entityType === "WORKER") {
        if (state.currentWorkerId?.toLowerCase() === lowerId) {
          return true;
        }
        if (
          state.recentWorkerResults.some(
            (w) => w.id.toLowerCase() === lowerId,
          )
        ) {
          return true;
        }
      }
    }

    // 3. Presence in earlier tool outputs of this user turn
    for (const out of turnToolOutputs) {
      if (!out) continue;
      // Search in arrays of results (e.g. { events: [...] } or { workers: [...] })
      const candidates: any[] = [];
      if (Array.isArray(out)) {
        candidates.push(...out);
      } else if (typeof out === "object") {
        if (Array.isArray(out.events)) candidates.push(...out.events);
        if (Array.isArray(out.workers)) candidates.push(...out.workers);
        if (out.id) candidates.push(out);
        if (out.worker?.id) candidates.push(out.worker);
        if (out.event?.id) candidates.push(out.event);
      }

      for (const item of candidates) {
        if (item?.id && String(item.id).toLowerCase() === lowerId) {
          return true;
        }
        if (
          entityType === "WORKER" &&
          item?.worker_id &&
          String(item.worker_id).toLowerCase() === lowerId
        ) {
          return true;
        }
        if (
          entityType === "EVENT" &&
          item?.event_id &&
          String(item.event_id).toLowerCase() === lowerId
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Resolves an ordinal reference ("first", "second", "#1", "last", etc.) against a list of recent items.
   */
  resolveOrdinalReference<T>(reference: string, recentResults: T[]): T | null {
    if (!recentResults || recentResults.length === 0) return null;

    const norm = reference.trim().toLowerCase();

    if (norm === "last" || norm === "the last one") {
      return recentResults[recentResults.length - 1];
    }

    const ordinals: Record<string, number> = {
      first: 0,
      "1st": 0,
      "number 1": 0,
      "#1": 0,
      "option 1": 0,
      second: 1,
      "2nd": 1,
      "number 2": 1,
      "#2": 1,
      "option 2": 1,
      third: 2,
      "3rd": 2,
      "number 3": 2,
      "#3": 2,
      "option 3": 2,
      fourth: 3,
      "4th": 3,
      "number 4": 3,
      "#4": 3,
      "option 4": 3,
      fifth: 4,
      "5th": 4,
      "number 5": 4,
      "#5": 4,
      "option 5": 4,
    };

    for (const [key, idx] of Object.entries(ordinals)) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?:^|\\b|#)${escaped}(?:\\b|$)`, "i");
      if (regex.test(norm) && idx < recentResults.length) {
        return recentResults[idx];
      }
    }

    return null;
  }

  /**
   * Resolves pronouns ("his", "him", "its", "her") to current entities in state.
   */
  resolvePronounReference(
    text: string,
    state: SessionState | null,
  ): { workerId?: string; eventId?: string } | null {
    if (!state) return null;

    const lower = text.toLowerCase();
    const workerPronouns = [
      /\bhe\b/i,
      /\bhim\b/i,
      /\bhis\b/i,
      /\bshe\b/i,
      /\bher\b/i,
      /\bhers\b/i,
      /\bworker\b/i,
    ];
    const eventPronouns = [/\bevent\b/i, /\breport\b/i, /\broster\b/i];

    const matchesWorker = workerPronouns.some((re) => re.test(lower));
    const matchesEvent = eventPronouns.some((re) => re.test(lower));

    if (matchesWorker && state.currentWorkerId) {
      return { workerId: state.currentWorkerId };
    }
    if (matchesEvent && state.currentEventId) {
      return { eventId: state.currentEventId };
    }
    if (/\bits\b/i.test(lower) || /\bit\b/i.test(lower)) {
      if (state.currentEventId) return { eventId: state.currentEventId };
      if (state.currentWorkerId) return { workerId: state.currentWorkerId };
    }

    return null;
  }
}

export const entityContextService = new EntityContextService();
