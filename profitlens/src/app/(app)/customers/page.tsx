"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Mail, Pencil, Phone, Plus, Search, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { MarginBadge, Money, ProfitText, SampleBadge, StatusBadge } from "@/components/finance-ui";
import { Button, Card, Dialog, DialogFooter, EmptyState, Field, Input, PageHeader, Textarea, useConfirm } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";
import { today } from "@/lib/dates";
import { customersCsv } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { canTable } from "@/lib/permissions";
import { byCustomer, type GroupTotals } from "@/lib/reports";
import { useWorkspace } from "@/lib/store";
import type { Customer } from "@/lib/types";
import { useRun } from "@/lib/use-run";
import { customerSchema, type CustomerFormValues } from "@/lib/validation";

const toForm = (c: Customer | null): CustomerFormValues => ({
  name: c?.name ?? "", business_name: c?.business_name ?? "", phone: c?.phone ?? "", email: c?.email ?? "", notes: c?.notes ?? "",
});

function CustomerDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { add, patch } = useWorkspace();
  const { run, busy } = useRun();
  const { register, handleSubmit, reset, formState } = useForm<CustomerFormValues>({ resolver: zodResolver(customerSchema), defaultValues: toForm(customer) });
  useEffect(() => reset(toForm(customer)), [customer, reset]);
  const errors = formState.errors;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={customer ? "עריכת לקוח" : "לקוח חדש"} description="נשמרים רק פרטים הנחוצים לניהול העבודות.">
      <form
        noValidate
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={handleSubmit((v) =>
          run(async () => {
            const row = { name: v.name, business_name: v.business_name || null, phone: v.phone || null, email: v.email || null, notes: v.notes.trim() || null };
            if (customer) await patch("customers", customer.id, row);
            else await add("customers", [{ ...row, is_sample: false }]);
            onClose();
          }, t.common.saved),
        )}
      >
        <Field label="שם הלקוח" error={errors.name?.message}>{(p) => <Input {...p} {...register("name")} />}</Field>
        <Field label="שם העסק" optional error={errors.business_name?.message}>{(p) => <Input {...p} {...register("business_name")} />}</Field>
        <Field label="טלפון" optional error={errors.phone?.message}>{(p) => <Input type="tel" dir="ltr" className="num text-start" {...p} {...register("phone")} />}</Field>
        <Field label="אימייל" optional error={errors.email?.message}>{(p) => <Input type="email" dir="ltr" className="text-start" {...p} {...register("email")} />}</Field>
        <Field label="הערות" optional error={errors.notes?.message} className="sm:col-span-2">{(p) => <Textarea rows={3} {...p} {...register("notes")} />}</Field>
        <div className="sm:col-span-2">
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>{t.common.cancel}</Button>
            <Button type="submit" loading={busy}>{t.common.save}</Button>
          </DialogFooter>
        </div>
      </form>
    </Dialog>
  );
}

export default function CustomersPage() {
  const { data, jobRows, settings, role, removeRows } = useWorkspace();
  const confirm = useConfirm();
  const { run } = useRun();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Customer | null | undefined>(undefined);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const canDelete = canTable(role, "delete", "customers");
  const overheadOn = settings.overhead_method !== "none";

  const totalsByCustomer = useMemo(() => {
    const completed = jobRows.filter((r) => r.job.status === "completed" && !r.job.archived);
    return new Map<string, GroupTotals>(byCustomer(completed).map((g) => [g.key, g]));
  }, [jobRows]);

  const customers = useMemo(() => {
    const text = query.trim().toLowerCase();
    return data.customers
      .filter((c) => !text || [c.name, c.business_name, c.phone, c.email].some((v) => v?.toLowerCase().includes(text)))
      .sort((a, b) => (totalsByCustomer.get(b.id)?.contribution ?? 0) - (totalsByCustomer.get(a.id)?.contribution ?? 0) || a.name.localeCompare(b.name, "he"));
  }, [data.customers, query, totalsByCustomer]);

  const history = viewing ? jobRows.filter((r) => r.job.customer_id === viewing.id).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const viewingTotals = viewing ? totalsByCustomer.get(viewing.id) : undefined;

  return (
    <>
      <PageHeader
        title={t.nav.customers}
        subtitle="הלקוחות והרווח שכל אחד מהם מייצר — לפי עבודות שהושלמו, לפני מע״מ."
        actions={
          <>
            <Button variant="outline" disabled={!data.customers.length} onClick={() => downloadCsv(`profitlens-customers-${today()}.csv`, customersCsv(customers, totalsByCustomer))}>
              <Download className="size-4" />
              {t.common.exportCsv}
            </Button>
            <Button onClick={() => setEditing(null)}>
              <Plus className="size-4" />
              לקוח חדש
            </Button>
          </>
        }
      />

      <Card>
        {data.customers.length > 0 && (
          <div className="border-b border-line p-3 sm:p-4">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input type="search" aria-label="חיפוש לקוחות" placeholder="חיפוש לפי שם, עסק, טלפון או אימייל" className="ps-9" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>
        )}
        {customers.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title={data.customers.length ? "לא נמצאו לקוחות" : "עדיין אין לקוחות"}
            text={data.customers.length ? "נסו חיפוש אחר." : "הוסיפו לקוח כדי לשייך אליו עבודות ולראות כמה הוא באמת מכניס."}
            action={!data.customers.length && <Button onClick={() => setEditing(null)}><Plus className="size-4" />לקוח חדש</Button>}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>לקוח</th>
                  <th className="hidden md:table-cell">פרטי קשר</th>
                  <th className="end">עבודות שהושלמו</th>
                  <th className="end hidden sm:table-cell">{t.fin.revenue}</th>
                  <th className="end">{overheadOn ? "תרומה תפעולית" : "רווח לפני תקורה"}</th>
                  <th className="end"><span className="sr-only">{t.common.actions}</span></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const sum = totalsByCustomer.get(c.id);
                  return (
                    <tr key={c.id}>
                      <td>
                        <button type="button" className="cursor-pointer text-start font-semibold hover:text-gold-700" onClick={() => setViewing(c)}>
                          {c.name}
                        </button>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                          {c.business_name && <span>{c.business_name}</span>}
                          {c.is_sample && <SampleBadge />}
                        </div>
                      </td>
                      <td className="hidden text-xs text-ink-2 md:table-cell">
                        {c.phone && <div className="flex items-center gap-1.5"><Phone className="size-3 text-muted" /><span className="num">{c.phone}</span></div>}
                        {c.email && <div className="flex items-center gap-1.5"><Mail className="size-3 text-muted" /><span className="num">{c.email}</span></div>}
                        {!c.phone && !c.email && "—"}
                      </td>
                      <td className="end num">{sum?.jobs ?? 0}</td>
                      <td className="end hidden sm:table-cell"><Money value={sum?.revenue ?? 0} /></td>
                      <td className="end">{sum ? <ProfitText value={overheadOn ? sum.contribution : sum.profit} /> : <span className="text-muted">—</span>}</td>
                      <td className="end">
                        <div className="flex justify-end gap-0.5">
                          <Button variant="ghost" size="sm" icon aria-label={`עריכת ${c.name}`} onClick={() => setEditing(c)}><Pencil className="size-4" /></Button>
                          {canDelete && (
                            <Button
                              variant="ghost" size="sm" icon className="hover:text-negative" aria-label={`מחיקת ${c.name}`}
                              onClick={async () => {
                                const jobs = jobRows.filter((r) => r.job.customer_id === c.id).length;
                                if (await confirm({ title: "מחיקת לקוח", text: `הלקוח ״${c.name}״ יימחק.${jobs ? ` ${jobs} העבודות שלו יישארו במערכת ללא שיוך ללקוח.` : ""}`, confirmLabel: t.common.delete, danger: true })) {
                                  await run(() => removeRows("customers", [c.id]), "הלקוח נמחק");
                                }
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing !== undefined && <CustomerDialog customer={editing} onClose={() => setEditing(undefined)} />}

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => !open && setViewing(null)} title={viewing?.name ?? ""} description={viewing?.business_name ?? undefined} size="lg">
        {viewing && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["עבודות שהושלמו", String(viewingTotals?.jobs ?? 0)],
                [t.fin.revenue, <Money key="r" value={viewingTotals?.revenue ?? 0} />],
                ["רווח לפני תקורה", <ProfitText key="p" value={viewingTotals?.profit ?? 0} />],
                ["שיעור רווח ממוצע", <MarginBadge key="m" bp={viewingTotals?.marginBp ?? null} target={settings.target_margin_bp} />],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-line bg-ivory/50 p-3">
                  <div className="text-xs text-muted">{label}</div>
                  <div className="mt-1 text-base font-bold">{value}</div>
                </div>
              ))}
            </div>
            {viewing.notes && <p className="mt-4 text-sm leading-relaxed text-ink-2">{viewing.notes}</p>}
            <h3 className="mt-5 mb-2 text-sm font-semibold">היסטוריית עבודות ({history.length})</h3>
            {history.length === 0 ? (
              <p className="text-sm text-muted">אין עבודות המשויכות ללקוח.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {history.map((r) => (
                  <li key={r.job.id}>
                    <Link href={`/jobs/${r.job.id}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-gold-100/40">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{r.job.title}</span>
                        <span className="num text-xs text-muted">{formatDate(r.date, settings.date_format)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <StatusBadge status={r.job.status} />
                        <ProfitText value={r.view.hasPrice ? r.view.profit : null} className="text-sm" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Dialog>
    </>
  );
}
