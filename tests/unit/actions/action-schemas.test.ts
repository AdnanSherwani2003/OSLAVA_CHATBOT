import { describe, it, expect } from "vitest";
import {
  changeWorkerCategoryInputSchema,
  publishEventInputSchema,
  completeEventInputSchema,
  closeEventInputSchema,
} from "../../../src/actions/action.schemas.js";

describe("Action Schemas Validation", () => {
  const validUuid = "11111111-1111-4111-8111-111111111111";

  describe("changeWorkerCategoryInputSchema", () => {
    it("accepts valid input with 1-step category and reason", () => {
      const parsed = changeWorkerCategoryInputSchema.parse({
        worker_id: validUuid,
        new_category: "A",
        reason: "Excellent attendance record",
        notes: "Optional notes",
      });

      expect(parsed.new_category).toBe("A");
      expect(parsed.reason).toBe("Excellent attendance record");
      expect(parsed.notes).toBe("Optional notes");
    });

    it("rejects invalid worker_id format", () => {
      expect(() =>
        changeWorkerCategoryInputSchema.parse({
          worker_id: "not-a-uuid",
          new_category: "A",
          reason: "Valid reason",
        }),
      ).toThrow();
    });

    it("rejects invalid category value (e.g. 'X')", () => {
      expect(() =>
        changeWorkerCategoryInputSchema.parse({
          worker_id: validUuid,
          new_category: "X",
          reason: "Valid reason",
        }),
      ).toThrow("new_category must be one of: A, B, C, F");
    });

    it("rejects reason shorter than 3 characters or whitespace-only", () => {
      expect(() =>
        changeWorkerCategoryInputSchema.parse({
          worker_id: validUuid,
          new_category: "B",
          reason: "ok",
        }),
      ).toThrow("Reason is required and must be at least 3 characters.");

      expect(() =>
        changeWorkerCategoryInputSchema.parse({
          worker_id: validUuid,
          new_category: "B",
          reason: "   ",
        }),
      ).toThrow();
    });

    it("rejects unrecognized extra properties (.strict())", () => {
      expect(() =>
        changeWorkerCategoryInputSchema.parse({
          worker_id: validUuid,
          new_category: "A",
          reason: "Good performance",
          extra_injected_param: "malicious",
        }),
      ).toThrow();
    });
  });

  describe("Event Write Schemas", () => {
    it("publishEventInputSchema requires valid event_id and reason >= 3 chars", () => {
      const parsed = publishEventInputSchema.parse({
        event_id: validUuid,
        reason: "Event ready to publish",
      });
      expect(parsed.event_id).toBe(validUuid);

      expect(() =>
        publishEventInputSchema.parse({
          event_id: validUuid,
          reason: "no",
        }),
      ).toThrow();
    });

    it("completeEventInputSchema requires valid event_id and reason >= 3 chars", () => {
      const parsed = completeEventInputSchema.parse({
        event_id: validUuid,
        reason: "All shifts concluded",
      });
      expect(parsed.event_id).toBe(validUuid);

      expect(() =>
        completeEventInputSchema.parse({
          event_id: "invalid",
          reason: "Valid reason",
        }),
      ).toThrow();
    });

    it("closeEventInputSchema requires valid event_id and reason >= 3 chars", () => {
      const parsed = closeEventInputSchema.parse({
        event_id: validUuid,
        reason: "Event closed and settled",
      });
      expect(parsed.event_id).toBe(validUuid);

      expect(() =>
        closeEventInputSchema.parse({
          event_id: validUuid,
          reason: "   ",
        }),
      ).toThrow();
    });
  });
});
