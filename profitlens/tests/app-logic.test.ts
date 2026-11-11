import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";
import { addDays, inRange, resolveRange, startOfWeek } from "@/lib/dates";
import { costsCsv, jobsCsv } from "@/lib/exports";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { buildJobRows, buildWarnings, byCustomer, byEmployee, byPeriod, byService, reportedRows, statusCounts, totals } from "@/lib/reports";
import { buildSampleData } from "@/lib/seed";
import type { BusinessSettings, Customer, Employee, Job, JobCostEntry, ServiceCategory } from "@/lib/types";
import { costEntrySchema, customerSchema, financialSettingsSchema, jobSchema, onboardingSchema, registerSchema } from "@/lib/validation";

const settings: BusinessSettings = {
  organization_id: "org", vat_rate_bp: 1800, vat_mode: "added", default_hourly_cost: 9000, target_margin_bp: 3000, overhead_method: "hours",
  monthly_overhead: 600000, billable_hours: 120, fixed_overhead_per_job: 0, overhead_revenue_pct_bp: 0, payment_fee_bp: 0,
  date_format: "dd/MM/yyyy", dashboard_range: "this_month", onboarded: true, updated_at: "",
};

/** Materialises the fictional sample set into rows, the way the store does. */
function sampleWorld(now = "2026-06-15", s = settings) {
  const sample = buildSampleData(s, now);
  const row = (i: number) => ({ id: `id${i}`, organization_id: "org", created_at: `${now}T00:00:00Z` });
  let n = 0;
  const customers: Customer[] = sample.customers.map((c) => ({ ...row(++n), ...c }));
  const employees: Employee[] = sample.employees.map((e) => ({ ...row(++n), ...e }));
  const categories: ServiceCategory[] = sample.categories.map((name) => ({ ...row(++n), name }));
  const jobs: Job[] = [];
  const entries: JobCostEntry[] = [];
  sample.jobs.forEach((item, index) => {
    const job: Job = {
      ...row(++n), ...item.job, job_number: index + 1, updated_at: "", customer_id: customers[item.customer].id,
      service_category_id: categories.find((c) => c.name === item.category)!.id,
    };
    jobs.push(job);
    for (const { employeeIndex, ...entry } of item.entries) {
      entries.push({ ...row(++n), ...entry, job_id: job.id, employee_id: employeeIndex == null ? null : employees[employeeIndex].id });
    }
  });
  return { customers, employees, categories, jobs, entries, rows: buildJobRows({ jobs, entries, customers, categories }, s) };
}

describe("CSV export", () => {
  it("escapes quotes, commas and new lines", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12.5)).toBe("12.5");
    expect(toCsv(["א", "ב"], [["x", 1]])).toBe("א,ב\r\nx,1\r\n");
  });
  it("neutralises spreadsheet formulas but keeps negative numbers", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("+972-50-0000000")).toBe("'+972-50-0000000");
    expect(csvCell("-150.00")).toBe("-150.00");
  });
  it("exports one row per job / cost entry with exact decimals", () => {
    const world = sampleWorld();
    const jobs = jobsCsv(world.rows).trim().split("\r\n");
    expect(jobs).toHaveLength(world.jobs.length + 1);
    expect(jobs[1]).toContain("2400.00");
    expect(costsCsv(world.rows, world.employees).trim().split("\r\n")).toHaveLength(world.entries.length + 1);
  });
});

describe("date filters", () => {
  const now = "2026-11-11"; // a Wednesday
  it("resolves presets (Sunday-based week)", () => {
    expect(startOfWeek(now)).toBe("2026-11-08");
    expect(resolveRange("this_week", now)).toEqual({ from: "2026-11-08", to: "2026-11-14" });
    expect(resolveRange("this_month", now)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(resolveRange("last_month", now)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolveRange("last_90", now)).toEqual({ from: "2026-08-14", to: "2026-11-11" });
    expect(resolveRange("this_year", now)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(resolveRange("all", now)).toEqual({ from: null, to: null });
  });
  it("handles year and leap-day boundaries", () => {
    expect(resolveRange("last_month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(resolveRange("this_month", "2028-02-10").to).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("custom range is inclusive, order-tolerant and may be open-ended", () => {
    const range = resolveRange("custom", now, { from: "2026-03-31", to: "2026-03-01" });
    expect(range).toEqual({ from: "2026-03-01", to: "2026-03-31" });
    expect(inRange("2026-03-01", range)).toBe(true);
    expect(inRange("2026-03-31T22:00:00Z", range)).toBe(true);
    expect(inRange("2026-04-01", range)).toBe(false);
    expect(inRange(null, range)).toBe(false);
    expect(inRange(null, { from: null, to: null })).toBe(true);
    expect(inRange("2030-01-01", { from: "2026-01-01", to: null })).toBe(true);
  });
});

describe("formatting (Israeli locale)", () => {
  const plain = (s: string) => s.replace(/[⁦⁩‎‏ \s]/g, "");
  it("money, percent and dates", () => {
    expect(plain(formatMoney(128571))).toMatch(/1,285\.71/);
    expect(plain(formatMoney(128571))).toContain("₪");
    expect(plain(formatMoney(150000))).toMatch(/1,500(?!\.)/);
    expect(plain(formatMoney(-15000))).toMatch(/150/);
    expect(formatMoney(null)).toBe("—");
    expect(plain(formatPercent(-3000))).toBe("−30%");
    expect(formatPercent(null)).toBe("—");
    expect(formatDate("2026-11-05")).toBe("05/11/2026");
    expect(formatDate("2026-11-05", "dd.MM.yyyy")).toBe("05.11.2026");
    expect(formatDate(null)).toBe("—");
  });
});

describe("form validation", () => {
  const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;
  const job = { title: "עבודה", customer_id: "", service_category_id: "", description: "", status: "draft", planned_date: "", completed_date: "", quoted_price: "1500", final_price: "", vat_mode: "added", vat_rate: "18", payment_fee: "0", notes: "" };
  it("job form", () => {
    expect(ok(jobSchema, job)).toBe(true);
    expect(ok(jobSchema, { ...job, title: " " })).toBe(false);
    expect(ok(jobSchema, { ...job, quoted_price: "-1" })).toBe(false);
    expect(ok(jobSchema, { ...job, quoted_price: "abc" })).toBe(false);
    expect(ok(jobSchema, { ...job, vat_rate: "101" })).toBe(false);
    expect(ok(jobSchema, { ...job, status: "completed" })).toBe(false);
    expect(ok(jobSchema, { ...job, status: "completed", completed_date: "2026-01-01" })).toBe(true);
    expect(ok(jobSchema, { ...job, status: "weird" })).toBe(false);
  });
  it("cost entries require the fields of their category", () => {
    const base = { kind: "actual", category: "materials", description: "", entry_date: "2026-01-01", quantity: "", unit: "", unit_cost: "", employee_id: "", hours: "", hourly_cost: "", distance_km: "", rate_per_km: "", parking: "", other_travel: "", amount: "" };
    expect(ok(costEntrySchema, base)).toBe(false);
    expect(ok(costEntrySchema, { ...base, description: "צינור", quantity: "2", unit_cost: "30" })).toBe(true);
    expect(ok(costEntrySchema, { ...base, category: "labor", hours: "3" })).toBe(false);
    expect(ok(costEntrySchema, { ...base, category: "labor", hours: "3", hourly_cost: "90" })).toBe(true);
    expect(ok(costEntrySchema, { ...base, category: "transport" })).toBe(false);
    expect(ok(costEntrySchema, { ...base, category: "transport", distance_km: "20" })).toBe(false);
    expect(ok(costEntrySchema, { ...base, category: "transport", parking: "15" })).toBe(true);
    expect(ok(costEntrySchema, { ...base, category: "other", description: "x", amount: "-3" })).toBe(false);
  });
  it("registration, customers and settings", () => {
    expect(ok(registerSchema, { name: "אלון", email: "a@b.co", password: "12345678", confirm: "12345678" })).toBe(true);
    expect(ok(registerSchema, { name: "אלון", email: "a@b.co", password: "1234567", confirm: "1234567" })).toBe(false);
    expect(ok(registerSchema, { name: "אלון", email: "nope", password: "12345678", confirm: "12345678" })).toBe(false);
    expect(ok(customerSchema, { name: "לקוח", business_name: "", phone: "", email: "", notes: "" })).toBe(true);
    expect(ok(customerSchema, { name: "לקוח", business_name: "", phone: "abc", email: "", notes: "" })).toBe(false);
    const fin = { vat_rate: "18", vat_mode: "added", default_hourly_cost: "90", target_margin: "30", overhead_method: "hours", monthly_overhead: "6000", billable_hours: "120", fixed_overhead_per_job: "0", overhead_revenue_pct: "0", payment_fee: "1.5" };
    expect(ok(financialSettingsSchema, fin)).toBe(true);
    expect(ok(financialSettingsSchema, { ...fin, target_margin: "100" })).toBe(false);
    expect(ok(financialSettingsSchema, { ...fin, payment_fee: "25" })).toBe(false);
    const onboarding = { name: "עסק", business_type: "hvac", country: "IL", currency: "ILS", language: "he", vat_rate: "18", vat_mode: "added", default_hourly_cost: "", target_margin: "30", monthly_overhead: "", billable_hours: "" };
    expect(ok(onboardingSchema, onboarding)).toBe(true);
    expect(ok(onboardingSchema, { ...onboarding, name: "" })).toBe(false);
  });
});

describe("sample data and reports", () => {
  const world = sampleWorld();
  const completed = reportedRows(world.rows, { from: null, to: null });

  it("sample set is flagged fictional and covers the required cases", () => {
    expect(world.jobs.length).toBeGreaterThanOrEqual(5);
    expect(world.jobs.every((j) => j.is_sample)).toBe(true);
    expect(world.customers.every((c) => c.is_sample)).toBe(true);
    const margins = completed.map((r) => r.fin.actual.marginBp ?? 0);
    expect(margins.some((m) => m >= 5000)).toBe(true); // highly profitable
    expect(margins.some((m) => m > 0 && m < 1500)).toBe(true); // low margin
    expect(completed.some((r) => r.fin.actual.profit < 0)).toBe(true); // loss-making
    expect(completed.some((r) => r.fin.variance.directCosts.diff > 0)).toBe(true); // over estimate
  });
  it("entered prices follow the VAT mode but revenue stays before VAT", () => {
    const included = sampleWorld("2026-06-15", { ...settings, vat_mode: "included" });
    expect(included.jobs[0].quoted_price).toBe(283200);
    expect(included.rows[0].fin.actual.revenue).toBe(240000);
    expect(totals(reportedRows(included.rows, { from: null, to: null })).revenue).toBe(totals(completed).revenue);
  });
  it("totals reconcile across every breakdown", () => {
    const sum = totals(completed);
    expect(sum.jobs).toBe(9);
    expect(sum.profit).toBe(sum.revenue - sum.directCosts);
    expect(sum.contribution).toBe(sum.profit - sum.overhead);
    for (const groups of [byService(completed), byCustomer(completed), byPeriod(completed, "month"), byPeriod(completed, "week")]) {
      expect(groups.reduce((s, g) => s + g.revenue, 0)).toBe(sum.revenue);
      expect(groups.reduce((s, g) => s + g.profit, 0)).toBe(sum.profit);
      expect(groups.reduce((s, g) => s + g.jobs, 0)).toBe(sum.jobs);
    }
    expect(byCustomer(completed)[0].contribution).toBeGreaterThanOrEqual(byCustomer(completed)[1].contribution);
  });
  it("only completed, non-archived jobs inside the period are reported", () => {
    expect(reportedRows(world.rows, { from: "2026-06-01", to: "2026-06-30" }).length).toBe(3);
    expect(reportedRows(world.rows, { from: "2031-01-01", to: "2031-12-31" })).toEqual([]);
    const archived = world.rows.map((r, i) => (i === 0 ? { ...r, job: { ...r.job, archived: true } } : r));
    expect(reportedRows(archived, { from: null, to: null }).length).toBe(8);
    expect(totals([])).toMatchObject({ jobs: 0, revenue: 0, marginBp: null, contributionMarginBp: null });
  });
  it("employee attribution distributes each job's profit and reports unattributed jobs", () => {
    const { rows, unattributedJobs } = byEmployee(completed, world.employees);
    expect(unattributedJobs).toBe(0);
    const attributed = rows.reduce((s, r) => s + r.attributedProfit, 0);
    expect(Math.abs(attributed - totals(completed).profit)).toBeLessThanOrEqual(completed.length * 2);
    const noLabor = completed.map((r) => ({ ...r, entries: r.entries.filter((e) => e.category !== "labor") }));
    expect(byEmployee(noLabor, world.employees)).toEqual({ rows: [], unattributedJobs: completed.length });
  });
  it("warnings come only from recorded data", () => {
    const warnings = buildWarnings(world.rows, settings);
    const types = (title: string) => warnings.filter((w) => w.jobTitle.includes(title)).map((w) => w.type);
    expect(types("תיקון נזילה")).toEqual(expect.arrayContaining(["loss", "materials_over", "labor_over"]));
    expect(types("ניקיון דירה לפני כניסה")).toEqual(expect.arrayContaining(["below_target", "labor_over"]));
    expect(types("התקנת 3 מזגנים")).toContain("materials_over");
    expect(types("תיקון מזגן — אינו מקרר")).toEqual([]); // cancelled jobs are ignored
    expect(types("בדיקת מערכת חשמל")).toEqual([]); // unpriced draft is not a warning
    expect(warnings[0].severity).toBe("critical");
    expect(buildWarnings([], settings)).toEqual([]);
    const missing = world.rows.filter((r) => r.job.status === "completed").slice(0, 1).map((r) => ({ ...r, entries: [], fin: { ...r.fin, hasActualCosts: false } }));
    expect(buildWarnings(missing, settings).map((w) => w.type)).toEqual(["missing_costs"]);
  });
  it("status overview counts every status", () => {
    expect(statusCounts(world.rows)).toEqual({ draft: 1, quoted: 1, approved: 1, in_progress: 1, completed: 9, cancelled: 1 });
  });
});
