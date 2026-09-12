import { describe, it, expect } from "vitest";
import {
  DEFAULT_BUSINESS_TIMEZONE,
  getBusinessTimezone,
  getBusinessNow,
  getBusinessDate,
  resolveTodayDate,
  resolveTomorrowDate,
  resolveYesterdayDate,
  resolveOffsetBusinessDate,
  resolveRelativeDatePhrase,
  getBusinessTimeContext,
} from "../../../src/shared/business-time.js";

describe("Business Time Utility (Asia/Kolkata)", () => {
  it("defaults to Asia/Kolkata timezone", () => {
    expect(DEFAULT_BUSINESS_TIMEZONE).toBe("Asia/Kolkata");
    expect(getBusinessTimezone()).toBe("Asia/Kolkata");
  });

  describe("UTC Midnight Boundaries (Requirement Example)", () => {
    // UTC: 2026-09-12T20:00:00Z -> Asia/Kolkata: 2026-09-13T01:30:00+05:30
    const boundaryUtcDate = new Date("2026-09-12T20:00:00Z");

    it("resolves today as 2026-09-13 when UTC is still 2026-09-12 but Kolkata is 2026-09-13", () => {
      expect(resolveTodayDate(boundaryUtcDate)).toBe("2026-09-13");
    });

    it("resolves tomorrow as 2026-09-14", () => {
      expect(resolveTomorrowDate(boundaryUtcDate)).toBe("2026-09-14");
    });

    it("resolves yesterday as 2026-09-12", () => {
      expect(resolveYesterdayDate(boundaryUtcDate)).toBe("2026-09-12");
    });

    it("resolves relative phrases correctly at UTC midnight boundary", () => {
      expect(resolveRelativeDatePhrase("today", boundaryUtcDate)).toBe("2026-09-13");
      expect(resolveRelativeDatePhrase("tomorrow", boundaryUtcDate)).toBe("2026-09-14");
      expect(resolveRelativeDatePhrase("yesterday", boundaryUtcDate)).toBe("2026-09-12");
      expect(resolveRelativeDatePhrase("this morning", boundaryUtcDate)).toBe("2026-09-13");
      expect(resolveRelativeDatePhrase("tonight", boundaryUtcDate)).toBe("2026-09-13");
      expect(resolveRelativeDatePhrase("this afternoon", boundaryUtcDate)).toBe("2026-09-13");
      expect(resolveRelativeDatePhrase("this evening", boundaryUtcDate)).toBe("2026-09-13");
    });
  });

  describe("Normal Daytime Case", () => {
    // UTC: 2026-09-13T06:30:00Z -> Asia/Kolkata: 2026-09-13 12:00:00 (Noon)
    const daytimeUtc = new Date("2026-09-13T06:30:00Z");

    it("resolves midday UTC to 2026-09-13 in Asia/Kolkata", () => {
      expect(resolveTodayDate(daytimeUtc)).toBe("2026-09-13");
      expect(resolveTomorrowDate(daytimeUtc)).toBe("2026-09-14");
      expect(resolveYesterdayDate(daytimeUtc)).toBe("2026-09-12");
    });
  });

  describe("Kolkata Midnight Boundary (18:30 UTC)", () => {
    // 18:29:59 UTC = 23:59:59 IST (Sept 13)
    const beforeMidnightIst = new Date("2026-09-13T18:29:59Z");
    // 18:30:01 UTC = 00:00:01 IST (Sept 14)
    const afterMidnightIst = new Date("2026-09-13T18:30:01Z");

    it("correctly identifies Sept 13 right before Indian midnight", () => {
      expect(resolveTodayDate(beforeMidnightIst)).toBe("2026-09-13");
      expect(resolveTomorrowDate(beforeMidnightIst)).toBe("2026-09-14");
      expect(resolveYesterdayDate(beforeMidnightIst)).toBe("2026-09-12");
    });

    it("correctly rolls over to Sept 14 right after Indian midnight", () => {
      expect(resolveTodayDate(afterMidnightIst)).toBe("2026-09-14");
      expect(resolveTomorrowDate(afterMidnightIst)).toBe("2026-09-15");
      expect(resolveYesterdayDate(afterMidnightIst)).toBe("2026-09-13");
    });
  });

  describe("Calendar Arithmetic Edge Cases (Month/Year/Leap)", () => {
    it("handles month rollover (Jan 31 -> Feb 1)", () => {
      const jan31 = new Date("2026-01-31T06:00:00Z");
      expect(resolveTodayDate(jan31)).toBe("2026-01-31");
      expect(resolveTomorrowDate(jan31)).toBe("2026-02-01");
      expect(resolveYesterdayDate(jan31)).toBe("2026-01-30");
    });

    it("handles leap year rollover (Feb 28 2024 -> Feb 29 2024)", () => {
      const feb28Leap = new Date("2024-02-28T06:00:00Z");
      expect(resolveTodayDate(feb28Leap)).toBe("2024-02-28");
      expect(resolveTomorrowDate(feb28Leap)).toBe("2024-02-29");
    });

    it("handles non-leap year rollover (Feb 28 2025 -> Mar 1 2025)", () => {
      const feb28NonLeap = new Date("2025-02-28T06:00:00Z");
      expect(resolveTodayDate(feb28NonLeap)).toBe("2025-02-28");
      expect(resolveTomorrowDate(feb28NonLeap)).toBe("2025-03-01");
    });

    it("handles year rollover (Dec 31 2026 -> Jan 1 2027)", () => {
      const dec31 = new Date("2026-12-31T06:00:00Z");
      expect(resolveTodayDate(dec31)).toBe("2026-12-31");
      expect(resolveTomorrowDate(dec31)).toBe("2027-01-01");
      expect(resolveYesterdayDate(dec31)).toBe("2026-12-30");
    });

    it("resolves arbitrary day offsets accurately", () => {
      const sept13 = new Date("2026-09-13T06:00:00Z");
      expect(resolveOffsetBusinessDate(5, sept13)).toBe("2026-09-18");
      expect(resolveOffsetBusinessDate(-5, sept13)).toBe("2026-09-08");
    });
  });

  describe("resolveRelativeDatePhrase", () => {
    const baseDate = new Date("2026-09-13T06:00:00Z");

    it("passes through valid YYYY-MM-DD date strings", () => {
      expect(resolveRelativeDatePhrase("2026-10-15", baseDate)).toBe("2026-10-15");
      expect(resolveRelativeDatePhrase("  2026-10-15  ", baseDate)).toBe("2026-10-15");
    });

    it("normalizes case and trimmed prefix words", () => {
      expect(resolveRelativeDatePhrase("TODAY", baseDate)).toBe("2026-09-13");
      expect(resolveRelativeDatePhrase("for tomorrow", baseDate)).toBe("2026-09-14");
      expect(resolveRelativeDatePhrase("on yesterday", baseDate)).toBe("2026-09-12");
      expect(resolveRelativeDatePhrase("during tonight", baseDate)).toBe("2026-09-13");
    });

    it("returns null for unrecognized strings or invalid dates", () => {
      expect(resolveRelativeDatePhrase("banana", baseDate)).toBeNull();
      expect(resolveRelativeDatePhrase("2026-02-31", baseDate)).toBeNull();
      expect(resolveRelativeDatePhrase("", baseDate)).toBeNull();
    });
  });

  describe("getBusinessTimeContext", () => {
    it("returns complete business time summary object", () => {
      const boundaryDate = new Date("2026-09-12T20:00:00Z");
      const ctx = getBusinessTimeContext(boundaryDate);

      expect(ctx.timezone).toBe("Asia/Kolkata");
      expect(ctx.today).toBe("2026-09-13");
      expect(ctx.tomorrow).toBe("2026-09-14");
      expect(ctx.yesterday).toBe("2026-09-12");
      expect(ctx.localTime).toMatch(/1:30\s*AM/);
      expect(ctx.localDateTime).toContain("2026-09-13");
      expect(ctx.localDateTime).toContain("Asia/Kolkata");
    });
  });

  describe("getBusinessNow and getBusinessDate", () => {
    it("getBusinessNow returns a valid Date instance", () => {
      const now = getBusinessNow();
      expect(now).toBeInstanceOf(Date);
      expect(now.getTime()).toBeGreaterThan(0);
    });

    it("getBusinessDate throws on invalid date inputs", () => {
      expect(() => getBusinessDate("invalid-date-string")).toThrowError(
        /Invalid date input for getBusinessDate/,
      );
    });
  });
});
