import { z } from "zod";
import type { ReadTool, ToolExecutionContext } from "../tool.types.js";
import { toolSuccess, type ToolResult } from "../tool-result.js";
import {
  EVENT_STATUSES,
  RECRUITMENT_STATUSES,
  type EventSummaryDto,
} from "../../domain/event.types.js";
import {
  dateStringSchema,
  validateInput,
} from "../../guardrails/input-validation.js";

export const searchEventsInputSchema = z
  .object({
    query: z.string().trim().min(1).optional(),
    start_date: dateStringSchema.optional(),
    end_date: dateStringSchema.optional(),
    event_status: z.enum(EVENT_STATUSES).optional(),
    recruitment_status: z.enum(RECRUITMENT_STATUSES).optional(),
    venue: z.string().trim().min(1).optional(),
    limit: z.number().int().min(1).max(25).default(10),
  })
  .refine(
    (data) => {
      if (data.start_date && data.end_date) {
        return data.start_date <= data.end_date;
      }
      return true;
    },
    {
      message: "start_date must be on or before end_date.",
      path: ["start_date"],
    },
  );

export type SearchEventsInput = z.infer<typeof searchEventsInputSchema>;

export class SearchEventsTool
  implements ReadTool<SearchEventsInput, EventSummaryDto[]>
{
  public readonly name = "search_events";
  public readonly description =
    "Searches and filters events chronologically by query, venue, date range, or status.";
  public readonly inputSchema = searchEventsInputSchema;

  public async execute(
    context: ToolExecutionContext,
    rawInput: unknown,
  ): Promise<ToolResult<EventSummaryDto[]>> {
    const input = validateInput(this.inputSchema, rawInput);
    const allEvents = await context.gateway.getAdminEvents();

    let filtered = allEvents;

    // 1. Text search across title, event_type, and venue_name
    if (input.query) {
      const q = input.query.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.event_type.toLowerCase().includes(q) ||
          e.venue_name.toLowerCase().includes(q),
      );
    }

    // 2. Specific venue filter
    if (input.venue) {
      const v = input.venue.toLowerCase();
      filtered = filtered.filter((e) =>
        e.venue_name.toLowerCase().includes(v),
      );
    }

    // 3. Status filters
    if (input.event_status) {
      filtered = filtered.filter((e) => e.event_status === input.event_status);
    }

    if (input.recruitment_status) {
      filtered = filtered.filter(
        (e) => e.recruitment_status === input.recruitment_status,
      );
    }

    // 4. Date range filter (against event_date YYYY-MM-DD)
    if (input.start_date) {
      filtered = filtered.filter((e) => e.event_date >= input.start_date!);
    }

    if (input.end_date) {
      filtered = filtered.filter((e) => e.event_date <= input.end_date!);
    }

    // 5. Chronological sort by reporting_at
    filtered.sort((a, b) => {
      const timeA = new Date(a.reporting_at).getTime();
      const timeB = new Date(b.reporting_at).getTime();
      return timeA - timeB;
    });

    // 6. Limit pagination
    const finalEvents = filtered.slice(0, input.limit);

    return toolSuccess(finalEvents);
  }
}
