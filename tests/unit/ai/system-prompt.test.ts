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

  describe("V1 Capability Boundaries & Proactive Offerings", () => {
    it("strictly enumerates supported read tools and write intent tools", () => {
      const prompt = buildSystemPrompt(null);

      expect(prompt).toContain("=== CAPABILITIES & BOUNDARIES (STRICT V1 BOUNDARIES) ===");
      expect(prompt).toContain("get_dashboard");
      expect(prompt).toContain("search_events");
      expect(prompt).toContain("get_event_details");
      expect(prompt).toContain("search_workers");
      expect(prompt).toContain("get_worker_details");
      expect(prompt).toContain("get_worker_history");
      expect(prompt).toContain("get_event_report");

      expect(prompt).toContain("change_worker_category");
      expect(prompt).toContain("publish_event");
      expect(prompt).toContain("complete_event");
      expect(prompt).toContain("close_event");
    });

    it("explicitly forbids all unsupported write operations", () => {
      const prompt = buildSystemPrompt(null);

      expect(prompt).toContain("EXPLICITLY UNSUPPORTED / OUT-OF-SCOPE MUTATIONS & ACTIONS:");
      expect(prompt).toContain("Assigning workers to events, shifts, or teams");
      expect(prompt).toContain("Removing, reassigning, or replacing workers");
      expect(prompt).toContain("Creating new events");
      expect(prompt).toContain("Editing event details, venues, or timings");
      expect(prompt).toContain("Canceling events");
      expect(prompt).toContain("Opening, closing, or adjusting recruitment status");
      expect(prompt).toContain("Modifying staffing requirements, headcounts, or allowances");
      expect(prompt).toContain("Registering workers or approving pending worker registrations");
      expect(prompt).toContain("Deleting any data");
    });

    it("forbids proactive offering of unsupported actions in closing sentences", () => {
      const prompt = buildSystemPrompt(null);

      expect(prompt).toContain("PROACTIVE OFFERING & CLOSING SENTENCE RULES (CRITICAL):");
      expect(prompt).toContain("NEVER say \"you may assign additional workers\"");
      expect(prompt).toContain("NEVER say \"wish to adjust recruitment\"");
      expect(prompt).toContain("NEVER offer to resolve the shortage, adjust recruitment, or assign workers.");
    });

    it("restricts suggested follow-up actions to supported read operations", () => {
      const prompt = buildSystemPrompt(null);

      expect(prompt).toContain('"view staffing details"');
      expect(prompt).toContain('"view event report"');
      expect(prompt).toContain('"inspect workers"');
      expect(prompt).toContain('"inspect event details"');
    });

    it("mandates exact refusal sentence for unsupported action requests", () => {
      const prompt = buildSystemPrompt(null);

      expect(prompt).toContain("UNSUPPORTED ACTION REFUSAL RULE:");
      expect(prompt).toContain('"That action isn\'t available through the chatbot yet."');
    });
  });
});
