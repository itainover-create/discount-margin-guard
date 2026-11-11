"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Download, FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button, Card, CardHeader, Field, Input, Notice, PageHeader, Select, Tabs, UnitInput, useConfirm } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";
import { RANGE_PRESETS, today } from "@/lib/dates";
import { costsCsv, customersCsv, jobsCsv } from "@/lib/exports";
import { overheadPerHour } from "@/lib/finance/engine";
import { bpToPercentString, minorToDecimalString, percentToBp, toMilli, toMinor } from "@/lib/finance/money";
import { formatDate, formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n";
import { canDeleteBusiness, canManageBusiness } from "@/lib/permissions";
import { byCustomer } from "@/lib/reports";
import { BUSINESS_TYPES } from "@/lib/seed";
import { useWorkspace } from "@/lib/store";
import type { BusinessSettings } from "@/lib/types";
import { useRun } from "@/lib/use-run";
import { businessProfileSchema, financialSettingsSchema, passwordSchema, type FinancialSettingsValues } from "@/lib/validation";

type Section = "business" | "finance" | "categories" | "appearance" | "account" | "data";
const SaveBar = ({ busy, dirty }: { busy: boolean; dirty: boolean }) => (
  <div className="mt-6 flex justify-end">
    <Button type="submit" loading={busy} disabled={!dirty}>{t.common.save}</Button>
  </div>
);

function BusinessSection({ disabled }: { disabled: boolean }) {
  const { organization, updateOrganization } = useWorkspace();
  const { run, busy } = useRun();
  type V = z.infer<typeof businessProfileSchema>;
  const { register, handleSubmit, reset, formState } = useForm<V>({
    resolver: zodResolver(businessProfileSchema),
    defaultValues: { name: organization.name, business_type: organization.business_type, country: organization.country, currency: organization.currency, language: organization.language },
  });
  return (
    <Card>
      <CardHeader title="פרופיל העסק" />
      <form noValidate className="card-pad pt-4" onSubmit={handleSubmit((v) => run(async () => { await updateOrganization(v); reset(v); }, t.common.saved))}>
        <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
          <Field label="שם העסק" error={formState.errors.name?.message}>{(p) => <Input {...p} {...register("name")} />}</Field>
          <Field label="תחום העיסוק">
            {(p) => <Select {...p} {...register("business_type")}>{BUSINESS_TYPES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</Select>}
          </Field>
          <Field label="מטבע" hint="מטבעות נוספים מתוכננים בהמשך.">{(p) => <Select {...p} {...register("currency")}><option value="ILS">שקל חדש (₪)</option></Select>}</Field>
          <Field label="שפה" hint="שפות נוספות מתוכננות בהמשך.">{(p) => <Select {...p} {...register("language")}><option value="he">עברית</option></Select>}</Field>
        </fieldset>
        {!disabled && <SaveBar busy={busy} dirty={formState.isDirty} />}
      </form>
    </Card>
  );
}

const financeDefaults = (s: BusinessSettings): FinancialSettingsValues => ({
  vat_rate: bpToPercentString(s.vat_rate_bp), vat_mode: s.vat_mode, default_hourly_cost: minorToDecimalString(s.default_hourly_cost),
  target_margin: bpToPercentString(s.target_margin_bp), overhead_method: s.overhead_method, monthly_overhead: minorToDecimalString(s.monthly_overhead),
  billable_hours: String(s.billable_hours), fixed_overhead_per_job: minorToDecimalString(s.fixed_overhead_per_job),
  overhead_revenue_pct: bpToPercentString(s.overhead_revenue_pct_bp), payment_fee: bpToPercentString(s.payment_fee_bp),
});

function FinanceSection({ disabled }: { disabled: boolean }) {
  const { settings, updateSettings } = useWorkspace();
  const { run, busy } = useRun();
  const { register, handleSubmit, reset, watch, formState } = useForm<FinancialSettingsValues>({ resolver: zodResolver(financialSettingsSchema), defaultValues: financeDefaults(settings) });
  const e = formState.errors;
  const [method, vatMode, monthly, hours] = watch(["overhead_method", "vat_mode", "monthly_overhead", "billable_hours"]);
  const perHour = overheadPerHour(toMinor(monthly) ?? 0, (toMilli(hours) ?? 0) / 1000);
  return (
    <Card>
      <CardHeader title="הגדרות פיננסיות" subtitle="ברירות מחדל לעבודות חדשות. עבודות קיימות שומרות את הגדרות המע״מ שנקבעו בהן." />
      <form
        noValidate
        className="card-pad pt-4"
        onSubmit={handleSubmit((v) =>
          run(async () => {
            await updateSettings({
              vat_rate_bp: percentToBp(v.vat_rate) ?? 0, vat_mode: v.vat_mode, default_hourly_cost: toMinor(v.default_hourly_cost) ?? 0,
              target_margin_bp: percentToBp(v.target_margin) ?? 0, overhead_method: v.overhead_method, monthly_overhead: toMinor(v.monthly_overhead) ?? 0,
              billable_hours: (toMilli(v.billable_hours) ?? 0) / 1000, fixed_overhead_per_job: toMinor(v.fixed_overhead_per_job) ?? 0,
              overhead_revenue_pct_bp: percentToBp(v.overhead_revenue_pct) ?? 0, payment_fee_bp: percentToBp(v.payment_fee) ?? 0,
            });
            reset(v);
          }, t.common.saved),
        )}
      >
        <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
          <Field label="הצגת מע״מ" className="sm:col-span-2" hint="ProfitLens אינו קובע את מעמדך במע״מ. בחרו את ההצגה המתאימה לעסק.">
            {(p) => (
              <Select {...p} {...register("vat_mode")}>
                <option value="added">{t.vatMode.added}</option>
                <option value="included">{t.vatMode.included}</option>
                <option value="none">{t.vatMode.none}</option>
              </Select>
            )}
          </Field>
          <Field label="שיעור מע״מ להצגה" error={e.vat_rate?.message}>{(p) => <UnitInput unit="%" disabled={vatMode === "none"} {...p} {...register("vat_rate")} />}</Field>
          <Field label="יעד שיעור רווח" error={e.target_margin?.message}>{(p) => <UnitInput unit="%" {...p} {...register("target_margin")} />}</Field>
          <Field label="עלות פנימית לשעה (ברירת מחדל)" error={e.default_hourly_cost?.message}>{(p) => <UnitInput unit="₪" {...p} {...register("default_hourly_cost")} />}</Field>
          <Field label="עמלת סליקה (ברירת מחדל)" error={e.payment_fee?.message} hint="אחוז מהמחיר ללקוח, נספר כעלות ישירה. 0 אם אין.">{(p) => <UnitInput unit="%" {...p} {...register("payment_fee")} />}</Field>

          <div className="mt-2 border-t border-line pt-4 sm:col-span-2">
            <h3 className="text-sm font-semibold">העמסת תקורה</h3>
            <p className="mt-0.5 text-xs text-muted">איך לחלק את ההוצאות הקבועות בין העבודות. התוצאה היא ״תרומה תפעולית״ — אומדן ניהולי, לא רווח נקי חשבונאי.</p>
          </div>
          <Field label="שיטת ההעמסה" className="sm:col-span-2">
            {(p) => (
              <Select {...p} {...register("overhead_method")}>
                {(["none", "fixed", "hours", "revenue_pct"] as const).map((m) => <option key={m} value={m}>{t.overhead[m]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="הוצאות קבועות חודשיות" error={e.monthly_overhead?.message}>{(p) => <UnitInput unit="₪" {...p} {...register("monthly_overhead")} />}</Field>
          <Field label="שעות לחיוב בחודש" error={e.billable_hours?.message} hint={perHour > 0 ? `תקורה לשעת עבודה: ${formatMoney(perHour, { exact: true })}` : "נדרש לשיטת ״לפי שעות העבודה״"}>
            {(p) => <UnitInput unit="ש׳" {...p} {...register("billable_hours")} />}
          </Field>
          {method === "fixed" && <Field label="תקורה קבועה לעבודה" error={e.fixed_overhead_per_job?.message}>{(p) => <UnitInput unit="₪" {...p} {...register("fixed_overhead_per_job")} />}</Field>}
          {method === "revenue_pct" && <Field label="תקורה כאחוז מההכנסה" error={e.overhead_revenue_pct?.message}>{(p) => <UnitInput unit="%" {...p} {...register("overhead_revenue_pct")} />}</Field>}
          {method === "hours" && perHour === 0 && <Notice tone="warning" className="sm:col-span-2">כדי להעמיס לפי שעות יש להזין גם הוצאות חודשיות וגם שעות לחיוב. בלי שניהם התקורה תהיה 0.</Notice>}
        </fieldset>
        {!disabled && <SaveBar busy={busy} dirty={formState.isDirty} />}
      </form>
    </Card>
  );
}

function CategoriesSection({ disabled }: { disabled: boolean }) {
  const { data, add, patch, removeRows, jobRows } = useWorkspace();
  const { run, busy } = useRun();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const exists = (value: string, exceptId?: string) => data.service_categories.some((c) => c.id !== exceptId && c.name === value.trim());
  return (
    <Card>
      <CardHeader title="קטגוריות שירות" subtitle="משמשות לסיווג עבודות ולדוח הרווחיות לפי שירות" />
      <div className="card-pad pt-4">
        <ul className="divide-y divide-line rounded-xl border border-line">
          {data.service_categories.length === 0 && <li className="px-3.5 py-3 text-sm text-muted">אין קטגוריות.</li>}
          {data.service_categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3.5 py-2">
              {editing?.id === c.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    const value = editing.name.trim();
                    if (!value || exists(value, c.id)) return;
                    void run(async () => { await patch("service_categories", c.id, { name: value }); setEditing(null); }, t.common.saved);
                  }}
                >
                  <Input autoFocus aria-label="שם הקטגוריה" maxLength={80} value={editing.name} onChange={(ev) => setEditing({ id: c.id, name: ev.target.value })} />
                  <Button type="submit" size="sm" className="h-10" loading={busy}>{t.common.save}</Button>
                  <Button size="sm" variant="ghost" className="h-10" onClick={() => setEditing(null)}>{t.common.cancel}</Button>
                </form>
              ) : (
                <>
                  <span className="text-sm font-medium">{c.name}</span>
                  {!disabled && (
                    <span className="flex gap-0.5">
                      <Button variant="ghost" size="sm" icon aria-label={`שינוי שם ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name })}><Pencil className="size-3.5" /></Button>
                      <Button
                        variant="ghost" size="sm" icon className="hover:text-negative" aria-label={`מחיקת ${c.name}`}
                        onClick={async () => {
                          const used = jobRows.filter((r) => r.job.service_category_id === c.id).length;
                          if (await confirm({ title: "מחיקת קטגוריה", text: `הקטגוריה ״${c.name}״ תימחק.${used ? ` ${used} עבודות יישארו ללא קטגוריה.` : ""}`, confirmLabel: t.common.delete, danger: true })) {
                            await run(() => removeRows("service_categories", [c.id]), "הקטגוריה נמחקה");
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        {!disabled && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              const value = name.trim();
              if (!value || exists(value)) return;
              void run(async () => { await add("service_categories", [{ name: value }]); setName(""); }, "הקטגוריה נוספה");
            }}
          >
            <Input aria-label="קטגוריה חדשה" placeholder="שם קטגוריה חדשה" maxLength={80} value={name} onChange={(ev) => setName(ev.target.value)} />
            <Button type="submit" variant="outline" disabled={!name.trim() || exists(name)}><Plus className="size-4" />הוספה</Button>
          </form>
        )}
        {name.trim() && exists(name) && <p className="mt-1 text-xs text-negative">כבר קיימת קטגוריה בשם הזה.</p>}
      </div>
    </Card>
  );
}

function AppearanceSection({ disabled }: { disabled: boolean }) {
  const { settings, updateSettings } = useWorkspace();
  const { run } = useRun();
  return (
    <Card>
      <CardHeader title="תצוגה" subtitle="השינויים נשמרים מיד" />
      <fieldset disabled={disabled} className="card-pad grid gap-4 pt-4 sm:grid-cols-2">
        <Field label="פורמט תאריך" hint={`דוגמה: ${formatDate(today(), settings.date_format)}`}>
          {(p) => (
            <Select {...p} value={settings.date_format} onChange={(e) => run(() => updateSettings({ date_format: e.target.value as BusinessSettings["date_format"] }), t.common.saved)}>
              <option value="dd/MM/yyyy">יום/חודש/שנה (31/12/2026)</option>
              <option value="dd.MM.yyyy">יום.חודש.שנה (31.12.2026)</option>
              <option value="yyyy-MM-dd">שנה-חודש-יום (2026-12-31)</option>
            </Select>
          )}
        </Field>
        <Field label="תקופת ברירת המחדל בלוח הבקרה">
          {(p) => (
            <Select {...p} value={settings.dashboard_range} onChange={(e) => run(() => updateSettings({ dashboard_range: e.target.value }), t.common.saved)}>
              {RANGE_PRESETS.filter((r) => r !== "custom").map((r) => <option key={r} value={r}>{t.range[r]}</option>)}
            </Select>
          )}
        </Field>
        <Field label="שפת הממשק" hint="כרגע עברית בלבד. הארכיטקטורה מוכנה להוספת אנגלית.">
          {(p) => <Select {...p} value="he" disabled onChange={() => undefined}><option value="he">עברית (RTL)</option></Select>}
        </Field>
      </fieldset>
    </Card>
  );
}

function AccountSection() {
  const { user, role, isDemo, updateProfile, updatePassword } = useWorkspace();
  const { run, busy } = useRun();
  const [name, setName] = useState(user.name);
  type V = z.infer<typeof passwordSchema>;
  const pw = useForm<V>({ resolver: zodResolver(passwordSchema), defaultValues: { current: "", next: "", confirm: "" } });
  const e = pw.formState.errors;
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="פרטי המשתמש" />
        <div className="card-pad grid gap-4 pt-4 sm:grid-cols-2">
          <Field label="שם מלא">{(p) => <Input {...p} value={name} maxLength={80} onChange={(ev) => setName(ev.target.value)} />}</Field>
          <Field label="אימייל" hint={`תפקיד: ${t.role[role]}`}>{(p) => <Input {...p} dir="ltr" className="text-start" value={user.email} disabled readOnly />}</Field>
          <div className="flex justify-end sm:col-span-2">
            <Button disabled={name.trim().length < 2 || name.trim() === user.name} loading={busy} onClick={() => run(() => updateProfile(name), t.common.saved)}>{t.common.save}</Button>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="שינוי סיסמה" subtitle={isDemo ? "בסביבת ההדגמה הסיסמה נשמרת (מגובבת) בדפדפן הזה בלבד ואין שחזור סיסמה." : undefined} />
        <form noValidate className="card-pad grid gap-4 pt-4 sm:grid-cols-3" onSubmit={pw.handleSubmit((v) => run(async () => { await updatePassword(v.current, v.next); pw.reset(); }, "הסיסמה עודכנה"))}>
          <Field label="סיסמה נוכחית" error={e.current?.message}>{(p) => <Input type="password" autoComplete="current-password" dir="ltr" className="text-start" {...p} {...pw.register("current")} />}</Field>
          <Field label="סיסמה חדשה" error={e.next?.message}>{(p) => <Input type="password" autoComplete="new-password" dir="ltr" className="text-start" {...p} {...pw.register("next")} />}</Field>
          <Field label="אימות הסיסמה החדשה" error={e.confirm?.message}>{(p) => <Input type="password" autoComplete="new-password" dir="ltr" className="text-start" {...p} {...pw.register("confirm")} />}</Field>
          <div className="flex justify-end sm:col-span-3"><Button type="submit" loading={busy}>עדכון הסיסמה</Button></div>
        </form>
      </Card>
    </div>
  );
}

function DataSection() {
  const { jobRows, data, role, organization, hasSampleData, loadSampleData, removeSampleData, removeRows, deleteBusiness } = useWorkspace();
  const { run, busy } = useRun();
  const confirm = useConfirm();
  const router = useRouter();
  const manage = canManageBusiness(role);
  const stamp = today();
  const archived = data.jobs.filter((j) => j.archived);
  const customerTotals = new Map(byCustomer(jobRows.filter((r) => r.job.status === "completed" && !r.job.archived)).map((g) => [g.key, g]));
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="ייצוא נתונים" subtitle="קובצי CSV שנפתחים באקסל ובגוגל שיטס. הנתונים שלך — תמיד ניתנים להורדה." />
        <div className="card-pad flex flex-wrap gap-2 pt-4">
          <Button variant="outline" disabled={!jobRows.length} onClick={() => downloadCsv(`profitlens-jobs-${stamp}.csv`, jobsCsv(jobRows))}><Download className="size-4" />כל העבודות</Button>
          <Button variant="outline" disabled={!data.job_cost_entries.length} onClick={() => downloadCsv(`profitlens-costs-${stamp}.csv`, costsCsv(jobRows, data.employees))}><Download className="size-4" />כל שורות העלות</Button>
          <Button variant="outline" disabled={!data.customers.length} onClick={() => downloadCsv(`profitlens-customers-${stamp}.csv`, customersCsv(data.customers, customerTotals))}><Download className="size-4" />לקוחות</Button>
        </div>
      </Card>
      {manage && (
        <Card>
          <CardHeader title="נתוני דוגמה" subtitle="14 עבודות בדיוניות להתנסות במערכת. מסומנות ״דוגמה״ ואינן מתערבבות ברשומות שלך." />
          <div className="card-pad flex flex-wrap gap-2 pt-4">
            {hasSampleData ? (
              <Button variant="outline" loading={busy} onClick={() => run(removeSampleData, "נתוני הדוגמה הוסרו")}><Trash2 className="size-4" />הסרת נתוני הדוגמה</Button>
            ) : (
              <Button variant="outline" loading={busy} onClick={() => run(loadSampleData, "נתוני הדוגמה נטענו")}><FlaskConical className="size-4" />טעינת נתוני דוגמה</Button>
            )}
          </div>
        </Card>
      )}
      {manage && (
        <Card className="border-negative/25">
          <CardHeader title="מחיקת נתונים" subtitle="פעולות בלתי הפיכות. מומלץ לייצא לפני המחיקה." />
          <div className="card-pad flex flex-col gap-3 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3.5">
              <div className="text-sm"><b>מחיקת עבודות בארכיון</b><div className="text-xs text-muted">{archived.length} עבודות בארכיון, כולל שורות העלות שלהן.</div></div>
              <Button
                variant="danger" disabled={!archived.length}
                onClick={async () => {
                  if (await confirm({ title: "מחיקת הארכיון", text: `${archived.length} עבודות בארכיון יימחקו לצמיתות.`, confirmLabel: "מחיקה לצמיתות", danger: true })) await run(() => removeRows("jobs", archived.map((j) => j.id)), "הארכיון נמחק");
                }}
              >
                מחיקת הארכיון
              </Button>
            </div>
            {canDeleteBusiness(role) && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-negative/30 bg-negative-soft/50 p-3.5">
                <div className="text-sm"><b>מחיקת חשבון העסק</b><div className="text-xs text-ink-2">כל העבודות, העלויות, הלקוחות, הצוות וההגדרות של ״{organization.name}״ יימחקו לצמיתות.</div></div>
                <Button
                  variant="danger"
                  onClick={async () => {
                    if (await confirm({ title: "מחיקת חשבון העסק", text: "כל נתוני העסק יימחקו לצמיתות ולא ניתן יהיה לשחזר אותם.", confirmLabel: "מחיקת העסק לצמיתות", danger: true, typeToConfirm: organization.name })) {
                      await run(async () => { await deleteBusiness(); router.replace("/onboarding"); }, "חשבון העסק נמחק");
                    }
                  }}
                >
                  מחיקת העסק
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { role } = useWorkspace();
  const [section, setSection] = useState<Section>("business");
  const readOnly = !canManageBusiness(role);
  return (
    <>
      <PageHeader title={t.nav.settings} subtitle="פרופיל העסק, ברירות המחדל הפיננסיות, התצוגה, החשבון והנתונים." />
      <Tabs
        className="mb-5"
        value={section}
        onChange={setSection}
        items={[
          { value: "business", label: "העסק" },
          { value: "finance", label: "פיננסי" },
          { value: "categories", label: "קטגוריות" },
          { value: "appearance", label: "תצוגה" },
          { value: "account", label: "חשבון" },
          { value: "data", label: "נתונים" },
        ]}
      />
      {readOnly && section !== "account" && section !== "data" && <Notice tone="info" className="mb-4">ההגדרות מוצגות לקריאה בלבד. רק בעלים ומנהלים יכולים לשנות אותן.</Notice>}
      <div className="max-w-3xl">
        {section === "business" && <BusinessSection disabled={readOnly} />}
        {section === "finance" && <FinanceSection disabled={readOnly} />}
        {section === "categories" && <CategoriesSection disabled={readOnly} />}
        {section === "appearance" && <AppearanceSection disabled={readOnly} />}
        {section === "account" && <AccountSection />}
        {section === "data" && <DataSection />}
      </div>
      <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted">{t.disclaimer}</p>
    </>
  );
}
