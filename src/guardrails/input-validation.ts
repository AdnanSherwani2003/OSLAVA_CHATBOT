import { z } from "zod";
import { InvalidInputError } from "../domain/errors.js";

export const uuidSchema = z
  .string()
  .uuid({ message: "Invalid UUID format." });

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Date must be formatted as YYYY-MM-DD.",
  })
  .refine((val) => !Number.isNaN(Date.parse(val)), {
    message: "Invalid calendar date.",
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
