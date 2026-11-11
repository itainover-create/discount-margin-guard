/** Aggregations for the dashboard and reports. Everything is derived from recorded data only. */
import { inRange, monthKey, weekKey, type DateRange } from "./dates";
import { computeJobFinancials, type JobFinancials, type Profitability } from "./finance/engine";
import { marginBp } from "./finance/engine";
import { JOB_STATUSES } from "./types";
import type { BusinessSettings, CostCategory, Customer, Employee, Job, JobCostEntry, JobStatus, ServiceCategory } from "./types";

export interface JobRow {
  job: Job;
  entries: JobCostEntry[];
  fin: JobFinancials;
  customer: Customer | null;
  category: ServiceCategory | null;
  /** The side used for reporting: actual figures once work has started, the estimate before that */
  view: Profitability;
  usesActual: boolean;
  /** Completion date, else planned date, else creation date */
  date: string;
}

export interface ReportData {
  jobs: Job[];
  entries: JobCostEntry[];
  customers: Customer[];
  categories: ServiceCategory[];
}

export function buildJobRows(data: ReportData, settings: BusinessSettings): JobRow[] {
  const byJob = new Map<string, JobCostEntry[]>();
  for (const entry of data.entries) {
    const list = byJob.get(entry.job_id);
    if (list) list.push(entry);
    else byJob.set(entry.job_id, [entry]);
  }
  const customers = new Map(data.customers.map((c) => [c.id, c]));
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  return data.jobs.map((job) => {
    const entries = byJob.get(job.id) ?? [];
    const fin = computeJobFinancials(job, entries, settings);
    const usesActual = job.status === "completed" || job.status === "in_progress" || fin.hasActualCosts;
    return {
      job,
      entries,
      fin,
      customer: job.customer_id ? (customers.get(job.customer_id) ?? null) : null,
      category: job.service_category_id ? (categories.get(job.service_category_id) ?? null) : null,
      view: usesActual ? fin.actual : fin.estimated,
      usesActual,
      date: job.completed_date ?? job.planned_date ?? job.created_at.slice(0, 10),
    };
  });
}

/** Jobs that count toward reported results: completed, not archived, inside the period. */
export function reportedRows(rows: JobRow[], range: DateRange): JobRow[] {
  return rows.filter((r) => r.job.status === "completed" && !r.job.archived && inRange(r.job.completed_date ?? r.date, range));
}

export interface Totals {
  jobs: number;
  revenue: number;
  directCosts: number;
  profit: number;
  overhead: number;
  contribution: number;
  /** Total profit ÷ total revenue (revenue-weighted), null without revenue */
  marginBp: number | null;
  contributionMarginBp: number | null;
}

export function totals(rows: JobRow[]): Totals {
  const acc = { jobs: rows.length, revenue: 0, directCosts: 0, profit: 0, overhead: 0, contribution: 0 };
  for (const { fin } of rows) {
    acc.revenue += fin.actual.revenue;
    acc.directCosts += fin.actual.directCosts;
    acc.profit += fin.actual.profit;
    acc.overhead += fin.actual.overhead;
    acc.contribution += fin.actual.contribution;
  }
  return { ...acc, marginBp: marginBp(acc.profit, acc.revenue), contributionMarginBp: marginBp(acc.contribution, acc.revenue) };
}

export interface GroupTotals extends Totals {
  key: string;
  label: string;
}

function groupBy(rows: JobRow[], keyOf: (row: JobRow) => { key: string; label: string }): GroupTotals[] {
  const groups = new Map<string, { label: string; rows: JobRow[] }>();
  for (const row of rows) {
    const { key, label } = keyOf(row);
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { label, rows: [row] });
  }
  return [...groups.entries()].map(([key, group]) => ({ key, label: group.label, ...totals(group.rows) }));
}

export const UNASSIGNED = "__none__";

export const byService = (rows: JobRow[]) =>
  groupBy(rows, (r) => ({ key: r.category?.id ?? UNASSIGNED, label: r.category?.name ?? "ללא קטגוריה" })).sort(
    (a, b) => b.contribution - a.contribution,
  );

export const byCustomer = (rows: JobRow[]) =>
  groupBy(rows, (r) => ({ key: r.customer?.id ?? UNASSIGNED, label: r.customer?.name ?? "ללא לקוח" })).sort(
    (a, b) => b.contribution - a.contribution,
  );

export const byPeriod = (rows: JobRow[], granularity: "week" | "month") =>
  groupBy(rows, (r) => {
    const key = granularity === "month" ? monthKey(r.date) : weekKey(r.date);
    return { key, label: key };
  }).sort((a, b) => a.key.localeCompare(b.key));

export interface EmployeeTotals {
  key: string;
  label: string;
  jobs: number;
  hours: number;
  laborCost: number;
  /** Share of each job's direct profit, attributed by the employee's share of recorded labor hours */
  attributedProfit: number;
  /** Attributed profit per recorded hour; null without hours */
  profitPerHour: number | null;
}

/**
 * Attribution is proportional to recorded actual labor hours. Jobs without labor records cannot be
 * attributed and are returned in `unattributedJobs` so the report can say so instead of guessing.
 */
export function byEmployee(rows: JobRow[], employees: Employee[]): { rows: EmployeeTotals[]; unattributedJobs: number } {
  const names = new Map(employees.map((e) => [e.id, e.name]));
  const acc = new Map<string, EmployeeTotals & { jobIds: Set<string> }>();
  let unattributedJobs = 0;
  for (const row of rows) {
    const labor = row.entries.filter((e) => e.kind === "actual" && e.category === "labor" && (e.hours ?? 0) > 0);
    const jobHours = labor.reduce((s, e) => s + (e.hours ?? 0), 0);
    if (jobHours <= 0) {
      unattributedJobs += 1;
      continue;
    }
    for (const entry of labor) {
      const key = entry.employee_id ?? UNASSIGNED;
      let item = acc.get(key);
      if (!item) {
        item = {
          key, label: entry.employee_id ? (names.get(entry.employee_id) ?? "עובד/ת שנמחק/ה") : "שעות ללא שיוך לעובד",
          jobs: 0, hours: 0, laborCost: 0, attributedProfit: 0, profitPerHour: null, jobIds: new Set(),
        };
        acc.set(key, item);
      }
      item.jobIds.add(row.job.id);
      item.hours += entry.hours ?? 0;
      item.laborCost += entry.amount;
      item.attributedProfit += Math.round((row.fin.actual.profit * (entry.hours ?? 0)) / jobHours);
    }
  }
  const result = [...acc.values()].map(({ jobIds, ...item }) => ({
    ...item,
    jobs: jobIds.size,
    hours: Math.round(item.hours * 1000) / 1000,
    profitPerHour: item.hours > 0 ? Math.round(item.attributedProfit / item.hours) : null,
  }));
  return { rows: result.sort((a, b) => b.attributedProfit - a.attributedProfit), unattributedJobs };
}

export function statusCounts(rows: JobRow[]): Record<JobStatus, number> {
  const counts = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
  for (const row of rows) if (!row.job.archived) counts[row.job.status] += 1;
  return counts;
}

export type WarningType = "loss" | "below_target" | "materials_over" | "labor_over" | "missing_costs" | "no_price";

export interface Warning {
  type: WarningType;
  severity: "critical" | "warning" | "info";
  jobId: string;
  jobTitle: string;
  /** Amount or basis-point figure that explains the warning */
  value: number | null;
  reference: number | null;
  category?: CostCategory;
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

/** Warnings are computed strictly from recorded figures — nothing is inferred or invented. */
export function buildWarnings(rows: JobRow[], settings: BusinessSettings): Warning[] {
  const warnings: Warning[] = [];
  for (const row of rows) {
    const { job, fin, view } = row;
    if (job.archived || job.status === "cancelled") continue;
    const base = { jobId: job.id, jobTitle: job.title };
    const active = job.status === "completed" || job.status === "in_progress";
    if (job.quoted_price == null && job.final_price == null) {
      if (job.status !== "draft") warnings.push({ ...base, type: "no_price", severity: "info", value: null, reference: null });
      continue;
    }
    if (active && !fin.hasActualCosts) {
      warnings.push({ ...base, type: "missing_costs", severity: "warning", value: null, reference: null });
      continue;
    }
    const hasCosts = row.usesActual ? fin.hasActualCosts : fin.hasEstimatedCosts;
    if (hasCosts && view.profit < 0) {
      warnings.push({ ...base, type: "loss", severity: "critical", value: view.profit, reference: null });
    } else if (hasCosts && view.marginBp != null && view.marginBp < settings.target_margin_bp) {
      warnings.push({ ...base, type: "below_target", severity: "warning", value: view.marginBp, reference: settings.target_margin_bp });
    }
    if (fin.hasActualCosts && fin.hasEstimatedCosts) {
      const materials = fin.variance.categories.materials;
      if (materials.estimated > 0 && materials.diff > 0) {
        warnings.push({ ...base, type: "materials_over", severity: "warning", value: materials.diff, reference: materials.estimated, category: "materials" });
      }
      if (fin.estimated.hours > 0 && fin.actual.hours > fin.estimated.hours) {
        warnings.push({ ...base, type: "labor_over", severity: "warning", value: fin.actual.hours, reference: fin.estimated.hours, category: "labor" });
      }
    }
  }
  return warnings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
