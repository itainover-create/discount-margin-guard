"use client";

import { Info, RotateCcw, Save, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SummaryRow } from "@/components/finance-ui";
import { Button, Card, CardHeader, Field, Input, Notice, PageHeader, Select, Tabs, UnitInput } from "@/components/ui";
import type { NewRow } from "@/lib/backend/types";
import { today } from "@/lib/dates";
import { allocateOverhead, calculatePrice, enteredFromNet, evaluatePrice, laborCost, marginToMarkupBp, overheadConfig, type PricingResult } from "@/lib/finance/engine";
import { bpToPercentString, minorToDecimalString, percentToBp, toMilli, toMinor } from "@/lib/finance/money";
import { formatMoney, formatPercent } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useWorkspace } from "@/lib/store";
import type { VatMode } from "@/lib/types";
import { useRun } from "@/lib/use-run";
import { cn } from "@/lib/utils";

const PRESETS = [10, 15, 20, 25, 30, 35, 40];
type Mode = "target" | "reverse";
type FieldKey = "materials" | "hours" | "hourly" | "transport" | "contractors" | "other" | "overhead" | "margin" | "price" | "vatRate";

export default function PricingCalculatorPage() {
  const { settings, add, log } = useWorkspace();
  const router = useRouter();
  const { run, busy } = useRun();
  const initial = (): Record<FieldKey, string> => ({
    materials: "", hours: "", hourly: settings.default_hourly_cost > 0 ? minorToDecimalString(settings.default_hourly_cost) : "",
    transport: "", contractors: "", other: "", overhead: "", margin: bpToPercentString(settings.target_margin_bp), price: "",
    vatRate: bpToPercentString(settings.vat_rate_bp),
  });
  const [mode, setMode] = useState<Mode>("target");
  const [values, setValues] = useState(initial);
  const [vatMode, setVatMode] = useState<VatMode>(settings.vat_mode);
  const [title, setTitle] = useState("");
  const set = (key: FieldKey) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((prev) => ({ ...prev, [key]: e.target.value }));

  const calc = useMemo(() => {
    const errors: Partial<Record<FieldKey, string>> = {};
    const moneyOf = (key: FieldKey) => {
      if (values[key].trim() === "") return 0;
      const minor = toMinor(values[key]);
      if (minor == null || minor < 0) errors[key] = "יש להזין סכום תקין (0 ומעלה)";
      return minor ?? 0;
    };
    const hoursMilli = values.hours.trim() === "" ? 0 : toMilli(values.hours);
    if (hoursMilli == null || hoursMilli < 0) errors.hours = "יש להזין מספר שעות תקין";
    const marginBp = percentToBp(values.margin);
    if (mode === "target" && (marginBp == null || marginBp < 0 || marginBp >= 10000)) errors.margin = "יעד הרווח חייב להיות בין 0% ל־100% (לא כולל)";
    const vatRateBp = vatMode === "none" ? 0 : percentToBp(values.vatRate);
    if (vatRateBp == null || vatRateBp < 0 || vatRateBp > 10000) errors.vatRate = "שיעור מע״מ לא תקין";
    const price = toMinor(values.price);
    if (mode === "reverse" && (price == null || price < 0)) errors.price = values.price.trim() === "" ? "יש להזין מחיר" : "יש להזין מחיר תקין";

    const input = {
      materials: moneyOf("materials"), laborHours: (hoursMilli ?? 0) / 1000, hourlyCost: moneyOf("hourly"), transport: moneyOf("transport"),
      contractors: moneyOf("contractors"), other: moneyOf("other"), overhead: moneyOf("overhead"), vatMode, vatRateBp: vatRateBp ?? 0,
    };
    const valid = Object.keys(errors).length === 0;
    let result: PricingResult | null = null;
    if (valid) result = mode === "target" ? calculatePrice({ ...input, targetMarginBp: marginBp ?? 0 }) : evaluatePrice(input, price ?? 0);
    return { errors, input, result, marginBp, valid };
  }, [values, mode, vatMode]);

  const { result, errors, input } = calc;
  const overhead = overheadConfig(settings);
  const suggestedOverhead = overhead.method === "hours" || overhead.method === "fixed" ? allocateOverhead(overhead, input.laborHours, 0) : null;
  const hasCosts = result != null && result.totalCost > 0;
  const belowTarget = result?.marginBp != null && result.marginBp < settings.target_margin_bp;

  const saveDraft = () =>
    run(async () => {
      if (!result || result.priceBeforeVat == null) return;
      const [job] = await add("jobs", [
        {
          title: title.trim() || `הצעת מחיר ${today().split("-").reverse().join("/")}`,
          customer_id: null, service_category_id: null, description: "נוצר ממחשבון התמחור.", status: "draft", planned_date: null, completed_date: null,
          quoted_price: enteredFromNet(result.priceBeforeVat, vatMode, input.vatRateBp), final_price: null, vat_mode: vatMode, vat_rate_bp: input.vatRateBp,
          payment_fee_bp: 0, notes: null, archived: false, is_sample: false,
        },
      ]);
      const blank = {
        job_id: job.id, kind: "estimated" as const, entry_date: today(), quantity: null, unit: null, unit_cost: null, employee_id: null,
        hours: null, hourly_cost: null, distance_km: null, rate_per_km: null, parking: null, other_travel: null,
      };
      const entries: NewRow<"job_cost_entries">[] = [];
      if (input.materials > 0) entries.push({ ...blank, category: "materials", description: "חומרים (הערכה כוללת)", quantity: 1, unit: "סה״כ", unit_cost: input.materials, amount: input.materials });
      if (input.laborHours > 0) entries.push({ ...blank, category: "labor", description: "שעות עבודה", hours: input.laborHours, hourly_cost: input.hourlyCost, amount: laborCost(input.laborHours, input.hourlyCost) });
      if (input.transport > 0) entries.push({ ...blank, category: "transport", description: "נסיעות", other_travel: input.transport, amount: input.transport });
      if (input.contractors > 0) entries.push({ ...blank, category: "contractor", description: "קבלני משנה", amount: input.contractors });
      if (input.other > 0) entries.push({ ...blank, category: "other", description: "הוצאות אחרות", amount: input.other });
      if (entries.length) await add("job_cost_entries", entries);
      log("create", "job", job.id, `נוצרה טיוטה ממחשבון התמחור: ״${job.title}״`);
      router.push(`/jobs/${job.id}`);
    }, "החישוב נשמר כטיוטת עבודה");

  return (
    <>
      <PageHeader title={t.nav.calculator} subtitle="כמה לגבות כדי להגיע ליעד הרווח — או כמה תרוויחו במחיר שכבר יש לכם בראש." />

      <Tabs
        className="mb-5"
        value={mode}
        onChange={setMode}
        items={[
          { value: "target", label: "מחיר לפי יעד רווח" },
          { value: "reverse", label: "כמה ארוויח במחיר נתון?" },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="עלויות מוערכות"
            action={
              <Button variant="ghost" size="sm" onClick={() => { setValues(initial()); setVatMode(settings.vat_mode); setTitle(""); }}>
                <RotateCcw className="size-3.5" />
                איפוס
              </Button>
            }
          />
          <div className="card-pad grid gap-4 pt-4 sm:grid-cols-2">
            <Field label={t.category.materials} error={errors.materials}>
              {(props) => <UnitInput unit="₪" placeholder="0" value={values.materials} onChange={set("materials")} {...props} />}
            </Field>
            <Field label={t.category.transport} error={errors.transport}>
              {(props) => <UnitInput unit="₪" placeholder="0" value={values.transport} onChange={set("transport")} {...props} />}
            </Field>
            <Field label="שעות עבודה" error={errors.hours}>
              {(props) => <UnitInput unit="ש׳" placeholder="0" value={values.hours} onChange={set("hours")} {...props} />}
            </Field>
            <Field label="עלות פנימית לשעה" error={errors.hourly} hint={result && result.labor > 0 ? `עלות עבודה: ${formatMoney(result.labor)}` : undefined}>
              {(props) => <UnitInput unit="₪" placeholder="0" value={values.hourly} onChange={set("hourly")} {...props} />}
            </Field>
            <Field label={t.category.contractor} error={errors.contractors}>
              {(props) => <UnitInput unit="₪" placeholder="0" value={values.contractors} onChange={set("contractors")} {...props} />}
            </Field>
            <Field label={t.category.other} error={errors.other}>
              {(props) => <UnitInput unit="₪" placeholder="0" value={values.other} onChange={set("other")} {...props} />}
            </Field>
            <Field
              label={t.fin.overhead} className="sm:col-span-2" error={errors.overhead}
              hint={
                suggestedOverhead != null
                  ? `לפי ההגדרות (${t.overhead[overhead.method]}): ${formatMoney(suggestedOverhead)}`
                  : overhead.method === "revenue_pct"
                    ? "בהגדרות נבחרה העמסה לפי אחוז מההכנסה — כאן יש להזין סכום ידנית."
                    : "חלק יחסי מההוצאות הקבועות של העסק. אפשר להשאיר 0."
              }
            >
              {(props) => (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <UnitInput unit="₪" placeholder="0" value={values.overhead} onChange={set("overhead")} {...props} />
                  </div>
                  {suggestedOverhead != null && (
                    <Button variant="outline" onClick={() => setValues((prev) => ({ ...prev, overhead: minorToDecimalString(suggestedOverhead) }))}>
                      <Wand2 className="size-4" />
                      מילוי לפי ההגדרות
                    </Button>
                  )}
                </div>
              )}
            </Field>
          </div>

          <div className="border-t border-line card-pad grid gap-4 sm:grid-cols-2">
            {mode === "target" ? (
              <div className="sm:col-span-2">
                <Field label="יעד שיעור רווח" error={errors.margin} hint="שיעור רווח = רווח ÷ מחיר לפני מע״מ. זה אינו Markup (תוספת על העלות).">
                  {(props) => (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-28">
                        <UnitInput unit="%" value={values.margin} onChange={set("margin")} {...props} />
                      </div>
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label="יעדי רווח מוכנים">
                        {PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            aria-pressed={values.margin === String(preset)}
                            onClick={() => setValues((prev) => ({ ...prev, margin: String(preset) }))}
                            className={cn(
                              "num h-9 cursor-pointer rounded-lg border px-2.5 text-[13px] font-medium transition",
                              values.margin === String(preset) ? "border-navy-900 bg-navy-900 text-gold-200" : "border-line-strong bg-surface text-ink-2 hover:border-gold-500",
                            )}
                          >
                            {preset}%
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Field>
              </div>
            ) : (
              <Field
                label={`המחיר שאני מתכוון לגבות ${vatMode === "included" ? "(כולל מע״מ)" : vatMode === "added" ? "(לפני מע״מ)" : ""}`}
                error={values.price.trim() === "" ? undefined : errors.price} className="sm:col-span-2"
              >
                {(props) => <UnitInput unit="₪" placeholder="1500" value={values.price} onChange={set("price")} {...props} />}
              </Field>
            )}
            <Field label="מע״מ">
              {(props) => (
                <Select value={vatMode} onChange={(e) => setVatMode(e.target.value as VatMode)} {...props}>
                  <option value="added">{t.vatModeShort.added} (המע״מ מתווסף)</option>
                  <option value="included">{t.vatModeShort.included}</option>
                  <option value="none">{t.vatModeShort.none}</option>
                </Select>
              )}
            </Field>
            <Field label="שיעור מע״מ" error={errors.vatRate}>
              {(props) => <UnitInput unit="%" disabled={vatMode === "none"} value={values.vatRate} onChange={set("vatRate")} {...props} />}
            </Field>
          </div>
        </Card>

        <div className="flex flex-col gap-5 lg:sticky lg:top-6 lg:self-start">
          <div className="tile-3d overflow-hidden rounded-(--radius-card) bg-linear-to-br from-navy-700 via-navy-900 to-navy-950 p-6 text-white ring-1 ring-gold-500/30">
            <div className="text-[13px] font-medium text-gold-300">
              {mode === "target" ? "המחיר הנדרש לפני מע״מ" : "הרווח הצפוי"}
            </div>
            <div className={cn("num mt-1 text-[40px] leading-tight font-bold tracking-tight", mode === "reverse" && result && result.profit < 0 && "text-[#ff9d95]")} aria-live="polite">
              {!result ? "—" : mode === "target" ? (result.priceBeforeVat == null ? "—" : formatMoney(result.priceBeforeVat, { exact: true })) : formatMoney(result.profit, { exact: true })}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
              <div>
                <div className="text-xs text-slate-400">{t.fin.customerPrice}{vatMode !== "none" ? " (כולל מע״מ)" : ""}</div>
                <div className="num mt-0.5 font-semibold">{result ? formatMoney(result.customerPrice, { exact: true }) : "—"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">{t.fin.margin}</div>
                <div className="num mt-0.5 font-semibold">{result ? formatPercent(result.marginBp) : "—"}</div>
              </div>
            </div>
          </div>

          <Card className="card-pad">
            <h2 className="card-title mb-1">פירוט החישוב</h2>
            {!calc.valid ? (
              <Notice tone="warning" className="mt-2">יש לתקן את השדות המסומנים כדי לראות תוצאה.</Notice>
            ) : result ? (
              <>
                <SummaryRow label="עלויות ישירות" value={formatMoney(result.directCost, { exact: true })} />
                <SummaryRow label={t.fin.overhead} value={formatMoney(input.overhead, { exact: true })} />
                <SummaryRow strong label="סך העלות המוערכת" value={formatMoney(result.totalCost, { exact: true })} />
                <SummaryRow label={mode === "target" ? "רווח יעד" : "רווח צפוי"} value={formatMoney(result.profit, { exact: true })} tone={result.profit > 0 ? "positive" : result.profit < 0 ? "negative" : undefined} />
                <SummaryRow label="מחיר לפני מע״מ" value={result.priceBeforeVat == null ? "—" : formatMoney(result.priceBeforeVat, { exact: true })} />
                {vatMode !== "none" && <SummaryRow label={`${t.fin.vat} (${formatPercent(input.vatRateBp)})`} value={formatMoney(result.vat, { exact: true })} hint="נגבה מהלקוח ומועבר — אינו הכנסה" />}
                <SummaryRow strong label={t.fin.customerPrice} value={formatMoney(result.customerPrice, { exact: true })} />
                <SummaryRow label={t.fin.margin} value={formatPercent(result.marginBp)} hint="רווח ÷ מחיר לפני מע״מ" />
                <SummaryRow label={t.fin.markup} value={formatPercent(result.markupBp)} hint="רווח ÷ עלות" />
                {mode === "reverse" && belowTarget && hasCosts && (
                  <Notice tone={result.profit < 0 ? "negative" : "warning"} className="mt-3">
                    {result.profit < 0 ? "במחיר הזה העבודה הפסדית." : `שיעור הרווח נמוך מהיעד שהגדרתם (${formatPercent(settings.target_margin_bp)}).`}
                  </Notice>
                )}
              </>
            ) : null}
          </Card>

          <Card className="card-pad">
            <h2 className="card-title">שמירה כטיוטת עבודה</h2>
            <p className="card-sub mb-3">המחיר יישמר כהצעת מחיר, והעלויות כהערכה. התקורה מחושבת לעבודות לפי ההגדרות ואינה נשמרת כשורת עלות.</p>
            <div className="flex flex-wrap gap-2">
              <Input aria-label="שם העבודה" placeholder="שם העבודה (רשות)" className="min-w-40 flex-1" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
              <Button loading={busy} disabled={!result || result.priceBeforeVat == null || !hasCosts} onClick={saveDraft}>
                <Save className="size-4" />
                שמירה כטיוטה
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Card className="card-pad mt-5">
        <h2 className="card-title flex items-center gap-2">
          <Info className="size-4 text-gold-600" />
          שיעור רווח מול Markup — לא אותו דבר
        </h2>
        <div className="mt-3 grid gap-4 text-sm leading-relaxed text-ink-2 md:grid-cols-3">
          <p>
            <b className="text-ink">שיעור רווח (Margin)</b> הוא הרווח חלקי <b>המחיר</b>. עבודה שעולה ₪900 ונמכרת ב־₪1,500 משאירה ₪600 — שיעור רווח של <span className="num">40%</span>.
          </p>
          <p>
            <b className="text-ink">Markup</b> הוא הרווח חלקי <b>העלות</b>. אותה עבודה בדיוק: ₪600 ÷ ₪900 = <span className="num">66.67%</span> Markup.
          </p>
          <p>
            לכן הוספת 30% על העלות <b>אינה</b> נותנת 30% רווח. כדי להגיע לשיעור רווח של {formatPercent(calc.marginBp ?? settings.target_margin_bp)} נדרש Markup של{" "}
            <b className="num text-ink">{formatPercent(marginToMarkupBp(calc.marginBp != null && calc.marginBp < 10000 && calc.marginBp >= 0 ? calc.marginBp : settings.target_margin_bp))}</b>. הנוסחה: מחיר = עלות ÷ (1 − שיעור הרווח).
          </p>
        </div>
      </Card>
    </>
  );
}
