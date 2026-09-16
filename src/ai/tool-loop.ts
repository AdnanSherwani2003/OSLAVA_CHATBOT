import { OslavaGateway } from "../integrations/supabase/oslava.gateway.js";
import { ActorContext } from "../auth/actor-context.js";
import { SessionState } from "../context/context.types.js";
import { entityContextService } from "../context/entity-context.service.js";
import { reduceSessionState } from "../context/context.reducer.js";
import { ITraceRepository } from "../persistence/repositories/trace.repository.js";
import { logger } from "../observability/logger.js";
import { metrics } from "../observability/metrics.js";
import { getConfig } from "../config/env.js";
import { ModelInvalidResponseError, ModelTimeoutError } from "../domain/errors.js";
import {
  ModelMessage,
  ModelProvider,
} from "./model.provider.js";
import { toolRegistry } from "./tool-registry.js";
import { PendingActionRecord } from "../actions/action.types.js";
import { WriteIntentResult } from "../tools/tool.types.js";
import {
  TurnPlan,
  turnPlanner,
  buildSynthesisInstruction,
  buildResynthesisInstruction,
  validateResponseCoverage,
} from "./turn-planner.js";
import { type V1ToolName } from "./v1-manifest.js";

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
    const rejectedOutOfPlanTools: string[] = [];
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

    // Filter tools to allowed turn tools if specified by TurnPlan (Requirement 8 & 9)
    let toolDefinitions = toolRegistry.getToolDefinitions();
    if (turnPlan && turnPlan.allowedTools) {
      const allowedSet = new Set<string>(turnPlan.allowedTools);
      toolDefinitions = toolDefinitions.filter((td) => allowedSet.has(td.function.name));
    }
    const hasTools = toolDefinitions.length > 0;

    const checkAndSynthesizeResponse = async (
      initialDraft?: string,
    ): Promise<ToolLoopResult> => {
      let candidateDraft = initialDraft;
      let resynthesisAttempts = 0;
      const maxResynthesisAttempts = 1;

      // If no initial draft was provided, run the dedicated final synthesis phase with toolChoice = "none" (Requirement 2)
      if (!candidateDraft) {
        if (turnPlan?.requiredResponseObjectives && turnPlan.requiredResponseObjectives.length > 0) {
          messages.push({
            role: "user",
            content: buildSynthesisInstruction(turnPlan.requiredResponseObjectives),
          });
        }

        const remainingMs = turnDeadline ? turnDeadline - Date.now() : config.CHAT_TURN_TIMEOUT_MS;
        if (remainingMs < 2000) {
          metrics.recordChatTurnTimeout();
          throw new ModelTimeoutError(`Chat turn deadline exceeded (${Math.max(0, remainingMs)}ms remaining).`);
        }

        const synthCallStart = Date.now();
        const synthResp = await modelProvider.chat({
          messages,
          toolChoice: "none",
          timeoutMs: Math.min(config.OPENAI_TIMEOUT_MS, Math.max(1000, remainingMs)),
        });
        metrics.recordModelCall(Date.now() - synthCallStart);

        candidateDraft = synthResp.content || "";
        lastModel = synthResp.model || lastModel;
        if (synthResp.provider) providersUsed.add(synthResp.provider);
        if (synthResp.fallbackUsed) fallbackOccurred = true;
        if (synthResp.usage) {
          totalPromptTokens += synthResp.usage.promptTokens || 0;
          totalCompletionTokens += synthResp.usage.completionTokens || 0;
        }
      }

      // If no required response objectives (e.g. conversational / confirmation), accept draft directly
      if (!turnPlan?.requiredResponseObjectives || turnPlan.requiredResponseObjectives.length === 0) {
        logger.info(
          {
            requestId,
            sessionId,
            plannedObjectives: turnPlan?.objectives || [],
            requiredTools: turnPlan?.requiredReadTools || [],
            allowedTools: turnPlan?.allowedTools || [],
            executedTools: executedToolNames,
            rejectedOutOfPlanTools,
          },
          "[ToolLoop] Turn execution complete (no response objectives required)",
        );

        return {
          finalContent: candidateDraft || "",
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

      // Validate response coverage (Requirement 3)
      let coverage = validateResponseCoverage(
        turnPlan.requiredResponseObjectives,
        candidateDraft || "",
      );

      // If coverage is incomplete, allow exactly 1 bounded resynthesis attempt (Requirement 4 & 5)
      if (!coverage.isCovered && resynthesisAttempts < maxResynthesisAttempts) {
        resynthesisAttempts++;
        metrics.recordResponseCoverageRecovery();
        logger.warn(
          {
            requestId,
            sessionId,
            requiredResponseObjectives: turnPlan.requiredResponseObjectives,
            coveredResponseObjectives: coverage.coveredObjectives,
            missingResponseObjectives: coverage.missingObjectives,
            responseResynthesisAttempts: resynthesisAttempts,
          },
          "[ToolLoop] Response coverage incomplete; attempting bounded resynthesis",
        );

        messages.push({
          role: "assistant",
          content: candidateDraft || null,
        });
        messages.push({
          role: "user",
          content: buildResynthesisInstruction(
            turnPlan.requiredResponseObjectives,
            coverage.missingObjectives,
          ),
        });

        const remainingMs = turnDeadline ? turnDeadline - Date.now() : config.CHAT_TURN_TIMEOUT_MS;
        if (remainingMs < 2000) {
          metrics.recordChatTurnTimeout();
          throw new ModelTimeoutError(`Chat turn deadline exceeded (${Math.max(0, remainingMs)}ms remaining).`);
        }

        const retryCallStart = Date.now();
        const retryResp = await modelProvider.chat({
          messages,
          toolChoice: "none",
          timeoutMs: Math.min(config.OPENAI_TIMEOUT_MS, Math.max(1000, remainingMs)),
        });
        metrics.recordModelCall(Date.now() - retryCallStart);

        candidateDraft = retryResp.content || "";
        lastModel = retryResp.model || lastModel;
        if (retryResp.provider) providersUsed.add(retryResp.provider);
        if (retryResp.fallbackUsed) fallbackOccurred = true;
        if (retryResp.usage) {
          totalPromptTokens += retryResp.usage.promptTokens || 0;
          totalCompletionTokens += retryResp.usage.completionTokens || 0;
        }

        coverage = validateResponseCoverage(
          turnPlan.requiredResponseObjectives,
          candidateDraft || "",
        );
      }

      // If STILL incomplete after retry: FAIL CLOSED (Requirement 4 & 9)
      if (!coverage.isCovered) {
        metrics.recordResponseCoverageFailure();
        logger.error(
          {
            requestId,
            sessionId,
            requiredResponseObjectives: turnPlan.requiredResponseObjectives,
            coveredResponseObjectives: coverage.coveredObjectives,
            missingResponseObjectives: coverage.missingObjectives,
            responseResynthesisAttempts: resynthesisAttempts,
          },
          "[ToolLoop] Response coverage incomplete after bounded resynthesis; failing closed",
        );
        throw new ModelInvalidResponseError(
          `AI model response omitted required user-facing objectives: ${coverage.missingObjectives.join(", ")}.`,
        );
      }

      // Complete! Log safe structured turn summary (Requirement 13)
      logger.info(
        {
          requestId,
          sessionId,
          plannedObjectives: turnPlan.objectives,
          requiredTools: turnPlan.requiredReadTools,
          allowedTools: turnPlan.allowedTools,
          executedTools: executedToolNames,
          rejectedOutOfPlanTools,
          requiredResponseObjectives: turnPlan.requiredResponseObjectives,
          coveredResponseObjectives: coverage.coveredObjectives,
          missingResponseObjectives: coverage.missingObjectives,
          responseResynthesisAttempts: resynthesisAttempts,
        },
        "[ToolLoop] Turn execution complete",
      );

      return {
        finalContent: candidateDraft || "",
        state: currentState,
        toolCallCount,
        totalTokens: totalPromptTokens + totalCompletionTokens,
        inputTokens: totalPromptTokens,
        outputTokens: totalCompletionTokens,
        model: lastModel,
        provider: resolveProvider(),
        fallbackUsed: fallbackOccurred,
      };
    };

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
        tools: hasTools ? toolDefinitions : undefined,
        toolChoice: hasTools ? "auto" : undefined,
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
        if (turnPlan) {
          const completeness = turnPlanner.validateTurnCompleteness(
            turnPlan,
            executedToolNames,
            currentState,
            response.content || "",
          );

          if (!completeness.isComplete) {
            if (omissionRecoveryAttempts < maxOmissionRecoveryAttempts && completeness.missingTool) {
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

            // Bounded recovery attempts exhausted and plan is STILL incomplete!
            // Requirement 5: MUST FAIL CLOSED!
            logger.error(
              {
                requestId,
                sessionId,
                missingObjective: completeness.missingObjective,
                missingTool: completeness.missingTool,
                omissionRecoveryAttempts,
                executedTools: executedToolNames,
              },
              "[ToolLoop] Required TurnPlan objectives unsatisfied after recovery; failing closed",
            );
            throw new ModelInvalidResponseError(
              `AI model failed to complete required objective '${completeness.missingObjective}' (${completeness.missingTool}).`,
            );
          }
        }

        return await checkAndSynthesizeResponse(response.content || "");
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

        // 0. Check TurnPlan Tool Allowlist (Requirement 8 & 9)
        if (turnPlan?.allowedTools && !turnPlan.allowedTools.includes(toolName as V1ToolName)) {
          rejectedOutOfPlanTools.push(toolName);
          logger.warn(
            { requestId, sessionId, toolName, allowedTools: turnPlan.allowedTools },
            "[ToolLoop] Intercepted out-of-plan tool call not permitted by TurnPlan; rejecting before execution",
          );
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            name: toolName,
            content: JSON.stringify({
              error: `Tool '${toolName}' is not permitted for the current request. Allowed tools: ${turnPlan.allowedTools.join(", ")}`,
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
        executedToolNames.push(toolName);
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

      // Dedicated Final Synthesis Trigger (Requirement 2):
      // If all required read tools have executed, run dedicated final synthesis phase with toolChoice = "none"
      const allRequiredReadToolsExecuted = Boolean(
        turnPlan &&
          turnPlan.requiredReadTools.length > 0 &&
          turnPlan.requiredReadTools.every((t) => executedToolNames.includes(t)),
      );

      if (
        allRequiredReadToolsExecuted &&
        turnPlan?.requiredResponseObjectives &&
        turnPlan.requiredResponseObjectives.length > 0
      ) {
        return await checkAndSynthesizeResponse();
      }
    }

    // Force final response if max tool calls reached
    // Requirement 6: MAX TOOL LIMIT MUST NOT BYPASS PLAN
    if (turnPlan) {
      const completeness = turnPlanner.validateTurnCompleteness(
        turnPlan,
        executedToolNames,
        currentState,
        "",
      );
      if (!completeness.isComplete) {
        logger.error(
          {
            requestId,
            sessionId,
            missingObjective: completeness.missingObjective,
            missingTool: completeness.missingTool,
            toolCallCount,
            executedTools: executedToolNames,
          },
          "[ToolLoop] Max tool limit reached with incomplete plan; failing closed",
        );
        throw new ModelInvalidResponseError(
          `Max tool execution limit reached before completing required objective '${completeness.missingObjective}' (${completeness.missingTool}).`,
        );
      }
    }

    return await checkAndSynthesizeResponse();
  }
}

export const toolLoop = new ToolLoop(8);
