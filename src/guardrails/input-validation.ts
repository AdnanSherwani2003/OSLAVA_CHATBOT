import { z } from "zod";
import { InvalidInputError } from "../domain/errors.js";
import { resolveRelativeDatePhrase } from "../shared/business-time.js";

export const uuidSchema = z
  .string()
  .uuid({ message: "Invalid UUID format." });

export const dateStringSchema = z
  .string()
  .trim()
  .transform((val, ctx) => {
    const resolved = resolveRelativeDatePhrase(val);
    if (!resolved) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Date must be formatted as YYYY-MM-DD or a relative date phrase (today, tomorrow, yesterday, this morning, tonight).",
      });
      return z.NEVER;
    }
    return resolved;
  });

/**
 * Validates input against a Zod schema, translating validation issues into InvalidInputError.
 */
export function validateInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.errors
      .map((e) => `${e.path.join(".") || "input"}: ${e.message}`)
      .join("; ");
    throw new InvalidInputError(`Validation failed: ${message}`);
  }
  return result.data;
}
