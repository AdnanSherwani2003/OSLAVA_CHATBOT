import { z } from "zod";
import type { ReadTool, ToolExecutionContext } from "../tool.types.js";
import { toolSuccess, type ToolResult } from "../tool-result.js";
import type { WorkerDetailDto } from "../../domain/worker.types.js";
import { uuidSchema, validateInput } from "../../guardrails/input-validation.js";

export const getWorkerDetailsInputSchema = z
  .object({
    worker_id: uuidSchema,
  })
  .strict();

export type GetWorkerDetailsInput = z.infer<typeof getWorkerDetailsInputSchema>;

export class GetWorkerDetailsTool
  implements ReadTool<GetWorkerDetailsInput, WorkerDetailDto>
{
  public readonly name = "get_worker_details";
  public readonly description =
    "Fetches sanitized operational metrics, reliability scores, and experience details for a specific worker.";
  public readonly inputSchema = getWorkerDetailsInputSchema;

  public async execute(
    context: ToolExecutionContext,
    rawInput: unknown,
  ): Promise<ToolResult<WorkerDetailDto>> {
    const input = validateInput(this.inputSchema, rawInput);
    const detail = await context.gateway.getWorkerDetail(input.worker_id);
    return toolSuccess(detail);
  }
}
