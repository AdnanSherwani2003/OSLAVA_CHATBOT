import {
  AuthInvalidError,
  SupabaseUnavailableError,
  EntityNotFoundError,
  InternalError,
  AppError,
} from "../../domain/errors.js";

/**
 * Maps Supabase Auth / PostgREST errors into clean domain errors.
 * Guarantees that raw SQL statements or internal stacks are never exposed to clients.
 */
export function mapSupabaseError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    const status = typeof err.status === "number" ? err.status : undefined;
    const message = typeof err.message === "string" ? err.message : "";
    const code = typeof err.code === "string" ? err.code : "";

    // Auth errors (invalid/expired JWT, bad signature, token revoked)
    if (
      status === 401 ||
      status === 403 ||
      code === "PGRST301" ||
      message.toLowerCase().includes("jwt") ||
      message.toLowerCase().includes("token") ||
      message.toLowerCase().includes("unauthorized")
    ) {
      return new AuthInvalidError("Invalid or expired session token.");
    }

    // Entity not found (e.g. 'event not found', PGRST116 single row not found)
    if (
      code === "PGRST116" ||
      message.toLowerCase().includes("not found")
    ) {
      return new EntityNotFoundError("Requested entity was not found.");
    }

    // Availability / connection errors
    if (
      status === 502 ||
      status === 503 ||
      status === 504 ||
      code === "ENOTFOUND" ||
      code === "ECONNREFUSED" ||
      code === "ETIMEDOUT" ||
      message.toLowerCase().includes("network") ||
      message.toLowerCase().includes("fetch failed")
    ) {
      return new SupabaseUnavailableError();
    }
  }

  return new InternalError("Failed to communicate with underlying data services.");
}
