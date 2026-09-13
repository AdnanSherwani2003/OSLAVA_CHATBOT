export const APP_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "CAPTAIN",
  "SUPERVISOR",
  "WORKER",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ALLOWED_ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"] as const;
export type AllowedAdminRole = (typeof ALLOWED_ADMIN_ROLES)[number];

export const ACCOUNT_STATUSES = [
  "ACTIVE",
  "SUSPENDED",
  "DETAINED",
  "BLACKLISTED",
  "INACTIVE",
  "PENDING_APPROVAL",
  "REJECTED",
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const WORKER_CATEGORIES = ["A", "B", "C", "F"] as const;
export type WorkerCategory = (typeof WORKER_CATEGORIES)[number];

/**
 * Direct representation of a profile row returned from public.my_profile() RPC.
 */
export interface MyProfileRow {
  id: string;
  worker_number: number | string | null;
  role: AppRole;
  full_name: string;
  initials: string | null;
  phone_e164: string | null;
  profile_photo_path: string | null;
  profile_completed_at: string | null;
  account_status: AccountStatus;
  category: WorkerCategory | null;
  last_worker_category: WorkerCategory | null;
}

/**
 * Normalized internal user profile record.
 */
export interface UserProfileRecord {
  userId: string;
  workerNumber: number | null;
  role: AppRole;
  fullName: string;
  initials: string | null;
  phoneE164: string | null;
  accountStatus: AccountStatus;
  category: WorkerCategory | null;
}

/**
 * Safe public representation returned by /v1/auth/me.
 * Secrets, raw tokens, and sensitive DB fields are excluded.
 */
export interface AuthMeResponse {
  request_id: string;
  user_id: string;
  role: AllowedAdminRole;
  display_name: string;
  account_status: "ACTIVE";
  worker_number?: number;
}
