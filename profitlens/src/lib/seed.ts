/**
 * Default service categories per business type, and the FICTIONAL sample data set.
 * Every sample record is flagged is_sample = true so it can be shown as such and removed in one click.
 */
import { addDays, today } from "./dates";
import { enteredFromNet, laborCost, materialCost, transportCost } from "./finance/engine";
import type { NewRow } from "./backend/types";
import type { BusinessSettings, JobStatus } from "./types";

export const BUSINESS_TYPES: { value: string; label: string; categories: string[] }[] = [
  { value: "hvac", label: "מיזוג אוויר", categories: ["התקנת מזגן", "תיקון מזגן", "שירות תקופתי"] },
  { value: "electrician", label: "חשמל", categories: ["תיקון חשמל", "התקנות חשמל", "בדיקות ותחזוקה"] },
  { value: "plumbing", label: "אינסטלציה", categories: ["תיקון נזילות", "פתיחת סתימות", "התקנות אינסטלציה"] },
  { value: "cleaning", label: "ניקיון", categories: ["ניקיון דירות", "ניקיון משרדים", "ניקיון לאחר שיפוץ"] },
  { value: "renovation", label: "צבע ושיפוצים", categories: ["צביעה", "שיפוץ כללי", "תיקוני גבס"] },
  { value: "maintenance", label: "אחזקה", categories: ["אחזקה שוטפת", "קריאות שירות"] },
  { value: "installation", label: "התקנות", categories: ["התקנת ציוד", "הרכבות"] },
  { value: "technical", label: "שירות טכני עצמאי", categories: ["קריאת שירות", "התקנה", "תחזוקה"] },
  { value: "other", label: "אחר", categories: ["שירות כללי"] },
];

export const businessTypeLabel = (value: string) => BUSINESS_TYPES.find((b) => b.value === value)?.label ?? value;

const ILS = (shekels: number) => Math.round(shekels * 100);

interface CostSpec {
  materials?: [name: string, qty: number, unit: string, unitCost: number][];
  labor?: [employee: number, hours: number][];
  km?: number;
  parking?: number;
  contractor?: [string, number];
  other?: [string, number];
}
interface JobSpec {
  title: string;
  category: string;
  customer: number;
  status: JobStatus;
  /** Days before today the job was completed (or planned, when negative) */
  day: number;
  quote: number | null;
  final?: number;
  est: CostSpec;
  act?: CostSpec;
  description: string;
  notes?: string;
}

const SAMPLE_CUSTOMERS = [
  { name: "משפחת לוי (דוגמה)", business_name: null, phone: "050-0000001", email: null },
  { name: "דנה כהן (דוגמה)", business_name: "סטודיו כהן אדריכלות", phone: "050-0000002", email: "dana@example.com" },
  { name: "יוסי מזרחי (דוגמה)", business_name: "מסעדת הגפן", phone: "050-0000003", email: "yossi@example.com" },
  { name: "ועד בית הרצל 12 (דוגמה)", business_name: null, phone: "050-0000004", email: null },
  { name: "מיכל אברהם (דוגמה)", business_name: null, phone: "050-0000005", email: "michal@example.com" },
];

const SAMPLE_EMPLOYEES = [
  { name: "בעל/ת העסק (דוגמה)", role: "owner" as const, rate: 110 },
  { name: "אורי — טכנאי (דוגמה)", role: "member" as const, rate: 75 },
  { name: "נועה — עוזרת (דוגמה)", role: "member" as const, rate: 55 },
];

const SAMPLE_CATEGORIES = ["התקנת מזגן", "תיקון חשמל", "ניקיון דירות", "תיקון אינסטלציה", "התקנת ציוד"];

const SAMPLE_JOBS: JobSpec[] = [
  {
    title: "התקנת מזגן עילי 1.5 כ״ס", category: "התקנת מזגן", customer: 0, status: "completed", day: 4, quote: 2400, final: 2400,
    description: "התקנה סטנדרטית כולל צנרת עד 4 מטר.",
    est: { materials: [["צנרת נחושת ובידוד", 4, "מ׳", 65], ["מתלה ואביזרי התקנה", 1, "ערכה", 180]], labor: [[0, 3], [1, 3]], km: 30 },
    act: { materials: [["צנרת נחושת ובידוד", 4, "מ׳", 65], ["מתלה ואביזרי התקנה", 1, "ערכה", 170]], labor: [[0, 3], [1, 2.5]], km: 32 },
  },
  {
    title: "תיקון קצר בלוח חשמל", category: "תיקון חשמל", customer: 1, status: "completed", day: 9, quote: 850, final: 850,
    description: "איתור תקלה והחלפת מאמ״ת.",
    est: { materials: [["מאמ״ת 16A", 2, "יח׳", 45]], labor: [[0, 1.5]], km: 20 },
    act: { materials: [["מאמ״ת 16A", 2, "יח׳", 45]], labor: [[0, 1.5]], km: 22, parking: 15 },
  },
  {
    title: "ניקיון דירה לפני כניסה", category: "ניקיון דירות", customer: 4, status: "completed", day: 13, quote: 1200, final: 1200,
    description: "דירת 4 חדרים לאחר שיפוץ קל.",
    notes: "העבודה נמשכה כמעט כפול מהמתוכנן בגלל אבק שיפוצים.",
    est: { materials: [["חומרי ניקוי", 1, "ערכה", 120]], labor: [[2, 6], [1, 4]], km: 15 },
    act: { materials: [["חומרי ניקוי", 1, "ערכה", 165]], labor: [[2, 9], [1, 6]], km: 15 },
  },
  {
    title: "תיקון נזילה בצנרת מטבח", category: "תיקון אינסטלציה", customer: 3, status: "completed", day: 18, quote: 700, final: 700,
    description: "נזילה מתחת לכיור.",
    notes: "התגלה צינור סדוק בקיר — נדרש קבלן משנה לפתיחת הקיר.",
    est: { materials: [["צינור גמיש ומחברים", 1, "ערכה", 90]], labor: [[0, 1.5]], km: 18 },
    act: { materials: [["צינור גמיש ומחברים", 1, "ערכה", 90], ["צינור PEX", 3, "מ׳", 28]], labor: [[0, 3.5]], km: 36, contractor: ["פתיחת קיר ותיקון ריצוף", 380] },
  },
  {
    title: "התקנת ציוד מטבח תעשייתי", category: "התקנת ציוד", customer: 2, status: "completed", day: 25, quote: 5200, final: 5200,
    description: "התקנת מנדף, כיריים תעשייתיות וחיבורי גז.",
    est: { materials: [["אביזרי חיבור ונירוסטה", 1, "ערכה", 850]], labor: [[0, 8], [1, 8]], km: 45, contractor: ["טכנאי גז מוסמך", 600] },
    act: { materials: [["אביזרי חיבור ונירוסטה", 1, "ערכה", 1120]], labor: [[0, 10], [1, 11]], km: 90, parking: 40, contractor: ["טכנאי גז מוסמך", 750] },
  },
  {
    title: "שירות תקופתי ל־4 מזגנים", category: "התקנת מזגן", customer: 1, status: "completed", day: 38, quote: 1100, final: 1100,
    description: "ניקוי פילטרים, בדיקת גז ולחצים.",
    est: { materials: [["חומרי ניקוי וגז", 1, "ערכה", 110]], labor: [[1, 4]], km: 20 },
    act: { materials: [["חומרי ניקוי וגז", 1, "ערכה", 105]], labor: [[1, 4]], km: 20 },
  },
  {
    title: "החלפת גופי תאורה במשרד", category: "תיקון חשמל", customer: 1, status: "completed", day: 52, quote: 1900, final: 2050,
    description: "החלפת 12 גופי תאורה ל־LED.",
    notes: "הלקוח הוסיף 2 גופים במהלך העבודה — המחיר הסופי עודכן.",
    est: { materials: [["אביזרי חיבור", 12, "יח׳", 12]], labor: [[0, 5], [2, 5]], km: 20 },
    act: { materials: [["אביזרי חיבור", 14, "יח׳", 12]], labor: [[0, 5.5], [2, 5.5]], km: 20 },
  },
  {
    title: "ניקיון לאחר שיפוץ — דירת 5 חדרים", category: "ניקיון דירות", customer: 0, status: "completed", day: 67, quote: 2300, final: 2300,
    description: "ניקיון יסודי כולל חלונות.",
    est: { materials: [["חומרי ניקוי", 1, "ערכה", 200]], labor: [[2, 12], [1, 6]], km: 25 },
    act: { materials: [["חומרי ניקוי", 1, "ערכה", 215]], labor: [[2, 12.5], [1, 6]], km: 25 },
  },
  {
    title: "התקנת דוד חשמלי 80 ליטר", category: "תיקון אינסטלציה", customer: 4, status: "completed", day: 81, quote: 980, final: 980,
    description: "פירוק דוד ישן והתקנת חדש (הדוד סופק ע״י הלקוח).",
    est: { materials: [["צנרת ואביזרים", 1, "ערכה", 140]], labor: [[0, 2.5]], km: 25 },
    act: { materials: [["צנרת ואביזרים", 1, "ערכה", 150]], labor: [[0, 3]], km: 25 },
  },
  {
    title: "התקנת 3 מזגנים במשרד", category: "התקנת מזגן", customer: 1, status: "in_progress", day: -2, quote: 6900,
    description: "שלוש יחידות עיליות, כולל תעלות.",
    est: { materials: [["צנרת נחושת ובידוד", 14, "מ׳", 65], ["תעלות ואביזרים", 3, "ערכה", 160]], labor: [[0, 9], [1, 9]], km: 40 },
    act: { materials: [["צנרת נחושת ובידוד", 19, "מ׳", 68], ["תעלות ואביזרים", 3, "ערכה", 175]], labor: [[0, 5], [1, 5]], km: 20 },
  },
  {
    title: "התקנת מדיח ותנור בנוי", category: "התקנת ציוד", customer: 0, status: "approved", day: -6, quote: 650,
    description: "כולל התאמת נקודת מים.",
    est: { materials: [["צינורות ומחברים", 1, "ערכה", 70]], labor: [[1, 2.5]], km: 20 },
  },
  {
    title: "ניקיון משרדים חודשי", category: "ניקיון דירות", customer: 2, status: "quoted", day: -10, quote: 1500,
    description: "4 ביקורים בחודש. הצעת המחיר נמוכה מיעד הרווח.",
    est: { materials: [["חומרי ניקוי", 4, "ביקור", 45]], labor: [[2, 16]], km: 80 },
  },
  {
    title: "בדיקת מערכת חשמל לבניין", category: "תיקון חשמל", customer: 3, status: "draft", day: -14, quote: null,
    description: "טרם תומחר — ממתין לסיור בשטח.",
    est: { labor: [[0, 4]], km: 18 },
  },
  {
    title: "תיקון מזגן — אינו מקרר", category: "התקנת מזגן", customer: 4, status: "cancelled", day: 30, quote: 450,
    description: "הלקוח ביטל לפני הביקור.",
    est: { labor: [[1, 1.5]], km: 25 },
  },
];

type EntryDraft = Omit<NewRow<"job_cost_entries">, "job_id" | "employee_id"> & { employeeIndex: number | null };

export interface SampleData {
  customers: NewRow<"customers">[];
  employees: NewRow<"employees">[];
  categories: string[];
  jobs: { job: Omit<NewRow<"jobs">, "customer_id" | "service_category_id">; customer: number; category: string; entries: EntryDraft[] }[];
}

const RATE_PER_KM = 140; // agorot — illustrative vehicle cost

function entriesFor(spec: CostSpec | undefined, kind: "estimated" | "actual", date: string): EntryDraft[] {
  if (!spec) return [];
  const blank = {
    kind, entry_date: date, quantity: null, unit: null, unit_cost: null, hours: null, hourly_cost: null,
    distance_km: null, rate_per_km: null, parking: null, other_travel: null, employeeIndex: null,
  };
  const entries: EntryDraft[] = [];
  for (const [name, qty, unit, unitCost] of spec.materials ?? []) {
    entries.push({ ...blank, category: "materials", description: name, quantity: qty, unit, unit_cost: ILS(unitCost), amount: materialCost(qty, ILS(unitCost)) });
  }
  for (const [employee, hours] of spec.labor ?? []) {
    const rate = ILS(SAMPLE_EMPLOYEES[employee].rate);
    entries.push({ ...blank, category: "labor", description: "שעות עבודה", hours, hourly_cost: rate, amount: laborCost(hours, rate), employeeIndex: employee });
  }
  if (spec.km != null || spec.parking != null) {
    const parking = spec.parking != null ? ILS(spec.parking) : null;
    entries.push({
      ...blank, category: "transport", description: "נסיעות לאתר", distance_km: spec.km ?? null, rate_per_km: RATE_PER_KM, parking,
      amount: transportCost(spec.km ?? 0, RATE_PER_KM, parking ?? 0),
    });
  }
  if (spec.contractor) entries.push({ ...blank, category: "contractor", description: spec.contractor[0], amount: ILS(spec.contractor[1]) });
  if (spec.other) entries.push({ ...blank, category: "other", description: spec.other[0], amount: ILS(spec.other[1]) });
  return entries;
}

/** Builds the fictional data set, dated relative to today so dashboards have something to show. */
export function buildSampleData(settings: BusinessSettings, now: string = today()): SampleData {
  const price = (net: number | null | undefined) =>
    net == null ? null : enteredFromNet(ILS(net), settings.vat_mode, settings.vat_rate_bp);
  return {
    customers: SAMPLE_CUSTOMERS.map((c) => ({ ...c, notes: "לקוח לדוגמה — נתונים בדיוניים.", is_sample: true })),
    employees: SAMPLE_EMPLOYEES.map((e) => ({ name: e.name, role: e.role, hourly_cost: ILS(e.rate), active: true, is_sample: true })),
    categories: SAMPLE_CATEGORIES,
    jobs: SAMPLE_JOBS.map((spec) => {
      const date = addDays(now, -spec.day);
      const completed = spec.status === "completed";
      return {
        customer: spec.customer,
        category: spec.category,
        job: {
          title: spec.title, description: spec.description, status: spec.status,
          planned_date: completed ? addDays(date, -1) : date,
          completed_date: completed ? date : null,
          quoted_price: price(spec.quote),
          final_price: price(spec.final),
          vat_mode: settings.vat_mode, vat_rate_bp: settings.vat_rate_bp, payment_fee_bp: 0,
          notes: spec.notes ?? null, archived: false, is_sample: true,
        },
        entries: [
          ...entriesFor(spec.est, "estimated", addDays(date, -3)),
          ...entriesFor(spec.act, "actual", completed ? date : addDays(now, -1)),
        ],
      };
    }),
  };
}
