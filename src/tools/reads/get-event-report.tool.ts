import { z } from "zod";
import type { ReadTool, ToolExecutionContext } from "../tool.types.js";
import { toolSuccess, type ToolResult } from "../tool-result.js";
import { APP_ROLES } from "../../domain/auth.types.js";
import {
  REPORT_SECTIONS,
  type CombinedEventReportDto,
} from "../../domain/report.types.js";
import { uuidSchema, validateInput } from "../../guardrails/input-validation.js";

export const getEventReportInputSchema = z
  .object({
    event_id: uuidSchema,
    section: z.enum(REPORT_SECTIONS).default("full"),
    audit_action_filter: z.string().trim().min(1).optional(),
    audit_actor_role_filter: z.enum(APP_ROLES).optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .strict();

export type GetEventReportInput = z.infer<typeof getEventReportInputSchema>;

export class GetEventReportTool
  implements ReadTool<GetEventReportInput, CombinedEventReportDto>
{
  public readonly name = "get_event_report";
  public readonly description =
    "Fetches operational reports for an event. Allows selective retrieval of summary, staffing, audit logs, or full combined report.";
  public readonly inputSchema = getEventReportInputSchema;

  public async execute(
    context: ToolExecutionContext,
    rawInput: unknown,
  ): Promise<ToolResult<CombinedEventReportDto>> {
    const input = validateInput(this.inputSchema, rawInput);
    const { gateway } = context;

    switch (input.section) {
      case "summary": {
        const summary = await gateway.getEventReportSummary(input.event_id);
        return toolSuccess({
          section: "summary",
          summary,
        });
      }

      case "staffing": {
        const staffing = await gateway.getEventStaffingReport(input.event_id);
        return toolSuccess({
          section: "staffing",
          staffing,
        });
      }

      case "audit": {
        const audit = await gateway.getEventAuditHistory({
          eventId: input.event_id,
          actionFilter: input.audit_action_filter,
          roleFilter: input.audit_actor_role_filter,
          limit: input.limit,
          offset: input.offset,
        });
        return toolSuccess({
          section: "audit",
          audit,
        });
      }

      case "full": {
        const [summary, staffing, audit] = await Promise.all([
          gateway.getEventReportSummary(input.event_id),
          gateway.getEventStaffingReport(input.event_id),
          gateway.getEventAuditHistory({
            eventId: input.event_id,
            actionFilter: input.audit_action_filter,
            roleFilter: input.audit_actor_role_filter,
            limit: input.limit,
            offset: input.offset,
          }),
        ]);

        return toolSuccess({
          section: "full",
          summary,
          staffing,
          audit,
        });
      }

      default:
        throw new Error(`Unsupported report section.`);
    }
  }
}
