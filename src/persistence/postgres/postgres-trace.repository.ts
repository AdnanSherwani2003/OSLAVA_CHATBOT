import { randomUUID } from "node:crypto";
import { getPool } from "../database.js";
import {
  ChatTraceRecord,
  ITraceRepository,
  ToolExecutionRecord,
} from "../contracts/repository.interfaces.js";

export class PostgresTraceRepository implements ITraceRepository {
  async recordToolExecution(exec: ToolExecutionRecord): Promise<void> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresTraceRepository] Database pool is not initialized.",
      );
    }

    const id = exec.id || randomUUID();

    await pool.query(
      `INSERT INTO tool_executions (
         id, request_id, session_id, user_id, tool_name,
         arguments_redacted, status, started_at, completed_at, duration_ms, error_code
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        exec.requestId,
        exec.sessionId || null,
        exec.userId,
        exec.toolName,
        JSON.stringify(exec.argumentsRedacted || {}),
        exec.status,
        exec.startedAt,
        exec.completedAt,
        exec.durationMs,
        exec.errorCode || null,
      ],
    );
  }

  async recordChatTrace(trace: ChatTraceRecord): Promise<void> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresTraceRepository] Database pool is not initialized.",
      );
    }

    const id = trace.id || randomUUID();
    const now = trace.createdAt || new Date();

    await pool.query(
      `INSERT INTO chat_traces (
         id, request_id, session_id, user_id, provider, model,
         reasoning_effort, tool_call_count, input_tokens, output_tokens,
         duration_ms, outcome, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        trace.requestId,
        trace.sessionId || null,
        trace.userId,
        trace.provider,
        trace.model,
        trace.reasoningEffort || null,
        trace.toolCallCount,
        trace.inputTokens || null,
        trace.outputTokens || null,
        trace.durationMs,
        trace.outcome,
        now,
      ],
    );
  }

  async getToolExecutionsBySession(
    sessionId: string,
  ): Promise<ToolExecutionRecord[]> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresTraceRepository] Database pool is not initialized.",
      );
    }

    const res = await pool.query<{
      id: string;
      request_id: string;
      session_id: string | null;
      user_id: string;
      tool_name: string;
      arguments_redacted: any;
      status: "SUCCESS" | "ERROR";
      started_at: Date;
      completed_at: Date;
      duration_ms: number;
      error_code: string | null;
    }>(
      `SELECT id, request_id, session_id, user_id, tool_name,
              arguments_redacted, status, started_at, completed_at, duration_ms, error_code
       FROM tool_executions
       WHERE session_id = $1
       ORDER BY started_at ASC`,
      [sessionId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      requestId: r.request_id,
      sessionId: r.session_id,
      userId: r.user_id,
      toolName: r.tool_name,
      argumentsRedacted:
        typeof r.arguments_redacted === "string"
          ? JSON.parse(r.arguments_redacted)
          : r.arguments_redacted,
      status: r.status,
      startedAt: new Date(r.started_at),
      completedAt: new Date(r.completed_at),
      durationMs: r.duration_ms,
      errorCode: r.error_code,
    }));
  }

  async getChatTracesBySession(sessionId: string): Promise<ChatTraceRecord[]> {
    const pool = getPool();
    if (!pool) {
      throw new Error(
        "[PostgresTraceRepository] Database pool is not initialized.",
      );
    }

    const res = await pool.query<{
      id: string;
      request_id: string;
      session_id: string | null;
      user_id: string;
      provider: string;
      model: string;
      reasoning_effort: string | null;
      tool_call_count: number;
      inputTokens: number | null;
      outputTokens: number | null;
      duration_ms: number;
      outcome: string;
      created_at: Date;
    }>(
      `SELECT id, request_id, session_id, user_id, provider, model,
              reasoning_effort, tool_call_count, input_tokens, output_tokens,
              duration_ms, outcome, created_at
       FROM chat_traces
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      requestId: r.request_id,
      sessionId: r.session_id,
      userId: r.user_id,
      provider: r.provider,
      model: r.model,
      reasoningEffort: r.reasoning_effort,
      toolCallCount: r.tool_call_count,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      durationMs: r.duration_ms,
      outcome: r.outcome,
      createdAt: new Date(r.created_at),
    }));
  }

  async clear(): Promise<void> {
    const pool = getPool();
    if (pool) {
      await pool.query("TRUNCATE TABLE tool_executions, chat_traces CASCADE");
    }
  }
}
