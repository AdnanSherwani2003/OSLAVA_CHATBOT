import { z } from "zod";
import { WORKER_CATEGORIES } from "../domain/auth.types.js";
import { uuidSchema } from "../guardrails/input-validation.js";

export const changeWorkerCategoryInputSchema = z
  .object({
    worker_id: uuidSchema,
    new_category: z.enum(WORKER_CATEGORIES, {
      errorMap: () => ({ message: "new_category must be one of: A, B, C, F" }),
    }),
    reason: z
      .string()
      .trim()
      .min(3, "Reason is required and must be at least 3 characters."),
    notes: z.string().trim().optional(),
  })
  .strict();

export type ChangeWorkerCategoryInput = z.infer<
  typeof changeWorkerCategoryInputSchema
>;

export const publishEventInputSchema = z
  .object({
    event_id: uuidSchema,
    reason: z
      .string()
      .trim()
      .min(3, "Reason is required and must be at least 3 characters."),
  })
  .strict();

export type PublishEventInput = z.infer<typeof publishEventInputSchema>;

export const completeEventInputSchema = z
  .object({
    event_id: uuidSchema,
    reason: z
      .string()
      .trim()
      .min(3, "Reason is required and must be at least 3 characters."),
  })
  .strict();

export type CompleteEventInput = z.infer<typeof completeEventInputSchema>;

export const closeEventInputSchema = z
  .object({
    event_id: uuidSchema,
    reason: z
      .string()
      .trim()
      .min(3, "Reason is required and must be at least 3 characters."),
  })
  .strict();

export type CloseEventInput = z.infer<typeof closeEventInputSchema>;
