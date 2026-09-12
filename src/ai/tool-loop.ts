import { OslavaGateway } from "../integrations/supabase/oslava.gateway.js";
import { ActorContext } from "../auth/actor-context.js";
import { SessionState } from "../context/context.types.js";
import { entityContextService } from "../context/entity-context.service.js";
import { reduceSessionState } from "../context/context.reducer.js";
import { ITraceRepository } from "../persistence/repositories/trace.repository.js";
import { logger } from "../observability/logger.js";
import { metrics } from "../observability/metrics.js";
import {
  ModelMessage,
  ModelProvider,
} from "./model.provider.js";
import { toolRegistry } from "./tool-registry.js";
import { PendingActionRecord } from "../actions/action.types.js";
import { WriteIntentResult } from "../tools/tool.types.js";

export interface ToolLoopExecutionParams {
  modelProvider: ModelProvider;
  messages: ModelMessage[];
  state: SessionState | null;
  userPrompt: string;
  gateway: OslavaGateway;
  actor: ActorContext;
  requestId: string;
  sessionId: string;
  traceRepo: ITraceRepository;
  maxToolCalls?: number;
}

export interface ToolLoopResult {
  finalContent: string;
  state: SessionState | null;
  toolCallCount: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  model: string;
  proposedAction?: PendingActionRecord;
}

export class ToolLoop {
  private readonly maxToolCalls: number;

  constructor(maxToolCalls = 5) {
    this.maxToolCalls = maxToolCalls;
  }

  async run(params: ToolLoopExecutionParams): Promise<ToolLoopResult> {
    const {
      modelProvider,
      messages,
      userPrompt,
      gateway,
      actor,
      requestId,
      sessionId,
      traceRepo,
    } = params;

    let currentState = params.state;
    let toolCallCount = 0;
    const turnToolOutputs: any[] = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let lastModel = "unknown";

    const toolDefinitions = toolRegistry.getToolDefinitions();

    while (toolCallCount < this.maxToolCalls) {
      const modelCallStart = Date.now();
      const response = await modelProvider.chat({
        messages,
        tools: toolDefinitions,
        toolChoice: "auto",
      });
      metrics.recordModelCall(Date.now() - modelCallStart);

      lastModel = response.model;
      if (response.usage) {
        totalPromptTokens += response.usage.promptTokens || 0;
        totalCompletionTokens += response.usage.completionTokens || 0;
      }

      // If model produced no tool calls, it has finished thinking
      if (!response.toolCalls || response.toolCalls.length === 0) {
        return {
          finalContent: response.content || "",
          state: currentState,
          toolCallCount,
          totalTokens: totalPromptTokens + totalCompletionTokens,
          inputTokens: totalPromptTokens,
          outputTokens: totalCompletionTokens,
          model: lastModel,
        };
      }

      // Append assistant tool-call message
      messages.push({
        role: "assistant",
        content: response.content || null,
        tool_calls: response.toolCalls,
      });

      // Execute each tool call sequentially
      for (const tc of response.toolCalls) {
        if (toolCallCount >= this.maxToolCalls) {
          logger.warn(
            { requestId, sessionId, toolCallCount },
            "[ToolLoop] Max tool calls reached; terminating loop.",
          );
          break;
        }

        toolCallCount++;
        const toolName = tc.function.name;
        let parsedArgs: Record<string, unknown> = {};

        try {
          parsedArgs = tc.function.arguments
            ? JSON.parse(tc.function.arguments)
            : {};
        } catch {
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            name: toolName,
            content: JSON.stringify({
              error: "Invalid JSON format in tool arguments.",
            }),
          });
          continue;
        }

        // 1. Check unsupported write tools
        if (toolRegistry.isUnsupportedWriteTool(toolName)) {
          logger.warn(
            { requestId, toolName },
            "[ToolLoop] Intercepted unsupported write tool call",
          );
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            name: toolName,
            content: JSON.stringify({
              error:
                "That action isn't available through the chatbot yet.",
            }),
          });
          continue;
        }

        // 2. Check tool exists
        const tool = toolRegistry.getTool(toolName);
        if (!tool) {
          logger.warn({ requestId, toolName }, "[ToolLoop] Unknown tool requested");
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            name: toolName,
            content: JSON.stringify({
              error: `Tool '${toolName}' is not recognized or permitted.`,
            }),
          });
          continue;
        }

        // 3. Hallucination / Entity reference guard
        if (
          (toolName === "get_event_details" ||
            toolName === "get_event_report" ||
            toolName === "publish_event" ||
            toolName === "complete_event" ||
            toolName === "close_event") &&
          parsedArgs.event_id
        ) {
          const isValid = entityContextService.validateEntityReference(
            String(parsedArgs.event_id),
            "EVENT",
            currentState,
            userPrompt,
            turnToolOutputs,
          );
          if (!isValid) {
            logger.warn(
              { requestId, eventId: parsedArgs.event_id },
              "[ToolLoop] Rejected hallucinated event UUID",
            );
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              name: toolName,
              content: JSON.stringify({
                error: `Entity reference rejected: Event ID '${parsedArgs.event_id}' was not found in active context or search results. Please search first.`,
              }),
            });
            continue;
          }
        }

        if (
          (toolName === "get_worker_details" ||
            toolName === "get_worker_history" ||
            toolName === "change_worker_category") &&
          parsedArgs.worker_id
        ) {
          const isValid = entityContextService.validateEntityReference(
            String(parsedArgs.worker_id),
            "WORKER",
            currentState,
            userPrompt,
            turnToolOutputs,
          );
          if (!isValid) {
            logger.warn(
              { requestId, workerId: parsedArgs.worker_id },
              "[ToolLoop] Rejected hallucinated worker UUID",
            );
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              name: toolName,
              content: JSON.stringify({
                error: `Entity reference rejected: Worker ID '${parsedArgs.worker_id}' was not found in active context or search results. Please search first.`,
              }),
            });
            continue;
          }
        }

        // 4. Execute tool
        const startTime = new Date();
        let executionStatus: "SUCCESS" | "ERROR" = "SUCCESS";
        let errorCode: string | null = null;
        let toolOutput: any = null;

        try {
          const result = await tool.execute(
            { gateway, actor, requestId, sessionId },
            parsedArgs,
          );
          toolOutput = result;
          if (!result.success) {
            executionStatus = "ERROR";
            errorCode = result.error?.code || "TOOL_ERROR";
          } else {
            // Write Intent Handling: Halt tool loop immediately!
            if (toolRegistry.isWriteIntentTool(toolName)) {
              const writeResult = result.data as WriteIntentResult;
              const endTime = new Date();
              const durationMs = endTime.getTime() - startTime.getTime();

              await traceRepo.recordToolExecution({
                requestId,
                sessionId,
                userId: actor.userId,
                toolName,
                argumentsRedacted: parsedArgs,
                status: "SUCCESS",
                startedAt: startTime,
                completedAt: endTime,
                durationMs,
                errorCode: null,
              });

              logger.info(
                {
                  requestId,
                  sessionId,
                  actionId: writeResult.action.id,
                  actionType: writeResult.action.actionType,
                },
                "[ToolLoop] Write intent proposed; halting tool loop for explicit admin confirmation",
              );

              return {
                finalContent: "",
                state: currentState,
                toolCallCount,
                totalTokens: totalPromptTokens + totalCompletionTokens,
                inputTokens: totalPromptTokens,
                outputTokens: totalCompletionTokens,
                model: lastModel,
                proposedAction: writeResult.action,
              };
            }

            // Update session state for read queries
            currentState = reduceSessionState(
              currentState,
              sessionId,
              toolName,
              parsedArgs,
              result.data,
            );
            turnToolOutputs.push(result.data);
          }
        } catch (err: any) {
          executionStatus = "ERROR";
          errorCode = err.code || "EXECUTION_EXCEPTION";
          toolOutput = {
            success: false,
            error: {
              code: errorCode,
              message: err.message || "Tool execution failed",
            },
          };
        }

        const endTime = new Date();
        const durationMs = endTime.getTime() - startTime.getTime();
        metrics.recordToolInvocation(
          toolName,
          durationMs,
          executionStatus === "SUCCESS",
        );

        // Record trace (arguments redacted)
        await traceRepo.recordToolExecution({
          requestId,
          sessionId,
          userId: actor.userId,
          toolName,
          argumentsRedacted: parsedArgs,
          status: executionStatus,
          startedAt: startTime,
          completedAt: endTime,
          durationMs,
          errorCode,
        });

        // Add tool output to conversation messages
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: toolName,
          content: JSON.stringify(toolOutput),
        });
      }
    }

    // Force final response if max tool calls reached
    const finalResp = await modelProvider.chat({
      messages,
      toolChoice: "none",
    });

    if (finalResp.usage) {
      totalPromptTokens += finalResp.usage.promptTokens || 0;
      totalCompletionTokens += finalResp.usage.completionTokens || 0;
    }

    return {
      finalContent:
        finalResp.content ||
        "I've completed my analysis with the available information.",
      state: currentState,
      toolCallCount,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      inputTokens: totalPromptTokens,
      outputTokens: totalCompletionTokens,
      model: finalResp.model || lastModel,
    };
  }
}

export const toolLoop = new ToolLoop(5);
