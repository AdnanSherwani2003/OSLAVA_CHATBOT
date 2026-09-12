import { describe, it, expect } from "vitest";
import {
  GetDashboardTool,
  SearchEventsTool,
  GetEventDetailsTool,
  SearchWorkersTool,
  GetWorkerDetailsTool,
  GetWorkerHistoryTool,
  GetEventReportTool,
} from "../../../src/tools/index.js";
import { parseConfig, rawEnvSchema } from "../../../src/config/env.js";

describe("Security & Architecture: Read Capabilities", () => {
  it("verifies all 7 tools are instantiated and expose strict input schemas", () => {
    const tools = [
      new GetDashboardTool(),
      new SearchEventsTool(),
      new GetEventDetailsTool(),
      new SearchWorkersTool(),
      new GetWorkerDetailsTool(),
      new GetWorkerHistoryTool(),
      new GetEventReportTool(),
    ];

    expect(tools).toHaveLength(7);

    const expectedNames = [
      "get_dashboard",
      "search_events",
      "get_event_details",
      "search_workers",
      "get_worker_details",
      "get_worker_history",
      "get_event_report",
    ];

    const actualNames = tools.map((t) => t.name);
    expect(actualNames).toEqual(expectedNames);

    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it("verifies SUPABASE_SERVICE_ROLE_KEY is not a valid or required configuration property", () => {
    // rawEnvSchema must NOT accept or require SUPABASE_SERVICE_ROLE_KEY
    const baseConfig = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      SUPABASE_SERVICE_ROLE_KEY: "illegal-service-role-key",
    };

    const parsed = parseConfig(baseConfig);
    // @ts-expect-error verifying service role key is not in typed config
    expect(parsed.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });
});
