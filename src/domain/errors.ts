export type ErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_INVALID"
  | "ROLE_FORBIDDEN"
  | "ACCOUNT_RESTRICTED"
  | "INVALID_INPUT"
  | "ENTITY_NOT_FOUND"
  | "DOMAIN_REJECTED"
  | "MODEL_UNAVAILABLE"
  | "MODEL_RATE_LIMITED"
  | "MODEL_TIMEOUT"
  | "MODEL_INVALID_RESPONSE"
  | "TOOL_LIMIT_EXCEEDED"
  | "SESSION_NOT_FOUND"
  | "SESSION_FORBIDDEN"
  | "ACTION_NOT_FOUND"
  | "ACTION_FORBIDDEN"
  | "ACTION_EXPIRED"
  | "ACTION_ALREADY_RESOLVED"
  | "ACTION_STALE"
  | "ACTION_EXECUTION_FAILED"
  | "ACTION_OUTCOME_UNKNOWN"
  | "PENDING_ACTION_EXISTS"
  | "SUPABASE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ApiErrorPayload {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    request_id: string;
  };
}

export abstract class AppError extends Error {
  public abstract readonly code: ErrorCode;
  public abstract readonly statusCode: number;
  public abstract readonly retryable: boolean;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toResponse(requestId: string): ApiErrorPayload {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        request_id: requestId,
      },
    };
  }
}

export class AuthRequiredError extends AppError {
  public readonly code = "AUTH_REQUIRED";
  public readonly statusCode = 401;
  public readonly retryable = false;

  constructor(message = "Authentication is required.") {
    super(message);
  }
}

export class AuthInvalidError extends AppError {
  public readonly code = "AUTH_INVALID";
  public readonly statusCode = 401;
  public readonly retryable = false;

  constructor(message = "Provided authentication token is invalid or expired.") {
    super(message);
  }
}

export class RoleForbiddenError extends AppError {
  public readonly code = "ROLE_FORBIDDEN";
  public readonly statusCode = 403;
  public readonly retryable = false;

  constructor(
    message = "Only ADMIN or SUPER_ADMIN users can access the Admin AI Chatbot.",
  ) {
    super(message);
  }
}

export class AccountRestrictedError extends AppError {
  public readonly code = "ACCOUNT_RESTRICTED";
  public readonly statusCode = 403;
  public readonly retryable = false;

  constructor(
    message = "Your account is not active. Please contact administrator.",
  ) {
    super(message);
  }
}

export class InvalidInputError extends AppError {
  public readonly code = "INVALID_INPUT";
  public readonly statusCode = 400;
  public readonly retryable = false;

  constructor(message = "Invalid input provided.") {
    super(message);
  }
}

export class SupabaseUnavailableError extends AppError {
  public readonly code = "SUPABASE_UNAVAILABLE";
  public readonly statusCode = 503;
  public readonly retryable = true;

  constructor(
    message = "The underlying database service is temporarily unavailable.",
  ) {
    super(message);
  }
}

export class EntityNotFoundError extends AppError {
  public readonly code = "ENTITY_NOT_FOUND";
  public readonly statusCode = 404;
  public readonly retryable = false;

  constructor(message = "Requested entity was not found.") {
    super(message);
  }
}

export class DomainRejectedError extends AppError {
  public readonly code = "DOMAIN_REJECTED";
  public readonly statusCode = 422;
  public readonly retryable = false;

  constructor(message = "The operation could not be completed due to domain rules.") {
    super(message);
  }
}

export class ModelUnavailableError extends AppError {
  public readonly code = "MODEL_UNAVAILABLE";
  public readonly statusCode = 503;
  public readonly retryable = true;

  constructor(message = "AI model provider is temporarily unavailable.") {
    super(message);
  }
}

export class ModelRateLimitedError extends AppError {
  public readonly code = "MODEL_RATE_LIMITED";
  public readonly statusCode = 429;
  public readonly retryable = true;

  constructor(message = "AI model rate limit reached. Please retry shortly.") {
    super(message);
  }
}

export class ModelTimeoutError extends AppError {
  public readonly code = "MODEL_TIMEOUT";
  public readonly statusCode = 504;
  public readonly retryable = true;

  constructor(message = "AI model request timed out.") {
    super(message);
  }
}

export class ModelInvalidResponseError extends AppError {
  public readonly code = "MODEL_INVALID_RESPONSE";
  public readonly statusCode = 502;
  public readonly retryable = false;

  constructor(message = "AI model returned an unexpected or invalid response.") {
    super(message);
  }
}

export class ToolLimitExceededError extends AppError {
  public readonly code = "TOOL_LIMIT_EXCEEDED";
  public readonly statusCode = 429;
  public readonly retryable = false;

  constructor(
    message = "The maximum number of tool executions per turn was exceeded.",
  ) {
    super(message);
  }
}

export class SessionNotFoundError extends AppError {
  public readonly code = "SESSION_NOT_FOUND";
  public readonly statusCode = 404;
  public readonly retryable = false;

  constructor(sessionId?: string) {
    super(
      sessionId
        ? `Chat session '${sessionId}' was not found.`
        : "Chat session was not found.",
    );
  }
}

export class SessionForbiddenError extends AppError {
  public readonly code = "SESSION_FORBIDDEN";
  public readonly statusCode = 403;
  public readonly retryable = false;

  constructor(sessionId?: string) {
    super(
      sessionId
        ? `Access to chat session '${sessionId}' is forbidden.`
        : "Access to this chat session is forbidden.",
    );
  }
}

export class InternalError extends AppError {
  public readonly code = "INTERNAL_ERROR";
  public readonly statusCode = 500;
  public readonly retryable = false;

  constructor(message = "An unexpected error occurred.") {
    super(message);
  }
}

export class ActionNotFoundError extends AppError {
  public readonly code = "ACTION_NOT_FOUND";
  public readonly statusCode = 404;
  public readonly retryable = false;

  constructor(actionId: string) {
    super(`Action '${actionId}' was not found.`);
  }
}

export class ActionForbiddenError extends AppError {
  public readonly code = "ACTION_FORBIDDEN";
  public readonly statusCode = 403;
  public readonly retryable = false;

  constructor(actionId: string) {
    super(`You are not authorized to confirm or cancel action '${actionId}'.`);
  }
}

export class ActionExpiredError extends AppError {
  public readonly code = "ACTION_EXPIRED";
  public readonly statusCode = 400;
  public readonly retryable = false;

  constructor(actionId: string) {
    super(`Action '${actionId}' has expired and cannot be executed.`);
  }
}

export class ActionAlreadyResolvedError extends AppError {
  public readonly code = "ACTION_ALREADY_RESOLVED";
  public readonly statusCode = 409;
  public readonly retryable = false;

  constructor(actionId: string, status: string) {
    super(`Action '${actionId}' is already resolved with status '${status}'.`);
  }
}

export class ActionStaleError extends AppError {
  public readonly code = "ACTION_STALE";
  public readonly statusCode = 409;
  public readonly retryable = false;

  constructor(message = "Action cannot be executed because underlying entity state has changed.") {
    super(message);
  }
}

export class ActionExecutionFailedError extends AppError {
  public readonly code = "ACTION_EXECUTION_FAILED";
  public readonly statusCode = 500;
  public readonly retryable = false;

  constructor(message = "Execution of the requested action failed.") {
    super(message);
  }
}

export class ActionOutcomeUnknownError extends AppError {
  public readonly code = "ACTION_OUTCOME_UNKNOWN";
  public readonly statusCode = 500;
  public readonly retryable = false;

  constructor(message = "Mutation outcome is unknown. Manual verification required.") {
    super(message);
  }
}

export class PendingActionExistsError extends AppError {
  public readonly code = "PENDING_ACTION_EXISTS";
  public readonly statusCode = 409;
  public readonly retryable = false;

  constructor(
    message = "You already have an action waiting for confirmation. Confirm or cancel it before requesting another change.",
  ) {
    super(message);
  }
}

