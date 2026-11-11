import type { Role, TableName } from "./types";

export type TableAction = "read" | "insert" | "update" | "delete";

/**
 * Role matrix — mirrored 1:1 by the Row Level Security policies in supabase/migrations.
 * Owners and administrators manage everything; team members work on jobs, costs and customers
 * but cannot delete business records, change settings or manage the team.
 */
const MEMBER_RULES: Record<TableName, TableAction[]> = {
  customers: ["read", "insert", "update"],
  employees: ["read"],
  service_categories: ["read"],
  jobs: ["read", "insert", "update"],
  job_cost_entries: ["read", "insert", "update", "delete"],
  activity_logs: ["insert"],
  organization_invites: [],
};

export function canTable(role: Role, action: TableAction, table: TableName): boolean {
  if (role === "owner" || role === "admin") return true;
  return MEMBER_RULES[table].includes(action);
}

export const canManageBusiness = (role: Role) => role === "owner" || role === "admin";
export const canDeleteBusiness = (role: Role) => role === "owner";
