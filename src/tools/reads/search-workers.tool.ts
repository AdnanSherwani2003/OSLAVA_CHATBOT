import { z } from "zod";
import type { ReadTool, ToolExecutionContext } from "../tool.types.js";
import { toolSuccess, type ToolResult } from "../tool-result.js";
import {
  ACCOUNT_STATUSES,
  WORKER_CATEGORIES,
} from "../../domain/auth.types.js";
import type { WorkerSearchResultDto } from "../../domain/worker.types.js";
import { validateInput } from "../../guardrails/input-validation.js";

export const searchWorkersInputSchema = z
  .object({
    query: z.string().trim().min(1).optional(),
    category: z.enum(WORKER_CATEGORIES).optional(),
    account_status: z.enum(ACCOUNT_STATUSES).optional(),
    limit: z.number().int().min(1).max(25).default(10),
    offset: z.number().int().min(0).default(0),
  })
  .strict();

export type SearchWorkersInput = z.infer<typeof searchWorkersInputSchema>;

export class SearchWorkersTool
  implements ReadTool<SearchWorkersInput, WorkerSearchResultDto[]>
{
  public readonly name = "search_workers";
  public readonly description =
    "Searches workers in the directory by name/worker number, category, or account status with sanitized results.";
  public readonly inputSchema = searchWorkersInputSchema;

  public async execute(
    context: ToolExecutionContext,
    rawInput: unknown,
  ): Promise<ToolResult<WorkerSearchResultDto[]>> {
    const input = validateInput(this.inputSchema, rawInput);
    const workers = await context.gateway.searchWorkers({
      query: input.query,
      category: input.category,
      account_status: input.account_status,
      limit: input.limit,
      offset: input.offset,
    });
    return toolSuccess(workers);
  }
}
