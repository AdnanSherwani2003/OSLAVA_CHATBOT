import { randomUUID } from "node:crypto";
import { getPool } from "../database.js";
import {
  CreateActionParams,
  PendingActionRecord,
  UpdateActionStatusParams,
} from "../../actions/action.types.js";
import { IActionRepository } from "../contracts/repository.interfaces.js";
import { ActionNotFoundError } from "../../domain/errors.js";

function mapRowToAction(row: any): PendingActionRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    actionType: row.action_type,
    status: row.status,
    arguments: row.arguments || {},
    expectedState: row.expected_state || {},
    displaySummary: row.display_summary || {},
    createdRequestId: row.created_request_id,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
    executedAt: row.executed_at ? new Date(row.executed_at) : null,
    executionRequestId: row.execution_request_id || null,
    executionErrorCode: row.execution_error_code || null,
    resultSummary: row.result_summary || null,
  };
}

export class PostgresActionRepository implements IActionRepository {
  async createAction(params: CreateActionParams): Promise<PendingActionRecord> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresActionRepository] Database pool is not initialized.",
      );
    }

    const id = params.id || randomUUID();
    const now = new Date();

    const res = await pool.query(
      `INSERT INTO pending_actions (
        id, session_id, user_id, action_type, status,
        arguments, expected_state, display_summary,
        created_request_id, created_at, expires_at
      ) VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        id,
        params.sessionId,
        params.userId,
        params.actionType,
        JSON.stringify(params.arguments),
        JSON.stringify(params.expectedState),
        JSON.stringify(params.displaySummary),
        params.createdRequestId,
        now,
        params.expiresAt,
      ],
    );

    return mapRowToAction(res.rows[0]);
  }

  async getActionById(id: string): Promise<PendingActionRecord | null> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresActionRepository] Database pool is not initialized.",
      );
    }

    const res = await pool.query(
      `SELECT * FROM pending_actions WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return mapRowToAction(res.rows[0]);
  }

  async getActivePendingActionBySession(
    sessionId: string,
  ): Promise<PendingActionRecord | null> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresActionRepository] Database pool is not initialized.",
      );
    }

    const res = await pool.query(
      `SELECT * FROM pending_actions
       WHERE session_id = $1 AND status = 'PENDING' AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [sessionId],
    );
    if (res.rows.length === 0) return null;
    return mapRowToAction(res.rows[0]);
  }

  async claimActionForExecution(
    id: string,
    executionRequestId: string,
  ): Promise<PendingActionRecord | null> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresActionRepository] Database pool is not initialized.",
      );
    }

    const res = await pool.query(
      `UPDATE pending_actions
       SET status = 'EXECUTING', execution_request_id = $2
       WHERE id = $1 AND status = 'PENDING'
       RETURNING *`,
      [id, executionRequestId],
    );

    if (res.rows.length === 0) return null;
    return mapRowToAction(res.rows[0]);
  }

  async updateActionStatus(
    id: string,
    update: UpdateActionStatusParams,
  ): Promise<PendingActionRecord> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresActionRepository] Database pool is not initialized.",
      );
    }

    const res = await pool.query(
      `UPDATE pending_actions
       SET status = $2,
           confirmed_at = COALESCE($3, confirmed_at),
           cancelled_at = COALESCE($4, cancelled_at),
           executed_at = COALESCE($5, executed_at),
           execution_request_id = COALESCE($6, execution_request_id),
           execution_error_code = $7,
           result_summary = COALESCE($8, result_summary)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        update.status,
        update.confirmedAt || null,
        update.cancelledAt || null,
        update.executedAt || null,
        update.executionRequestId || null,
        update.executionErrorCode || null,
        update.resultSummary ? JSON.stringify(update.resultSummary) : null,
      ],
    );

    if (res.rows.length === 0) {
      throw new ActionNotFoundError(id);
    }

    return mapRowToAction(res.rows[0]);
  }

  async cancelAction(id: string): Promise<PendingActionRecord> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresActionRepository] Database pool is not initialized.",
      );
    }

    const res = await pool.query(
      `UPDATE pending_actions
       SET status = 'CANCELLED', cancelled_at = NOW()
       WHERE id = $1 AND status = 'PENDING'
       RETURNING *`,
      [id],
    );

    if (res.rows.length === 0) {
      const existing = await this.getActionById(id);
      if (!existing) throw new ActionNotFoundError(id);
      return existing;
    }

    return mapRowToAction(res.rows[0]);
  }

  async clear(): Promise<void> {
    const pool = getPool();
    if (pool) {
      await pool.query("TRUNCATE TABLE pending_actions CASCADE");
    }
  }
}
