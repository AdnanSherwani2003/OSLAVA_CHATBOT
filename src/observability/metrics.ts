/**
 * Lightweight in-memory metrics registry for Oslava Admin AI Chatbot.
 * Provides operational visibility into HTTP traffic, LLM latency, tool usage,
 * and confirmation lifecycles without heavy external dependencies.
 */

export interface LatencySummary {
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}

export class MetricsRegistry {
  private httpRequestsCount = 0;
  private httpErrorsCount = 0;
  private chatTurnsCount = 0;
  private modelCallsCount = 0;

  private modelDurations: number[] = [];
  private openaiModelCallsCount = 0;
  private groqModelCallsCount = 0;
  private fallbackActivationsCount = 0;
  private primaryProviderFailuresCount = 0;
  private fallbackProviderFailuresCount = 0;
  private toolCallsTotal = 0;
  private toolPlanRecoveryTotal = 0;
  private toolOmissionPreventedTotal = 0;
  private responseCoverageRecoveryTotal = 0;
  private responseCoverageFailureTotal = 0;
  private chatTurnTimeoutsTotal = 0;
  private toolTimeoutsTotal = 0;
  private toolInvocations = new Map<string, { count: number; success: number; failed: number; totalMs: number }>();
  private actionsProposed = new Map<string, number>();
  private actionsConfirmed = new Map<string, number>();
  private actionsCancelled = new Map<string, number>();
  private actionsStale = new Map<string, number>();
  private providerErrors = new Map<string, number>();

  public reset(): void {
    this.httpRequestsCount = 0;
    this.httpErrorsCount = 0;
    this.chatTurnsCount = 0;
    this.modelCallsCount = 0;
    this.openaiModelCallsCount = 0;
    this.groqModelCallsCount = 0;
    this.fallbackActivationsCount = 0;
    this.primaryProviderFailuresCount = 0;
    this.fallbackProviderFailuresCount = 0;
    this.toolCallsTotal = 0;
    this.toolPlanRecoveryTotal = 0;
    this.toolOmissionPreventedTotal = 0;
    this.responseCoverageRecoveryTotal = 0;
    this.responseCoverageFailureTotal = 0;
    this.chatTurnTimeoutsTotal = 0;
    this.toolTimeoutsTotal = 0;
    this.modelDurations = [];
    this.toolInvocations.clear();
    this.actionsProposed.clear();
    this.actionsConfirmed.clear();
    this.actionsCancelled.clear();
    this.actionsStale.clear();
    this.providerErrors.clear();
  }

  public recordHttpRequest(_method: string, _route: string, statusCode: number): void {
    this.httpRequestsCount++;
    if (statusCode >= 400) {
      this.httpErrorsCount++;
    }
  }

  public recordHttpError(_route: string, _errorCode: string): void {
    this.httpErrorsCount++;
  }

  public recordChatTurn(): void {
    this.chatTurnsCount++;
  }

  public recordModelCall(durationMs: number): void {
    this.modelCallsCount++;
    this.modelDurations.push(durationMs);
    if (this.modelDurations.length > 500) {
      this.modelDurations.shift();
    }
  }

  public recordModelCallByProvider(provider: string, _durationMs?: number): void {
    if (provider === "openai") {
      this.openaiModelCallsCount++;
    } else if (provider === "groq") {
      this.groqModelCallsCount++;
    }
  }

  public recordFallbackActivation(_primary: string, _fallback: string): void {
    this.fallbackActivationsCount++;
  }

  public recordToolInvocation(toolName: string, durationMs: number, success: boolean): void {
    const entry = this.toolInvocations.get(toolName) || {
      count: 0,
      success: 0,
      failed: 0,
      totalMs: 0,
    };
    entry.count++;
    if (success) {
      entry.success++;
    } else {
      entry.failed++;
    }
    entry.totalMs += durationMs;
    this.toolInvocations.set(toolName, entry);
  }

  public recordToolPlanRecovery(): void {
    this.toolPlanRecoveryTotal++;
  }

  public recordToolOmissionPrevented(): void {
    this.toolOmissionPreventedTotal++;
  }

  public recordResponseCoverageRecovery(): void {
    this.responseCoverageRecoveryTotal++;
  }

  public recordResponseCoverageFailure(): void {
    this.responseCoverageFailureTotal++;
  }

  public recordChatTurnTimeout(): void {
    this.chatTurnTimeoutsTotal++;
  }

  public recordToolTimeout(_toolName?: string): void {
    this.toolTimeoutsTotal++;
  }

  public recordActionProposed(actionType: string): void {
    this.actionsProposed.set(
      actionType,
      (this.actionsProposed.get(actionType) || 0) + 1,
    );
  }

  public recordActionConfirmed(actionType: string): void {
    this.actionsConfirmed.set(
      actionType,
      (this.actionsConfirmed.get(actionType) || 0) + 1,
    );
  }

  public recordActionCancelled(actionType: string): void {
    this.actionsCancelled.set(
      actionType,
      (this.actionsCancelled.get(actionType) || 0) + 1,
    );
  }

  public recordActionStale(actionType: string): void {
    this.actionsStale.set(
      actionType,
      (this.actionsStale.get(actionType) || 0) + 1,
    );
  }

  public recordProviderError(provider: string, errorType: string): void {
    if (provider === "openai") {
      this.primaryProviderFailuresCount++;
    } else if (provider === "groq") {
      this.fallbackProviderFailuresCount++;
    }
    const key = `${provider}:${errorType}`;
    this.providerErrors.set(key, (this.providerErrors.get(key) || 0) + 1);
  }

  private summarizeDurations(durations: number[]): LatencySummary {
    if (durations.length === 0) {
      return { count: 0, totalMs: 0, avgMs: 0, minMs: 0, maxMs: 0 };
    }
    const totalMs = durations.reduce((acc, d) => acc + d, 0);
    return {
      count: durations.length,
      totalMs,
      avgMs: Math.round((totalMs / durations.length) * 100) / 100,
      minMs: Math.min(...durations),
      maxMs: Math.max(...durations),
    };
  }

  public getSnapshot(): Record<string, any> {
    const toolStats: Record<string, any> = {};
    for (const [tool, stats] of this.toolInvocations.entries()) {
      toolStats[tool] = {
        invocations: stats.count,
        success: stats.success,
        failed: stats.failed,
        avgMs: stats.count > 0 ? Math.round((stats.totalMs / stats.count) * 100) / 100 : 0,
      };
    }

    return {
      timestamp: new Date().toISOString(),
      http: {
        total_requests: this.httpRequestsCount,
        total_errors: this.httpErrorsCount,
      },
      agent: {
        chat_turns_total: this.chatTurnsCount,
        model_calls_total: this.modelCallsCount,
        model_latency: this.summarizeDurations(this.modelDurations),
        openai_model_calls_total: this.openaiModelCallsCount,
        groq_model_calls_total: this.groqModelCallsCount,
        fallback_activations_total: this.fallbackActivationsCount,
        primary_provider_failures_total: this.primaryProviderFailuresCount,
        fallback_provider_failures_total: this.fallbackProviderFailuresCount,
        tool_calls_total: this.toolCallsTotal,
        tool_plan_recovery_total: this.toolPlanRecoveryTotal,
        tool_omission_prevented_total: this.toolOmissionPreventedTotal,
        response_coverage_recovery_total: this.responseCoverageRecoveryTotal,
        response_coverage_failure_total: this.responseCoverageFailureTotal,
        chat_turn_timeouts_total: this.chatTurnTimeoutsTotal,
        tool_timeouts_total: this.toolTimeoutsTotal,
        tools: toolStats,
      },
      actions: {
        proposed: Object.fromEntries(this.actionsProposed),
        confirmed: Object.fromEntries(this.actionsConfirmed),
        cancelled: Object.fromEntries(this.actionsCancelled),
        stale: Object.fromEntries(this.actionsStale),
      },
      provider_errors: Object.fromEntries(this.providerErrors),
    };
  }
}

export const metrics = new MetricsRegistry();
