import { describe, it, expect } from "vitest";
import { toolRegistry } from "../../../src/ai/tool-registry.js";

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

  it("produces clean OpenAI/Groq function definitions", () => {
    const defs = toolRegistry.getToolDefinitions();
    expect(defs).toHaveLength(7);

    for (const def of defs) {
      expect(def.type).toBe("function");
      expect(def.function.name).toBeDefined();
      expect(def.function.description).toBeDefined();
      expect(def.function.parameters).toBeDefined();
      expect(def.function.parameters.$schema).toBeUndefined();
    }
  });
});
