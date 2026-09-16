import { describe, it, expect } from "vitest";
import {
  sanitizeSearchArguments,
  hasTemporalEvidence,
  isGenericEventQuery,
  isGenericWorkerQuery,
  extractEventTargetResidual,
  extractWorkerTargetResidual,
} from "../../../src/ai/search-argument-policy.js";
import {
  resolveTodayDate,
  resolveTomorrowDate,
  resolveYesterdayDate,
  getBusinessTimezone,
} from "../../../src/shared/business-time.js";

describe("Deterministic Search Argument Policy (Unit Tests)", () => {
  const fixedDate = new Date("2026-09-16T12:00:00Z");
  const tz = getBusinessTimezone();
  const today = resolveTodayDate(fixedDate, tz);
  const tomorrow = resolveTomorrowDate(fixedDate, tz);
  const yesterday = resolveYesterdayDate(fixedDate, tz);

  describe("§1. Generic Event Collections (Requirement 2 & 12)", () => {
    it("sanitizes 'list events' to empty args when model proposes nothing", () => {
      const { sanitizedArgs, report } = sanitizeSearchArguments(
        "search_events",
        {},
        "list events",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({});
      expect(report.removedKeys).toEqual([]);
    });

    it("sanitizes 'show me the events' to empty args when model proposes query 'events'", () => {
      const { sanitizedArgs, report } = sanitizeSearchArguments(
        "search_events",
        { query: "events" },
        "show me the events",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({});
      expect(report.proposedKeys).toEqual(["query"]);
      expect(report.removedKeys).toEqual(["query"]);
    });

    it("sanitizes 'tell me about the events' to empty args when model proposes query 'tell me about the events'", () => {
      const { sanitizedArgs, report } = sanitizeSearchArguments(
        "search_events",
        { query: "tell me about the events" },
        "tell me about the events",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({});
      expect(report.removedKeys).toEqual(["query"]);
    });

    it("sanitizes 'what events are there?' when model proposes query and pagination", () => {
      const { sanitizedArgs, report } = sanitizeSearchArguments(
        "search_events",
        { query: "events", limit: 10 },
        "what events are there?",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({ limit: 10 });
      expect(report.removedKeys).toEqual(["query"]);
    });
  });

  describe("§2. Date Evidence & Temporal Sanitization (Requirement 3, 13 & 15)", () => {
    it("removes model-invented today date when user asked 'tell me about the events'", () => {
      const { sanitizedArgs, report } = sanitizeSearchArguments(
        "search_events",
        { start_date: today, end_date: today },
        "tell me about the events",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({});
      expect(report.proposedKeys).toEqual(["start_date", "end_date"]);
      expect(report.removedKeys).toEqual(["start_date", "end_date"]);
    });

    it("removes model-invented date and query when user asked 'show me the events'", () => {
      const { sanitizedArgs, report } = sanitizeSearchArguments(
        "search_events",
        { query: "events", start_date: today, end_date: today },
        "show me the events",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({});
      expect(report.removedKeys).toEqual(["query", "start_date", "end_date"]);
    });

    it("keeps and normalizes start_date/end_date when user explicitly asks 'show me events today'", () => {
      const { sanitizedArgs, report } = sanitizeSearchArguments(
        "search_events",
        { start_date: today, end_date: today },
        "show me events today",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({
        start_date: today,
        end_date: today,
      });
      expect(report.removedKeys).toEqual([]);
    });

    it("normalizes date to today when user says 'show me events today' even if model proposed nothing", () => {
      const { sanitizedArgs, report } = sanitizeSearchArguments(
        "search_events",
        {},
        "show me events today",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({
        start_date: today,
        end_date: today,
      });
      expect(report.normalizedKeys).toEqual(["start_date", "end_date"]);
    });

    it("resolates tomorrow range for 'show me events tomorrow'", () => {
      const { sanitizedArgs } = sanitizeSearchArguments(
        "search_events",
        {},
        "show me events tomorrow",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({
        start_date: tomorrow,
        end_date: tomorrow,
      });
    });

    it("resolves yesterday range for 'show me events yesterday'", () => {
      const { sanitizedArgs } = sanitizeSearchArguments(
        "search_events",
        {},
        "show me events yesterday",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({
        start_date: yesterday,
        end_date: yesterday,
      });
    });

    it("preserves explicit calendar date in user prompt", () => {
      const { sanitizedArgs } = sanitizeSearchArguments(
        "search_events",
        { start_date: "2026-10-15", end_date: "2026-10-15" },
        "show events on 2026-10-15",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({
        start_date: "2026-10-15",
        end_date: "2026-10-15",
      });
    });
  });

  describe("§3. Legitimate Event Filters (Requirement 4, 5 & 16)", () => {
    it("preserves target query for 'find VM hall function'", () => {
      const { sanitizedArgs, report } = sanitizeSearchArguments(
        "search_events",
        { query: "VM hall function" },
        "find VM hall function",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({ query: "VM hall function" });
      expect(report.removedKeys).toEqual([]);
    });

    it("preserves target query for 'find Arbaz Wedding'", () => {
      const { sanitizedArgs } = sanitizeSearchArguments(
        "search_events",
        { query: "Arbaz Wedding" },
        "find Arbaz Wedding",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({ query: "Arbaz Wedding" });
    });

    it("preserves event_status=PUBLISHED for 'show published events'", () => {
      const { sanitizedArgs } = sanitizeSearchArguments(
        "search_events",
        { event_status: "PUBLISHED" },
        "show published events",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({ event_status: "PUBLISHED" });
    });

    it("removes event_status when user did NOT ask for status in 'show me the events'", () => {
      const { sanitizedArgs, report } = sanitizeSearchArguments(
        "search_events",
        { event_status: "PUBLISHED" },
        "show me the events",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({});
      expect(report.removedKeys).toEqual(["event_status"]);
    });

    it("preserves recruitment_status=OPEN for 'show events with open recruitment'", () => {
      const { sanitizedArgs } = sanitizeSearchArguments(
        "search_events",
        { recruitment_status: "OPEN" },
        "show events with open recruitment",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({ recruitment_status: "OPEN" });
    });

    it("preserves venue constraint for 'show events at VM hall'", () => {
      const { sanitizedArgs } = sanitizeSearchArguments(
        "search_events",
        { venue: "VM hall" },
        "show events at VM hall",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({ venue: "VM hall" });
    });
  });

  describe("§4. Worker Search Policy (Requirement 6 & 17)", () => {
    it("sanitizes generic worker collection queries to empty args", () => {
      const queries = [
        "list workers",
        "show workers",
        "show me the workers",
        "tell me about the workers",
        "what workers are there?",
      ];

      for (const q of queries) {
        const { sanitizedArgs } = sanitizeSearchArguments(
          "search_workers",
          { query: "workers" },
          q,
          fixedDate,
          tz,
        );
        expect(sanitizedArgs).toEqual({});
      }
    });

    it("preserves category=A for 'show category A workers'", () => {
      const { sanitizedArgs } = sanitizeSearchArguments(
        "search_workers",
        { category: "A" },
        "show category A workers",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({ category: "A" });
    });

    it("removes category when user did not mention category in 'list workers'", () => {
      const { sanitizedArgs, report } = sanitizeSearchArguments(
        "search_workers",
        { category: "A" },
        "list workers",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({});
      expect(report.removedKeys).toEqual(["category"]);
    });

    it("preserves account_status=ACTIVE for 'show active workers'", () => {
      const { sanitizedArgs } = sanitizeSearchArguments(
        "search_workers",
        { account_status: "ACTIVE" },
        "show active workers",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({ account_status: "ACTIVE" });
    });

    it("preserves specific target query for 'tell me about the worker Adnan Adnan'", () => {
      const { sanitizedArgs } = sanitizeSearchArguments(
        "search_workers",
        { query: "Adnan Adnan" },
        "tell me about the worker Adnan Adnan",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({ query: "Adnan Adnan" });
    });
  });

  describe("§5. Negation Handling (Review Requirement 1)", () => {
    it("'show all events, not just today' removes today date filter", () => {
      const { sanitizedArgs, report } = sanitizeSearchArguments(
        "search_events",
        { start_date: today, end_date: today },
        "show all events, not just today",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({});
      expect(report.removedKeys).toEqual(["start_date", "end_date"]);
    });

    it("'show events, not only published ones' removes published status filter", () => {
      const { sanitizedArgs, report } = sanitizeSearchArguments(
        "search_events",
        { event_status: "PUBLISHED" },
        "show events, not only published ones",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({});
      expect(report.removedKeys).toEqual(["event_status"]);
    });

    it("'show workers, not only active workers' removes active status filter", () => {
      const { sanitizedArgs, report } = sanitizeSearchArguments(
        "search_workers",
        { account_status: "ACTIVE" },
        "show workers, not only active workers",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({});
      expect(report.removedKeys).toEqual(["account_status"]);
    });
  });

  describe("§6. Multi-Filter Combinations (Review Requirement 6)", () => {
    it("'show published events at VM hall today' retains status, venue, and today date", () => {
      const { sanitizedArgs, report } = sanitizeSearchArguments(
        "search_events",
        {
          event_status: "PUBLISHED",
          venue: "VM hall",
          start_date: today,
          end_date: today,
        },
        "show published events at VM hall today",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({
        event_status: "PUBLISHED",
        venue: "VM hall",
        start_date: today,
        end_date: today,
      });
      expect(report.removedKeys).toEqual([]);
    });

    it("'show active category A workers' retains category A and active status without generic query", () => {
      const { sanitizedArgs, report } = sanitizeSearchArguments(
        "search_workers",
        {
          category: "A",
          account_status: "ACTIVE",
          query: "workers",
        },
        "show active category A workers",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({
        category: "A",
        account_status: "ACTIVE",
      });
      expect(report.removedKeys).toEqual(["query"]);
    });
  });

  describe("§7. Schema Validity (Review Requirement 5)", () => {
    it("never produces empty string properties", () => {
      const { sanitizedArgs } = sanitizeSearchArguments(
        "search_events",
        { query: "", venue: "   " },
        "list events",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({});
      expect("query" in sanitizedArgs).toBe(false);
      expect("venue" in sanitizedArgs).toBe(false);
    });

    it("worker sanitization never produces empty string query", () => {
      const { sanitizedArgs } = sanitizeSearchArguments(
        "search_workers",
        { query: "" },
        "list workers",
        fixedDate,
        tz,
      );
      expect(sanitizedArgs).toEqual({});
      expect("query" in sanitizedArgs).toBe(false);
    });
  });
});
