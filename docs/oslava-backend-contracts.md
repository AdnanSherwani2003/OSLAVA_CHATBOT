# Oslava Backend External Contracts

This document records the external Supabase backend contracts, database models, and RPC interfaces discovered from the active `oslava-events-app` repository (`main` branch).

The Oslava Admin AI Chatbot backend is a completely separate service that interacts with Supabase strictly as an external client using caller-scoped JWT authentication.

---

## 1. Authentication & Session Model

### Authentication Flow
1. Staff and workers authenticate with Supabase Auth (email/password for staff and phone/password for workers).
2. The client receives a standard Supabase JWT access token.
3. The client calls the Chatbot backend with:
   ```http
   Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
   ```
4. The Chatbot backend validates the JWT with Supabase Auth (`supabase.auth.getUser(token)`).
5. The Chatbot backend creates a **request-scoped Supabase client** with `Authorization: Bearer <token>` in headers.
6. PostgreSQL RLS policies and functions evaluate the caller via `auth.uid()`.
7. **No service-role key is ever used for chatbot operations.**

---

## 2. Core RPCs & Schemas

### `public.my_profile()`
- **Schema**: `public`
- **Security**: `security definer`, `stable`, `set search_path = ''`
- **Parameters**: None. Evaluates `where p.id = auth.uid()`.
- **Return Type**: `TABLE` with: `id` (uuid), `worker_number` (bigint), `role` (`app_role`), `full_name` (text), `initials` (text), `phone_e164` (text), `profile_photo_path` (text), `profile_completed_at` (timestamptz), `account_status` (`account_status`), `category` (`worker_category`), `last_worker_category` (`worker_category`).

---

## 3. Phase 2 Read Capabilities & RPC Contracts

### 1. `get_dashboard`
- **Underlying RPC**: `public.admin_event_dashboard()`
- **Parameters**: None.
- **Access**: Restricted to `ADMIN` and `SUPER_ADMIN` via `private.can_manage_events()`.
- **Return Columns**:
  - `today_event_count` (int)
  - `draft_count` (int)
  - `published_count` (int)
  - `upcoming_count` (int)
  - `in_progress_count` (int)
  - `completed_count` (int)
  - `open_review_flag_count` (int)
  - `required_today_count` (int)
  - `confirmed_today_count` (int)
  - `vacant_today_count` (int)

### 2. `search_events`
- **Underlying RPC**: `public.admin_event_list()`
- **Parameters**: None.
- **Access**: Restricted to `ADMIN` and `SUPER_ADMIN` via `private.can_manage_events()`.
- **Return Columns**: `id`, `title`, `event_type`, `venue_name`, `event_date`, `reporting_at`, `required_worker_count`, `daily_wage`, `currency_code`, `event_status`, `recruitment_status`, `tier_strategy`, `version`.
- **Deterministic Server-Side Filtering**:
  Since the existing backend only provides an unfiltered list ordered by `reporting_at desc`, `SearchEventsTool` executes deterministic TypeScript filtering:
  - `query`: Case-insensitive substring match across `title`, `event_type`, and `venue_name`.
  - `venue`: Case-insensitive substring match against `venue_name`.
  - `event_status`: Exact match against `EventStatus` enum.
  - `recruitment_status`: Exact match against `RecruitmentStatus` enum.
  - `start_date` / `end_date`: Date range comparison against `event_date` (`YYYY-MM-DD`). Rejects `start_date > end_date`.
  - Chronological sort: Ascending by `reporting_at`.
  - Limit: Default 10, maximum 25.

### 3. `get_event_details`
- **Underlying RPC**: `public.admin_event_detail(p_event_id uuid)`
- **Parameters**: `p_event_id uuid`
- **Access**: Restricted to `ADMIN` and `SUPER_ADMIN` via `private.can_manage_events()`.
- **Return JSONB**:
  - Event metadata (`id`, `title`, `event_type`, `venue_name`, `maps_url`, `event_date`, `reporting_at`, `work_starts_at`, `expected_ends_at`, `daily_wage`, `currency_code`, `instructions`, `dress_code`, `event_status`, `recruitment_status`, `tier_strategy`, `version`).
  - Staffing metrics (`required_worker_count`, `confirmed_count`, `waitlist_count`, `open_review_flags`).
  - Embedded arrays:
    - `leaders`: `[{ user_id, full_name, leader_role }]`
    - `requirements`: `[{ id, name, description, is_mandatory, acknowledgement_required, extra_allowance_amount, display_order }]`
    - `allowances`: `[{ id, label, description, amount, display_order }]`

### 4. `search_workers`
- **Underlying RPC**: `public.worker_directory(p_search_text, p_account_filter, p_category_filter, p_result_limit, p_result_offset)`
- **Parameters**:
  - `p_search_text text DEFAULT NULL`
  - `p_account_filter public.account_status DEFAULT NULL`
  - `p_category_filter public.worker_category DEFAULT NULL`
  - `p_result_limit integer DEFAULT 50`
  - `p_result_offset integer DEFAULT 0`
- **PII Sanitization**:
  The raw RPC returns full profile rows including personal identifying information. The chatbot DTO explicitly selects only:
  - `worker_id`
  - `worker_number`
  - `full_name`
  - `category`
  - `account_status`
  - `reliability_score`
  **Explicitly Excluded**: `phone_e164`, `date_of_birth`, `address`, `native_place`, `id_card_file_path`, `profile_photo_path`, auth metadata.

### 5. `get_worker_details`
- **Underlying RPC**: `public.worker_profile_detail(p_target_user_id uuid)`
- **Parameters**: `p_target_user_id uuid`
- **PII Sanitization**:
  Preserves operational metrics and experience details while stripping sensitive identity documents and contact details:
  - **Preserved**: `worker_id`, `worker_number`, `full_name`, `role`, `account_status`, `category`, `last_worker_category`, `profile_completed_at`, `reliability_score`, `reliability_state`, `reliability_sample_count`, `reliability_present_count`, `reliability_late_count`, `reliability_absent_count`, `reliability_worker_cancellation_count`, `reliability_completed_event_count`, `reliability_performance_event_count`, `reliability_performance_average`, `experience_level`, `education_status`, `has_previous_experience`, `experience_details`.
  - **Explicitly Excluded**: `phone_e164`, `date_of_birth`, `address`, `native_place`, `id_card_file_path`, `profile_photo_path`.

### 6. `get_worker_history`
- **Underlying RPC**: `public.worker_history(p_target_user_id uuid)`
- **Parameters**: `p_target_user_id uuid` (Does not accept limit parameter in SQL).
- **Behavior**: Server-side chronological limiting (default 50, max 100). Redacts raw phone numbers when `history_type === 'phone'`.

### 7. `get_event_report`
- **Selective Section Execution**:
  - `section = 'summary'`: Calls **only** `public.event_report_summary(p_event_id uuid)`.
  - `section = 'staffing'`: Calls **only** `public.event_staffing_report(p_event_id uuid)`. Excludes worker phone numbers.
  - `section = 'audit'`: Calls **only** `public.event_audit_history_filtered(p_event_id uuid, p_action_filter text, p_actor_role_filter public.app_role, p_limit integer, p_offset integer)`. Excludes raw before/after JSON blobs.
  - `section = 'full'`: Executes all 3 RPCs and combines results into `CombinedEventReportDto`.

---

## 4. Enums & Values

### `public.app_role`
- `SUPER_ADMIN`, `ADMIN` (Permitted for Chatbot operations)
- `CAPTAIN`, `SUPERVISOR`, `WORKER` (Forbidden from Chatbot backend)

### `public.account_status`
- `ACTIVE` (Required)
- `SUSPENDED`, `DETAINED`, `BLACKLISTED`, `INACTIVE`, `PENDING_APPROVAL`, `REJECTED` (Restricted)

### `public.worker_category`
- `A`, `B`, `C`, `F`

### `public.event_status`
- `DRAFT`, `PUBLISHED`, `UPCOMING`, `IN_PROGRESS`, `COMPLETED`, `CLOSED`, `CANCELLED`

### `public.recruitment_status`
- `NOT_OPEN`, `OPEN`, `FULL`, `CLOSED`

### `public.tier_strategy`
- `STANDARD`, `URGENT`, `EMERGENCY`, `CUSTOM`
