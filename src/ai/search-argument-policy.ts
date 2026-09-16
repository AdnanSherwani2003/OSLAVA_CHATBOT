import {
  resolveTodayDate,
  resolveTomorrowDate,
  resolveYesterdayDate,
  getBusinessTimezone,
} from "../shared/business-time.js";

export interface SearchArgumentPolicyReport {
  toolName: string;
  proposedKeys: string[];
  removedKeys: string[];
  normalizedKeys: string[];
}

export interface SanitizedSearchArgumentsResult {
  sanitizedArgs: Record<string, unknown>;
  report: SearchArgumentPolicyReport;
}

const RELATIVE_TODAY_REGEX = /\b(today|tonight|this\s+morning|this\s+afternoon|this\s+evening)\b/i;
const RELATIVE_TOMORROW_REGEX = /\b(tomorrow|tomorrow\s+morning|tomorrow\s+afternoon|tomorrow\s+evening|tomorrow\s+night)\b/i;
const RELATIVE_YESTERDAY_REGEX = /\b(yesterday|yesterday\s+morning|yesterday\s+afternoon|yesterday\s+evening|yesterday\s+night)\b/i;

const CALENDAR_DATE_REGEX = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/;
const MONTH_NAME_DATE_REGEX = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?\b/i;
const DAY_MONTH_DATE_REGEX = /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*\d{4})?\b/i;
const RANGE_DATE_REGEX = /\b(?:between\b.+\band\b|from\b.+\bto\b|this\s+week|next\s+week|last\s+week|this\s+month|next\s+month|last\s+month)\b/i;

const GENERIC_EVENT_QUERY_STOPWORDS = new Set([
  "event", "events", "the", "a", "an", "all", "upcoming", "scheduled", "active",
  "available", "show", "me", "tell", "about", "list", "get", "give", "find",
  "search", "what", "which", "are", "there", "exist", "do", "we", "have",
  "functions", "function", "details", "info", "please", "can", "you", "could",
  "display", "lookup", "look", "up", "not", "just", "only", "merely", "other",
  "than", "except", "excluding", "without", "ones", "one", "none",
]);

const GENERIC_WORKER_QUERY_STOPWORDS = new Set([
  "worker", "workers", "staff", "personnel", "crew", "employee", "employees",
  "contractor", "contractors", "the", "a", "an", "all", "active", "available",
  "show", "me", "tell", "about", "list", "get", "give", "find", "search",
  "what", "which", "are", "there", "exist", "do", "we", "have", "details",
  "info", "profile", "please", "can", "you", "could", "display", "lookup", "look", "up",
  "not", "just", "only", "merely", "other", "than", "except", "excluding", "without",
  "ones", "one", "none",
]);

/**
 * Strips negated/exclusion phrases such as:
 * "not just today", "not only published", "not active", "other than today", "except published"
 * so that negated constraints are not misinterpreted as positive filter evidence.
 */
export function stripNegatedPhrases(prompt: string): string {
  return prompt.replace(
    /\b(?:not\s+(?:just|only|merely)?|never|other\s+than|except(?:\s+for)?|excluding|without)\s+(?:only\s+)?(?:the\s+)?(?:active(?:\s+workers?)?|published(?:\s+ones?)?|draft|closed|completed|open(?:\s+recruitment)?|today|tonight|tomorrow|yesterday|this\s+morning|this\s+afternoon|this\s+evening|category\s+[abcf]|tier\s+[abcf])\b/gi,
    "",
  );
}

export function hasTemporalEvidence(prompt: string): boolean {
  const cleanPrompt = stripNegatedPhrases(prompt);
  return (
    RELATIVE_TODAY_REGEX.test(cleanPrompt) ||
    RELATIVE_TOMORROW_REGEX.test(cleanPrompt) ||
    RELATIVE_YESTERDAY_REGEX.test(cleanPrompt) ||
    CALENDAR_DATE_REGEX.test(cleanPrompt) ||
    MONTH_NAME_DATE_REGEX.test(cleanPrompt) ||
    DAY_MONTH_DATE_REGEX.test(cleanPrompt) ||
    RANGE_DATE_REGEX.test(cleanPrompt)
  );
}

export function isGenericEventQuery(query: string): boolean {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  return words.every((w) => GENERIC_EVENT_QUERY_STOPWORDS.has(w));
}

export function isGenericWorkerQuery(query: string): boolean {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  return words.every((w) => GENERIC_WORKER_QUERY_STOPWORDS.has(w));
}

export function extractEventTargetResidual(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/^(?:please\s+)?(?:can\s+you\s+)?(?:could\s+you\s+)?(?:tell\s+me\s+about|show(?:\s+me)?|list|give\s+me|find|search(?:\s+for)?|look\s*up|display|get|what|which)\s+/i, "")
    .replace(/\b(?:the|a|an|all|upcoming|scheduled|active|available|events?|functions?|halls?|there|exist|are\s+there|do\s+we\s+have|we\s+have|are\s+upcoming|today|tomorrow|yesterday|published|draft|in\s+progress|completed|closed|open\s+recruitment|open|not|just|only|merely|other|than|except|excluding|without|ones?)\b/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
}

export function extractWorkerTargetResidual(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/^(?:please\s+)?(?:can\s+you\s+)?(?:could\s+you\s+)?(?:tell\s+me\s+about|show(?:\s+me)?|list|give\s+me|find|search(?:\s+for)?|look\s*up|display|get|who\s+is|what|which)\s+/i, "")
    .replace(/\b(?:the|a|an|all|active|available|workers?|staff|personnel|crew|employees?|contractors?|there|exist|are\s+there|do\s+we\s+have|we\s+have|category\s+[abcf]|tier\s+[abcf]|active|inactive|suspended|pending(\s+approval)?|not|just|only|merely|other|than|except|excluding|without|ones?)\b/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
}

function hasEventStatusEvidence(prompt: string, status: string): boolean {
  const cleanPrompt = stripNegatedPhrases(prompt);
  switch (status.toUpperCase()) {
    case "PUBLISHED":
      return /\b(published)\b/i.test(cleanPrompt);
    case "DRAFT":
      return /\b(draft|drafts)\b/i.test(cleanPrompt);
    case "IN_PROGRESS":
      return /\b(in[ -]progress|ongoing)\b/i.test(cleanPrompt);
    case "COMPLETED":
      return /\b(completed?|finished)\b/i.test(cleanPrompt);
    case "CLOSED":
      return /\b(closed)\b/i.test(cleanPrompt) && !/\bclosed\s+recruitment\b/i.test(cleanPrompt);
    case "CANCELED":
    case "CANCELLED":
      return /\b(cancell?ed)\b/i.test(cleanPrompt);
    default:
      return false;
  }
}

function hasRecruitmentStatusEvidence(prompt: string, status: string): boolean {
  const cleanPrompt = stripNegatedPhrases(prompt);
  switch (status.toUpperCase()) {
    case "OPEN":
      return /\b(open(\s+recruitment)?|recruiting|accepting)\b/i.test(cleanPrompt);
    case "FULL":
      return /\b(full|fully\s+staffed|filled)\b/i.test(cleanPrompt);
    case "CLOSED":
      return /\b(closed(\s+recruitment)?)\b/i.test(cleanPrompt);
    case "DRAFT":
      return /\b(draft)\b/i.test(cleanPrompt);
    default:
      return false;
  }
}

function hasVenueEvidence(prompt: string, venue: string): boolean {
  if (!venue || typeof venue !== "string") return false;
  const v = venue.trim().toLowerCase();
  if (!v || /^(venue|hall|location|place|events?)$/i.test(v)) return false;
  const promptLower = prompt.toLowerCase();
  if (promptLower.includes(v)) return true;
  const tokens = v.split(/\s+/).filter((t) => t.length > 1 && !/^(the|at|in|on|of|near)$/i.test(t));
  return tokens.length > 0 && tokens.every((t) => promptLower.includes(t));
}

function isDateSupportedByPrompt(
  dateStr: string,
  userPrompt: string,
  baseDate?: Date,
  timezone?: string,
): boolean {
  if (!dateStr || typeof dateStr !== "string") return false;
  const cleanDate = dateStr.trim();
  const cleanPrompt = stripNegatedPhrases(userPrompt);
  const tz = timezone || getBusinessTimezone();
  const today = resolveTodayDate(baseDate, tz);
  const tomorrow = resolveTomorrowDate(baseDate, tz);
  const yesterday = resolveYesterdayDate(baseDate, tz);

  if (cleanDate === today && RELATIVE_TODAY_REGEX.test(cleanPrompt)) {
    return true;
  }
  if (cleanDate === tomorrow && RELATIVE_TOMORROW_REGEX.test(cleanPrompt)) {
    return true;
  }
  if (cleanDate === yesterday && RELATIVE_YESTERDAY_REGEX.test(cleanPrompt)) {
    return true;
  }
  if (cleanPrompt.includes(cleanDate)) {
    return true;
  }
  if (
    CALENDAR_DATE_REGEX.test(cleanPrompt) ||
    MONTH_NAME_DATE_REGEX.test(cleanPrompt) ||
    DAY_MONTH_DATE_REGEX.test(cleanPrompt) ||
    RANGE_DATE_REGEX.test(cleanPrompt)
  ) {
    return true;
  }

  return false;
}

/**
 * Deterministically sanitizes search arguments against the current user request.
 * Enforces evidence-based filtering:
 * A search filter may only be used when there is evidence for that filter in the current user prompt.
 */
export function sanitizeSearchArguments(
  toolName: string,
  proposedArgs: Record<string, unknown>,
  userPrompt: string,
  baseDate?: Date,
  timezone?: string,
): SanitizedSearchArgumentsResult {
  const proposedKeys = Object.keys(proposedArgs || {}).filter(
    (k) => proposedArgs[k] !== undefined,
  );
  const sanitizedArgs: Record<string, unknown> = {};
  const normalizedKeys: string[] = [];

  const tz = timezone || getBusinessTimezone();
  const positivePrompt = stripNegatedPhrases(userPrompt);

  if (toolName === "search_events") {
    // 1. Date filters
    const hasToday = RELATIVE_TODAY_REGEX.test(positivePrompt);
    const hasTomorrow = RELATIVE_TOMORROW_REGEX.test(positivePrompt);
    const hasYesterday = RELATIVE_YESTERDAY_REGEX.test(positivePrompt);
    const today = resolveTodayDate(baseDate, tz);
    const tomorrow = resolveTomorrowDate(baseDate, tz);
    const yesterday = resolveYesterdayDate(baseDate, tz);

    if (hasToday && !hasTomorrow && !hasYesterday) {
      // User explicitly and solely asked for today
      sanitizedArgs.start_date = today;
      sanitizedArgs.end_date = today;
      if (
        proposedArgs.start_date !== today ||
        proposedArgs.end_date !== today
      ) {
        normalizedKeys.push("start_date", "end_date");
      }
    } else if (hasTomorrow && !hasToday && !hasYesterday) {
      // User explicitly and solely asked for tomorrow
      sanitizedArgs.start_date = tomorrow;
      sanitizedArgs.end_date = tomorrow;
      if (
        proposedArgs.start_date !== tomorrow ||
        proposedArgs.end_date !== tomorrow
      ) {
        normalizedKeys.push("start_date", "end_date");
      }
    } else if (hasYesterday && !hasToday && !hasTomorrow) {
      // User explicitly and solely asked for yesterday
      sanitizedArgs.start_date = yesterday;
      sanitizedArgs.end_date = yesterday;
      if (
        proposedArgs.start_date !== yesterday ||
        proposedArgs.end_date !== yesterday
      ) {
        normalizedKeys.push("start_date", "end_date");
      }
    } else {
      // Multiple relative dates (e.g. "today and tomorrow"), explicit calendar dates/ranges, or no date:
      if (typeof proposedArgs.start_date === "string") {
        if (isDateSupportedByPrompt(proposedArgs.start_date, userPrompt, baseDate, tz)) {
          sanitizedArgs.start_date = proposedArgs.start_date.trim();
        }
      }
      if (typeof proposedArgs.end_date === "string") {
        if (isDateSupportedByPrompt(proposedArgs.end_date, userPrompt, baseDate, tz)) {
          sanitizedArgs.end_date = proposedArgs.end_date.trim();
        }
      }
    }

    // 2. Status filters
    if (typeof proposedArgs.event_status === "string") {
      if (hasEventStatusEvidence(userPrompt, proposedArgs.event_status)) {
        sanitizedArgs.event_status = proposedArgs.event_status.toUpperCase();
      }
    }

    if (typeof proposedArgs.recruitment_status === "string") {
      if (hasRecruitmentStatusEvidence(userPrompt, proposedArgs.recruitment_status)) {
        sanitizedArgs.recruitment_status = proposedArgs.recruitment_status.toUpperCase();
      }
    }

    // 3. Venue filter
    if (typeof proposedArgs.venue === "string") {
      if (hasVenueEvidence(userPrompt, proposedArgs.venue)) {
        sanitizedArgs.venue = proposedArgs.venue.trim();
      }
    }

    // 4. Text query filter
    if (typeof proposedArgs.query === "string") {
      const q = proposedArgs.query.trim();
      const eventResidual = extractEventTargetResidual(userPrompt);
      const isGeneric = isGenericEventQuery(q);

      // Check if query is just status or recruitment status matching a recognized status
      const isStatusWord =
        typeof sanitizedArgs.event_status === "string" &&
        q.toLowerCase() === (sanitizedArgs.event_status as string).toLowerCase();
      const isRecruitmentWord =
        typeof sanitizedArgs.recruitment_status === "string" &&
        (q.toLowerCase() === (sanitizedArgs.recruitment_status as string).toLowerCase() ||
          q.toLowerCase() === "open recruitment");

      if (!isGeneric && !isStatusWord && !isRecruitmentWord && eventResidual.length > 0) {
        // Ensure the query has basis in the prompt
        const qTokens = q
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const promptLower = userPrompt.toLowerCase();
        const hasEvidence =
          promptLower.includes(q.toLowerCase()) ||
          qTokens.some((tok) => promptLower.includes(tok) && !GENERIC_EVENT_QUERY_STOPWORDS.has(tok));

        if (hasEvidence) {
          sanitizedArgs.query = q;
        }
      }
    }

    // 5. Pagination
    if (typeof proposedArgs.limit === "number") {
      sanitizedArgs.limit = proposedArgs.limit;
    }
  } else if (toolName === "search_workers") {
    // 1. Category filter
    if (typeof proposedArgs.category === "string") {
      const cat = proposedArgs.category.toUpperCase();
      const categoryRegex = new RegExp(`\\b(?:category|cat|tier)\\s*${cat}\\b`, "i");
      const reverseCategoryRegex = new RegExp(`\\b${cat}\\s*(?:category|tier)\\b`, "i");
      if (categoryRegex.test(positivePrompt) || reverseCategoryRegex.test(positivePrompt)) {
        sanitizedArgs.category = cat;
      }
    }

    // 2. Account status filter
    if (typeof proposedArgs.account_status === "string") {
      const status = proposedArgs.account_status.toUpperCase();
      let hasStatusEvidence = false;
      if (status === "ACTIVE") {
        hasStatusEvidence = /\bactive(\s+workers?)?\b/i.test(positivePrompt);
      } else if (status === "INACTIVE") {
        hasStatusEvidence = /\binactive\b/i.test(positivePrompt);
      } else if (status === "SUSPENDED") {
        hasStatusEvidence = /\bsuspended\b/i.test(positivePrompt);
      } else if (status === "PENDING_APPROVAL") {
        hasStatusEvidence = /\bpending(\s+approval)?\b/i.test(positivePrompt);
      }
      if (hasStatusEvidence) {
        sanitizedArgs.account_status = status;
      }
    }

    // 3. Text query filter
    if (typeof proposedArgs.query === "string") {
      const q = proposedArgs.query.trim();
      const workerResidual = extractWorkerTargetResidual(userPrompt);
      const isGeneric = isGenericWorkerQuery(q);

      const isCategoryWord =
        typeof sanitizedArgs.category === "string" &&
        q.toUpperCase() === sanitizedArgs.category;
      const isAccountStatusWord =
        typeof sanitizedArgs.account_status === "string" &&
        q.toUpperCase() === sanitizedArgs.account_status;

      if (!isGeneric && !isCategoryWord && !isAccountStatusWord && workerResidual.length > 0) {
        const qTokens = q
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const promptLower = userPrompt.toLowerCase();
        const hasEvidence =
          promptLower.includes(q.toLowerCase()) ||
          qTokens.some((tok) => promptLower.includes(tok) && !GENERIC_WORKER_QUERY_STOPWORDS.has(tok));

        if (hasEvidence) {
          sanitizedArgs.query = q;
        }
      }
    }

    // 4. Pagination
    if (typeof proposedArgs.limit === "number") {
      sanitizedArgs.limit = proposedArgs.limit;
    }
    if (typeof proposedArgs.offset === "number") {
      sanitizedArgs.offset = proposedArgs.offset;
    }
  } else {
    // Non-search tools: pass through unchanged
    return {
      sanitizedArgs: { ...proposedArgs },
      report: {
        toolName,
        proposedKeys,
        removedKeys: [],
        normalizedKeys: [],
      },
    };
  }

  // Schema Validity Guard: ensure empty strings or whitespace-only values are never outputted
  for (const [key, value] of Object.entries(sanitizedArgs)) {
    if (typeof value === "string" && value.trim().length === 0) {
      delete sanitizedArgs[key];
    }
  }

  const removedKeys = proposedKeys.filter(
    (key) => sanitizedArgs[key] === undefined,
  );

  return {
    sanitizedArgs,
    report: {
      toolName,
      proposedKeys,
      removedKeys,
      normalizedKeys: Array.from(new Set(normalizedKeys)),
    },
  };
}
