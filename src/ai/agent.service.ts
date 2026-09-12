import { OslavaGateway } from "../integrations/supabase/oslava.gateway.js";
import { ActorContext } from "../auth/actor-context.js";
import { getConfig } from "../config/env.js";
import {
  conversationService,
  ConversationService,
} from "../context/conversation.service.js";
import { SessionState } from "../context/context.types.js";
import { ModelMessage, ModelProvider } from "./model.provider.js";
import { groqProvider } from "./groq.provider.js";
import { buildSystemPrompt } from "./prompts/system.prompt.js";
import { TOOL_POLICY_PROMPT } from "./prompts/tool-policy.prompt.js";
import { toolLoop, ToolLoop } from "./tool-loop.js";
import {
  AgentResponse,
  buildConfirmationRequiredResponse,
  buildStandardResponse,
} from "./response-builder.js";
import { logger } from "../observability/logger.js";
import { metrics } from "../observability/metrics.js";
import {
  actionConfirmationService,
  ActionConfirmationService,
} from "../actions/action-confirmation.service.js";

import { randomUUID } from "node:crypto";

export interface UserTurnParams {
  sessionId: string;
  userPrompt: string;
  requestId: string;
  gateway: OslavaGateway;
  actor: ActorContext;
}

export interface UserTurnResult {
  response: AgentResponse;
  state: SessionState | null;
  messageId: string;
}

export interface ExecuteAgentRequestParams {
  prompt: string;
  gateway: OslavaGateway;
  actor: ActorContext;
  requestId?: string;
  maxToolCalls?: number;
}

export interface ExecuteAgentRequestResult {
  content: string;
  toolCallCount: number;
  model: string;
}

export class AgentService {
  constructor(
    private readonly modelProvider: ModelProvider = groqProvider,
    private readonly convService: ConversationService = conversationService,
    private readonly loop: ToolLoop = toolLoop,
    private readonly actionConfirmation: ActionConfirmationService = actionConfirmationService,
  ) {}

  async executeRequest(
    params: ExecuteAgentRequestParams,
  ): Promise<ExecuteAgentRequestResult> {
    const {
      prompt,
      gateway,
      actor,
      requestId = randomUUID(),
      maxToolCalls = 5,
    } = params;
    const systemInstruction = `${buildSystemPrompt(null)}\n\n${TOOL_POLICY_PROMPT}`;
    const messages: ModelMessage[] = [
      { role: "system", content: systemInstruction },
      { role: "user", content: prompt },
    ];

    const loopResult = await this.loop.run({
      modelProvider: this.modelProvider,
      messages,
      state: null,
      userPrompt: prompt,
      gateway,
      actor,
      requestId,
      sessionId: "direct-request",
      traceRepo: this.convService.traceRepository,
      maxToolCalls,
    });

    return {
      content: loopResult.finalContent,
      toolCallCount: loopResult.toolCallCount,
      model: loopResult.model,
    };
  }

  async executeUserTurn(params: UserTurnParams): Promise<UserTurnResult> {
    const { sessionId, userPrompt, requestId, gateway, actor } = params;
    const userId = actor.userId;
    const startTime = Date.now();
    const config = getConfig();
    metrics.recordChatTurn();

    // 1. Verify access
    await this.convService.verifySessionAccess(sessionId, userId);

    // 2. Fetch existing state, history, and active pending action
    let state = await this.convService.getState(sessionId);
    const historyLimit = config.CHAT_HISTORY_MESSAGE_LIMIT;
    const history = await this.convService.getRecentHistory(
      sessionId,
      historyLimit,
    );
    const activePendingAction =
      await this.actionConfirmation.getActivePendingActionForSession(sessionId);

    // 3. Persist user message
    await this.convService.appendMessage(
      sessionId,
      requestId,
      "USER",
      userPrompt,
    );

    // 4. Assemble model messages
    const systemInstruction = `${buildSystemPrompt(state, activePendingAction)}\n\n${TOOL_POLICY_PROMPT}`;
    const messages: ModelMessage[] = [
      {
        role: "system",
        content: systemInstruction,
      },
    ];

    for (const h of history) {
      if (h.role === "USER") {
        messages.push({ role: "user", content: h.content });
      } else if (h.role === "ASSISTANT") {
        messages.push({ role: "assistant", content: h.content });
      }
    }

    // Append current user message
    messages.push({
      role: "user",
      content: userPrompt,
    });

    // 5. Run tool loop
    let outcome = "SUCCESS";
    let loopResult;

    try {
      loopResult = await this.loop.run({
        modelProvider: this.modelProvider,
        messages,
        state,
        userPrompt,
        gateway,
        actor,
        requestId,
        sessionId,
        traceRepo: this.convService.traceRepository,
      });
    } catch (err: any) {
      outcome = err.code || "AGENT_ERROR";
      logger.error(
        { err, requestId, sessionId },
        "[AgentService] Tool loop failed",
      );
      throw err;
    } finally {
      const durationMs = Date.now() - startTime;
      await this.convService.traceRepository.recordChatTrace({
        requestId,
        sessionId,
        userId,
        provider: "groq",
        model: loopResult?.model || config.GROQ_MODEL,
        reasoningEffort: config.GROQ_REASONING_EFFORT,
        toolCallCount: loopResult?.toolCallCount || 0,
        inputTokens: loopResult?.inputTokens,
        outputTokens: loopResult?.outputTokens,
        durationMs,
        outcome,
      });
    }

    // 6. Update session state
    if (loopResult.state) {
      state = await this.convService.saveState(loopResult.state);
    }

    // 7. Handle proposed write action (deterministic confirmation required response)
    if (loopResult.proposedAction) {
      const confirmationResponse = buildConfirmationRequiredResponse(
        loopResult.proposedAction,
      );

      const assistantMsg = await this.convService.appendMessage(
        sessionId,
        requestId,
        "ASSISTANT",
        confirmationResponse.content,
      );

      return {
        response: confirmationResponse,
        state,
        messageId: assistantMsg.id,
      };
    }

    // 8. Persist assistant standard response
    const assistantMsg = await this.convService.appendMessage(
      sessionId,
      requestId,
      "ASSISTANT",
      loopResult.finalContent,
    );

    const response: AgentResponse = buildStandardResponse(
      loopResult.finalContent,
    );

    return {
      response,
      state,
      messageId: assistantMsg.id,
    };
  }
}

export const agentService = new AgentService();
