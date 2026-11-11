"use client";

import { BarChart3, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { RankChart } from "@/components/charts";
import { MarginBadge, Money, ProfitText } from "@/components/finance-ui";
import { RangeFilter, rangeLabel, useRange } from "@/components/range-filter";
import { Button, Card, CardHeader, EmptyState, Notice, PageHeader, Tabs } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";
import { today } from "@/lib/dates";
import { costsCsv, employeesCsv, groupCsv, jobsCsv } from "@/lib/exports";
import { formatMoney, formatMonthKey, formatNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { byCustomer, byEmployee, byPeriod, byService, reportedRows, totals, type GroupTotals } from "@/lib/reports";
import { useWorkspace } from "@/lib/store";

type Report = "service" | "customer" | "employee" | "monthly";

function GroupTable({ first, groups, target, overheadOn }: { first: string; groups: GroupTotals[]; target: number; overheadOn: boolean }) {
  const sum = groups.reduce(
    (acc, g) => ({ jobs: acc.jobs + g.jobs, revenue: acc.revenue + g.revenue, directCosts: acc.directCosts + g.directCosts, profit: acc.profit + g.profit, contribution: acc.contribution + g.contribution }),
    { jobs: 0, revenue: 0, directCosts: 0, profit: 0, contribution: 0 },
  );
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{first}</th>
            <th className="end">עבודות</th>
            <th className="end">{t.fin.revenue}</th>
            <th className="end">{t.fin.directCosts}</th>
            <th className="end">רווח לפני תקורה</th>
            <th className="end">שיעור רווח ממוצע</th>
            {overheadOn && <th className="end">תרומה תפעולית</th>}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key}>
              <td className="font-medium">{g.label}</td>
              <td className="end num">{g.jobs}</td>
              <td className="end"><Money value={g.revenue} /></td>
              <td className="end"><Money value={g.directCosts} /></td>
              <td className="end"><ProfitText value={g.profit} /></td>
              <td className="end"><MarginBadge bp={g.marginBp} target={target} /></td>
              {overheadOn && <td className="end"><ProfitText value={g.contribution} /></td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>סה״כ</td>
            <td className="end num">{sum.jobs}</td>
            <td className="end"><Money value={sum.revenue} /></td>
            <td className="end"><Money value={sum.directCosts} /></td>
            <td className="end"><ProfitText value={sum.profit} /></td>
            <td className="end" />
            {overheadOn && <td className="end"><ProfitText value={sum.contribution} /></td>}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function AnalyticsPage() {
  const { jobRows, settings, data } = useWorkspace();
  const rangeState = useRange("this_year");
  const [report, setReport] = useState<Report>("service");
  const overheadOn = settings.overhead_method !== "none";
  const period = rangeLabel(rangeState.preset, rangeState.range, settings.date_format);

  const view = useMemo(() => {
    const rows = reportedRows(jobRows, rangeState.range);
    return {
      rows,
      sum: totals(rows),
      service: byService(rows),
      customer: byCustomer(rows),
      employee: byEmployee(rows, data.employees),
      monthly: byPeriod(rows, "month").map((m) => ({ ...m, label: formatMonthKey(m.key) })),
    };
  }, [jobRows, rangeState.range, data.employees]);

  const stamp = today();
  const exportCurrent = () => {
    if (report === "service") downloadCsv(`profitlens-by-service-${stamp}.csv`, groupCsv("שירות", view.service, period));
    if (report === "customer") downloadCsv(`profitlens-by-customer-${stamp}.csv`, groupCsv("לקוח", view.customer, period));
    if (report === "monthly") downloadCsv(`profitlens-monthly-${stamp}.csv`, groupCsv("חודש", view.monthly, period));
    if (report === "employee") downloadCsv(`profitlens-by-employee-${stamp}.csv`, employeesCsv(view.employee.rows, period));
  };
  const measure = overheadOn ? "תרומה תפעולית לאחר תקורה" : "רווח לפני תקורה";
  const rank = (groups: GroupTotals[]) => groups.map((g) => ({ label: g.label, value: overheadOn ? g.contribution : g.profit }));

  return (
    <>
      <PageHeader
        title={t.nav.analytics}
        subtitle="אילו שירותים, לקוחות ואנשי צוות באמת מייצרים רווח. הדוחות מבוססים על עבודות שהושלמו בלבד."
        actions={<RangeFilter state={rangeState} format={settings.date_format} />}
      />

      <Notice tone="gold" className="mb-5">
        <span>
          <b>תקופת הדוח: {period}</b> · לפי תאריך סיום העבודה · כל הסכומים בש״ח לפני מע״מ. ״רווח לפני תקורה״ = הכנסה פחות עלויות ישירות. ״תרומה תפעולית״ = רווח פחות תקורה מועמסת, והיא אומדן ניהולי.
          הדוחות אינם מסמכי מס רשמיים.
        </span>
      </Notice>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={report}
          onChange={setReport}
          items={[
            { value: "service", label: "לפי שירות" },
            { value: "customer", label: "לפי לקוח" },
            { value: "employee", label: "לפי עובד/ת" },
            { value: "monthly", label: "ביצועים חודשיים" },
          ]}
        />
        <div className="no-print flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!view.rows.length} onClick={exportCurrent}>
            <Download className="size-4" />
            ייצוא הדוח
          </Button>
          <Button variant="outline" size="sm" disabled={!view.rows.length} onClick={() => downloadCsv(`profitlens-jobs-${stamp}.csv`, jobsCsv(view.rows))}>
            <Download className="size-4" />
            עבודות
          </Button>
          <Button variant="outline" size="sm" disabled={!view.rows.length} onClick={() => downloadCsv(`profitlens-costs-${stamp}.csv`, costsCsv(view.rows, data.employees))}>
            <Download className="size-4" />
            עלויות
          </Button>
        </div>
      </div>

      {view.rows.length === 0 ? (
        <Card>
          <EmptyState icon={<BarChart3 className="size-6" />} title="אין עבודות שהושלמו בתקופה" text="בחרו תקופה אחרת. דוחות נבנים רק מעבודות בסטטוס ״הושלמה״ עם תאריך סיום." />
        </Card>
      ) : (
        <>
          {report === "service" && (
            <Card>
              <CardHeader title="רווח לפי שירות" subtitle={`ממוין לפי ${measure}`} />
              <div className="px-3 pt-2 sm:px-5">
                <RankChart data={rank(view.service)} name={measure} ariaLabel="רווח לפי שירות" />
              </div>
              <div className="mt-4">
                <GroupTable first="שירות" groups={view.service} target={settings.target_margin_bp} overheadOn={overheadOn} />
              </div>
            </Card>
          )}

          {report === "customer" && (
            <Card>
              <CardHeader title="רווח לפי לקוח" subtitle={`ממוין לפי ${measure} — לא לפי ההכנסה. לקוח גדול אינו בהכרח לקוח רווחי.`} />
              <div className="px-3 pt-2 sm:px-5">
                <RankChart data={rank(view.customer).slice(0, 10)} name={measure} ariaLabel="רווח לפי לקוח" />
              </div>
              <div className="mt-4">
                <GroupTable first="לקוח" groups={view.customer} target={settings.target_margin_bp} overheadOn={overheadOn} />
              </div>
            </Card>
          )}

          {report === "employee" && (
            <Card>
              <CardHeader title="רווח לפי עובד/ת" subtitle="רווח העבודות מיוחס לכל עובד/ת לפי חלקו/ה בשעות העבודה שנרשמו בפועל" />
              <div className="card-pad pt-3 pb-0">
                <Notice tone="info">
                  <span>
                    זו השוואה מקורבת: היא תלויה ברישום שעות מלא, ועובדים שמבצעים סוגי עבודה שונים אינם בהכרח בני השוואה.
                    {view.employee.unattributedJobs > 0 && (
                      <b> {view.employee.unattributedJobs} עבודות בתקופה ללא שעות עבודה רשומות אינן נכללות.</b>
                    )}
                  </span>
                </Notice>
              </div>
              {view.employee.rows.length === 0 ? (
                <EmptyState title="לא נרשמו שעות עבודה בתקופה" text="הוסיפו שורות ״עבודה״ לעלויות בפועל של העבודות, עם שיוך לעובד/ת." />
              ) : (
                <div className="table-wrap mt-4">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>עובד/ת</th>
                        <th className="end">עבודות</th>
                        <th className="end">שעות שנרשמו</th>
                        <th className="end">עלות עבודה</th>
                        <th className="end">רווח מיוחס</th>
                        <th className="end">רווח מיוחס לשעה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.employee.rows.map((r) => (
                        <tr key={r.key}>
                          <td className="font-medium">{r.label}</td>
                          <td className="end num">{r.jobs}</td>
                          <td className="end num">{formatNumber(r.hours)}</td>
                          <td className="end"><Money value={r.laborCost} /></td>
                          <td className="end"><ProfitText value={r.attributedProfit} /></td>
                          <td className="end"><ProfitText value={r.profitPerHour} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {report === "monthly" && (
            <Card>
              <CardHeader title="ביצועים חודשיים" subtitle="הכנסות, עלויות, רווח, מספר עבודות ושיעור רווח ממוצע לכל חודש" />
              <div className="mt-4">
                <GroupTable first="חודש" groups={view.monthly} target={settings.target_margin_bp} overheadOn={overheadOn} />
              </div>
            </Card>
          )}

          <p className="mt-4 text-xs text-muted">
            סה״כ בתקופה: {view.sum.jobs} עבודות · הכנסה {formatMoney(view.sum.revenue)} · רווח לפני תקורה {formatMoney(view.sum.profit)}.
          </p>
        </>
      )}
    </>
  );
}
