import { randomUUID } from "node:crypto";

/**
 * Generates a unique, URL-safe request ID prefixed with 'req_'.
 */
export function generateRequestId(): string {
  return `req_${randomUUID().replace(/-/g, "")}`;
}
