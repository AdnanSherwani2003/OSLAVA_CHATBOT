import { getConfig } from "../config/env.js";

export const DEFAULT_BUSINESS_TIMEZONE = "Asia/Kolkata";

/**
 * Returns the configured business operational timezone, defaulting to Asia/Kolkata.
 */
export function getBusinessTimezone(): string {
  try {
    return getConfig().APP_TIMEZONE || DEFAULT_BUSINESS_TIMEZONE;
  } catch {
    return process.env.APP_TIMEZONE || DEFAULT_BUSINESS_TIMEZONE;
  }
}

/**
 * Returns the current Date instant representing "now".
 */
export function getBusinessNow(baseDate?: Date): Date {
  return baseDate ? new Date(baseDate.getTime()) : new Date();
}

/**
 * Resolves a Date (or timestamp/ISO string) to its YYYY-MM-DD calendar date in the business timezone.
 */
export function getBusinessDate(
  dateInput?: Date | number | string,
  timezone?: string,
): string {
  const tz = timezone || getBusinessTimezone();
  let date: Date;
  if (!dateInput) {
    date = new Date();
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    date = new Date(dateInput);
  }

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date input for getBusinessDate: ${String(dateInput)}`);
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

/**
 * Resolves today's date (YYYY-MM-DD) in the business timezone.
 */
export function resolveTodayDate(baseDate?: Date, timezone?: string): string {
  return getBusinessDate(baseDate, timezone);
}

/**
 * Computes a calendar date offset by N days from the resolved business date.
 * Uses deterministic UTC date arithmetic on the business year/month/day components.
 */
export function resolveOffsetBusinessDate(
  offsetDays: number,
  baseDate?: Date,
  timezone?: string,
): string {
  const todayStr = resolveTodayDate(baseDate, timezone);
  const [yearStr, monthStr, dayStr] = todayStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  const targetUtc = new Date(Date.UTC(year, month - 1, day + offsetDays));
  const y = targetUtc.getUTCFullYear();
  const m = String(targetUtc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(targetUtc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Resolves tomorrow's date (YYYY-MM-DD) in the business timezone.
 */
export function resolveTomorrowDate(baseDate?: Date, timezone?: string): string {
  return resolveOffsetBusinessDate(1, baseDate, timezone);
}

/**
 * Resolves yesterday's date (YYYY-MM-DD) in the business timezone.
 */
export function resolveYesterdayDate(baseDate?: Date, timezone?: string): string {
  return resolveOffsetBusinessDate(-1, baseDate, timezone);
}

/**
 * Resolves natural language date phrases ("today", "tomorrow", "yesterday", "this morning", "tonight")
 * or standard YYYY-MM-DD strings to their business date string.
 * Returns null if the phrase is not a recognized relative phrase or valid date.
 */
export function resolveRelativeDatePhrase(
  phrase: string,
  baseDate?: Date,
  timezone?: string,
): string | null {
  if (!phrase || typeof phrase !== "string") {
    return null;
  }

  const normalized = phrase
    .toLowerCase()
    .trim()
    .replace(/^(for|on|at|during)\s+/, "")
    .trim();

  // 1. Check standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [yStr, mStr, dStr] = normalized.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const d = parseInt(dStr, 10);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    if (
      dateObj.getUTCFullYear() === y &&
      dateObj.getUTCMonth() === m - 1 &&
      dateObj.getUTCDate() === d
    ) {
      return normalized;
    }
    return null;
  }

  // 2. Relative date phrases
  switch (normalized) {
    case "today":
    case "this morning":
    case "this afternoon":
    case "this evening":
    case "tonight":
      return resolveTodayDate(baseDate, timezone);

    case "tomorrow":
    case "tomorrow morning":
    case "tomorrow afternoon":
    case "tomorrow evening":
    case "tomorrow night":
      return resolveTomorrowDate(baseDate, timezone);

    case "yesterday":
    case "yesterday morning":
    case "yesterday afternoon":
    case "yesterday evening":
    case "yesterday night":
      return resolveYesterdayDate(baseDate, timezone);

    default:
      return null;
  }
}

export interface BusinessTimeContext {
  timezone: string;
  today: string;
  tomorrow: string;
  yesterday: string;
  localTime: string;
  localDateTime: string;
}

/**
 * Produces a full business time summary context object for prompt injection and diagnostic logging.
 */
export function getBusinessTimeContext(
  baseDate?: Date,
  timezone?: string,
): BusinessTimeContext {
  const tz = timezone || getBusinessTimezone();
  const date = getBusinessNow(baseDate);
  const today = resolveTodayDate(date, tz);
  const tomorrow = resolveTomorrowDate(date, tz);
  const yesterday = resolveYesterdayDate(date, tz);

  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const localTime = timeFormatter.format(date);
  const localDateTime = `${today} ${localTime} (${tz})`;

  return {
    timezone: tz,
    today,
    tomorrow,
    yesterday,
    localTime,
    localDateTime,
  };
}
