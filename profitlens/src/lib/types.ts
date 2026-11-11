/**
 * Domain types. Field names are snake_case so rows map 1:1 to the Postgres schema.
 * MONEY: every monetary field is an integer number of minor units (agorot). Never floats.
 * RATES: percentages are stored as basis points (18% = 1800).
 */
export type Role = "owner" | "admin" | "member";
export type VatMode = "added" | "included" | "none";
export type OverheadMethod = "none" | "fixed" | "hours" | "revenue_pct";
export type JobStatus = "draft" | "quoted" | "approved" | "in_progress" | "completed" | "cancelled";
export type CostKind = "estimated" | "actual";
export type CostCategory = "materials" | "labor" | "transport" | "contractor" | "other";

export const JOB_STATUSES: JobStatus[] = ["draft", "quoted", "approved", "in_progress", "completed", "cancelled"];
export const COST_CATEGORIES: CostCategory[] = ["materials", "labor", "transport", "contractor", "other"];

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Organization {
  id: string;
  name: string;
  business_type: string;
  country: string;
  currency: string;
  language: string;
  created_at: string;
}

export interface BusinessSettings {
  organization_id: string;
  vat_rate_bp: number;
  vat_mode: VatMode;
  default_hourly_cost: number;
  target_margin_bp: number;
  overhead_method: OverheadMethod;
  monthly_overhead: number;
  billable_hours: number;
  fixed_overhead_per_job: number;
  overhead_revenue_pct_bp: number;
  payment_fee_bp: number;
  date_format: "dd/MM/yyyy" | "dd.MM.yyyy" | "yyyy-MM-dd";
  dashboard_range: string;
  onboarded: boolean;
  updated_at: string;
}

export interface Member {
  id: string;
  organization_id: string;
  user_id: string;
  role: Role;
  email: string;
  name: string;
  created_at: string;
}

export interface Invite {
  id: string;
  organization_id: string;
  email: string;
  role: Role;
  created_at: string;
}

interface OrgRow {
  id: string;
  organization_id: string;
  created_at: string;
}

export interface Customer extends OrgRow {
  name: string;
  business_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_sample: boolean;
}

export interface Employee extends OrgRow {
  name: string;
  role: Role;
  hourly_cost: number;
  active: boolean;
  is_sample: boolean;
}

export interface ServiceCategory extends OrgRow {
  name: string;
}

export interface Job extends OrgRow {
  job_number: number;
  title: string;
  customer_id: string | null;
  service_category_id: string | null;
  description: string | null;
  status: JobStatus;
  planned_date: string | null;
  completed_date: string | null;
  /** Price as entered by the user; meaning depends on vat_mode (see finance engine). */
  quoted_price: number | null;
  final_price: number | null;
  vat_mode: VatMode;
  vat_rate_bp: number;
  payment_fee_bp: number;
  notes: string | null;
  archived: boolean;
  is_sample: boolean;
  updated_at: string;
}

export interface JobCostEntry extends OrgRow {
  job_id: string;
  kind: CostKind;
  category: CostCategory;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  employee_id: string | null;
  hours: number | null;
  hourly_cost: number | null;
  distance_km: number | null;
  rate_per_km: number | null;
  parking: number | null;
  other_travel: number | null;
  /** Total for the entry in agorot, always derived by the finance engine. */
  amount: number;
  entry_date: string;
}

export interface ActivityLog extends OrgRow {
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  summary: string;
}

export interface TableMap {
  customers: Customer;
  employees: Employee;
  service_categories: ServiceCategory;
  jobs: Job;
  job_cost_entries: JobCostEntry;
  activity_logs: ActivityLog;
  organization_invites: Invite;
}
export type TableName = keyof TableMap;
