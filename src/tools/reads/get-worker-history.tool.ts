import { z } from "zod";
import type { ReadTool, ToolExecutionContext } from "../tool.types.js";
import { toolSuccess, type ToolResult } from "../tool-result.js";
import type { WorkerHistoryEntryDto } from "../../domain/worker.types.js";
import { uuidSchema, validateInput } from "../../guardrails/input-validation.js";

export const getWorkerHistoryInputSchema = z
  .object({
    worker_id: uuidSchema,
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();

export type GetWorkerHistoryInput = z.infer<typeof getWorkerHistoryInputSchema>;

export class GetWorkerHistoryTool
  implements ReadTool<GetWorkerHistoryInput, WorkerHistoryEntryDto[]>
{
  public readonly name = "get_worker_history";
  public readonly description =
    "Fetches chronological audit history for a specific worker (category, account status, role changes).";
  public readonly inputSchema = getWorkerHistoryInputSchema;

  public async execute(
    context: ToolExecutionContext,
    rawInput: unknown,
  ): Promise<ToolResult<WorkerHistoryEntryDto[]>> {
    const input = validateInput(this.inputSchema, rawInput);
    const history = await context.gateway.getWorkerHistory(input.worker_id);

    // Apply deterministic limiting server-side
    const sliced = history.slice(0, input.limit);
    return toolSuccess(sliced);
  }
}
