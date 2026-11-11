/** CSV builders. Amounts are exported as plain decimal shekels so spreadsheets can sum them. */
import { toCsv, type CsvCell } from "./csv";
import { minorToDecimalString, bpToPercentString } from "./finance/money";
import { t } from "./i18n";
import type { EmployeeTotals, GroupTotals, JobRow } from "./reports";
import type { Customer, Employee } from "./types";

const ils = (minor: number | null | undefined): CsvCell => (minor == null ? "" : minorToDecimalString(minor));
const pct = (bp: number | null | undefined): CsvCell => (bp == null ? "" : bpToPercentString(bp));

export function jobsCsv(rows: JobRow[]): string {
  return toCsv(
    [
      "מספר עבודה", "שם העבודה", "לקוח", "קטגוריה", "סטטוס", "תאריך מתוכנן", "תאריך סיום", "הכנסה לפני מע״מ (₪)", "מע״מ (₪)", "מחיר ללקוח (₪)",
      "עלויות ישירות מוערכות (₪)", "עלויות ישירות בפועל (₪)", "רווח מוערך לפני תקורה (₪)", "רווח בפועל לפני תקורה (₪)", "שיעור רווח בפועל (%)",
      "תקורה מועמסת (₪)", "תרומה תפעולית לאחר תקורה (₪)", "בארכיון", "נתוני דוגמה",
    ],
    rows.map(({ job, fin, customer, category }) => [
      job.job_number, job.title, customer?.name ?? "", category?.name ?? "", t.status[job.status], job.planned_date ?? "", job.completed_date ?? "",
      ils(fin.actual.revenue), ils(fin.actual.vat), ils(fin.actual.customerPrice), ils(fin.estimated.directCosts), ils(fin.actual.directCosts),
      ils(fin.estimated.profit), ils(fin.actual.profit), pct(fin.actual.marginBp), ils(fin.actual.overhead), ils(fin.actual.contribution),
      job.archived ? "כן" : "לא", job.is_sample ? "כן" : "לא",
    ]),
  );
}

export function costsCsv(rows: JobRow[], employees: Employee[]): string {
  const names = new Map(employees.map((e) => [e.id, e.name]));
  return toCsv(
    ["מספר עבודה", "שם העבודה", "סוג (הערכה/בפועל)", "קטגוריה", "תיאור", "תאריך", "כמות", "יחידה", "עלות ליחידה (₪)", "עובד/ת", "שעות", "עלות לשעה (₪)", "ק״מ", "עלות לק״מ (₪)", "חניה (₪)", "נסיעות אחרות (₪)", "סה״כ (₪)"],
    rows.flatMap(({ job, entries }) =>
      entries.map((e) => [
        job.job_number, job.title, t.kind[e.kind], t.category[e.category], e.description, e.entry_date, e.quantity, e.unit ?? "", ils(e.unit_cost),
        e.employee_id ? (names.get(e.employee_id) ?? "") : "", e.hours, ils(e.hourly_cost), e.distance_km, ils(e.rate_per_km), ils(e.parking), ils(e.other_travel), ils(e.amount),
      ]),
    ),
  );
}

export function customersCsv(customers: Customer[], totals: Map<string, GroupTotals>): string {
  return toCsv(
    ["שם הלקוח", "שם העסק", "טלפון", "אימייל", "הערות", "עבודות שהושלמו", "הכנסה לפני מע״מ (₪)", "רווח לפני תקורה (₪)", "תרומה תפעולית (₪)", "נתוני דוגמה"],
    customers.map((c) => {
      const sum = totals.get(c.id);
      return [c.name, c.business_name ?? "", c.phone ?? "", c.email ?? "", c.notes ?? "", sum?.jobs ?? 0, ils(sum?.revenue ?? 0), ils(sum?.profit ?? 0), ils(sum?.contribution ?? 0), c.is_sample ? "כן" : "לא"];
    }),
  );
}

export function groupCsv(firstColumn: string, groups: GroupTotals[], period: string): string {
  return toCsv(
    [firstColumn, "עבודות שהושלמו", "הכנסה לפני מע״מ (₪)", "עלויות ישירות (₪)", "רווח לפני תקורה (₪)", "שיעור רווח (%)", "תקורה מועמסת (₪)", "תרומה תפעולית לאחר תקורה (₪)", "תקופת הדוח"],
    groups.map((g) => [g.label, g.jobs, ils(g.revenue), ils(g.directCosts), ils(g.profit), pct(g.marginBp), ils(g.overhead), ils(g.contribution), period]),
  );
}

export function employeesCsv(rows: EmployeeTotals[], period: string): string {
  return toCsv(
    ["עובד/ת", "עבודות", "שעות שנרשמו", "עלות עבודה (₪)", "רווח מיוחס לפי שעות (₪)", "רווח מיוחס לשעה (₪)", "תקופת הדוח"],
    rows.map((r) => [r.label, r.jobs, r.hours, ils(r.laborCost), ils(r.attributedProfit), ils(r.profitPerHour), period]),
  );
}
