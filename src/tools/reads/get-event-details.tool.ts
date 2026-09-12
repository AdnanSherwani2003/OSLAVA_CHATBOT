import { z } from "zod";
import type { ReadTool, ToolExecutionContext } from "../tool.types.js";
import { toolSuccess, type ToolResult } from "../tool-result.js";
import type { EventDetailDto } from "../../domain/event.types.js";
import { uuidSchema, validateInput } from "../../guardrails/input-validation.js";

export const getEventDetailsInputSchema = z
  .object({
    event_id: uuidSchema,
  })
  .strict();

export type GetEventDetailsInput = z.infer<typeof getEventDetailsInputSchema>;

export class GetEventDetailsTool
  implements ReadTool<GetEventDetailsInput, EventDetailDto>
{
  public readonly name = "get_event_details";
  public readonly description =
    "Fetches comprehensive details for a specific event including staffing counts, requirements, allowances, and assigned leaders.";
  public readonly inputSchema = getEventDetailsInputSchema;

  public async execute(
    context: ToolExecutionContext,
    rawInput: unknown,
  ): Promise<ToolResult<EventDetailDto>> {
    const input = validateInput(this.inputSchema, rawInput);
    const detail = await context.gateway.getAdminEventDetail(input.event_id);
    return toolSuccess(detail);
  }
}
