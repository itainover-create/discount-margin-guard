import { formatMoney, formatNumber, formatPercent } from "./format";
import type { Warning } from "./reports";

export function warningText(w: Warning): string {
  switch (w.type) {
    case "loss":
      return `עבודה הפסדית: הפסד של ${formatMoney(Math.abs(w.value ?? 0))} לפני תקורה`;
    case "below_target":
      return `שיעור רווח ${formatPercent(w.value)} — מתחת ליעד (${formatPercent(w.reference)})`;
    case "materials_over":
      return `עלות החומרים חרגה מההערכה ב־${formatMoney(w.value)} (הערכה: ${formatMoney(w.reference)})`;
    case "labor_over":
      return `שעות העבודה חרגו מההערכה: ${formatNumber(w.value ?? 0)} בפועל מול ${formatNumber(w.reference ?? 0)} בהערכה`;
    case "missing_costs":
      return "לא נרשמו עלויות בפועל — הרווח המוצג אינו משקף את העבודה";
    case "no_price":
      return "לא הוזן מחיר לעבודה";
  }
}
