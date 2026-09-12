import { zodToJsonSchema } from "zod-to-json-schema";
import {
  GetDashboardTool,
  SearchEventsTool,
  GetEventDetailsTool,
  SearchWorkersTool,
  GetWorkerDetailsTool,
  GetWorkerHistoryTool,
  GetEventReportTool,
  ChangeWorkerCategoryTool,
  PublishEventTool,
  CompleteEventTool,
  CloseEventTool,
  ChatTool,
} from "../tools/index.js";
import { ModelToolDefinition } from "./model.provider.js";

import {
  V1_CAPABILITY_REGISTRY,
  V1_READ_TOOLS,
  V1_WRITE_INTENT_TOOLS,
  V1_ALL_TOOLS,
  type V1ToolName,
} from "./v1-manifest.js";

export const SUPPORTED_WRITE_TOOLS: Set<string> = new Set(V1_WRITE_INTENT_TOOLS);

export const UNSUPPORTED_WRITE_TOOLS = new Set([
  "cancel_event",
  "assign_leader",
  "create_event",
  "update_event",
  "settle_event",
  "delete_event",
  "register_worker",
  "approve_worker",
  "reject_worker",
]);

const TOOL_REQUIRED_PROPERTIES: Record<string, readonly string[]> = Object.fromEntries(
  Object.values(V1_CAPABILITY_REGISTRY).map((c) => [c.name, c.requiredProperties]),
);

export class ToolRegistry {
  private readonly tools = new Map<string, ChatTool<any, any>>();
  private cachedDefinitions: ModelToolDefinition[] | null = null;

  constructor() {
    // 7 Read tools
    this.registerTool(new GetDashboardTool());
    this.registerTool(new SearchEventsTool());
    this.registerTool(new GetEventDetailsTool());
    this.registerTool(new SearchWorkersTool());
    this.registerTool(new GetWorkerDetailsTool());
    this.registerTool(new GetWorkerHistoryTool());
    this.registerTool(new GetEventReportTool());

    // 4 Write intent tools
    this.registerTool(new ChangeWorkerCategoryTool());
    this.registerTool(new PublishEventTool());
    this.registerTool(new CompleteEventTool());
    this.registerTool(new CloseEventTool());
  }

  private registerTool(tool: ChatTool<any, any>): void {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): ChatTool<any, any> | undefined {
    return this.tools.get(name);
  }

  public isReadTool(name: string): boolean {
    const tool = this.tools.get(name);
    return !!tool && tool.category !== "WRITE_INTENT";
  }

  public isWriteIntentTool(name: string): boolean {
    const tool = this.tools.get(name);
    return !!tool && tool.category === "WRITE_INTENT";
  }

  public isSupportedWriteTool(name: string): boolean {
    return SUPPORTED_WRITE_TOOLS.has(name);
  }

  public isUnsupportedWriteTool(name: string): boolean {
    return UNSUPPORTED_WRITE_TOOLS.has(name);
  }

  public isKnownWriteTool(name: string): boolean {
    return SUPPORTED_WRITE_TOOLS.has(name) || UNSUPPORTED_WRITE_TOOLS.has(name);
  }

  public getToolDefinitions(): ModelToolDefinition[] {
    if (this.cachedDefinitions) {
      return this.cachedDefinitions;
    }

    const defs: ModelToolDefinition[] = [];

    for (const tool of this.tools.values()) {
      const jsonSchema = zodToJsonSchema(tool.inputSchema, {
        target: "jsonSchema7",
        $refStrategy: "none",
      }) as Record<string, any>;

      // Clean up JSON schema metadata to keep OpenAI/Groq function calling payload tidy
      delete jsonSchema["$schema"];
      delete jsonSchema["default"];

      // Enforce clean required array according to tool specification
      const requiredFields = TOOL_REQUIRED_PROPERTIES[tool.name];
      if (requiredFields !== undefined) {
        jsonSchema.required = requiredFields;
      } else if (!jsonSchema.required) {
        jsonSchema.required = [];
      }

      defs.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: jsonSchema,
        },
      });
    }

    this.cachedDefinitions = defs;
    return defs;
  }
}

export const toolRegistry = new ToolRegistry();
