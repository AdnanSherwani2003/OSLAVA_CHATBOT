import { Groq } from "groq-sdk";
import { getConfig } from "../config/env.js";
import {
  ModelInvalidResponseError,
  ModelRateLimitedError,
  ModelTimeoutError,
  ModelUnavailableError,
} from "../domain/errors.js";
import { logger } from "../observability/logger.js";
import {
  ModelCompletionOptions,
  ModelCompletionResponse,
  ModelProvider,
  ModelToolCall,
} from "./model.provider.js";

export class GroqProvider implements ModelProvider {
  private client: Groq | null = null;

  private getClient(): Groq {
    if (this.client) return this.client;
    const config = getConfig();
    if (!config.GROQ_API_KEY) {
      throw new ModelUnavailableError("GROQ_API_KEY is not configured.");
    }
    this.client = new Groq({ apiKey: config.GROQ_API_KEY });
    return this.client;
  }

  async chat(options: ModelCompletionOptions): Promise<ModelCompletionResponse> {
    const config = getConfig();
    const client = this.getClient();
    const timeoutMs = options.timeoutMs ?? config.GROQ_TIMEOUT_MS;

    const requestPayload: any = {
      model: config.GROQ_MODEL,
      messages: options.messages.map((m) => {
        const msg: any = {
          role: m.role,
          content: m.content,
        };
        if (m.name) msg.name = m.name;
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        if (m.tool_calls && m.tool_calls.length > 0) {
          msg.tool_calls = m.tool_calls.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          }));
        }
        return msg;
      }),
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? config.GROQ_MAX_OUTPUT_TOKENS,
    };

    if (options.tools && options.tools.length > 0) {
      requestPayload.tools = options.tools;
      requestPayload.parallel_tool_calls = false;
      if (options.toolChoice) {
        requestPayload.tool_choice = options.toolChoice;
      }
    }

    // Execute with 1 transient retry
    return this.executeWithRetry(client, requestPayload, timeoutMs);
  }

  private async executeWithRetry(
    client: Groq,
    payload: any,
    timeoutMs: number,
    retryCount = 0,
  ): Promise<ModelCompletionResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await client.chat.completions.create(payload, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      const choice = response.choices?.[0];
      if (!choice) {
        throw new ModelInvalidResponseError("No completion choices returned by model.");
      }

      let content = choice.message?.content || null;
      if (content) {
        // Strip any internal reasoning or <think> tags if model emits them
        content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      }

      const toolCalls: ModelToolCall[] = [];
      if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
        for (const tc of choice.message.tool_calls) {
          if (tc.type === "function" && tc.function) {
            toolCalls.push({
              id: tc.id,
              type: "function",
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            });
          }
        }
      }

      return {
        content: content || null,
        toolCalls,
        usage: {
          promptTokens: response.usage?.prompt_tokens,
          completionTokens: response.usage?.completion_tokens,
          totalTokens: response.usage?.total_tokens,
        },
        finishReason: choice.finish_reason || undefined,
        model: response.model || payload.model,
      };
    } catch (err: any) {
      clearTimeout(timer);

      if (err.name === "AbortError") {
        throw new ModelTimeoutError(`AI model request timed out after ${timeoutMs}ms.`);
      }

      const status = err.status || err.statusCode;
      const isRateLimit = status === 429;
      const isServerError = status >= 500 && status < 600;
      const isNetworkError =
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT" ||
        err.message?.includes("network");

      if ((isRateLimit || isServerError || isNetworkError) && retryCount === 0) {
        logger.warn(
          { err, status, retryCount },
          "[GroqProvider] Transient failure, retrying once...",
        );
        const delay = isRateLimit ? 1200 : 500;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeWithRetry(client, payload, timeoutMs, 1);
      }

      if (isRateLimit) {
        throw new ModelRateLimitedError();
      }

      if (isServerError || isNetworkError) {
        throw new ModelUnavailableError(err.message || "Model provider unavailable.");
      }

      throw err;
    }
  }
}

export const groqProvider = new GroqProvider();
