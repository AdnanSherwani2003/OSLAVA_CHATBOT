import { describe, it, expect } from "vitest";
import { toolRegistry } from "../../../src/ai/tool-registry.js";
import { MockOslavaGateway } from "../../../src/dev/mock-oslava.gateway.js";
import type { ToolExecutionContext } from "../../../src/tools/tool.types.js";

describe("ToolRegistry", () => {
  it("registers all 7 read tools", () => {
    const expected = [
      "get_dashboard",
      "search_events",
      "get_event_details",
      "search_workers",
      "get_worker_details",
      "get_worker_history",
      "get_event_report",
    ];

    for (const name of expected) {
      expect(toolRegistry.isReadTool(name)).toBe(true);
      expect(toolRegistry.getTool(name)).toBeDefined();
    }
  });

  it("identifies write actions as known write tools", () => {
    expect(toolRegistry.isKnownWriteTool("change_worker_category")).toBe(true);
    expect(toolRegistry.isKnownWriteTool("publish_event")).toBe(true);
    expect(toolRegistry.isKnownWriteTool("cancel_event")).toBe(true);
    expect(toolRegistry.isKnownWriteTool("get_dashboard")).toBe(false);
  });

  it("produces clean OpenAI/Groq function definitions without schema artifacts", () => {
    const defs = toolRegistry.getToolDefinitions();
    expect(defs).toHaveLength(11);

    for (const def of defs) {
      expect(def.type).toBe("function");
      expect(def.function.name).toBeDefined();
      expect(def.function.description).toBeDefined();
      expect(def.function.parameters).toBeDefined();
      expect((def.function.parameters as any).$schema).toBeUndefined();
      expect((def.function.parameters as any).additionalProperties).toBe(false);
    }
  });

  it("enforces exact schema contracts and required semantics for all 7 tools", () => {
    const defs = toolRegistry.getToolDefinitions();
    const map = new Map(defs.map((d) => [d.function.name, d.function.parameters as Record<string, any>]));

    // 1. get_dashboard: required is absent or []
    const dashboard = map.get("get_dashboard")!;
    expect(dashboard).toBeDefined();
    expect(dashboard.required ?? []).toEqual([]);

    // 2. search_events: required is absent or []
    const searchEvents = map.get("search_events")!;
    expect(searchEvents).toBeDefined();
    expect(searchEvents.required ?? []).toEqual([]);
    expect(searchEvents.properties).toHaveProperty("query");
    expect(searchEvents.properties).toHaveProperty("start_date");
    expect(searchEvents.properties).toHaveProperty("end_date");
    expect(searchEvents.properties).toHaveProperty("event_status");
    expect(searchEvents.properties).toHaveProperty("recruitment_status");
    expect(searchEvents.properties).toHaveProperty("venue");
    expect(searchEvents.properties).toHaveProperty("limit");

    // 3. get_event_details: required exactly ["event_id"]
    const eventDetails = map.get("get_event_details")!;
    expect(eventDetails).toBeDefined();
    expect(eventDetails.required).toEqual(["event_id"]);

    // 4. search_workers: required is absent or []
    const searchWorkers = map.get("search_workers")!;
    expect(searchWorkers).toBeDefined();
    expect(searchWorkers.required ?? []).toEqual([]);
    // Properties must still be present
    expect(searchWorkers.properties).toHaveProperty("query");
    expect(searchWorkers.properties).toHaveProperty("category");
    expect(searchWorkers.properties).toHaveProperty("account_status");
    expect(searchWorkers.properties).toHaveProperty("limit");
    expect(searchWorkers.properties).toHaveProperty("offset");

    // Verify none of the optional properties use fake nullable anyOf
    expect(searchWorkers.properties.query).not.toHaveProperty("anyOf");
    expect(searchWorkers.properties.query.type).toBe("string");

    // 5. get_worker_details: required exactly ["worker_id"]
    const workerDetails = map.get("get_worker_details")!;
    expect(workerDetails).toBeDefined();
    expect(workerDetails.required).toEqual(["worker_id"]);

    // 6. get_worker_history: required exactly ["worker_id"]
    const workerHistory = map.get("get_worker_history")!;
    expect(workerHistory).toBeDefined();
    expect(workerHistory.required).toEqual(["worker_id"]);
    expect(workerHistory.properties).toHaveProperty("limit");

    // 7. get_event_report: required exactly ["event_id", "section"]
    const eventReport = map.get("get_event_report")!;
    expect(eventReport).toBeDefined();
    expect(eventReport.required).toEqual(["event_id", "section"]);
    expect(eventReport.properties).toHaveProperty("audit_action_filter");
    expect(eventReport.properties).toHaveProperty("audit_actor_role_filter");
    expect(eventReport.properties).toHaveProperty("limit");
    expect(eventReport.properties).toHaveProperty("offset");

    // 8. change_worker_category: required ["worker_id", "new_category", "reason"]
    const changeWorker = map.get("change_worker_category")!;
    expect(changeWorker).toBeDefined();
    expect(changeWorker.required).toEqual(["worker_id", "new_category", "reason"]);

    // 9. publish_event: required ["event_id", "reason"]
    const publishEvent = map.get("publish_event")!;
    expect(publishEvent).toBeDefined();
    expect(publishEvent.required).toEqual(["event_id", "reason"]);

    // 10. complete_event: required ["event_id", "reason"]
    const completeEvent = map.get("complete_event")!;
    expect(completeEvent).toBeDefined();
    expect(completeEvent.required).toEqual(["event_id", "reason"]);

    // 11. close_event: required ["event_id", "reason"]
    const closeEvent = map.get("close_event")!;
    expect(closeEvent).toBeDefined();
    expect(closeEvent.required).toEqual(["event_id", "reason"]);
  });

  it("distinguishes read tools from write intent tools", () => {
    expect(toolRegistry.isReadTool("get_dashboard")).toBe(true);
    expect(toolRegistry.isReadTool("search_workers")).toBe(true);
    expect(toolRegistry.isReadTool("change_worker_category")).toBe(false);

    expect(toolRegistry.isWriteIntentTool("change_worker_category")).toBe(true);
    expect(toolRegistry.isWriteIntentTool("publish_event")).toBe(true);
    expect(toolRegistry.isWriteIntentTool("complete_event")).toBe(true);
    expect(toolRegistry.isWriteIntentTool("close_event")).toBe(true);
    expect(toolRegistry.isWriteIntentTool("get_dashboard")).toBe(false);

    expect(toolRegistry.isSupportedWriteTool("publish_event")).toBe(true);
    expect(toolRegistry.isUnsupportedWriteTool("cancel_event")).toBe(true);
  });

  it("regression: search_workers succeeds with partial argument { query: 'Arif' } and empty argument {}", async () => {
    const tool = toolRegistry.getTool("search_workers")!;
    expect(tool).toBeDefined();

    const gateway = new MockOslavaGateway();
    const context: ToolExecutionContext = {
      gateway,
      actor: {
        userId: "00000000-0000-4000-8000-000000000001",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        displayName: "Test Admin",
        accessToken: "mock-jwt",
        requestId: "test-req",
      },
      requestId: "test-req",
    };

    // 1. Partial argument: { query: 'Arif' }
    const res1 = await tool.execute(context, { query: "Arif" });
    expect(res1.success).toBe(true);
    expect(res1.data.length).toBe(2);
    expect(res1.data.map((w: any) => w.full_name)).toEqual(["Arif Khan", "Arif Ahmed"]);

    // 2. Empty argument: {}
    const res2 = await tool.execute(context, {});
    expect(res2.success).toBe(true);
    expect(res2.data.length).toBe(4);
  });
});
