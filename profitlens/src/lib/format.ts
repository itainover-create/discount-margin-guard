import { bpToPercentString } from "./finance/money";

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string, fractionDigits: number) {
  const key = `${currency}:${fractionDigits}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    currencyFormatters.set(key, formatter);
  }
  return formatter;
}

/** Formats integer minor units for display. Whole-shekel amounts drop the ".00" unless `exact`. */
export function formatMoney(minor: number | null | undefined, options: { currency?: string; exact?: boolean } = {}): string {
  if (minor == null) return "—";
  const digits = options.exact || minor % 100 !== 0 ? 2 : 0;
  // Division is for display only; Intl rounds to the 2 digits we already hold exactly.
  const text = currencyFormatter(options.currency ?? "ILS", digits).format(minor / 100);
  // Keep sign and symbol glued to the digits inside RTL paragraphs.
  return `⁦${text.replace(/[‎‏]/g, "")}⁩`;
}

export function formatSignedMoney(minor: number, currency?: string): string {
  const text = formatMoney(Math.abs(minor), { currency });
  return minor > 0 ? `+${text}` : minor < 0 ? `−${text}` : text;
}

export function formatPercent(bp: number | null | undefined): string {
  if (bp == null) return "—";
  return `⁦${bpToPercentString(bp).replace("-", "−")}%⁩`;
}

export function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("he-IL", { maximumFractionDigits }).format(value);
}

export type DateFormat = "dd/MM/yyyy" | "dd.MM.yyyy" | "yyyy-MM-dd";

/** Formats a YYYY-MM-DD (or ISO timestamp) string. Default is the familiar Israeli dd/MM/yyyy. */
export function formatDate(value: string | null | undefined, format: DateFormat = "dd/MM/yyyy"): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  if (format === "yyyy-MM-dd") return `${y}-${m}-${d}`;
  const sep = format === "dd.MM.yyyy" ? "." : "/";
  return `${d}${sep}${m}${sep}${y}`;
}

const HEBREW_MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

export function formatMonthKey(key: string): string {
  const [y, m] = key.split("-");
  return `${HEBREW_MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}
