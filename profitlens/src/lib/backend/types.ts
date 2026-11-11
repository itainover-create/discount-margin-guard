import type { BusinessSettings, Member, Organization, Role, TableMap, TableName, User } from "../types";

export type BackendErrorCode =
  | "invalid_credentials"
  | "email_taken"
  | "confirm_email"
  | "not_authenticated"
  | "forbidden"
  | "not_found"
  | "storage"
  | "network"
  | "unknown";

/** Every backend failure surfaces as this error with a safe, user-presentable Hebrew message. */
export class BackendError extends Error {
  constructor(
    public code: BackendErrorCode,
    message?: string,
  ) {
    super(message ?? BACKEND_MESSAGES[code]);
    this.name = "BackendError";
  }
}

export const BACKEND_MESSAGES: Record<BackendErrorCode, string> = {
  invalid_credentials: "אימייל או סיסמה שגויים",
  email_taken: "כבר קיים חשבון עם כתובת האימייל הזו",
  confirm_email: "נשלח אליך אימייל לאימות. יש לאשר אותו ואז להתחבר.",
  not_authenticated: "יש להתחבר מחדש",
  forbidden: "אין לך הרשאה לבצע את הפעולה",
  not_found: "הרשומה לא נמצאה",
  storage: "שמירת הנתונים נכשלה. ייתכן שאחסון הדפדפן מלא או חסום.",
  network: "אירעה שגיאת תקשורת. נסו שוב.",
  unknown: "אירעה שגיאה לא צפויה. נסו שוב.",
};

export interface Workspace {
  organization: Organization;
  settings: BusinessSettings;
  role: Role;
}

export type SettingsInput = Partial<Omit<BusinessSettings, "organization_id" | "updated_at">>;

export interface NewOrganizationInput {
  name: string;
  business_type: string;
  country: string;
  currency: string;
  language: string;
  settings: SettingsInput;
  categories: string[];
}

/** Columns the backend assigns itself. */
export type ServerColumns = "id" | "organization_id" | "created_at" | "updated_at" | "job_number";
export type NewRow<T extends TableName> = Omit<TableMap[T], ServerColumns>;
export type RowPatch<T extends TableName> = Partial<NewRow<T>>;

export interface Backend {
  readonly mode: "demo" | "supabase";
  getUser(): Promise<User | null>;
  signUp(input: { email: string; password: string; name: string }): Promise<User>;
  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  updatePassword(current: string, next: string): Promise<void>;
  updateProfile(name: string): Promise<User>;

  /** The signed-in user's business, accepting a pending invitation if one exists. */
  getWorkspace(): Promise<Workspace | null>;
  createOrganization(input: NewOrganizationInput): Promise<Workspace>;
  updateOrganization(orgId: string, patch: Partial<Omit<Organization, "id" | "created_at">>): Promise<Organization>;
  updateSettings(orgId: string, patch: SettingsInput): Promise<BusinessSettings>;
  deleteOrganization(orgId: string): Promise<void>;

  listMembers(orgId: string): Promise<Member[]>;
  updateMemberRole(memberId: string, role: Role): Promise<void>;
  removeMember(memberId: string): Promise<void>;

  list<T extends TableName>(table: T, orgId: string): Promise<TableMap[T][]>;
  insert<T extends TableName>(table: T, orgId: string, rows: NewRow<T>[]): Promise<TableMap[T][]>;
  update<T extends TableName>(table: T, id: string, patch: RowPatch<T>): Promise<TableMap[T]>;
  remove(table: TableName, ids: string[]): Promise<void>;
}

export const DEFAULT_SETTINGS: Omit<BusinessSettings, "organization_id" | "updated_at"> = {
  vat_rate_bp: 1800,
  vat_mode: "added",
  default_hourly_cost: 0,
  target_margin_bp: 3000,
  overhead_method: "none",
  monthly_overhead: 0,
  billable_hours: 0,
  fixed_overhead_per_job: 0,
  overhead_revenue_pct_bp: 0,
  payment_fee_bp: 0,
  date_format: "dd/MM/yyyy",
  dashboard_range: "this_month",
  onboarded: true,
};
