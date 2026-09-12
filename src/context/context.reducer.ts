import { RecentEventResult, RecentWorkerResult, SessionState } from "./context.types.js";

export function reduceSessionState(
  currentState: SessionState | null,
  sessionId: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  toolResult: any,
): SessionState {
  const state: SessionState = currentState
    ? {
        sessionId: currentState.sessionId,
        currentEventId: currentState.currentEventId,
        currentEventLabel: currentState.currentEventLabel,
        currentWorkerId: currentState.currentWorkerId,
        currentWorkerLabel: currentState.currentWorkerLabel,
        recentEventResults: [...currentState.recentEventResults],
        recentWorkerResults: [...currentState.recentWorkerResults],
      }
    : {
        sessionId,
        currentEventId: null,
        currentEventLabel: null,
        currentWorkerId: null,
        currentWorkerLabel: null,
        recentEventResults: [],
        recentWorkerResults: [],
      };

  const data = toolResult?.data ?? toolResult;
  if (!data) return state;

  switch (toolName) {
    case "search_events": {
      if (Array.isArray(data)) {
        const mapped: RecentEventResult[] = data.slice(0, 10).map((e: any) => ({
          id: e.id,
          title: e.title,
          date: e.event_date || e.date,
          status: e.event_status || e.status,
        }));
        state.recentEventResults = mapped;
        if (mapped.length === 1) {
          state.currentEventId = mapped[0].id;
          state.currentEventLabel = mapped[0].title;
        }
      }
      break;
    }

    case "get_event_details": {
      if (data && typeof data === "object") {
        const id = data.id || toolArgs.event_id;
        const title = data.title;
        if (id) {
          state.currentEventId = String(id);
          if (title) state.currentEventLabel = String(title);

          const existingIdx = state.recentEventResults.findIndex(
            (e) => e.id.toLowerCase() === String(id).toLowerCase(),
          );
          const item: RecentEventResult = {
            id: String(id),
            title: title || state.currentEventLabel || "Event",
            date: data.event_date,
            status: data.event_status,
          };
          if (existingIdx >= 0) {
            state.recentEventResults[existingIdx] = item;
          } else {
            state.recentEventResults.unshift(item);
            if (state.recentEventResults.length > 10) {
              state.recentEventResults.pop();
            }
          }
        }
      }
      break;
    }

    case "get_event_report": {
      if (toolArgs.event_id) {
        state.currentEventId = String(toolArgs.event_id);
        const candidateTitle =
          data?.event?.title || data?.summary?.title || state.currentEventLabel;
        if (candidateTitle) {
          state.currentEventLabel = String(candidateTitle);
        }
      }
      break;
    }

    case "search_workers": {
      if (Array.isArray(data)) {
        const mapped: RecentWorkerResult[] = data.slice(0, 10).map((w: any) => ({
          id: w.worker_id || w.id,
          fullName: w.full_name || w.fullName || "Worker",
          category: w.category,
          status: w.account_status || w.status,
        }));
        state.recentWorkerResults = mapped;
        if (mapped.length === 1) {
          state.currentWorkerId = mapped[0].id;
          state.currentWorkerLabel = mapped[0].fullName;
        }
      }
      break;
    }

    case "get_worker_details": {
      if (data && typeof data === "object") {
        const id = data.worker_id || data.id || toolArgs.worker_id;
        const name = data.full_name || data.fullName;
        if (id) {
          state.currentWorkerId = String(id);
          if (name) state.currentWorkerLabel = String(name);

          const existingIdx = state.recentWorkerResults.findIndex(
            (w) => w.id.toLowerCase() === String(id).toLowerCase(),
          );
          const item: RecentWorkerResult = {
            id: String(id),
            fullName: name || state.currentWorkerLabel || "Worker",
            category: data.category,
            status: data.account_status,
          };
          if (existingIdx >= 0) {
            state.recentWorkerResults[existingIdx] = item;
          } else {
            state.recentWorkerResults.unshift(item);
            if (state.recentWorkerResults.length > 10) {
              state.recentWorkerResults.pop();
            }
          }
        }
      }
      break;
    }

    case "get_worker_history": {
      if (toolArgs.worker_id) {
        state.currentWorkerId = String(toolArgs.worker_id);
      }
      break;
    }
  }

  return state;
}
