"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button, Field, Input, Select, Textarea, UnitInput } from "@/components/ui";
import type { NewRow } from "@/lib/backend/types";
import { today } from "@/lib/dates";
import { resolvePrice } from "@/lib/finance/engine";
import { bpToPercentString, minorToDecimalString, percentToBp, toMinor } from "@/lib/finance/money";
import { formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useWorkspace } from "@/lib/store";
import { JOB_STATUSES, type BusinessSettings, type Job, type JobStatus, type VatMode } from "@/lib/types";
import { jobSchema, type JobFormValues } from "@/lib/validation";

const money = (value: number | null) => (value == null ? "" : minorToDecimalString(value));

export function jobToForm(job: Job | null, settings: BusinessSettings): JobFormValues {
  return {
    title: job?.title ?? "",
    customer_id: job?.customer_id ?? "",
    service_category_id: job?.service_category_id ?? "",
    description: job?.description ?? "",
    status: job?.status ?? "draft",
    planned_date: job?.planned_date ?? "",
    completed_date: job?.completed_date ?? "",
    quoted_price: money(job?.quoted_price ?? null),
    final_price: money(job?.final_price ?? null),
    vat_mode: job?.vat_mode ?? settings.vat_mode,
    vat_rate: bpToPercentString(job?.vat_rate_bp ?? settings.vat_rate_bp),
    payment_fee: bpToPercentString(job?.payment_fee_bp ?? settings.payment_fee_bp),
    notes: job?.notes ?? "",
  };
}

export function formToJob(values: JobFormValues): Omit<NewRow<"jobs">, "archived" | "is_sample"> {
  return {
    title: values.title.trim(),
    customer_id: values.customer_id || null,
    service_category_id: values.service_category_id || null,
    description: values.description.trim() || null,
    status: values.status as JobStatus,
    planned_date: values.planned_date || null,
    completed_date: values.completed_date || null,
    quoted_price: toMinor(values.quoted_price),
    final_price: toMinor(values.final_price),
    vat_mode: values.vat_mode,
    vat_rate_bp: percentToBp(values.vat_rate) ?? 0,
    payment_fee_bp: percentToBp(values.payment_fee) ?? 0,
    notes: values.notes.trim() || null,
  };
}

function PricePreview({ value, mode, rate }: { value: string; mode: VatMode; rate: string }) {
  const entered = toMinor(value);
  const rateBp = percentToBp(rate);
  if (entered == null || rateBp == null || mode === "none") return null;
  const price = resolvePrice(entered, mode, rateBp);
  return (
    <span className="num">
      הכנסה לפני מע״מ {formatMoney(price.net)} · מע״מ {formatMoney(price.vat)} · ללקוח {formatMoney(price.customerPrice)}
    </span>
  );
}

export function JobForm({ job, onSubmit, onCancel, busy, submitLabel }: {
  job: Job | null;
  onSubmit: (values: JobFormValues) => void | Promise<unknown>;
  onCancel: () => void;
  busy?: boolean;
  submitLabel: string;
}) {
  const { settings, data } = useWorkspace();
  const { register, handleSubmit, watch, setValue, formState } = useForm<JobFormValues>({
    resolver: zodResolver(jobSchema),
    defaultValues: jobToForm(job, settings),
  });
  const errors = formState.errors;
  const [status, vatMode, vatRate, quoted, final] = watch(["status", "vat_mode", "vat_rate", "quoted_price", "final_price"]);
  const priceLabel = vatMode === "included" ? "כולל מע״מ" : vatMode === "added" ? "לפני מע״מ" : "";

  return (
    <form noValidate onSubmit={handleSubmit((values) => onSubmit(values))} className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="שם העבודה" error={errors.title?.message} className="sm:col-span-2">
          {(props) => <Input placeholder="לדוגמה: התקנת מזגן בסלון" {...props} {...register("title")} />}
        </Field>
        <Field label="לקוח" optional>
          {(props) => (
            <Select {...props} {...register("customer_id")}>
              <option value="">ללא לקוח</option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="קטגוריית שירות" optional>
          {(props) => (
            <Select {...props} {...register("service_category_id")}>
              <option value="">ללא קטגוריה</option>
              {data.service_categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="תיאור" optional error={errors.description?.message} className="sm:col-span-2">
          {(props) => <Textarea rows={2} className="min-h-16" {...props} {...register("description")} />}
        </Field>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Field label="סטטוס">
          {(props) => (
            <Select
              {...props}
              {...register("status", {
                onChange: (e) => {
                  if (e.target.value === "completed" && !watch("completed_date")) setValue("completed_date", today(), { shouldValidate: true });
                },
              })}
            >
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t.status[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="תאריך מתוכנן" optional error={errors.planned_date?.message}>
          {(props) => <Input type="date" {...props} {...register("planned_date")} />}
        </Field>
        <Field label="תאריך סיום" optional={status !== "completed"} error={errors.completed_date?.message}>
          {(props) => <Input type="date" {...props} {...register("completed_date")} />}
        </Field>
      </section>

      <section className="rounded-2xl border border-line bg-ivory/50 p-4">
        <h3 className="mb-3 text-sm font-semibold">מחיר ומע״מ</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`מחיר בהצעת המחיר ${priceLabel}`} optional error={errors.quoted_price?.message} hint={<PricePreview value={quoted} mode={vatMode} rate={vatRate} />}>
            {(props) => <UnitInput unit="₪" placeholder="0.00" {...props} {...register("quoted_price")} />}
          </Field>
          <Field
            label={`מחיר סופי בפועל ${priceLabel}`} optional error={errors.final_price?.message}
            hint={final ? <PricePreview value={final} mode={vatMode} rate={vatRate} /> : "אם יישאר ריק, מחיר ההצעה ישמש כהכנסה בפועל."}
          >
            {(props) => <UnitInput unit="₪" placeholder="0.00" {...props} {...register("final_price")} />}
          </Field>
          <Field label="הצגת מע״מ בעבודה זו">
            {(props) => (
              <Select {...props} {...register("vat_mode")}>
                <option value="added">{t.vatModeShort.added} (המע״מ מתווסף)</option>
                <option value="included">{t.vatModeShort.included}</option>
                <option value="none">{t.vatModeShort.none}</option>
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="שיעור מע״מ" error={errors.vat_rate?.message}>
              {(props) => <UnitInput unit="%" disabled={vatMode === "none"} {...props} {...register("vat_rate")} />}
            </Field>
            <Field label="עמלת סליקה" error={errors.payment_fee?.message} hint="מהמחיר ללקוח">
              {(props) => <UnitInput unit="%" {...props} {...register("payment_fee")} />}
            </Field>
          </div>
        </div>
      </section>

      <Field label="הערות" optional error={errors.notes?.message}>
        {(props) => <Textarea rows={3} {...props} {...register("notes")} />}
      </Field>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
