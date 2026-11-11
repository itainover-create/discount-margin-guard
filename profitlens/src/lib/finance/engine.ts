/**
 * ProfitLens financial engine — pure, framework-free, fully unit tested.
 *
 * Definitions used across the product:
 *  - Revenue            = price BEFORE VAT. VAT is never revenue.
 *  - Direct costs       = materials + labor + transport + contractors + other + payment fees.
 *  - Direct profit      = revenue − direct costs ("profit before allocated overhead").
 *  - Margin             = profit ÷ revenue.   Markup = profit ÷ cost.  They are different numbers.
 *  - Contribution       = direct profit − allocated overhead (a management estimate, not certified net profit).
 */
import type {
  BusinessSettings,
  CostCategory,
  CostKind,
  Job,
  JobCostEntry,
  OverheadMethod,
  VatMode,
} from "../types";
import { COST_CATEGORIES } from "../types";
import { BP, divRound, mulDiv, sum } from "./money";

/* ------------------------------------------------------------------ VAT */

export interface PriceBreakdown {
  /** Revenue before VAT */
  net: number;
  vat: number;
  /** What the customer actually pays */
  customerPrice: number;
}

/** Customer price includes VAT → revenue before VAT = price / (1 + rate). */
export function netFromGross(gross: number, vatRateBp: number): number {
  return mulDiv(gross, BP, BP + vatRateBp);
}

/** Price excludes VAT → VAT = net × rate. */
export function vatOnNet(net: number, vatRateBp: number): number {
  return mulDiv(net, vatRateBp, BP);
}

/** Interprets a user-entered price according to the VAT presentation mode. */
export function resolvePrice(entered: number, mode: VatMode, vatRateBp: number): PriceBreakdown {
  if (mode === "none" || vatRateBp <= 0) return { net: entered, vat: 0, customerPrice: entered };
  if (mode === "included") {
    const net = netFromGross(entered, vatRateBp);
    return { net, vat: entered - net, customerPrice: entered };
  }
  const vat = vatOnNet(entered, vatRateBp);
  return { net: entered, vat, customerPrice: entered + vat };
}

/** Converts a before-VAT amount into the number the user should type/see for a given mode. */
export function enteredFromNet(net: number, mode: VatMode, vatRateBp: number): number {
  if (mode === "included" && vatRateBp > 0) return net + vatOnNet(net, vatRateBp);
  return net;
}

/* ------------------------------------------------------- ratios */

/** Profit margin in basis points; null when revenue is zero or negative (undefined, never NaN/Infinity). */
export function marginBp(profit: number, revenue: number): number | null {
  if (revenue <= 0) return null;
  return mulDiv(profit, BP, revenue);
}

/** Markup in basis points over cost; null when there is no cost base. */
export function markupBp(profit: number, cost: number): number | null {
  if (cost <= 0) return null;
  return mulDiv(profit, BP, cost);
}

/** Price (before VAT) needed so that profit ÷ price = target margin. Null for margins ≥ 100% or < −... invalid. */
export function priceForMargin(cost: number, targetMarginBp: number): number | null {
  if (targetMarginBp >= BP || targetMarginBp < 0 || cost < 0) return null;
  return mulDiv(cost, BP, BP - targetMarginBp);
}

/** Price (before VAT) for a markup over cost. */
export function priceForMarkup(cost: number, markupRateBp: number): number | null {
  if (markupRateBp < 0 || cost < 0) return null;
  return cost + mulDiv(cost, markupRateBp, BP);
}

/** margin → equivalent markup (30% margin = 42.86% markup). */
export function marginToMarkupBp(margin: number): number | null {
  if (margin >= BP) return null;
  return mulDiv(margin, BP, BP - margin);
}

/* ------------------------------------------------------- cost lines */

const milli = (value: number | null | undefined) => Math.round((value ?? 0) * 1000);

/** Labor cost = hours × internal hourly cost. */
export function laborCost(hours: number, hourlyCost: number): number {
  return mulDiv(milli(hours), hourlyCost, 1000);
}

export function materialCost(quantity: number, unitCost: number): number {
  return mulDiv(milli(quantity), unitCost, 1000);
}

export function transportCost(distanceKm: number, ratePerKm: number, parking = 0, otherTravel = 0): number {
  return mulDiv(milli(distanceKm), ratePerKm, 1000) + parking + otherTravel;
}

type EntryInput = Pick<
  JobCostEntry,
  "category" | "quantity" | "unit_cost" | "hours" | "hourly_cost" | "distance_km" | "rate_per_km" | "parking" | "other_travel" | "amount"
>;

/** The single place an entry total is derived. Contractor/other entries carry a plain amount. */
export function entryAmount(entry: EntryInput): number {
  switch (entry.category) {
    case "materials":
      return entry.quantity != null && entry.unit_cost != null ? materialCost(entry.quantity, entry.unit_cost) : entry.amount;
    case "labor":
      return entry.hours != null && entry.hourly_cost != null ? laborCost(entry.hours, entry.hourly_cost) : entry.amount;
    case "transport":
      return entry.distance_km != null || entry.parking != null || entry.other_travel != null
        ? transportCost(entry.distance_km ?? 0, entry.rate_per_km ?? 0, entry.parking ?? 0, entry.other_travel ?? 0)
        : entry.amount;
    default:
      return entry.amount;
  }
}

export type CategoryTotals = Record<CostCategory, number>;

export const emptyTotals = (): CategoryTotals => ({ materials: 0, labor: 0, transport: 0, contractor: 0, other: 0 });

/** Sums entries of ONE kind. Estimates are never mixed into actuals. */
export function totalsByCategory(entries: JobCostEntry[], kind: CostKind): CategoryTotals {
  const totals = emptyTotals();
  for (const entry of entries) if (entry.kind === kind) totals[entry.category] += entry.amount;
  return totals;
}

export function laborHours(entries: JobCostEntry[], kind: CostKind): number {
  const thousandths = sum(entries.filter((e) => e.kind === kind && e.category === "labor").map((e) => milli(e.hours)));
  return thousandths / 1000;
}

/* ------------------------------------------------------- overhead */

export interface OverheadConfig {
  method: OverheadMethod;
  monthlyOverhead: number;
  billableHours: number;
  fixedPerJob: number;
  revenuePctBp: number;
}

export const overheadConfig = (s: BusinessSettings): OverheadConfig => ({
  method: s.overhead_method,
  monthlyOverhead: s.monthly_overhead,
  billableHours: s.billable_hours,
  fixedPerJob: s.fixed_overhead_per_job,
  revenuePctBp: s.overhead_revenue_pct_bp,
});

/** Overhead per billable hour = monthly overhead ÷ monthly billable hours (0 when hours are not configured). */
export function overheadPerHour(monthlyOverhead: number, billableHours: number): number {
  const hoursMilli = milli(billableHours);
  if (hoursMilli <= 0) return 0;
  return mulDiv(monthlyOverhead, 1000, hoursMilli);
}

export function allocateOverhead(config: OverheadConfig, jobHours: number, revenue: number): number {
  switch (config.method) {
    case "fixed":
      return Math.max(0, config.fixedPerJob);
    case "hours": {
      const billable = milli(config.billableHours);
      if (billable <= 0) return 0;
      // monthly overhead × job hours ÷ billable hours — one rounding step only
      return mulDiv(config.monthlyOverhead, milli(jobHours), billable);
    }
    case "revenue_pct":
      return revenue > 0 ? mulDiv(revenue, config.revenuePctBp, BP) : 0;
    default:
      return 0;
  }
}

/* ------------------------------------------------------- profitability */

export interface ProfitInput {
  /** Price as entered; null when no price exists yet */
  enteredPrice: number | null;
  vatMode: VatMode;
  vatRateBp: number;
  costs: CategoryTotals;
  /** Card/payment processing fee as bp of the customer-facing price */
  paymentFeeBp?: number;
  hours?: number;
  overhead?: OverheadConfig;
}

export interface Profitability {
  hasPrice: boolean;
  revenue: number;
  vat: number;
  customerPrice: number;
  costs: CategoryTotals;
  paymentFees: number;
  directCosts: number;
  /** Profit before allocated overhead */
  profit: number;
  marginBp: number | null;
  markupBp: number | null;
  hours: number;
  overhead: number;
  /** Operating contribution after allocated overhead — management estimate */
  contribution: number;
  contributionMarginBp: number | null;
}

export function computeProfitability(input: ProfitInput): Profitability {
  const price = resolvePrice(input.enteredPrice ?? 0, input.vatMode, input.vatRateBp);
  const paymentFees = input.paymentFeeBp ? mulDiv(price.customerPrice, input.paymentFeeBp, BP) : 0;
  const directCosts = sum(COST_CATEGORIES.map((c) => input.costs[c])) + paymentFees;
  const profit = price.net - directCosts;
  const hours = input.hours ?? 0;
  const overhead = input.overhead ? allocateOverhead(input.overhead, hours, price.net) : 0;
  const contribution = profit - overhead;
  return {
    hasPrice: input.enteredPrice != null,
    revenue: price.net,
    vat: price.vat,
    customerPrice: price.customerPrice,
    costs: input.costs,
    paymentFees,
    directCosts,
    profit,
    marginBp: marginBp(profit, price.net),
    markupBp: markupBp(profit, directCosts),
    hours,
    overhead,
    contribution,
    contributionMarginBp: marginBp(contribution, price.net),
  };
}

/* ------------------------------------------------------- jobs */

export interface Variance {
  estimated: number;
  actual: number;
  /** actual − estimated */
  diff: number;
  /** diff ÷ |estimated| in bp; null when there was no estimate */
  diffBp: number | null;
}

export function variance(estimated: number, actual: number): Variance {
  const diff = actual - estimated;
  return { estimated, actual, diff, diffBp: estimated === 0 ? null : mulDiv(diff, BP, Math.abs(estimated)) };
}

export interface JobFinancials {
  estimated: Profitability;
  actual: Profitability;
  /** True when no final price was recorded and the quoted price stands in for actual revenue */
  actualRevenueIsQuoted: boolean;
  hasActualCosts: boolean;
  hasEstimatedCosts: boolean;
  variance: {
    revenue: Variance;
    categories: Record<CostCategory, Variance>;
    paymentFees: Variance;
    directCosts: Variance;
    profit: Variance;
  };
  /** Cost categories that pushed profit down, largest overrun first */
  overruns: { category: CostCategory; diff: number }[];
}

export function computeJobFinancials(job: Job, jobEntries: JobCostEntry[], settings: BusinessSettings): JobFinancials {
  const overhead = overheadConfig(settings);
  const base = { vatMode: job.vat_mode, vatRateBp: job.vat_rate_bp, paymentFeeBp: job.payment_fee_bp, overhead };
  const estimated = computeProfitability({
    ...base,
    enteredPrice: job.quoted_price,
    costs: totalsByCategory(jobEntries, "estimated"),
    hours: laborHours(jobEntries, "estimated"),
  });
  const actualPrice = job.final_price ?? job.quoted_price;
  const actual = computeProfitability({
    ...base,
    enteredPrice: actualPrice,
    costs: totalsByCategory(jobEntries, "actual"),
    hours: laborHours(jobEntries, "actual"),
  });
  const categories = Object.fromEntries(
    COST_CATEGORIES.map((c) => [c, variance(estimated.costs[c], actual.costs[c])]),
  ) as Record<CostCategory, Variance>;
  const overruns = COST_CATEGORIES.map((category) => ({ category, diff: categories[category].diff }))
    .filter((o) => o.diff > 0)
    .sort((a, b) => b.diff - a.diff);
  return {
    estimated,
    actual,
    actualRevenueIsQuoted: job.final_price == null && job.quoted_price != null,
    hasActualCosts: jobEntries.some((e) => e.kind === "actual"),
    hasEstimatedCosts: jobEntries.some((e) => e.kind === "estimated"),
    variance: {
      revenue: variance(estimated.revenue, actual.revenue),
      categories,
      paymentFees: variance(estimated.paymentFees, actual.paymentFees),
      directCosts: variance(estimated.directCosts, actual.directCosts),
      profit: variance(estimated.profit, actual.profit),
    },
    overruns,
  };
}

/* ------------------------------------------------------- pricing calculator */

export interface PricingInput {
  materials: number;
  laborHours: number;
  hourlyCost: number;
  transport: number;
  contractors: number;
  other: number;
  overhead: number;
  targetMarginBp: number;
  vatMode: VatMode;
  vatRateBp: number;
}

export interface PricingResult {
  labor: number;
  directCost: number;
  /** Direct cost + allocated overhead: the base the target margin is applied to */
  totalCost: number;
  /** Null when the target margin is impossible (≥ 100%) */
  priceBeforeVat: number | null;
  vat: number;
  customerPrice: number;
  /** Profit after all listed costs including the overhead share */
  profit: number;
  marginBp: number | null;
  markupBp: number | null;
}

function pricingCosts(input: Omit<PricingInput, "targetMarginBp">) {
  const labor = laborCost(input.laborHours, input.hourlyCost);
  const directCost = input.materials + labor + input.transport + input.contractors + input.other;
  return { labor, directCost, totalCost: directCost + input.overhead };
}

function pricingResult(input: Omit<PricingInput, "targetMarginBp">, priceBeforeVat: number | null): PricingResult {
  const { labor, directCost, totalCost } = pricingCosts(input);
  const net = priceBeforeVat ?? 0;
  const useVat = input.vatMode !== "none" && input.vatRateBp > 0;
  const vat = useVat ? vatOnNet(net, input.vatRateBp) : 0;
  const profit = net - totalCost;
  return {
    labor,
    directCost,
    totalCost,
    priceBeforeVat,
    vat,
    customerPrice: net + vat,
    profit,
    marginBp: priceBeforeVat == null ? null : marginBp(profit, net),
    markupBp: priceBeforeVat == null ? null : markupBp(profit, totalCost),
  };
}

/** Required price before VAT = total estimated cost ÷ (1 − target margin). */
export function calculatePrice(input: PricingInput): PricingResult {
  const { totalCost } = pricingCosts(input);
  return pricingResult(input, priceForMargin(totalCost, input.targetMarginBp));
}

/** Reverse: "if I charge X, what do I earn?" — X is interpreted per the VAT mode. */
export function evaluatePrice(input: Omit<PricingInput, "targetMarginBp">, enteredPrice: number): PricingResult {
  const { net } = resolvePrice(enteredPrice, input.vatMode, input.vatRateBp);
  return pricingResult(input, net);
}
