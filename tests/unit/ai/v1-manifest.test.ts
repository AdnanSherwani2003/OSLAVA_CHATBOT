import { describe, it, expect } from "vitest";
import {
  V1_READ_TOOLS,
  V1_WRITE_INTENT_TOOLS,
  V1_ALL_TOOLS,
  V1_CAPABILITY_REGISTRY,
  isV1Tool,
  isV1ReadTool,
  isV1WriteIntentTool,
} from "../../../src/ai/v1-manifest.js";
import { toolRegistry } from "../../../src/ai/tool-registry.js";

describe("V1 Capability Manifest & Tool Registry Freeze", () => {
  it("freezes exactly 7 read tools and 4 write intent tools", () => {
    expect(V1_READ_TOOLS).toHaveLength(7);
    expect(V1_WRITE_INTENT_TOOLS).toHaveLength(4);
    expect(V1_ALL_TOOLS).toHaveLength(11);
  });

  it("contains the exact expected 7 read tools", () => {
    expect(V1_READ_TOOLS).toEqual([
      "get_dashboard",
      "search_events",
      "get_event_details",
      "search_workers",
      "get_worker_details",
      "get_worker_history",
      "get_event_report",
    ]);
  });

  it("contains the exact expected 4 write intent tools", () => {
    expect(V1_WRITE_INTENT_TOOLS).toEqual([
      "change_worker_category",
      "publish_event",
      "complete_event",
      "close_event",
    ]);
  });

  it("ensures model-visible tool definitions contain ONLY frozen V1 capabilities", () => {
    const definitions = toolRegistry.getToolDefinitions();
    const definedNames = definitions.map((d) => d.function.name).sort();
    const manifestNames = [...V1_ALL_TOOLS].sort();

    expect(definedNames).toEqual(manifestNames);
  });

  it("rejects unauthorized V2 operations from V1 tools", () => {
    const forbiddenV2Tools = [
      "create_event",
      "edit_event",
      "update_event",
      "delete_event",
      "assign_leader",
      "remove_leader",
      "assign_worker",
      "remove_worker",
      "mark_attendance",
      "detain_worker",
      "release_worker",
      "approve_registration",
      "reject_registration",
      "send_notification",
      "execute_sql",
      "run_rpc",
    ];

    for (const v2Tool of forbiddenV2Tools) {
      expect(isV1Tool(v2Tool)).toBe(false);
      expect(toolRegistry.getTool(v2Tool)).toBeUndefined();
    }
  });

  it("validates capability descriptors and required parameter metadata", () => {
    for (const toolName of V1_ALL_TOOLS) {
      const descriptor = V1_CAPABILITY_REGISTRY[toolName];
      expect(descriptor).toBeDefined();
      expect(descriptor.name).toBe(toolName);
      expect(descriptor.description).toBeTruthy();
      expect(Array.isArray(descriptor.requiredProperties)).toBe(true);

      if (V1_READ_TOOLS.includes(toolName as any)) {
        expect(isV1ReadTool(toolName)).toBe(true);
        expect(descriptor.category).toBe("READ");
      } else {
        expect(isV1WriteIntentTool(toolName)).toBe(true);
        expect(descriptor.category).toBe("WRITE_INTENT");
      }
    }
  });
});
