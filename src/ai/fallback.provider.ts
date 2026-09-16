import { getConfig } from "../config/env.js";
import {
  ModelInvalidResponseError,
  ModelRateLimitedError,
  ModelTimeoutError,
  ModelUnavailableError,
} from "../domain/errors.js";
import { logger } from "../observability/logger.js";
import { metrics } from "../observability/metrics.js";
import {
  ModelCompletionOptions,
  ModelCompletionResponse,
  ModelProvider,
} from "./model.provider.js";
import { openAIProvider, OpenAIProvider } from "./openai.provider.js";
import { groqProvider, GroqProvider } from "./groq.provider.js";

export interface FallbackProviderOptions {
  primaryName?: string;
  fallbackName?: string;
}

export class FallbackModelProvider implements ModelProvider {
  private readonly primaryName: string;
  private readonly fallbackName: string;

  constructor(
    private readonly primaryProvider: ModelProvider = openAIProvider,
    private readonly fallbackProvider: ModelProvider = groqProvider,
    options?: FallbackProviderOptions,
  ) {
    this.primaryName = options?.primaryName || "openai";
    this.fallbackName = options?.fallbackName || "groq";
  }

  async chat(options: ModelCompletionOptions): Promise<ModelCompletionResponse> {
    const config = getConfig();

    // If configuration designates Groq as primary, route directly to fallback
    if (config.AI_PRIMARY_PROVIDER === "groq") {
      const start = Date.now();
      try {
        const res = await this.fallbackProvider.chat(options);
        metrics.recordModelCallByProvider(this.fallbackName, Date.now() - start);
        return {
          ...res,
          provider: res.provider || this.fallbackName,
          fallbackUsed: false,
        };
      } catch (err: any) {
        metrics.recordModelCallByProvider(this.fallbackName, Date.now() - start);
        metrics.recordProviderError(this.fallbackName, err.code || err.name || "UNKNOWN_ERROR");
        throw err;
      }
    }

    const primaryStart = Date.now();
    try {
      const response = await this.primaryProvider.chat(options);
      metrics.recordModelCallByProvider(this.primaryName, Date.now() - primaryStart);
      return {
        ...response,
        provider: response.provider || this.primaryName,
        fallbackUsed: false,
      };
    } catch (err: any) {
      const primaryDurationMs = Date.now() - primaryStart;
      metrics.recordModelCallByProvider(this.primaryName, primaryDurationMs);
      metrics.recordProviderError(this.primaryName, err.code || err.name || "UNKNOWN_ERROR");

      const fallbackEnabled =
        config.AI_FALLBACK_ENABLED && config.AI_FALLBACK_PROVIDER !== "none";

      const isEligibleProviderFailure =
        err instanceof ModelUnavailableError ||
        err instanceof ModelTimeoutError ||
        err instanceof ModelRateLimitedError ||
        err instanceof ModelInvalidResponseError ||
        err.code === "MODEL_UNAVAILABLE" ||
        err.code === "MODEL_TIMEOUT" ||
        err.code === "MODEL_RATE_LIMITED" ||
        err.code === "MODEL_INVALID_RESPONSE";

      if (!fallbackEnabled || !isEligibleProviderFailure) {
        throw err;
      }

      // Calculate remaining budget for fallback
      let fallbackTimeoutMs = config.GROQ_TIMEOUT_MS;
      if (options.timeoutMs !== undefined) {
        fallbackTimeoutMs = Math.min(fallbackTimeoutMs, options.timeoutMs - primaryDurationMs);
      }

      if (fallbackTimeoutMs < 2000) {
        logger.warn(
          { remainingBudgetMs: fallbackTimeoutMs, primaryProvider: this.primaryName },
          "[FallbackModelProvider] Insufficient turn budget remaining for fallback; failing fast",
        );
        throw err;
      }

      logger.warn(
        {
          primaryProvider: this.primaryName,
          fallbackProvider: this.fallbackName,
          primaryErrorCode: err.code || err.name,
          fallbackReason: err.message,
          fallbackTimeoutMs,
        },
        "[FallbackModelProvider] Primary AI provider failed; falling back to secondary provider",
      );

      metrics.recordFallbackActivation(this.primaryName, this.fallbackName);

      const fallbackStart = Date.now();
      try {
        const fallbackResponse = await this.fallbackProvider.chat({
          ...options,
          timeoutMs: fallbackTimeoutMs,
        });
        metrics.recordModelCallByProvider(this.fallbackName, Date.now() - fallbackStart);
        return {
          ...fallbackResponse,
          provider: fallbackResponse.provider || this.fallbackName,
          fallbackUsed: true,
        };
      } catch (fallbackErr: any) {
        const fallbackDurationMs = Date.now() - fallbackStart;
        metrics.recordModelCallByProvider(this.fallbackName, fallbackDurationMs);
        metrics.recordProviderError(
          this.fallbackName,
          fallbackErr.code || fallbackErr.name || "UNKNOWN_ERROR",
        );
        logger.error(
          {
            primaryProvider: this.primaryName,
            fallbackProvider: this.fallbackName,
            fallbackErrorCode: fallbackErr.code || fallbackErr.name,
            fallbackErrorMessage: fallbackErr.message,
          },
          "[FallbackModelProvider] Fallback AI provider also failed",
        );
        throw fallbackErr;
      }
    }
  }
}

export const defaultModelProvider = new FallbackModelProvider();
