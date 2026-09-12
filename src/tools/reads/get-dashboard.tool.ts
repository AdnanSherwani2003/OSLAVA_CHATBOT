import { z } from "zod";
import type { ReadTool, ToolExecutionContext } from "../tool.types.js";
import { toolSuccess, type ToolResult } from "../tool-result.js";
import type { AdminDashboardDto } from "../../domain/event.types.js";
import { validateInput } from "../../guardrails/input-validation.js";

export const getDashboardInputSchema = z
  .object({})
  .strict();

export type GetDashboardInput = z.infer<typeof getDashboardInputSchema>;

export class GetDashboardTool
  implements ReadTool<GetDashboardInput, AdminDashboardDto>
{
  public readonly name = "get_dashboard";
  public readonly description =
    "Fetches high-level operational event metrics and today's staffing counts for administrators.";
  public readonly inputSchema = getDashboardInputSchema;

  public async execute(
    context: ToolExecutionContext,
    rawInput: unknown,
  ): Promise<ToolResult<AdminDashboardDto>> {
    validateInput(this.inputSchema, rawInput);
    const dashboard = await context.gateway.getAdminDashboard();
    return toolSuccess(dashboard);
  }
}
