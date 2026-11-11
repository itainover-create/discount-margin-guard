"use client";

import { AlertTriangle, CheckCircle2, CircleDollarSign, ClipboardCheck, Coins, Info, Percent, PiggyBank, Plus, Scale, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Legend, RankChart, SERIES, TrendChart } from "@/components/charts";
import { RangeFilter, rangeLabel, useRange } from "@/components/range-filter";
import { Card, CardHeader, EmptyState, PageHeader, Tabs } from "@/components/ui";
import type { RangePreset } from "@/lib/dates";
import { formatDate, formatMoney, formatMonthKey, formatPercent } from "@/lib/format";
import { t } from "@/lib/i18n";
import { buildWarnings, byPeriod, byService, reportedRows, statusCounts, totals } from "@/lib/reports";
import { useWorkspace } from "@/lib/store";
import { JOB_STATUSES, type JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { warningText } from "@/lib/warning-text";

function Kpi({ icon, label, value, note, tone, delay }: { icon: ReactNode; label: string; value: string; note?: string; tone?: "positive" | "negative"; delay: number }) {
  return (
    <div className="card tile-3d rise-in p-4 sm:p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13px] leading-snug font-medium text-ink-2">{label}</div>
        <div className="hidden shrink-0 min-[420px]:block"><div className="chip-3d size-10">{icon}</div></div>
      </div>
      <div className={cn("num mt-3 text-xl leading-none font-bold tracking-tight sm:text-[26px]", tone === "positive" && "text-positive", tone === "negative" && "text-negative")}>
        {value}
      </div>
      {note && <div className="mt-2 text-xs leading-relaxed text-muted">{note}</div>}
    </div>
  );
}

const STATUS_COLOR: Record<JobStatus, string> = {
  draft: "#a8adba", quoted: "#3b5ba5", approved: "#c08a62", in_progress: "#d9a23a", completed: "#177a52", cancelled: "#b93a34",
};

export default function DashboardPage() {
  const { jobRows, settings, organization } = useWorkspace();
  const rangeState = useRange(settings.dashboard_range as RangePreset);
  const [granularity, setGranularity] = useState<"week" | "month">("month");

  const view = useMemo(() => {
    const rows = reportedRows(jobRows, rangeState.range);
    const sum = totals(rows);
    const trend = byPeriod(rows, granularity).map((p) => ({
      label: granularity === "month" ? formatMonthKey(p.key) : formatDate(p.key, settings.date_format).slice(0, 5),
      revenue: p.revenue,
      costs: p.directCosts,
      profit: p.profit,
    }));
    const jobs = [...rows]
      .sort((a, b) => b.fin.actual.profit - a.fin.actual.profit)
      .map((r) => ({ label: r.job.title, value: r.fin.actual.profit }));
    const topJobs = jobs.length > 8 ? [...jobs.slice(0, 5), ...jobs.slice(-3)] : jobs;
    const services = byService(rows).map((s) => ({ label: s.label, value: s.contribution }));
    return { rows, sum, trend, topJobs, jobCount: jobs.length, services };
  }, [jobRows, rangeState.range, granularity, settings.date_format]);

  const counts = useMemo(() => statusCounts(jobRows), [jobRows]);
  const warnings = useMemo(() => buildWarnings(jobRows, settings), [jobRows, settings]);
  const activeTotal = JOB_STATUSES.reduce((s, k) => s + counts[k], 0);
  const period = rangeLabel(rangeState.preset, rangeState.range, settings.date_format);
  const overheadOn = settings.overhead_method !== "none";
  const { sum } = view;

  if (jobRows.length === 0) {
    return (
      <>
        <PageHeader title={t.nav.dashboard} subtitle={`${organization.name} — איך העסק מתפקד?`} />
        <Card>
          <EmptyState
            icon={<TrendingUp className="size-6" />}
            title="עדיין אין עבודות"
            text="צרו את העבודה הראשונה, הזינו הערכת עלויות ומחיר — ולוח הבקרה יתמלא בנתונים אמיתיים בלבד."
            action={
              <Link href="/jobs/new" className="btn btn-primary">
                <Plus className="size-4" />
                עבודה חדשה
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t.nav.dashboard}
        subtitle={`${organization.name} — איך העסק מתפקד?`}
        actions={
          <>
            <RangeFilter state={rangeState} format={settings.date_format} />
            <Link href="/jobs/new" className="btn btn-primary">
              <Plus className="size-4" />
              עבודה חדשה
            </Link>
          </>
        }
      />

      <p className="mb-3 flex items-center gap-1.5 text-xs text-muted">
        <Info className="size-3.5" />
        הנתונים מבוססים על עבודות שהושלמו בתקופה ({period}), לפי תאריך הסיום. כל הסכומים לפני מע״מ.
      </p>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3" aria-label="מדדים מרכזיים">
        <Kpi delay={0} icon={<Wallet className="size-5" />} label="סך ההכנסות שדווחו" value={formatMoney(sum.revenue)} note="לפני מע״מ" />
        <Kpi delay={50} icon={<Coins className="size-5" />} label="סך העלויות הישירות" value={formatMoney(sum.directCosts)} note="חומרים, עבודה, נסיעות, קבלנים ועוד" />
        <Kpi
          delay={100} icon={<CircleDollarSign className="size-5" />} label={t.fin.profit} value={formatMoney(sum.profit)}
          tone={sum.profit > 0 ? "positive" : sum.profit < 0 ? "negative" : undefined} note="הכנסות פחות עלויות ישירות"
        />
        <Kpi
          delay={150} icon={<PiggyBank className="size-5" />} label={t.fin.contribution} value={overheadOn ? formatMoney(sum.contribution) : "—"}
          tone={overheadOn ? (sum.contribution > 0 ? "positive" : sum.contribution < 0 ? "negative" : undefined) : undefined}
          note={overheadOn ? `${t.fin.estimateNote} · תקורה: ${formatMoney(sum.overhead)}` : "לא הוגדרה שיטת העמסת תקורה בהגדרות"}
        />
        <Kpi delay={200} icon={<Percent className="size-5" />} label="שיעור רווח ממוצע" value={formatPercent(sum.marginBp)} note={`משוקלל לפי הכנסה · היעד: ${formatPercent(settings.target_margin_bp)}`} />
        <Kpi delay={250} icon={<ClipboardCheck className="size-5" />} label="עבודות שהושלמו" value={String(sum.jobs)} note="בתקופה שנבחרה" />
      </section>

      <Card className="mt-5">
        <CardHeader
          title="הכנסות ורווח לאורך זמן"
          subtitle={`עבודות שהושלמו · ${period}`}
          action={
            <Tabs value={granularity} onChange={setGranularity} items={[{ value: "week", label: "שבועי" }, { value: "month", label: "חודשי" }]} />
          }
        />
        <div className="px-3 pt-3 pb-4 sm:px-5">
          {view.trend.length ? (
            <>
              <div className="mb-2 px-2">
                <Legend
                  items={[
                    { color: SERIES.revenue, label: t.fin.revenue },
                    { color: SERIES.cost, label: t.fin.directCosts },
                    { color: SERIES.profit, label: "רווח לפני תקורה", line: true },
                  ]}
                />
              </div>
              <TrendChart data={view.trend} />
            </>
          ) : (
            <EmptyState title="אין עבודות שהושלמו בתקופה" text="בחרו תקופה אחרת, או סמנו עבודה כ״הושלמה״ עם תאריך סיום." />
          )}
        </div>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="רווחיות לפי עבודה"
            subtitle={view.jobCount > 8 ? `5 הרווחיות ביותר ו־3 החלשות ביותר מתוך ${view.jobCount}` : "רווח לפני תקורה, לכל עבודה שהושלמה"}
          />
          <div className="px-3 pt-2 pb-4 sm:px-5">
            {view.topJobs.length ? <RankChart data={view.topJobs} name="רווח לפני תקורה" ariaLabel="רווח לפי עבודה" /> : <EmptyState title="אין נתונים לתקופה" />}
          </div>
        </Card>
        <Card>
          <CardHeader title="רווחיות לפי שירות" subtitle={overheadOn ? "תרומה תפעולית לאחר תקורה, מהגבוה לנמוך" : "רווח לפני תקורה, מהגבוה לנמוך"} />
          <div className="px-3 pt-2 pb-4 sm:px-5">
            {view.services.length ? <RankChart data={view.services} name={overheadOn ? "תרומה תפעולית" : "רווח"} ariaLabel="רווחיות לפי שירות" /> : <EmptyState title="אין נתונים לתקופה" />}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader title="סטטוס עבודות" subtitle={`${activeTotal} עבודות פעילות במערכת (כל התקופות)`} />
          <div className="card-pad pt-4">
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden>
              {JOB_STATUSES.filter((s) => counts[s] > 0).map((s) => (
                <span key={s} style={{ flexGrow: counts[s], background: STATUS_COLOR[s] }} title={`${t.status[s]}: ${counts[s]}`} />
              ))}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
              {JOB_STATUSES.map((s) => (
                <li key={s}>
                  <Link href={`/jobs?status=${s}`} className="flex items-center justify-between gap-2 rounded-lg px-1 py-0.5 text-sm hover:bg-gold-100/50">
                    <span className="flex items-center gap-2 text-ink-2">
                      <span className="size-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} aria-hidden />
                      {t.status[s]}
                    </span>
                    <span className="num font-semibold">{counts[s]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader title="התרעות פיננסיות" subtitle="מחושבות מהנתונים שהוזנו בלבד — כל העבודות הפעילות" />
          <div className="card-pad pt-3">
            {warnings.length === 0 ? (
              <div className="flex items-center gap-2.5 rounded-xl bg-positive-soft px-3.5 py-3 text-sm text-positive">
                <CheckCircle2 className="size-4.5 shrink-0" />
                אין התרעות. כל העבודות עומדות ביעד לפי הנתונים שהוזנו.
              </div>
            ) : (
              <ul className="flex max-h-[320px] flex-col gap-2 overflow-y-auto pe-1">
                {warnings.map((w, index) => (
                  <li key={`${w.jobId}-${w.type}-${index}`}>
                    <Link href={`/jobs/${w.jobId}`} className="flex items-start gap-3 rounded-xl border border-line px-3.5 py-2.5 transition hover:border-gold-500/60 hover:bg-gold-100/30">
                      <span
                        className={cn(
                          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
                          w.severity === "critical" && "bg-negative-soft text-negative",
                          w.severity === "warning" && "bg-warning-soft text-warning",
                          w.severity === "info" && "bg-info-soft text-info",
                        )}
                      >
                        {w.severity === "info" ? <Scale className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{w.jobTitle}</span>
                        <span className="block text-[13px] leading-relaxed text-ink-2">{warningText(w)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted">{t.disclaimer}</p>
    </>
  );
}
