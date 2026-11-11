"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button, Dialog, DialogFooter, Field, Input, Select, UnitInput } from "@/components/ui";
import type { NewRow } from "@/lib/backend/types";
import { today } from "@/lib/dates";
import { entryAmount } from "@/lib/finance/engine";
import { minorToDecimalString, toMilli, toMinor } from "@/lib/finance/money";
import { formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useWorkspace } from "@/lib/store";
import { COST_CATEGORIES, type CostCategory, type CostKind, type JobCostEntry } from "@/lib/types";
import { costEntrySchema, type CostEntryFormValues } from "@/lib/validation";

const money = (v: number | null) => (v == null ? "" : minorToDecimalString(v));
const number = (v: number | null) => (v == null ? "" : String(v));
const qty = (v: string) => {
  const milli = toMilli(v);
  return milli == null ? null : milli / 1000;
};

function toForm(entry: JobCostEntry | null, kind: CostKind, category: CostCategory, hourly: number): CostEntryFormValues {
  return {
    kind: entry?.kind ?? kind,
    category: entry?.category ?? category,
    description: entry?.description ?? "",
    entry_date: entry?.entry_date ?? today(),
    quantity: entry ? number(entry.quantity) : "1",
    unit: entry?.unit ?? "יח׳",
    unit_cost: money(entry?.unit_cost ?? null),
    employee_id: entry?.employee_id ?? "",
    hours: number(entry?.hours ?? null),
    hourly_cost: entry ? money(entry.hourly_cost) : hourly > 0 ? minorToDecimalString(hourly) : "",
    distance_km: number(entry?.distance_km ?? null),
    rate_per_km: entry ? money(entry.rate_per_km) : "",
    parking: money(entry?.parking ?? null),
    other_travel: money(entry?.other_travel ?? null),
    amount: entry && (entry.category === "contractor" || entry.category === "other") ? money(entry.amount) : "",
  };
}

/** Converts validated form text into a row; only the fields relevant to the category are kept. */
export function formToEntry(values: CostEntryFormValues, jobId: string): NewRow<"job_cost_entries"> {
  const category = values.category as CostCategory;
  const base: NewRow<"job_cost_entries"> = {
    job_id: jobId, kind: values.kind, category, description: values.description.trim(), entry_date: values.entry_date,
    quantity: null, unit: null, unit_cost: null, employee_id: null, hours: null, hourly_cost: null,
    distance_km: null, rate_per_km: null, parking: null, other_travel: null, amount: 0,
  };
  if (category === "materials") Object.assign(base, { quantity: qty(values.quantity), unit: values.unit || null, unit_cost: toMinor(values.unit_cost) });
  if (category === "labor") {
    Object.assign(base, { employee_id: values.employee_id || null, hours: qty(values.hours), hourly_cost: toMinor(values.hourly_cost) });
    if (!base.description) base.description = "שעות עבודה";
  }
  if (category === "transport") {
    Object.assign(base, {
      distance_km: qty(values.distance_km), rate_per_km: toMinor(values.rate_per_km), parking: toMinor(values.parking), other_travel: toMinor(values.other_travel),
    });
    if (!base.description) base.description = "נסיעות";
  }
  if (category === "contractor" || category === "other") base.amount = toMinor(values.amount) ?? 0;
  base.amount = entryAmount(base);
  return base;
}

export function CostEntryDialog({ open, onOpenChange, jobId, kind, category, entry, onSave, busy }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  kind: CostKind;
  category: CostCategory;
  entry: JobCostEntry | null;
  onSave: (row: NewRow<"job_cost_entries">) => Promise<unknown>;
  busy?: boolean;
}) {
  const { settings, data } = useWorkspace();
  const { register, handleSubmit, watch, reset, setValue, formState } = useForm<CostEntryFormValues>({
    resolver: zodResolver(costEntrySchema),
    defaultValues: toForm(entry, kind, category, settings.default_hourly_cost),
  });
  const errors = formState.errors;

  useEffect(() => {
    if (open) reset(toForm(entry, kind, category, settings.default_hourly_cost));
  }, [open, entry, kind, category, settings.default_hourly_cost, reset]);

  const values = watch();
  const currentCategory = values.category as CostCategory;
  const parsed = costEntrySchema.safeParse(values);
  const total = parsed.success ? formToEntry(parsed.data, jobId).amount : null;
  const activeEmployees = data.employees.filter((e) => e.active || e.id === values.employee_id);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={entry ? "עריכת שורת עלות" : values.kind === "estimated" ? "הוספת עלות מוערכת" : "הוספת עלות בפועל"}
      description={values.kind === "estimated" ? "הערכה לפני ביצוע — אינה נספרת כהוצאה בפועל." : "הוצאה שהתרחשה בפועל בעבודה זו."}
    >
      <form noValidate onSubmit={handleSubmit((v) => onSave(formToEntry(v, jobId)))} className="grid gap-4 sm:grid-cols-2">
        <Field label="סוג עלות">
          {(props) => (
            <Select {...props} {...register("category")} disabled={Boolean(entry)}>
              {COST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t.category[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="תאריך" error={errors.entry_date?.message}>
          {(props) => <Input type="date" {...props} {...register("entry_date")} />}
        </Field>

        {currentCategory === "materials" && (
          <>
            <Field label="שם הפריט" error={errors.description?.message} className="sm:col-span-2">
              {(props) => <Input placeholder="לדוגמה: צנרת נחושת" {...props} {...register("description")} />}
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="כמות" error={errors.quantity?.message}>
                {(props) => <Input inputMode="decimal" dir="ltr" className="num text-start" {...props} {...register("quantity")} />}
              </Field>
              <Field label="יחידה">{(props) => <Input placeholder="יח׳ / מ׳ / ק״ג" {...props} {...register("unit")} />}</Field>
            </div>
            <Field label="עלות ליחידה" error={errors.unit_cost?.message}>
              {(props) => <UnitInput unit="₪" placeholder="0.00" {...props} {...register("unit_cost")} />}
            </Field>
          </>
        )}

        {currentCategory === "labor" && (
          <>
            <Field label="עובד/ת" optional className="sm:col-span-2" hint="בחירת עובד/ת ממלאת את העלות הפנימית לשעה שהוגדרה לו/לה. אפשר לרשום גם את שעות בעל/ת העסק.">
              {(props) => (
                <Select
                  {...props}
                  {...register("employee_id", {
                    onChange: (e) => {
                      const employee = data.employees.find((x) => x.id === e.target.value);
                      if (employee) setValue("hourly_cost", minorToDecimalString(employee.hourly_cost), { shouldValidate: true });
                    },
                  })}
                >
                  <option value="">ללא שיוך</option>
                  {activeEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="שעות עבודה" error={errors.hours?.message}>
              {(props) => <UnitInput unit="ש׳" placeholder="0" {...props} {...register("hours")} />}
            </Field>
            <Field label="עלות פנימית לשעה" error={errors.hourly_cost?.message}>
              {(props) => <UnitInput unit="₪" placeholder="0.00" {...props} {...register("hourly_cost")} />}
            </Field>
            <Field label="תיאור" optional className="sm:col-span-2">
              {(props) => <Input {...props} {...register("description")} />}
            </Field>
          </>
        )}

        {currentCategory === "transport" && (
          <>
            <Field label="מרחק" optional error={errors.distance_km?.message}>
              {(props) => <UnitInput unit="ק״מ" placeholder="0" {...props} {...register("distance_km")} />}
            </Field>
            <Field label="עלות לק״מ" optional error={errors.rate_per_km?.message}>
              {(props) => <UnitInput unit="₪" placeholder="0.00" {...props} {...register("rate_per_km")} />}
            </Field>
            <Field label="חניה" optional error={errors.parking?.message}>
              {(props) => <UnitInput unit="₪" placeholder="0.00" {...props} {...register("parking")} />}
            </Field>
            <Field label="הוצאות נסיעה אחרות" optional error={errors.other_travel?.message}>
              {(props) => <UnitInput unit="₪" placeholder="0.00" {...props} {...register("other_travel")} />}
            </Field>
            <Field label="תיאור" optional className="sm:col-span-2">
              {(props) => <Input {...props} {...register("description")} />}
            </Field>
          </>
        )}

        {(currentCategory === "contractor" || currentCategory === "other") && (
          <>
            <Field label={currentCategory === "contractor" ? "שם הקבלן / תיאור העבודה" : "תיאור ההוצאה"} error={errors.description?.message} className="sm:col-span-2">
              {(props) => <Input {...props} {...register("description")} />}
            </Field>
            <Field label="סכום" error={errors.amount?.message}>
              {(props) => <UnitInput unit="₪" placeholder="0.00" {...props} {...register("amount")} />}
            </Field>
          </>
        )}

        <div className="flex items-center justify-between rounded-xl bg-navy-900 px-4 py-3 text-white sm:col-span-2">
          <span className="text-sm text-gold-200">סה״כ לשורה</span>
          <span className="num text-lg font-bold">{total == null ? "—" : formatMoney(total, { exact: true })}</span>
        </div>

        <div className="sm:col-span-2">
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" loading={busy}>
              {t.common.save}
            </Button>
          </DialogFooter>
        </div>
      </form>
    </Dialog>
  );
}
