"use client";

import { AlertTriangle, Archive, ArchiveRestore, ArrowRight, Copy, CopyPlus, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { MarginBadge, Money, SampleBadge, StatusBadge, SummaryRow } from "@/components/finance-ui";
import { CostEntryDialog } from "@/components/jobs/cost-entry-dialog";
import { formToJob, JobForm } from "@/components/jobs/job-form";
import { useJobActions } from "@/components/jobs/use-job-actions";
import { Badge, Button, Card, CardHeader, Dialog, EmptyState, Notice, Select, Tabs, Textarea, useConfirm } from "@/components/ui";
import type { NewRow } from "@/lib/backend/types";
import { today } from "@/lib/dates";
import type { Profitability, Variance } from "@/lib/finance/engine";
import { formatDate, formatMoney, formatNumber, formatPercent, formatSignedMoney } from "@/lib/format";
import { t } from "@/lib/i18n";
import { canTable } from "@/lib/permissions";
import { buildWarnings, type JobRow } from "@/lib/reports";
import { useWorkspace } from "@/lib/store";
import { COST_CATEGORIES, JOB_STATUSES, type CostCategory, type CostKind, type JobCostEntry, type JobStatus } from "@/lib/types";
import { useRun } from "@/lib/use-run";
import { cn } from "@/lib/utils";
import { warningText } from "@/lib/warning-text";

type Tab = "overview" | "estimated" | "actual" | "profitability" | "notes";

function entryDetail(entry: JobCostEntry, employeeName: string | null): string {
  switch (entry.category) {
    case "materials":
      return `${formatNumber(entry.quantity ?? 0, 3)} ${entry.unit ?? ""} × ${formatMoney(entry.unit_cost)}`;
    case "labor":
      return `${employeeName ? `${employeeName} · ` : ""}${formatNumber(entry.hours ?? 0, 3)} ש׳ × ${formatMoney(entry.hourly_cost)}`;
    case "transport": {
      const parts: string[] = [];
      if (entry.distance_km) parts.push(`${formatNumber(entry.distance_km, 3)} ק״מ × ${formatMoney(entry.rate_per_km ?? 0)}`);
      if (entry.parking) parts.push(`חניה ${formatMoney(entry.parking)}`);
      if (entry.other_travel) parts.push(`אחר ${formatMoney(entry.other_travel)}`);
      return parts.join(" · ");
    }
    default:
      return "";
  }
}

function ProfitSummary({ side, title, note, target, overheadOn }: { side: Profitability; title: string; note?: string; target: number; overheadOn: boolean }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={note} action={<MarginBadge bp={side.hasPrice ? side.marginBp : null} target={target} />} />
      <div className="card-pad pt-2">
        {!side.hasPrice && <Notice tone="warning" className="mb-2">לא הוזן מחיר — לא ניתן לחשב רווח.</Notice>}
        <SummaryRow label={t.fin.customerPrice} value={formatMoney(side.customerPrice)} hint={side.vat > 0 ? `כולל מע״מ ${formatMoney(side.vat)}` : undefined} />
        <SummaryRow label={t.fin.revenue} value={formatMoney(side.revenue)} hint="מע״מ אינו נספר כהכנסה" />
        {COST_CATEGORIES.map((c) => (side.costs[c] > 0 ? <SummaryRow key={c} label={t.category[c]} value={`−${formatMoney(side.costs[c])}`} /> : null))}
        {side.paymentFees > 0 && <SummaryRow label={t.fin.paymentFees} value={`−${formatMoney(side.paymentFees)}`} />}
        <SummaryRow strong label={t.fin.profit} value={formatMoney(side.profit)} tone={side.profit > 0 ? "positive" : side.profit < 0 ? "negative" : undefined} />
        <SummaryRow label={t.fin.margin} value={formatPercent(side.marginBp)} hint="רווח ÷ הכנסה לפני מע״מ" />
        <SummaryRow label={t.fin.markup} value={formatPercent(side.markupBp)} hint="רווח ÷ עלויות ישירות" />
        {overheadOn && (
          <>
            <SummaryRow label={t.fin.overhead} value={`−${formatMoney(side.overhead)}`} hint={side.hours > 0 ? `${formatNumber(side.hours)} שעות עבודה` : undefined} />
            <SummaryRow strong label={t.fin.contribution} value={formatMoney(side.contribution)} tone={side.contribution > 0 ? "positive" : side.contribution < 0 ? "negative" : undefined} hint={t.fin.estimateNote} />
          </>
        )}
      </div>
    </Card>
  );
}

function VarianceRow({ label, v, costLike, strong }: { label: string; v: Variance; costLike: boolean; strong?: boolean }) {
  // For costs an increase is bad; for revenue and profit an increase is good.
  const bad = costLike ? v.diff > 0 : v.diff < 0;
  const good = costLike ? v.diff < 0 : v.diff > 0;
  return (
    <tr className={cn(strong && "font-semibold")}>
      <td>{label}</td>
      <td className="end num">{formatMoney(v.estimated)}</td>
      <td className="end num">{formatMoney(v.actual)}</td>
      <td className={cn("end num", bad && "text-negative", good && "text-positive")}>{v.diff === 0 ? "—" : formatSignedMoney(v.diff)}</td>
      <td className={cn("end num", bad && "text-negative", good && "text-positive")}>
        {v.diff === 0 ? "—" : v.diffBp == null ? "לא הוערך" : `${v.diffBp > 0 ? "+" : ""}${formatPercent(v.diffBp)}`}
      </td>
    </tr>
  );
}

function CostsTab({ row, kind }: { row: JobRow; kind: CostKind }) {
  const { data, add, patch, removeRows, role } = useWorkspace();
  const { run, busy } = useRun();
  const confirm = useConfirm();
  const [dialog, setDialog] = useState<{ entry: JobCostEntry | null; category: CostCategory } | null>(null);
  const entries = row.entries.filter((e) => e.kind === kind);
  const employees = new Map(data.employees.map((e) => [e.id, e.name]));
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const canEdit = canTable(role, "insert", "job_cost_entries");
  const estimates = row.entries.filter((e) => e.kind === "estimated");

  const save = (payload: NewRow<"job_cost_entries">) =>
    run(async () => {
      if (dialog?.entry) await patch("job_cost_entries", dialog.entry.id, payload);
      else await add("job_cost_entries", [payload]);
      setDialog(null);
    }, "העלות נשמרה והרווחיות עודכנה");

  return (
    <Card>
      <CardHeader
        title={kind === "estimated" ? "עלויות מוערכות" : "עלויות בפועל"}
        subtitle={kind === "estimated" ? "מה צפוי לעלות — לפני הביצוע. הערכות אינן נספרות כהוצאות." : "מה עלה באמת. כל שורה מעדכנת מיד את הרווח בפועל."}
        action={
          canEdit && (
            <div className="flex flex-wrap gap-2">
              {kind === "actual" && entries.length === 0 && estimates.length > 0 && (
                <Button
                  variant="outline" size="sm" loading={busy}
                  onClick={() =>
                    run(
                      () => add("job_cost_entries", estimates.map(({ id: _i, organization_id: _o, created_at: _c, ...e }) => { void _i; void _o; void _c; return { ...e, kind: "actual" as const, entry_date: today() }; })),
                      "ההערכות הועתקו כעלויות בפועל — עדכנו את מה שהשתנה",
                    )
                  }
                >
                  <CopyPlus className="size-4" />
                  העתקה מההערכה
                </Button>
              )}
              <Button size="sm" onClick={() => setDialog({ entry: null, category: "materials" })}>
                <Plus className="size-4" />
                הוספת עלות
              </Button>
            </div>
          )
        }
      />
      {entries.length === 0 ? (
        <EmptyState
          title={kind === "estimated" ? "עדיין אין הערכת עלויות" : "עדיין לא נרשמו עלויות בפועל"}
          text={kind === "estimated" ? "הוסיפו חומרים, שעות עבודה, נסיעות וקבלנים כדי לדעת מה הרווח הצפוי." : "רשמו את ההוצאות האמיתיות כדי לראות כמה הרווחתם באמת."}
        />
      ) : (
        <div className="mt-3 pb-2">
          {COST_CATEGORIES.map((category) => {
            const list = entries.filter((e) => e.category === category);
            if (!list.length) return null;
            return (
              <div key={category} className="border-t border-line first:border-t-0">
                <div className="flex items-center justify-between bg-ivory/60 px-5 py-2 text-[13px] font-semibold sm:px-6">
                  <span>{t.category[category]}</span>
                  <Money value={list.reduce((s, e) => s + e.amount, 0)} />
                </div>
                <ul>
                  {list.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-3 border-t border-line/60 px-5 py-2.5 sm:px-6">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{entry.description || t.category[entry.category]}</div>
                        <div className="num text-xs text-muted" style={{ direction: "rtl" }}>
                          {[entryDetail(entry, entry.employee_id ? (employees.get(entry.employee_id) ?? null) : null), formatDate(entry.entry_date)].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <Money value={entry.amount} className="text-sm font-semibold" />
                      {canEdit && (
                        <div className="flex">
                          <Button variant="ghost" size="sm" icon aria-label={`עריכת ${entry.description}`} onClick={() => setDialog({ entry, category: entry.category })}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm" icon className="hover:text-negative" aria-label={`מחיקת ${entry.description}`}
                            onClick={async () => {
                              if (await confirm({ title: "מחיקת שורת עלות", text: `למחוק את ״${entry.description || t.category[entry.category]}״ (${formatMoney(entry.amount)})?`, confirmLabel: t.common.delete, danger: true })) {
                                await run(() => removeRows("job_cost_entries", [entry.id]), "השורה נמחקה");
                              }
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <div className="flex items-center justify-between border-t border-line-strong px-5 pt-3 pb-2 font-bold sm:px-6">
            <span>סה״כ {kind === "estimated" ? "מוערך" : "בפועל"}</span>
            <Money value={total} className="text-base" />
          </div>
        </div>
      )}
      {dialog && (
        <CostEntryDialog open onOpenChange={(open) => !open && setDialog(null)} jobId={row.job.id} kind={kind} category={dialog.category} entry={dialog.entry} onSave={save} busy={busy} />
      )}
    </Card>
  );
}

function NotesTab({ row }: { row: JobRow }) {
  const { patch } = useWorkspace();
  const { run, busy } = useRun();
  const [notes, setNotes] = useState(row.job.notes ?? "");
  const dirty = notes !== (row.job.notes ?? "");
  return (
    <Card className="card-pad">
      <label htmlFor="job-notes" className="card-title mb-3 block">
        הערות לעבודה
      </label>
      <Textarea id="job-notes" rows={8} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="מה למדתם מהעבודה? מה כדאי לתמחר אחרת בפעם הבאה?" />
      <div className="mt-3 flex justify-end">
        <Button disabled={!dirty} loading={busy} onClick={() => run(() => patch("jobs", row.job.id, { notes: notes.trim() || null }), t.common.saved)}>
          שמירת ההערות
        </Button>
      </div>
    </Card>
  );
}

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const { jobRows, settings, role, patch, log } = useWorkspace();
  const router = useRouter();
  const actions = useJobActions();
  const { run, busy } = useRun();
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const row = jobRows.find((r) => r.job.id === id);

  if (!row) {
    return (
      <Card>
        <EmptyState
          title="העבודה לא נמצאה"
          text="ייתכן שהיא נמחקה, או שאין לך גישה אליה."
          action={
            <Link href="/jobs" className="btn btn-primary">
              חזרה לעבודות
            </Link>
          }
        />
      </Card>
    );
  }

  const { job, fin } = row;
  const overheadOn = settings.overhead_method !== "none";
  const warnings = buildWarnings([row], settings);
  const canDelete = canTable(role, "delete", "jobs");

  const changeStatus = (status: JobStatus) =>
    run(async () => {
      await patch("jobs", job.id, { status, completed_date: status === "completed" ? (job.completed_date ?? today()) : job.completed_date });
      log("status", "job", job.id, `״${job.title}״ → ${t.status[status]}`);
    }, `הסטטוס עודכן: ${t.status[status]}`);

  return (
    <>
      <Link href="/jobs" className="no-print mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowRight className="size-4" />
        חזרה לעבודות
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="num font-semibold text-gold-700">עבודה #{job.job_number}</span>
            <StatusBadge status={job.status} />
            {job.archived && <Badge>בארכיון</Badge>}
            {job.is_sample && <SampleBadge />}
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{job.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {[row.customer?.name, row.category?.name].filter(Boolean).join(" · ") || "ללא לקוח וקטגוריה"}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <Select aria-label="שינוי סטטוס" className="w-auto" value={job.status} disabled={busy} onChange={(e) => changeStatus(e.target.value as JobStatus)}>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t.status[s]}
              </option>
            ))}
          </Select>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
            {t.common.edit}
          </Button>
          <Button variant="outline" icon title="שכפול" aria-label="שכפול העבודה" onClick={() => actions.duplicate(job)}>
            <Copy className="size-4" />
          </Button>
          <Button variant="outline" icon title={job.archived ? "שחזור מהארכיון" : "העברה לארכיון"} aria-label={job.archived ? "שחזור מהארכיון" : "העברה לארכיון"} onClick={() => actions.setArchived(job, !job.archived)}>
            {job.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
          </Button>
          {canDelete && (
            <Button variant="danger" icon title="מחיקה" aria-label="מחיקת העבודה" onClick={() => actions.remove(job, () => router.replace("/jobs"))}>
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </header>

      {warnings.length > 0 && (
        <div className="mb-5 flex flex-col gap-2">
          {warnings.map((w) => (
            <Notice key={w.type} tone={w.severity === "critical" ? "negative" : w.severity === "warning" ? "warning" : "info"}>
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{warningText(w)}</span>
            </Notice>
          ))}
        </div>
      )}

      <Tabs
        className="no-print mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { value: "overview", label: "סקירה" },
          { value: "estimated", label: `עלויות מוערכות (${row.entries.filter((e) => e.kind === "estimated").length})` },
          { value: "actual", label: `עלויות בפועל (${row.entries.filter((e) => e.kind === "actual").length})` },
          { value: "profitability", label: "הערכה מול ביצוע" },
          { value: "notes", label: "הערות" },
        ]}
      />

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <Card className="card-pad">
              <h2 className="card-title mb-3">פרטי העבודה</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ["נוצרה", formatDate(job.created_at, settings.date_format)],
                  ["תאריך מתוכנן", formatDate(job.planned_date, settings.date_format)],
                  ["תאריך סיום", formatDate(job.completed_date, settings.date_format)],
                  ["הצגת מע״מ", job.vat_mode === "none" ? t.vatModeShort.none : `${t.vatModeShort[job.vat_mode]} · ${formatPercent(job.vat_rate_bp)}`],
                  ["מחיר בהצעה", formatMoney(job.quoted_price)],
                  ["מחיר סופי", job.final_price == null ? "טרם הוזן" : formatMoney(job.final_price)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="num mt-0.5 font-medium" style={{ direction: "rtl" }}>{value}</dd>
                  </div>
                ))}
              </dl>
              {job.description && <p className="mt-4 border-t border-line pt-3 text-sm leading-relaxed text-ink-2">{job.description}</p>}
            </Card>
            <ProfitSummary side={fin.estimated} title="רווחיות מוערכת" note="לפי מחיר ההצעה והערכת העלויות" target={settings.target_margin_bp} overheadOn={overheadOn} />
          </div>
          <ProfitSummary
            side={fin.actual}
            title="רווחיות בפועל"
            note={!fin.hasActualCosts ? "טרם נרשמו עלויות בפועל" : fin.actualRevenueIsQuoted ? "לפי מחיר ההצעה (לא הוזן מחיר סופי) והעלויות שנרשמו" : "לפי המחיר הסופי והעלויות שנרשמו"}
            target={settings.target_margin_bp}
            overheadOn={overheadOn}
          />
        </div>
      )}

      {tab === "estimated" && <CostsTab row={row} kind="estimated" />}
      {tab === "actual" && <CostsTab row={row} kind="actual" />}

      {tab === "profitability" && (
        <Card>
          <CardHeader title="הערכה מול ביצוע" subtitle="איפה העבודה סטתה מהתכנון — בשקלים ובאחוזים" />
          {!fin.hasEstimatedCosts || !fin.hasActualCosts ? (
            <EmptyState
              title="חסרים נתונים להשוואה"
              text={!fin.hasEstimatedCosts ? "כדי להשוות, יש להזין קודם הערכת עלויות." : "כדי להשוות, יש לרשום את העלויות בפועל."}
              action={
                <Button onClick={() => setTab(!fin.hasEstimatedCosts ? "estimated" : "actual")}>
                  {!fin.hasEstimatedCosts ? "להערכת העלויות" : "לרישום עלויות בפועל"}
                </Button>
              }
            />
          ) : (
            <>
              <div className="table-wrap mt-4">
                <table className="table">
                  <thead>
                    <tr>
                      <th>סעיף</th>
                      <th className="end">הערכה</th>
                      <th className="end">בפועל</th>
                      <th className="end">הפרש ₪</th>
                      <th className="end">הפרש %</th>
                    </tr>
                  </thead>
                  <tbody>
                    <VarianceRow label={t.fin.revenue} v={fin.variance.revenue} costLike={false} />
                    {COST_CATEGORIES.map((c) =>
                      fin.variance.categories[c].estimated || fin.variance.categories[c].actual ? (
                        <VarianceRow key={c} label={t.category[c]} v={fin.variance.categories[c]} costLike />
                      ) : null,
                    )}
                    {(fin.variance.paymentFees.estimated > 0 || fin.variance.paymentFees.actual > 0) && <VarianceRow label={t.fin.paymentFees} v={fin.variance.paymentFees} costLike />}
                    <VarianceRow label="סה״כ עלויות ישירות" v={fin.variance.directCosts} costLike strong />
                  </tbody>
                  <tfoot>
                    <VarianceRow label={t.fin.profit} v={fin.variance.profit} costLike={false} strong />
                  </tfoot>
                </table>
              </div>
              <div className="card-pad pt-4">
                {fin.actualRevenueIsQuoted && <p className="mb-3 text-xs text-muted">לא הוזן מחיר סופי, ולכן ההכנסה בפועל מוצגת לפי מחיר ההצעה.</p>}
                <h3 className="mb-2 text-sm font-semibold">מה גרם להפרש?</h3>
                {fin.variance.profit.diff === 0 && fin.overruns.length === 0 ? (
                  <p className="text-sm text-ink-2">הרווח בפועל זהה להערכה.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5 text-sm text-ink-2">
                    <li>
                      הרווח בפועל {fin.variance.profit.diff < 0 ? "נמוך" : "גבוה"} מההערכה ב־
                      <b className={cn("num", fin.variance.profit.diff < 0 ? "text-negative" : "text-positive")}>{formatMoney(Math.abs(fin.variance.profit.diff))}</b>.
                    </li>
                    {fin.variance.revenue.diff !== 0 && (
                      <li>
                        ההכנסה {fin.variance.revenue.diff > 0 ? "עלתה" : "ירדה"} ב־<b className="num">{formatMoney(Math.abs(fin.variance.revenue.diff))}</b> לעומת ההצעה.
                      </li>
                    )}
                    {fin.overruns.map((o) => (
                      <li key={o.category}>
                        חריגה ב{t.category[o.category]}: <b className="num text-negative">{formatSignedMoney(o.diff)}</b>
                        {fin.variance.directCosts.diff > 0 && <span className="text-muted"> ({formatNumber((o.diff / fin.overruns.reduce((s, x) => s + x.diff, 0)) * 100, 0)}% מסך החריגות)</span>}
                      </li>
                    ))}
                    {COST_CATEGORIES.filter((c) => fin.variance.categories[c].diff < 0).map((c) => (
                      <li key={c}>
                        חיסכון ב{t.category[c]}: <b className="num text-positive">{formatMoney(Math.abs(fin.variance.categories[c].diff))}</b>
                      </li>
                    ))}
                    {fin.estimated.hours > 0 && fin.actual.hours !== fin.estimated.hours && (
                      <li>
                        שעות עבודה: <span className="num">{formatNumber(fin.actual.hours)}</span> בפועל מול <span className="num">{formatNumber(fin.estimated.hours)}</span> בהערכה.
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </>
          )}
        </Card>
      )}

      {tab === "notes" && <NotesTab key={job.updated_at} row={row} />}

      <Dialog open={editing} onOpenChange={setEditing} title="עריכת העבודה" size="lg">
        <JobForm
          job={job}
          busy={busy}
          submitLabel={t.common.save}
          onCancel={() => setEditing(false)}
          onSubmit={(values) =>
            run(async () => {
              await patch("jobs", job.id, formToJob(values));
              log("update", "job", job.id, `עודכנה העבודה ״${values.title}״`);
              setEditing(false);
            }, t.common.saved)
          }
        />
      </Dialog>
    </>
  );
}
