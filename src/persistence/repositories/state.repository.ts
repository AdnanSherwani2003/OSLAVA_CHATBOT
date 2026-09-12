import { getPool } from "../database.js";

export interface ChatSessionState {
  sessionId: string;
  currentEventId: string | null;
  currentEventLabel: string | null;
  currentWorkerId: string | null;
  currentWorkerLabel: string | null;
  recentEventResults: any[];
  recentWorkerResults: any[];
  updatedAt: Date;
}

export interface IStateRepository {
  getStateBySessionId(sessionId: string): Promise<ChatSessionState | null>;
  upsertState(
    state: Omit<ChatSessionState, "updatedAt">,
  ): Promise<ChatSessionState>;
  clear(): Promise<void>;
}

export class StateRepository implements IStateRepository {
  private inMemoryState = new Map<string, ChatSessionState>();

  async getStateBySessionId(sessionId: string): Promise<ChatSessionState | null> {
    const pool = getPool();
    if (pool) {
      const res = await pool.query<{
        session_id: string;
        current_event_id: string | null;
        current_event_label: string | null;
        current_worker_id: string | null;
        current_worker_label: string | null;
        recent_event_results: any;
        recent_worker_results: any;
        updated_at: Date;
      }>(
        `SELECT session_id, current_event_id, current_event_label,
                current_worker_id, current_worker_label,
                recent_event_results, recent_worker_results, updated_at
         FROM chat_session_state
         WHERE session_id = $1`,
        [sessionId],
      );
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        sessionId: r.session_id,
        currentEventId: r.current_event_id,
        currentEventLabel: r.current_event_label,
        currentWorkerId: r.current_worker_id,
        currentWorkerLabel: r.current_worker_label,
        recentEventResults: Array.isArray(r.recent_event_results)
          ? r.recent_event_results
          : JSON.parse(r.recent_event_results || "[]"),
        recentWorkerResults: Array.isArray(r.recent_worker_results)
          ? r.recent_worker_results
          : JSON.parse(r.recent_worker_results || "[]"),
        updatedAt: new Date(r.updated_at),
      };
    }

    return this.inMemoryState.get(sessionId) || null;
  }

  async upsertState(
    state: Omit<ChatSessionState, "updatedAt">,
  ): Promise<ChatSessionState> {
    const now = new Date();
    const pool = getPool();

    if (pool) {
      const res = await pool.query<{
        session_id: string;
        current_event_id: string | null;
        current_event_label: string | null;
        current_worker_id: string | null;
        current_worker_label: string | null;
        recent_event_results: any;
        recent_worker_results: any;
        updated_at: Date;
      }>(
        `INSERT INTO chat_session_state (
           session_id, current_event_id, current_event_label,
           current_worker_id, current_worker_label,
           recent_event_results, recent_worker_results, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (session_id) DO UPDATE SET
           current_event_id = EXCLUDED.current_event_id,
           current_event_label = EXCLUDED.current_event_label,
           current_worker_id = EXCLUDED.current_worker_id,
           current_worker_label = EXCLUDED.current_worker_label,
           recent_event_results = EXCLUDED.recent_event_results,
           recent_worker_results = EXCLUDED.recent_worker_results,
           updated_at = EXCLUDED.updated_at
         RETURNING session_id, current_event_id, current_event_label,
                   current_worker_id, current_worker_label,
                   recent_event_results, recent_worker_results, updated_at`,
        [
          state.sessionId,
          state.currentEventId,
          state.currentEventLabel,
          state.currentWorkerId,
          state.currentWorkerLabel,
          JSON.stringify(state.recentEventResults || []),
          JSON.stringify(state.recentWorkerResults || []),
          now,
        ],
      );
      const r = res.rows[0];
      return {
        sessionId: r.session_id,
        currentEventId: r.current_event_id,
        currentEventLabel: r.current_event_label,
        currentWorkerId: r.current_worker_id,
        currentWorkerLabel: r.current_worker_label,
        recentEventResults: Array.isArray(r.recent_event_results)
          ? r.recent_event_results
          : JSON.parse(r.recent_event_results || "[]"),
        recentWorkerResults: Array.isArray(r.recent_worker_results)
          ? r.recent_worker_results
          : JSON.parse(r.recent_worker_results || "[]"),
        updatedAt: new Date(r.updated_at),
      };
    }

    const fullState: ChatSessionState = {
      ...state,
      updatedAt: now,
    };
    this.inMemoryState.set(state.sessionId, fullState);
    return fullState;
  }

  async clear(): Promise<void> {
    const pool = getPool();
    if (pool) {
      await pool.query("TRUNCATE TABLE chat_session_state CASCADE");
    }
    this.inMemoryState.clear();
  }
}

export const stateRepository = new StateRepository();
