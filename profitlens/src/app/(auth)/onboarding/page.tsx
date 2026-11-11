"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { AuthFrame } from "@/components/shell/auth-frame";
import { FullScreenLoader } from "@/components/shell/app-shell";
import { Button, Field, Input, Notice, Select, UnitInput } from "@/components/ui";
import { percentToBp, toMilli, toMinor } from "@/lib/finance/money";
import { t } from "@/lib/i18n";
import { BUSINESS_TYPES } from "@/lib/seed";
import { useApp } from "@/lib/store";
import { useRun } from "@/lib/use-run";
import { cn } from "@/lib/utils";
import { onboardingSchema, type OnboardingFormValues } from "@/lib/validation";

const STEPS: { title: string; fields: (keyof OnboardingFormValues)[] }[] = [
  { title: "העסק", fields: ["name", "business_type", "country", "currency", "language"] },
  { title: "מע״מ ותמחור", fields: ["vat_rate", "vat_mode", "target_margin", "default_hourly_cost"] },
  { title: "תקורה", fields: ["monthly_overhead", "billable_hours"] },
];

export default function OnboardingPage() {
  const { status, user, createOrganization, signOut } = useApp();
  const router = useRouter();
  const { run, busy } = useRun();
  const [step, setStep] = useState(0);
  const [withSample, setWithSample] = useState(true);
  const { register, handleSubmit, trigger, watch, formState } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    mode: "onTouched",
    defaultValues: {
      name: "", business_type: "hvac", country: "IL", currency: "ILS", language: "he",
      vat_rate: "18", vat_mode: "added", default_hourly_cost: "", target_margin: "30", monthly_overhead: "", billable_hours: "",
    },
  });
  const errors = formState.errors;
  const vatMode = watch("vat_mode");

  useEffect(() => {
    if (status === "signed_out") router.replace("/login");
    if (status === "ready") router.replace("/dashboard");
  }, [status, router]);

  if (status !== "no_workspace") return <FullScreenLoader />;

  const next = async () => {
    if (await trigger(STEPS[step].fields)) setStep((s) => s + 1);
  };

  const submit = handleSubmit((values) =>
    run(async () => {
      const monthlyOverhead = toMinor(values.monthly_overhead) ?? 0;
      const billableHours = (toMilli(values.billable_hours) ?? 0) / 1000;
      const type = BUSINESS_TYPES.find((b) => b.value === values.business_type);
      await createOrganization(
        {
          name: values.name,
          business_type: values.business_type,
          country: values.country,
          currency: values.currency,
          language: values.language,
          categories: type?.categories ?? [],
          settings: {
            vat_rate_bp: percentToBp(values.vat_rate) ?? 1800,
            vat_mode: values.vat_mode,
            default_hourly_cost: toMinor(values.default_hourly_cost) ?? 0,
            target_margin_bp: percentToBp(values.target_margin) ?? 3000,
            monthly_overhead: monthlyOverhead,
            billable_hours: billableHours,
            // Hour-based allocation only makes sense once both figures are known.
            overhead_method: monthlyOverhead > 0 && billableHours > 0 ? "hours" : "none",
          },
        },
        withSample,
      );
    }),
  );

  return (
    <AuthFrame wide title={`שלום ${user?.name ?? ""}, נגדיר את העסק`} subtitle="ההגדרות האלה קובעות איך ProfitLens מחשב רווחיות. אפשר לשנות הכול מאוחר יותר במסך ההגדרות.">
      <ol className="mb-7 flex items-center gap-2" aria-label="שלבי ההגדרה">
        {STEPS.map((item, index) => (
          <li key={item.title} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition",
                index < step && "bg-positive text-white",
                index === step && "bg-navy-900 text-gold-200 ring-2 ring-gold-400/60",
                index > step && "bg-line text-muted",
              )}
              aria-current={index === step ? "step" : undefined}
            >
              {index < step ? <Check className="size-4" /> : index + 1}
            </span>
            <span className={cn("text-[13px] font-medium", index === step ? "text-ink" : "text-muted")}>{item.title}</span>
            {index < STEPS.length - 1 && <span className="h-px flex-1 bg-line-strong" aria-hidden />}
          </li>
        ))}
      </ol>

      <form noValidate onSubmit={submit} className="card card-pad">
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="שם העסק" error={errors.name?.message} className="sm:col-span-2">
              {(props) => <Input autoFocus placeholder="לדוגמה: מיזוג הצפון" {...props} {...register("name")} />}
            </Field>
            <Field label="תחום העיסוק" error={errors.business_type?.message}>
              {(props) => (
                <Select {...props} {...register("business_type")}>
                  {BUSINESS_TYPES.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="מדינה">
              {(props) => (
                <Select {...props} {...register("country")}>
                  <option value="IL">ישראל</option>
                </Select>
              )}
            </Field>
            <Field label="מטבע">
              {(props) => (
                <Select {...props} {...register("currency")}>
                  <option value="ILS">שקל חדש (₪)</option>
                </Select>
              )}
            </Field>
            <Field label="שפת הממשק" hint="שפות נוספות יתווספו בהמשך.">
              {(props) => (
                <Select {...props} {...register("language")}>
                  <option value="he">עברית</option>
                </Select>
              )}
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="איך להציג מע״מ?" className="sm:col-span-2" hint="ProfitLens אינו קובע את מעמדך במע״מ — בחרו את ההצגה שמתאימה לעסק. מע״מ לעולם אינו נספר כהכנסה.">
              {(props) => (
                <Select {...props} {...register("vat_mode")}>
                  <option value="added">{t.vatMode.added}</option>
                  <option value="included">{t.vatMode.included}</option>
                  <option value="none">{t.vatMode.none}</option>
                </Select>
              )}
            </Field>
            {vatMode !== "none" && (
              <Field label="שיעור מע״מ להצגה" error={errors.vat_rate?.message} hint="ברירת המחדל היא 18%. ניתן לשנות בכל עת.">
                {(props) => <UnitInput unit="%" {...props} {...register("vat_rate")} />}
              </Field>
            )}
            <Field label="יעד שיעור רווח" error={errors.target_margin?.message} hint="רווח חלקי המחיר לפני מע״מ. משמש להתרעות ולמחשבון.">
              {(props) => <UnitInput unit="%" {...props} {...register("target_margin")} />}
            </Field>
            <Field label="עלות פנימית לשעת עבודה" optional error={errors.default_hourly_cost?.message} hint="כמה עולה לעסק שעת עבודה (לא המחיר ללקוח).">
              {(props) => <UnitInput unit="₪" placeholder="0" {...props} {...register("default_hourly_cost")} />}
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="הוצאות קבועות חודשיות (בקירוב)" optional error={errors.monthly_overhead?.message} hint="שכירות, רכב, ביטוחים, טלפון, הנהלת חשבונות וכו׳.">
              {(props) => <UnitInput unit="₪" placeholder="0" {...props} {...register("monthly_overhead")} />}
            </Field>
            <Field label="שעות עבודה לחיוב בחודש (הערכה)" optional error={errors.billable_hours?.message} hint="כמה שעות בחודש מושקעות בעבודות ללקוחות.">
              {(props) => <UnitInput unit="ש׳" placeholder="0" {...props} {...register("billable_hours")} />}
            </Field>
            <Notice tone="gold" className="sm:col-span-2">
              אם תמלאו את שני השדות, התקורה תועמס על כל עבודה לפי שעות העבודה שלה. אפשר לדלג ולהגדיר מאוחר יותר.
            </Notice>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 sm:col-span-2">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-gold-600)]" checked={withSample} onChange={(e) => setWithSample(e.target.checked)} />
              <span className="text-sm leading-relaxed">
                <b>לטעון נתוני דוגמה בדיוניים</b>
                <span className="block text-[13px] text-muted">
                  14 עבודות לדוגמה שמדגימות עבודות רווחיות, דלות רווח והפסדיות. הן מסומנות בבירור ״דוגמה״ וניתן להסיר את כולן בלחיצה אחת.
                </span>
              </span>
            </label>
            <p className="text-xs leading-relaxed text-muted sm:col-span-2">{t.disclaimer}</p>
          </div>
        )}

        <div className="mt-7 flex items-center justify-between gap-3">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              <ChevronRight className="size-4" />
              הקודם
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
            >
              התנתקות
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>
              המשך
              <ChevronLeft className="size-4" />
            </Button>
          ) : (
            <Button type="submit" variant="gold" loading={busy}>
              סיום והמשך ללוח הבקרה
            </Button>
          )}
        </div>
      </form>
    </AuthFrame>
  );
}
