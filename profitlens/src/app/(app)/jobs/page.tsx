"use client";

import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, ClipboardList, Copy, Download, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { MarginBadge, Money, ProfitText, SampleBadge, StatusBadge } from "@/components/finance-ui";
import { useJobActions } from "@/components/jobs/use-job-actions";
import { Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";
import { today } from "@/lib/dates";
import { jobsCsv } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { canTable } from "@/lib/permissions";
import type { JobRow } from "@/lib/reports";
import { useWorkspace } from "@/lib/store";
import { JOB_STATUSES, type JobStatus } from "@/lib/types";

const PAGE_SIZE = 20;
type SortKey = "newest" | "oldest" | "profit_desc" | "profit_asc" | "margin_asc" | "price_desc" | "title";

const SORTS: Record<SortKey, { label: string; compare: (a: JobRow, b: JobRow) => number }> = {
  newest: { label: "מהחדשה לישנה", compare: (a, b) => b.date.localeCompare(a.date) || b.job.job_number - a.job.job_number },
  oldest: { label: "מהישנה לחדשה", compare: (a, b) => a.date.localeCompare(b.date) || a.job.job_number - b.job.job_number },
  profit_desc: { label: "רווח — מהגבוה לנמוך", compare: (a, b) => b.view.profit - a.view.profit },
  profit_asc: { label: "רווח — מהנמוך לגבוה", compare: (a, b) => a.view.profit - b.view.profit },
  margin_asc: { label: "שיעור רווח — מהנמוך לגבוה", compare: (a, b) => (a.view.marginBp ?? Infinity) - (b.view.marginBp ?? Infinity) },
  price_desc: { label: "מחיר — מהגבוה לנמוך", compare: (a, b) => b.view.revenue - a.view.revenue },
  title: { label: "שם העבודה", compare: (a, b) => a.job.title.localeCompare(b.job.title, "he") },
};

function JobsList() {
  const { jobRows, settings, data, role } = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const actions = useJobActions();
  const initialStatus = params.get("status");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<JobStatus | "">(JOB_STATUSES.includes(initialStatus as JobStatus) ? (initialStatus as JobStatus) : "");
  const [category, setCategory] = useState("");
  const [customer, setCustomer] = useState(params.get("customer") ?? "");
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(0);
  const canDelete = canTable(role, "delete", "jobs");

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return jobRows
      .filter((r) => r.job.archived === showArchived)
      .filter((r) => !status || r.job.status === status)
      .filter((r) => !category || r.job.service_category_id === category)
      .filter((r) => !customer || r.job.customer_id === customer)
      .filter(
        (r) =>
          !text ||
          r.job.title.toLowerCase().includes(text) ||
          String(r.job.job_number) === text.replace("#", "") ||
          (r.customer?.name ?? "").toLowerCase().includes(text) ||
          (r.job.description ?? "").toLowerCase().includes(text),
      )
      .sort(SORTS[sort].compare);
  }, [jobRows, query, status, category, customer, showArchived, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(0);
  };
  const archivedCount = jobRows.filter((r) => r.job.archived).length;

  return (
    <>
      <PageHeader
        title={t.nav.jobs}
        subtitle="כל עבודה עם המחיר, העלויות והרווח שלה. עבודות בביצוע או שהושלמו מציגות נתוני ביצוע; האחרות — הערכה."
        actions={
          <>
            <Button variant="outline" disabled={!filtered.length} onClick={() => downloadCsv(`profitlens-jobs-${today()}.csv`, jobsCsv(filtered))}>
              <Download className="size-4" />
              {t.common.exportCsv}
            </Button>
            <Link href="/jobs/new" className="btn btn-primary">
              <Plus className="size-4" />
              עבודה חדשה
            </Link>
          </>
        }
      />

      <Card className="mb-4 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input type="search" aria-label="חיפוש עבודות" placeholder="חיפוש לפי שם, לקוח או מספר עבודה" className="ps-9" value={query} onChange={(e) => resetPage(setQuery)(e.target.value)} />
          </div>
          <Select aria-label="סינון לפי סטטוס" value={status} onChange={(e) => resetPage(setStatus)(e.target.value as JobStatus | "")}>
            <option value="">כל הסטטוסים</option>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t.status[s]}
              </option>
            ))}
          </Select>
          <Select aria-label="סינון לפי קטגוריה" value={category} onChange={(e) => resetPage(setCategory)(e.target.value)}>
            <option value="">כל הקטגוריות</option>
            {data.service_categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select aria-label="סינון לפי לקוח" value={customer} onChange={(e) => resetPage(setCustomer)(e.target.value)}>
            <option value="">כל הלקוחות</option>
            {data.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select aria-label="מיון" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {(Object.keys(SORTS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORTS[key].label}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
          <span>
            {filtered.length} עבודות{showArchived ? " בארכיון" : ""}
          </span>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="size-4 accent-[var(--color-gold-600)]" checked={showArchived} onChange={(e) => resetPage(setShowArchived)(e.target.checked)} />
            הצגת הארכיון ({archivedCount})
          </label>
        </div>
      </Card>

      <Card>
        {visible.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-6" />}
            title={jobRows.length ? "לא נמצאו עבודות מתאימות" : "עדיין אין עבודות"}
            text={jobRows.length ? "נסו לשנות את החיפוש או את הסינון." : "צרו עבודה, הזינו הערכת עלויות ומחיר — ותראו מיד את הרווח הצפוי."}
            action={
              !jobRows.length && (
                <Link href="/jobs/new" className="btn btn-primary">
                  <Plus className="size-4" />
                  עבודה חדשה
                </Link>
              )
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="table-wrap hidden md:block">
              <table className="table">
                <thead>
                  <tr>
                    <th>עבודה</th>
                    <th>לקוח</th>
                    <th>סטטוס</th>
                    <th className="end">מחיר לפני מע״מ</th>
                    <th className="end">עלויות מוערכות</th>
                    <th className="end">עלויות בפועל</th>
                    <th className="end">רווח</th>
                    <th className="end">שיעור רווח</th>
                    <th className="end">
                      <span className="sr-only">{t.common.actions}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.job.id} className="cursor-pointer" onClick={() => router.push(`/jobs/${row.job.id}`)}>
                      <td>
                        <Link href={`/jobs/${row.job.id}`} className="font-semibold text-ink hover:text-gold-700" onClick={(e) => e.stopPropagation()}>
                          {row.job.title}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                          <span className="num">#{row.job.job_number}</span>
                          <span className="num">{formatDate(row.date, settings.date_format)}</span>
                          {row.category && <span>{row.category.name}</span>}
                          {row.job.is_sample && <SampleBadge />}
                        </div>
                      </td>
                      <td className="text-ink-2">{row.customer?.name ?? "—"}</td>
                      <td>
                        <StatusBadge status={row.job.status} />
                      </td>
                      <td className="end">{row.view.hasPrice ? <Money value={row.view.revenue} /> : <span className="text-muted">—</span>}</td>
                      <td className="end">{row.fin.hasEstimatedCosts ? <Money value={row.fin.estimated.directCosts} /> : <span className="text-muted">—</span>}</td>
                      <td className="end">{row.fin.hasActualCosts ? <Money value={row.fin.actual.directCosts} /> : <span className="text-muted">—</span>}</td>
                      <td className="end">
                        {row.view.hasPrice ? <ProfitText value={row.view.profit} /> : <span className="text-muted">—</span>}
                        <div className="text-[11px] text-muted">{row.usesActual ? "בפועל" : "הערכה"}</div>
                      </td>
                      <td className="end">
                        <MarginBadge bp={row.view.hasPrice ? row.view.marginBp : null} target={settings.target_margin_bp} />
                      </td>
                      <td className="end" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-0.5">
                          <Button variant="ghost" size="sm" icon title="שכפול" aria-label={`שכפול ${row.job.title}`} onClick={() => actions.duplicate(row.job)}>
                            <Copy className="size-4" />
                          </Button>
                          <Button
                            variant="ghost" size="sm" icon
                            title={row.job.archived ? "שחזור מהארכיון" : "העברה לארכיון"}
                            aria-label={`${row.job.archived ? "שחזור" : "ארכוב"} ${row.job.title}`}
                            onClick={() => actions.setArchived(row.job, !row.job.archived)}
                          >
                            {row.job.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                          </Button>
                          {canDelete && (
                            <Button variant="ghost" size="sm" icon title="מחיקה" aria-label={`מחיקת ${row.job.title}`} className="hover:text-negative" onClick={() => actions.remove(row.job)}>
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-line md:hidden">
              {visible.map((row) => (
                <li key={row.job.id}>
                  <Link href={`/jobs/${row.job.id}`} className="block px-4 py-3.5 active:bg-gold-100/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{row.job.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                          <span className="num">#{row.job.job_number}</span>
                          <span>{row.customer?.name ?? "ללא לקוח"}</span>
                          {row.job.is_sample && <SampleBadge />}
                        </div>
                      </div>
                      <StatusBadge status={row.job.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-muted">מחיר לפני מע״מ</div>
                        <Money value={row.view.hasPrice ? row.view.revenue : null} className="text-sm font-semibold" />
                      </div>
                      <div>
                        <div className="text-muted">רווח ({row.usesActual ? "בפועל" : "הערכה"})</div>
                        <ProfitText value={row.view.hasPrice ? row.view.profit : null} className="text-sm" />
                      </div>
                      <div className="text-end">
                        <div className="mb-0.5 text-muted">שיעור רווח</div>
                        <MarginBadge bp={row.view.hasPrice ? row.view.marginBp : null} target={settings.target_margin_bp} />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {pages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
                <span className="text-muted">
                  עמוד <span className="num">{current + 1}</span> מתוך <span className="num">{pages}</span>
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
                    <ChevronRight className="size-4" />
                    הקודם
                  </Button>
                  <Button variant="outline" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                    הבא
                    <ChevronLeft className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={null}>
      <JobsList />
    </Suspense>
  );
}
