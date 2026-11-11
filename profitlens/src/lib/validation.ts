/**
 * Zod schemas for every form. Money/quantity fields stay strings in the form state and are
 * converted to integers with the money helpers only after validation succeeds.
 */
import { z } from "zod";
import { percentToBp, toMilli, toMinor } from "./finance/money";
import { COST_CATEGORIES, JOB_STATUSES } from "./types";

const REQUIRED = "שדה חובה";
const MAX_MONEY = 100_000_000_00; // ₪100M — sanity ceiling

const isMoney = (v: string) => {
  const minor = toMinor(v);
  return minor !== null && minor >= 0 && minor <= MAX_MONEY;
};
const isQuantity = (v: string) => {
  const milli = toMilli(v);
  return milli !== null && milli >= 0 && milli <= 1_000_000_000;
};

export const money = z.string().trim().min(1, REQUIRED).refine(isMoney, "יש להזין סכום תקין (0 ומעלה)");
export const optionalMoney = z.string().trim().refine((v) => v === "" || isMoney(v), "יש להזין סכום תקין (0 ומעלה)");
export const quantity = z.string().trim().min(1, REQUIRED).refine(isQuantity, "יש להזין מספר תקין (0 ומעלה)");
export const optionalQuantity = z.string().trim().refine((v) => v === "" || isQuantity(v), "יש להזין מספר תקין (0 ומעלה)");
export const percent = (max = 100, maxExclusive = false) =>
  z
    .string()
    .trim()
    .min(1, REQUIRED)
    .refine((v) => {
      const bp = percentToBp(v);
      return bp !== null && bp >= 0 && (maxExclusive ? bp < max * 100 : bp <= max * 100);
    }, maxExclusive ? `יש להזין אחוז בין 0 ל-${max} (לא כולל)` : `יש להזין אחוז בין 0 ל-${max}`);
const optionalDate = z.string().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "תאריך לא תקין");
const email = z.string().trim().toLowerCase().email("כתובת אימייל לא תקינה");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, REQUIRED),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "יש להזין שם מלא").max(80),
    email,
    password: z.string().min(8, "סיסמה באורך 8 תווים לפחות").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "הסיסמאות אינן תואמות" });

export const passwordSchema = z
  .object({
    current: z.string().min(1, REQUIRED),
    next: z.string().min(8, "סיסמה באורך 8 תווים לפחות").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "הסיסמאות אינן תואמות" });

export const vatModeSchema = z.enum(["added", "included", "none"]);
export const overheadMethodSchema = z.enum(["none", "fixed", "hours", "revenue_pct"]);

export const financialSettingsSchema = z.object({
  vat_rate: percent(100),
  vat_mode: vatModeSchema,
  default_hourly_cost: money,
  target_margin: percent(100, true),
  overhead_method: overheadMethodSchema,
  monthly_overhead: money,
  billable_hours: quantity,
  fixed_overhead_per_job: money,
  overhead_revenue_pct: percent(100),
  payment_fee: percent(20),
});

export const businessProfileSchema = z.object({
  name: z.string().trim().min(2, "יש להזין שם עסק").max(120),
  business_type: z.string().trim().min(1, REQUIRED).max(80),
  country: z.string().trim().min(2).max(2),
  currency: z.string().trim().length(3),
  language: z.string().trim().min(2).max(5),
});

export const onboardingSchema = businessProfileSchema.extend({
  vat_rate: percent(100),
  vat_mode: vatModeSchema,
  default_hourly_cost: optionalMoney,
  target_margin: percent(100, true),
  monthly_overhead: optionalMoney,
  billable_hours: optionalQuantity,
});

export const jobSchema = z
  .object({
    title: z.string().trim().min(2, "יש להזין שם עבודה").max(160),
    customer_id: z.string(),
    service_category_id: z.string(),
    description: z.string().max(2000),
    status: z.enum(JOB_STATUSES as [string, ...string[]]),
    planned_date: optionalDate,
    completed_date: optionalDate,
    quoted_price: optionalMoney,
    final_price: optionalMoney,
    vat_mode: vatModeSchema,
    vat_rate: percent(100),
    payment_fee: percent(20),
    notes: z.string().max(4000),
  })
  .refine((v) => v.status !== "completed" || v.completed_date !== "", {
    path: ["completed_date"],
    message: "לעבודה שהושלמה נדרש תאריך סיום",
  });

export const costEntrySchema = z
  .object({
    kind: z.enum(["estimated", "actual"]),
    category: z.enum(COST_CATEGORIES as [string, ...string[]]),
    description: z.string().trim().max(200),
    entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין"),
    quantity: optionalQuantity,
    unit: z.string().trim().max(20),
    unit_cost: optionalMoney,
    employee_id: z.string(),
    hours: optionalQuantity,
    hourly_cost: optionalMoney,
    distance_km: optionalQuantity,
    rate_per_km: optionalMoney,
    parking: optionalMoney,
    other_travel: optionalMoney,
    amount: optionalMoney,
  })
  .superRefine((v, ctx) => {
    const need = (field: keyof typeof v) => {
      if (v[field] === "") ctx.addIssue({ code: "custom", path: [field], message: REQUIRED });
    };
    if (v.category === "materials") {
      need("description");
      need("quantity");
      need("unit_cost");
    } else if (v.category === "labor") {
      need("hours");
      need("hourly_cost");
    } else if (v.category === "transport") {
      if (v.distance_km === "" && v.parking === "" && v.other_travel === "") {
        ctx.addIssue({ code: "custom", path: ["distance_km"], message: "יש להזין מרחק, חניה או הוצאת נסיעה אחרת" });
      }
      if (v.distance_km !== "" && v.rate_per_km === "") need("rate_per_km");
    } else {
      need("description");
      need("amount");
    }
  });

export const customerSchema = z.object({
  name: z.string().trim().min(2, "יש להזין שם לקוח").max(120),
  business_name: z.string().trim().max(120),
  phone: z.string().trim().max(30).refine((v) => v === "" || /^[\d+\-() ]{6,}$/.test(v), "מספר טלפון לא תקין"),
  email: z.string().trim().refine((v) => v === "" || z.string().email().safeParse(v).success, "כתובת אימייל לא תקינה"),
  notes: z.string().max(2000),
});

export const employeeSchema = z.object({
  name: z.string().trim().min(2, "יש להזין שם").max(120),
  role: z.enum(["owner", "admin", "member"]),
  hourly_cost: money,
  active: z.boolean(),
});

export const inviteSchema = z.object({
  email,
  role: z.enum(["admin", "member"]),
});

export type JobFormValues = z.infer<typeof jobSchema>;
export type CostEntryFormValues = z.infer<typeof costEntrySchema>;
export type CustomerFormValues = z.infer<typeof customerSchema>;
export type EmployeeFormValues = z.infer<typeof employeeSchema>;
export type OnboardingFormValues = z.infer<typeof onboardingSchema>;
export type FinancialSettingsValues = z.infer<typeof financialSettingsSchema>;
