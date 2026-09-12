import type { z } from "zod";
import type { ActorContext } from "../auth/actor-context.js";
import type { OslavaGateway } from "../integrations/supabase/oslava.gateway.js";
import type { ToolResult } from "./tool-result.js";

/**
 * Execution context supplied to a read tool.
 * Provides the verified caller identity, request-scoped gateway, and correlation ID.
 */
export interface ToolExecutionContext {
  actor: ActorContext;
  gateway: OslavaGateway;
  requestId: string;
}

/**
 * Framework-independent contract for read capabilities.
 * Phase 3 will adapt these same tools for the AI agent runtime.
 */
export interface ReadTool<TInput, TOutput> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput, any, any>;

  execute(
    context: ToolExecutionContext,
    input: unknown,
  ): Promise<ToolResult<TOutput>>;
}
