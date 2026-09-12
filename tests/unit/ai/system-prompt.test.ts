import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../../src/ai/prompts/system.prompt.js";
import { getBusinessTimeContext } from "../../../src/shared/business-time.js";

describe("buildSystemPrompt: Operational Timezone & Business Date", () => {
  it("includes Oslava operational timezone and business date instructions", () => {
    const prompt = buildSystemPrompt(null);

    expect(prompt).toContain("Oslava's operational timezone is Asia/Kolkata.");
    expect(prompt).toContain("Today's Business Date:");
    expect(prompt).toContain("Tomorrow's Business Date:");
    expect(prompt).toContain("Yesterday's Business Date:");
    expect(prompt).toContain("CRITICAL TIMEZONE & DATE RESOLUTION RULES:");
    expect(prompt).toContain("Kerala, India (Asia/Kolkata)");
  });

  it("incorporates provided businessDateContext accurately", () => {
    const customTimeContext = {
      timezone: "Asia/Kolkata",
      today: "2026-09-13",
      tomorrow: "2026-09-14",
      yesterday: "2026-09-12",
      localTime: "1:30 AM",
      localDateTime: "2026-09-13 1:30 AM (Asia/Kolkata)",
    };

    const prompt = buildSystemPrompt(null, null, customTimeContext);

    expect(prompt).toContain("Today's Business Date: 2026-09-13");
    expect(prompt).toContain("Tomorrow's Business Date: 2026-09-14");
    expect(prompt).toContain("Yesterday's Business Date: 2026-09-12");
    expect(prompt).toContain("Current Local Time: 1:30 AM (Asia/Kolkata)");
    expect(prompt).toContain('When searching events for "today", pass start_date: "2026-09-13", end_date: "2026-09-13".');
    expect(prompt).toContain('When searching events for "tomorrow", pass start_date: "2026-09-14", end_date: "2026-09-14".');
    expect(prompt).toContain('When searching events for "yesterday", pass start_date: "2026-09-12", end_date: "2026-09-12".');
  });
});
