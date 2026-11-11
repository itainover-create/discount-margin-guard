/**
 * Integer money primitives. All amounts are integer agorot (1 ILS = 100 agorot);
 * rates are basis points (1% = 100bp); quantities/hours are converted to thousandths.
 * No floating point value is ever used as a final monetary result.
 */
export type Minor = number;

export const BP = 10_000;

/** Integer division with round-half-away-from-zero. Inputs must be safe integers. */
export function divRound(numerator: number, denominator: number): number {
  if (denominator === 0) throw new RangeError("divRound: division by zero");
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new RangeError("divRound: operands must be safe integers");
  }
  const sign = (numerator < 0 ? -1 : 1) * (denominator < 0 ? -1 : 1);
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  const q = Math.floor(n / d);
  const r = n - q * d;
  const rounded = r * 2 >= d ? q + 1 : q;
  return rounded === 0 ? 0 : sign * rounded;
}

/** a * b / c with rounding, guarding against overflow of the intermediate product. */
export function mulDiv(a: number, b: number, c: number): number {
  const product = a * b;
  if (Number.isSafeInteger(product)) return divRound(product, c);
  const big = (BigInt(a) * BigInt(b) * BigInt(2) + (BigInt(a) * BigInt(b) < 0 ? -BigInt(c) : BigInt(c))) / (BigInt(2) * BigInt(c));
  return Number(big);
}

/**
 * Parses a user-typed decimal ("1,285.71", "12.5") into an integer scaled by 10^decimals.
 * String based, so 1.005 never becomes 1.00499999. Returns null when the text is not a number.
 */
export function parseScaled(input: string | number | null | undefined, decimals: number): number | null {
  if (input === null || input === undefined) return null;
  let text = typeof input === "number" ? (Number.isFinite(input) ? input.toFixed(decimals + 2) : "") : String(input);
  text = text.replace(/[\s,₪]/g, "").replace(/‏|‎/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  const negative = text.startsWith("-");
  text = text.replace(/^[-+]/, "");
  const [whole, fraction = ""] = text.split(".");
  const padded = (fraction + "0".repeat(decimals + 1)).slice(0, decimals + 1);
  let value = Number(whole || "0") * 10 ** decimals + Number(padded.slice(0, decimals) || "0");
  if (Number(padded[decimals]) >= 5) value += 1;
  if (!Number.isSafeInteger(value)) return null;
  return negative && value !== 0 ? -value : value;
}

/** "1285.71" -> 128571 agorot */
export const toMinor = (input: string | number | null | undefined): number | null => parseScaled(input, 2);
/** "2.5" -> 2500 thousandths */
export const toMilli = (input: string | number | null | undefined): number | null => parseScaled(input, 3);
/** "18" (percent) -> 1800 basis points */
export const percentToBp = (input: string | number | null | undefined): number | null => parseScaled(input, 2);

/** Exact decimal string for forms and CSV: 128571 -> "1285.71" */
export function minorToDecimalString(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** 3000 -> "30", 1285 -> "12.85", -3050 -> "-30.5" */
export function bpToPercentString(bp: number): string {
  const sign = bp < 0 ? "-" : "";
  const abs = Math.abs(bp);
  let text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  text = text.replace(/0+$/, "").replace(/\.$/, "");
  return sign + text;
}

export const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
