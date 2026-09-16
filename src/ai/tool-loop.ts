import { OslavaGateway } from "../integrations/supabase/oslava.gateway.js";
import { ActorContext } from "../auth/actor-context.js";
import { SessionState } from "../context/context.types.js";
import { entityContextService } from "../context/entity-context.service.js";
import { reduceSessionState } from "../context/context.reducer.js";
import { ITraceRepository } from "../persistence/repositories/trace.repository.js";
import { logger } from "../observability/logger.js";
import { metrics } from "../observability/metrics.js";
import { getConfig } from "../config/env.js";
import { ModelTimeoutError } from "../domain/errors.js";
import {
  ModelMessage,
  ModelProvider,
} from "./model.provider.js";
import { toolRegistry } from "./tool-registry.js";
import { PendingActionRecord } from "../actions/action.types.js";
import { WriteIntentResult } from "../tools/tool.types.js";
import { TurnPlan, turnPlanner } from "./turn-planner.js";

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
  turnPlan?: TurnPlan;
  turnDeadline?: number;
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
  provider?: string;
  fallbackUsed?: boolean;
}

function getToolSignature(toolName: string, args: Record<string, unknown>): string {
  const sortedKeys = Object.keys(args).sort();
  const canonical: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    canonical[k] = args[k];
  }
  return `${toolName}:${JSON.stringify(canonical)}`;
}

export class ToolLoop {
  private readonly defaultMaxToolCalls: number;

  constructor(defaultMaxToolCalls = 8) {
    this.defaultMaxToolCalls = defaultMaxToolCalls;
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
      turnPlan,
      turnDeadline,
    } = params;

    const config = getConfig();
    const maxToolCalls = params.maxToolCalls || this.defaultMaxToolCalls;
    let currentState = params.state;
    let toolCallCount = 0;
    const turnToolOutputs: any[] = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let lastModel = "unknown";
    const providersUsed = new Set<string>();
    let fallbackOccurred = false;

    // Track executed tools and cache successful read tool outputs for deduplication
    const readToolCache = new Map<string, any>();
    const executedToolNames: string[] = [];
    let omissionRecoveryAttempts = 0;
    const maxOmissionRecoveryAttempts = 2;

    const resolveProvider = (): string => {
      if (fallbackOccurred || providersUsed.size > 1) {
        return "openai->groq";
      }
      if (providersUsed.has("groq")) {
        return "groq";
      }
      if (providersUsed.has("openai")) {
        return "openai";
      }
      return "openai";
    };

    const toolDefinitions = toolRegistry.getToolDefinitions();

    while (toolCallCount < maxToolCalls) {
      // Bounded turn deadline check before model call
      const remainingTurnMs = turnDeadline ? turnDeadline - Date.now() : config.CHAT_TURN_TIMEOUT_MS;
      if (remainingTurnMs < 2000) {
        metrics.recordChatTurnTimeout();
        logger.error(
          { requestId, sessionId, remainingTurnMs },
          "[ToolLoop] Chat turn deadline exceeded before model call; terminating turn",
        );
        throw new ModelTimeoutError(`Chat turn deadline exceeded (${Math.max(0, remainingTurnMs)}ms remaining).`);
      }

      const modelTimeoutMs = Math.min(config.OPENAI_TIMEOUT_MS, remainingTurnMs);

      const modelCallStart = Date.now();
      const response = await modelProvider.chat({
        messages,
        tools: toolDefinitions,
        toolChoice: "auto",
        timeoutMs: modelTimeoutMs,
      });
      metrics.recordModelCall(Date.now() - modelCallStart);

      lastModel = response.model;
      if (response.provider) {
        providersUsed.add(response.provider);
      }
      if (response.fallbackUsed) {
        fallbackOccurred = true;
      }
      if (response.usage) {
        totalPromptTokens += response.usage.promptTokens || 0;
        totalCompletionTokens += response.usage.completionTokens || 0;
      }

      // If model produced no tool calls, verify completeness
      if (!response.toolCalls || response.toolCalls.length === 0) {
        if (turnPlan && omissionRecoveryAttempts < maxOmissionRecoveryAttempts) {
          const completeness = turnPlanner.validateTurnCompleteness(
            turnPlan,
            executedToolNames,
            currentState,
            response.content || "",
          );

          if (!completeness.isComplete && completeness.missingTool) {
            omissionRecoveryAttempts++;
            metrics.recordToolOmissionPrevented();
            logger.warn(
              {
                requestId,
                sessionId,
                missingTool: completeness.missingTool,
                omissionRecoveryAttempts,
              },
              "[ToolLoop] Intercepted premature response with missing tool objective; re-prompting model",
            );

            // Append assistant draft and deterministic reminder
            messages.push({
              role: "assistant",
              content: response.content || null,
            });
            messages.push({
              role: "user",
              content:
                completeness.instruction ||
                `[System: You must call tool '${completeness.missingTool}' before providing your final response.]`,
            });
            continue;
          }
        }

        return {
          finalContent: response.content || "",
          state: currentState,
          toolCallCount,
          totalTokens: totalPromptTokens + totalCompletionTokens,
          inputTokens: totalPromptTokens,
          outputTokens: totalCompletionTokens,
          model: lastModel,
          provider: resolveProvider(),
          fallbackUsed: fallbackOccurred,
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
        if (toolCallCount >= maxToolCalls) {
          logger.warn(
            { requestId, sessionId, toolCallCount },
            "[ToolLoop] Max tool calls reached; terminating loop.",
          );
          break;
        }

        toolCallCount++;
        metrics.recordToolPlanRecovery();
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
              error: `Tool '${toolName}' is not recognized or permitted. Available tools: ${toolRegistry.getToolDefinitions().map((t) => t.function.name).join(", ")}`,
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

        // 4. Duplicate Tool Execution Check (Read Tools)
        const isRead = toolRegistry.isReadTool(toolName);
        const sig = isRead ? getToolSignature(toolName, parsedArgs) : null;

        if (sig && readToolCache.has(sig)) {
          logger.info(
            { requestId, toolName, sig },
            "[ToolLoop] Reusing cached read tool output to prevent duplicate execution",
          );
          const cachedResult = readToolCache.get(sig);
          executedToolNames.push(toolName);

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            name: toolName,
            content: JSON.stringify(cachedResult),
          });
          continue;
        }

        // 5. Execute tool with bounded timeout
        const startTime = new Date();
        let executionStatus: "SUCCESS" | "ERROR" = "SUCCESS";
        let errorCode: string | null = null;
        let toolOutput: any = null;

        const remainingForTool = turnDeadline
          ? turnDeadline - Date.now()
          : config.TOOL_EXECUTION_TIMEOUT_MS;
        const toolTimeoutMs = Math.min(
          config.TOOL_EXECUTION_TIMEOUT_MS,
          Math.max(1000, remainingForTool),
        );

        try {
          const toolPromise = tool.execute(
            { gateway, actor, requestId, sessionId },
            parsedArgs,
          );

          let timeoutHandle: NodeJS.Timeout;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(new ModelTimeoutError(`Tool '${toolName}' timed out after ${toolTimeoutMs}ms`));
            }, toolTimeoutMs);
          });

          const result = await Promise.race([toolPromise, timeoutPromise]).finally(() => {
            clearTimeout(timeoutHandle);
          });

          toolOutput = result;
          if (!result.success) {
            executionStatus = "ERROR";
            errorCode = result.error?.code || "TOOL_ERROR";
          } else {
            executedToolNames.push(toolName);
            if (sig) {
              readToolCache.set(sig, result);
            }

            // Write Intent Handling: Halt tool loop immediately!
            if (toolRegistry.isWriteIntentTool(toolName)) {
              const writeResult = result.data as WriteIntentResult;
              const endTime = new Date();
              const durationMs = endTime.getTime() - startTime.getTime();

              // Telemetry write is isolated from execution outcome
              try {
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
              } catch (traceErr: any) {
                logger.error(
                  { traceErr, requestId, sessionId, toolName },
                  "[ToolLoop] Failed to record tool execution trace for write intent (isolated)",
                );
              }

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
                provider: resolveProvider(),
                fallbackUsed: fallbackOccurred,
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
          if (err instanceof ModelTimeoutError || err.name === "AbortError" || err.message?.includes("timed out")) {
            errorCode = "TOOL_TIMEOUT";
            metrics.recordToolTimeout(toolName);
          }
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

        // Record trace (isolated)
        try {
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
        } catch (traceErr: any) {
          logger.error(
            { traceErr, requestId, sessionId, toolName },
            "[ToolLoop] Failed to record tool execution trace (isolated)",
          );
        }

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
    const remainingFinalMs = turnDeadline ? turnDeadline - Date.now() : config.CHAT_TURN_TIMEOUT_MS;
    const finalResp = await modelProvider.chat({
      messages,
      toolChoice: "none",
      timeoutMs: Math.min(config.OPENAI_TIMEOUT_MS, Math.max(1000, remainingFinalMs)),
    });

    if (finalResp.provider) {
      providersUsed.add(finalResp.provider);
    }
    if (finalResp.fallbackUsed) {
      fallbackOccurred = true;
    }

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
      provider: resolveProvider(),
      fallbackUsed: fallbackOccurred,
    };
  }
}

export const toolLoop = new ToolLoop(8);
