import { zodToJsonSchema } from "zod-to-json-schema";
import {
  GetDashboardTool,
  SearchEventsTool,
  GetEventDetailsTool,
  SearchWorkersTool,
  GetWorkerDetailsTool,
  GetWorkerHistoryTool,
  GetEventReportTool,
  ReadTool,
} from "../tools/index.js";
import { ModelToolDefinition } from "./model.provider.js";

const KNOWN_WRITE_TOOLS = new Set([
  "change_worker_category",
  "publish_event",
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

export class ToolRegistry {
  private readonly tools = new Map<string, ReadTool<any, any>>();
  private cachedDefinitions: ModelToolDefinition[] | null = null;

  constructor() {
    this.registerTool(new GetDashboardTool());
    this.registerTool(new SearchEventsTool());
    this.registerTool(new GetEventDetailsTool());
    this.registerTool(new SearchWorkersTool());
    this.registerTool(new GetWorkerDetailsTool());
    this.registerTool(new GetWorkerHistoryTool());
    this.registerTool(new GetEventReportTool());
  }

  private registerTool(tool: ReadTool<any, any>): void {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): ReadTool<any, any> | undefined {
    return this.tools.get(name);
  }

  public isReadTool(name: string): boolean {
    return this.tools.has(name);
  }

  public isKnownWriteTool(name: string): boolean {
    return KNOWN_WRITE_TOOLS.has(name);
  }

  public getToolDefinitions(): ModelToolDefinition[] {
    if (this.cachedDefinitions) {
      return this.cachedDefinitions;
    }

    const defs: ModelToolDefinition[] = [];

    for (const tool of this.tools.values()) {
      const jsonSchema = zodToJsonSchema(tool.inputSchema, {
        target: "openAi",
      }) as Record<string, any>;

      // Clean up JSON schema metadata to keep OpenAI/Groq function calling payload tidy
      delete jsonSchema["$schema"];
      delete jsonSchema["default"];

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
