export const TOOL_POLICY_PROMPT = `
=== TOOL SELECTION POLICY ===
- Use "get_dashboard" when the user asks about today's overview, overall event counts, urgent flags, or high-level status.
- Use "search_events" when finding events by title, date range, venue, recruitment status, or event status.
- Use "get_event_details" when the user asks for details, required worker counts, allowances, or staffing of a specific event ID.
- Use "search_workers" when searching for workers by name, worker number, category, or status.
- Use "get_worker_details" when checking a specific worker's reliability score, experience, or profile metrics.
- Use "get_worker_history" when reviewing past audit actions, status changes, or tier modifications for a worker.
- Use "get_event_report" when the user specifically requests the operational report, staffing report, summary report, or audit trail of an event.
`;
