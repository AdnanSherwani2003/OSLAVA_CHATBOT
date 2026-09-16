import OpenAI from "openai";
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

export class OpenAIProvider implements ModelProvider {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (this.client) return this.client;
    const config = getConfig();
    if (!config.OPENAI_API_KEY) {
      throw new ModelUnavailableError("OPENAI_API_KEY is not configured.");
    }
    this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    return this.client;
  }

  async chat(options: ModelCompletionOptions): Promise<ModelCompletionResponse> {
    const config = getConfig();
    const client = this.getClient();
    const timeoutMs = options.timeoutMs ?? config.OPENAI_TIMEOUT_MS;

    const requestPayload: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: config.OPENAI_MODEL,
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
      max_tokens: options.maxTokens ?? config.OPENAI_MAX_OUTPUT_TOKENS,
    };

    if (options.tools && options.tools.length > 0) {
      requestPayload.tools = options.tools as OpenAI.Chat.ChatCompletionTool[];
      requestPayload.parallel_tool_calls = false;
      if (options.toolChoice) {
        requestPayload.tool_choice = options.toolChoice as OpenAI.Chat.ChatCompletionToolChoiceOption;
      }
    }

    const controller = new AbortController();
    const abortHandler = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", abortHandler);
      }
    }
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await client.chat.completions.create(requestPayload, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (options.signal) {
        options.signal.removeEventListener("abort", abortHandler);
      }

      const choice = response.choices?.[0];
      if (!choice) {
        throw new ModelInvalidResponseError("No completion choices returned by OpenAI.");
      }

      let content = choice.message?.content || null;
      if (content) {
        // Strip any unexpected reasoning or <think> tags
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
        model: response.model || requestPayload.model,
        provider: "openai",
        fallbackUsed: false,
      };
    } catch (err: any) {
      clearTimeout(timer);
      if (options.signal) {
        options.signal.removeEventListener("abort", abortHandler);
      }

      if (err.name === "AbortError" || err instanceof OpenAI.APIConnectionTimeoutError) {
        throw new ModelTimeoutError(`OpenAI request timed out after ${timeoutMs}ms.`);
      }

      if (err instanceof ModelInvalidResponseError) {
        throw err;
      }

      const status = err.status || err.statusCode;
      const isRateLimit = status === 429 || err instanceof OpenAI.RateLimitError;
      const isServerError =
        (status >= 500 && status < 600) || err instanceof OpenAI.InternalServerError;
      const isNetworkError =
        err instanceof OpenAI.APIConnectionError ||
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT" ||
        err.message?.includes("network") ||
        err.message?.includes("fetch failed");

      if (isRateLimit) {
        throw new ModelRateLimitedError("OpenAI rate limit exceeded.");
      }

      if (isServerError || isNetworkError) {
        throw new ModelUnavailableError(err.message || "OpenAI service unavailable.");
      }

      if (status === 401 || err instanceof OpenAI.AuthenticationError) {
        logger.error(
          { status, message: err.message },
          "[OpenAIProvider] Authentication failure. Check OPENAI_API_KEY configuration.",
        );
        throw new ModelUnavailableError("OpenAI authentication failed.");
      }

      throw new ModelUnavailableError(err.message || "OpenAI request failed.");
    }
  }
}

export const openAIProvider = new OpenAIProvider();
