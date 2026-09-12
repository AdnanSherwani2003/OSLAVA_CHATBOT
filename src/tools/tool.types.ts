import type { z } from "zod";
import type { ActorContext } from "../auth/actor-context.js";
import type { OslavaGateway } from "../integrations/supabase/oslava.gateway.js";
import type { ToolResult } from "./tool-result.js";
import type { PendingActionRecord } from "../actions/action.types.js";

/**
 * Execution context supplied to a tool.
 * Provides the verified caller identity, request-scoped gateway, session ID, and correlation ID.
 */
export interface ToolExecutionContext {
  actor: ActorContext;
  gateway: OslavaGateway;
  requestId: string;
  sessionId?: string;
}

export type ToolCategory = "READ" | "WRITE_INTENT";

/**
 * Common tool contract for both reads and write intents.
 */
export interface ChatTool<TInput = any, TOutput = any> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput, any, any>;
  readonly category?: ToolCategory;

  execute(
    context: ToolExecutionContext,
    input: unknown,
  ): Promise<ToolResult<TOutput>>;
}

/**
 * Contract for read capabilities.
 */
export interface ReadTool<TInput, TOutput> extends ChatTool<TInput, TOutput> {
  readonly category?: "READ";
}

/**
 * Contract for write intent capabilities.
 */
export interface WriteIntentResult {
  action: PendingActionRecord;
  confirmationRequired: true;
}

export interface WriteIntentTool<TInput>
  extends ChatTool<TInput, WriteIntentResult> {
  readonly category: "WRITE_INTENT";
}
