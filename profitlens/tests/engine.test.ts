import { describe, expect, it } from "vitest";
import {
  allocateOverhead, calculatePrice, computeJobFinancials, computeProfitability, emptyTotals, entryAmount, evaluatePrice,
  laborCost, marginBp, marginToMarkupBp, markupBp, materialCost, netFromGross, overheadPerHour, priceForMargin,
  priceForMarkup, resolvePrice, transportCost, variance,
} from "@/lib/finance/engine";
import { bpToPercentString, divRound, minorToDecimalString, percentToBp, toMilli, toMinor } from "@/lib/finance/money";
import type { BusinessSettings, Job, JobCostEntry } from "@/lib/types";

const ILS = (n: number) => Math.round(n * 100);
const costs = (direct: number) => ({ ...emptyTotals(), other: direct });

export const settings: BusinessSettings = {
  organization_id: "org", vat_rate_bp: 1800, vat_mode: "added", default_hourly_cost: ILS(80), target_margin_bp: 3000,
  overhead_method: "none", monthly_overhead: ILS(6000), billable_hours: 120, fixed_overhead_per_job: ILS(100),
  overhead_revenue_pct_bp: 1000, payment_fee_bp: 0, date_format: "dd/MM/yyyy", dashboard_range: "this_month",
  onboarded: true, updated_at: "",
};
const job = (over: Partial<Job> = {}): Job => ({
  id: "j1", organization_id: "org", created_at: "2026-01-01", updated_at: "2026-01-01", job_number: 1, title: "t",
  customer_id: null, service_category_id: null, description: null, status: "completed", planned_date: null,
  completed_date: "2026-01-05", quoted_price: ILS(1500), final_price: null, vat_mode: "added", vat_rate_bp: 1800,
  payment_fee_bp: 0, notes: null, archived: false, is_sample: false, ...over,
});
let n = 0;
const entry = (over: Partial<JobCostEntry>): JobCostEntry => ({
  id: `e${++n}`, organization_id: "org", created_at: "", job_id: "j1", kind: "actual", category: "other", description: "",
  quantity: null, unit: null, unit_cost: null, employee_id: null, hours: null, hourly_cost: null, distance_km: null,
  rate_per_km: null, parking: null, other_travel: null, amount: 0, entry_date: "2026-01-02", ...over,
});

describe("money primitives", () => {
  it("parses decimals without float drift", () => {
    expect(toMinor("1285.71")).toBe(128571);
    expect(toMinor("1,285.71")).toBe(128571);
    expect(toMinor("1.005")).toBe(101);
    expect(toMinor("0.1")).toBe(10);
    expect(toMinor(".5")).toBe(50);
    expect(toMinor("-12")).toBe(-1200);
    expect(toMinor("abc")).toBeNull();
    expect(toMinor("")).toBeNull();
    expect(toMinor("1e5")).toBeNull();
    expect(toMilli("2.5")).toBe(2500);
    expect(percentToBp("18")).toBe(1800);
    expect(percentToBp("17.5")).toBe(1750);
  });
  it("0.1 + 0.2 is exact in agorot", () => {
    expect(toMinor("0.1")! + toMinor("0.2")!).toBe(toMinor("0.3"));
  });
  it("rounds half away from zero", () => {
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(-5, 2)).toBe(-3);
    expect(divRound(4, 3)).toBe(1);
    expect(() => divRound(1, 0)).toThrow();
  });
  it("formats exact strings", () => {
    expect(minorToDecimalString(128571)).toBe("1285.71");
    expect(minorToDecimalString(-5)).toBe("-0.05");
    expect(bpToPercentString(3000)).toBe("30");
    expect(bpToPercentString(-3050)).toBe("-30.5");
    expect(bpToPercentString(4286)).toBe("42.86");
    expect(bpToPercentString(10000)).toBe("100");
  });
});

describe("required scenarios", () => {
  it("Test 1: revenue ₪1,500, direct costs ₪900 → profit ₪600, margin 40%", () => {
    const r = computeProfitability({ enteredPrice: ILS(1500), vatMode: "none", vatRateBp: 0, costs: costs(ILS(900)) });
    expect(r.profit).toBe(ILS(600));
    expect(r.marginBp).toBe(4000);
  });
  it("Test 2: ₪1,500 before VAT at 18% → customer price ₪1,770", () => {
    const r = resolvePrice(ILS(1500), "added", 1800);
    expect(r).toEqual({ net: ILS(1500), vat: ILS(270), customerPrice: ILS(1770) });
  });
  it("Test 3: VAT-inclusive ₪1,770 → revenue before VAT ₪1,500", () => {
    expect(netFromGross(ILS(1770), 1800)).toBe(ILS(1500));
    expect(resolvePrice(ILS(1770), "included", 1800)).toEqual({ net: ILS(1500), vat: ILS(270), customerPrice: ILS(1770) });
  });
  it("Test 4: costs ₪900 at 30% target margin → ≈ ₪1,285.71", () => {
    expect(priceForMargin(ILS(900), 3000)).toBe(128571);
  });
  it("Test 5: revenue ₪500, costs ₪650 → loss ₪150, margin −30%", () => {
    const r = computeProfitability({ enteredPrice: ILS(500), vatMode: "none", vatRateBp: 0, costs: costs(ILS(650)) });
    expect(r.profit).toBe(-ILS(150));
    expect(r.marginBp).toBe(-3000);
  });
  it("Test 6: zero revenue never divides by zero", () => {
    const r = computeProfitability({ enteredPrice: 0, vatMode: "added", vatRateBp: 1800, costs: costs(ILS(100)) });
    expect(r.marginBp).toBeNull();
    expect(r.contributionMarginBp).toBeNull();
    expect(r.profit).toBe(-ILS(100));
    const none = computeProfitability({ enteredPrice: null, vatMode: "added", vatRateBp: 1800, costs: emptyTotals() });
    expect(none.marginBp).toBeNull();
    expect(none.markupBp).toBeNull();
    expect(none.hasPrice).toBe(false);
    expect(marginBp(0, 0)).toBeNull();
    expect(markupBp(100, 0)).toBeNull();
    expect(variance(0, 500).diffBp).toBeNull();
    expect(overheadPerHour(ILS(6000), 0)).toBe(0);
    expect(allocateOverhead({ method: "hours", monthlyOverhead: ILS(6000), billableHours: 0, fixedPerJob: 0, revenuePctBp: 0 }, 5, 0)).toBe(0);
  });
  it("Test 7: updating actual costs updates profitability", () => {
    const entries = [entry({ category: "materials", quantity: 1, unit_cost: ILS(300), amount: ILS(300) })];
    const before = computeJobFinancials(job(), entries, settings);
    expect(before.actual.profit).toBe(ILS(1200));
    const after = computeJobFinancials(job(), [...entries, entry({ category: "contractor", amount: ILS(450) })], settings);
    expect(after.actual.directCosts).toBe(ILS(750));
    expect(after.actual.profit).toBe(ILS(750));
    expect(after.actual.marginBp).toBe(5000);
  });
});

describe("VAT", () => {
  it("VAT is never counted as revenue", () => {
    const r = computeProfitability({ enteredPrice: ILS(1770), vatMode: "included", vatRateBp: 1800, costs: costs(ILS(900)) });
    expect(r.revenue).toBe(ILS(1500));
    expect(r.vat).toBe(ILS(270));
    expect(r.profit).toBe(ILS(600));
  });
  it("net + vat always equals the customer price, for awkward amounts too", () => {
    for (const gross of [1, 99, 100, 101, 9999, 123457, 1000001]) {
      for (const rate of [1700, 1800, 1750]) {
        const r = resolvePrice(gross, "included", rate);
        expect(r.net + r.vat).toBe(gross);
        expect(Number.isInteger(r.net)).toBe(true);
      }
    }
  });
  it("mode none ignores VAT", () => {
    expect(resolvePrice(ILS(1000), "none", 1800)).toEqual({ net: ILS(1000), vat: 0, customerPrice: ILS(1000) });
  });
});

describe("cost lines", () => {
  it("labor = hours × internal hourly cost", () => {
    expect(laborCost(2.5, ILS(80))).toBe(ILS(200));
    expect(laborCost(1.333, ILS(90))).toBe(11997);
  });
  it("materials and transport", () => {
    expect(materialCost(3, ILS(49.9))).toBe(ILS(149.7));
    expect(transportCost(40, 140, ILS(20), ILS(5))).toBe(5600 + 2000 + 500);
  });
  it("entryAmount derives totals per category", () => {
    expect(entryAmount(entry({ category: "labor", hours: 4, hourly_cost: ILS(75), amount: 1 }))).toBe(ILS(300));
    expect(entryAmount(entry({ category: "materials", quantity: 2.5, unit_cost: ILS(12), amount: 1 }))).toBe(ILS(30));
    expect(entryAmount(entry({ category: "transport", distance_km: 10, rate_per_km: 150, parking: ILS(15), amount: 1 }))).toBe(ILS(30));
    expect(entryAmount(entry({ category: "contractor", amount: ILS(700) }))).toBe(ILS(700));
  });
});

describe("markup vs margin", () => {
  it("are different numbers for the same job", () => {
    expect(marginBp(ILS(600), ILS(1500))).toBe(4000);
    expect(markupBp(ILS(600), ILS(900))).toBe(6667);
    expect(marginToMarkupBp(3000)).toBe(4286);
  });
  it("priceForMarkup adds on cost; priceForMargin divides", () => {
    expect(priceForMarkup(ILS(900), 3000)).toBe(ILS(1170));
    expect(priceForMargin(ILS(900), 3000)).toBe(128571);
    expect(priceForMargin(ILS(900), 10000)).toBeNull();
    expect(priceForMargin(ILS(900), 0)).toBe(ILS(900));
  });
});

describe("overhead allocation", () => {
  const cfg = { monthlyOverhead: ILS(6000), billableHours: 120, fixedPerJob: ILS(100), revenuePctBp: 1000 };
  it("none / fixed / hours / revenue", () => {
    expect(allocateOverhead({ ...cfg, method: "none" }, 4, ILS(1500))).toBe(0);
    expect(allocateOverhead({ ...cfg, method: "fixed" }, 4, ILS(1500))).toBe(ILS(100));
    expect(overheadPerHour(ILS(6000), 120)).toBe(ILS(50));
    expect(allocateOverhead({ ...cfg, method: "hours" }, 4, ILS(1500))).toBe(ILS(200));
    expect(allocateOverhead({ ...cfg, method: "revenue_pct" }, 4, ILS(1500))).toBe(ILS(150));
  });
  it("contribution = revenue − direct costs − overhead", () => {
    const r = computeProfitability({
      enteredPrice: ILS(1500), vatMode: "added", vatRateBp: 1800, costs: costs(ILS(900)), hours: 4,
      overhead: { ...cfg, method: "hours" },
    });
    expect(r.profit).toBe(ILS(600));
    expect(r.overhead).toBe(ILS(200));
    expect(r.contribution).toBe(ILS(400));
  });
});

describe("payment fees", () => {
  it("are a direct cost charged on the customer-facing price", () => {
    const r = computeProfitability({ enteredPrice: ILS(1000), vatMode: "added", vatRateBp: 1800, costs: emptyTotals(), paymentFeeBp: 150 });
    expect(r.paymentFees).toBe(ILS(17.7));
    expect(r.directCosts).toBe(ILS(17.7));
  });
});

describe("estimated vs actual", () => {
  it("keeps estimates out of actuals and explains the gap", () => {
    const entries = [
      entry({ kind: "estimated", category: "materials", amount: ILS(300) }),
      entry({ kind: "estimated", category: "labor", hours: 6, hourly_cost: ILS(100), amount: ILS(600) }),
      entry({ kind: "actual", category: "materials", amount: ILS(360) }),
      entry({ kind: "actual", category: "labor", hours: 7.1, hourly_cost: ILS(100), amount: ILS(710) }),
    ];
    const f = computeJobFinancials(job({ quoted_price: ILS(1500), final_price: ILS(1500) }), entries, settings);
    expect(f.estimated.profit).toBe(ILS(600));
    expect(f.actual.profit).toBe(ILS(430));
    expect(f.variance.profit.diff).toBe(-ILS(170));
    expect(f.variance.categories.materials).toEqual({ estimated: ILS(300), actual: ILS(360), diff: ILS(60), diffBp: 2000 });
    expect(f.overruns.map((o) => o.category)).toEqual(["labor", "materials"]);
    expect(f.actualRevenueIsQuoted).toBe(false);
  });
  it("flags when the quoted price stands in for actual revenue", () => {
    expect(computeJobFinancials(job(), [], settings).actualRevenueIsQuoted).toBe(true);
  });
});

describe("pricing calculator", () => {
  const base = { materials: ILS(400), laborHours: 5, hourlyCost: ILS(80), transport: ILS(60), contractors: 0, other: ILS(40), overhead: 0, vatMode: "added" as const, vatRateBp: 1800 };
  it("forward: cost ₪900 at 30% → ₪1,285.71 + VAT", () => {
    const r = calculatePrice({ ...base, targetMarginBp: 3000 });
    expect(r.totalCost).toBe(ILS(900));
    expect(r.priceBeforeVat).toBe(128571);
    expect(r.vat).toBe(23143);
    expect(r.customerPrice).toBe(128571 + 23143);
    expect(r.profit).toBe(38571);
    expect(r.marginBp).toBe(3000);
  });
  it("includes allocated overhead in the cost base", () => {
    const r = calculatePrice({ ...base, overhead: ILS(100), targetMarginBp: 2000 });
    expect(r.totalCost).toBe(ILS(1000));
    expect(r.priceBeforeVat).toBe(ILS(1250));
  });
  it("reverse: charging ₪1,500 earns ₪600 (40%)", () => {
    const r = evaluatePrice(base, ILS(1500));
    expect(r.profit).toBe(ILS(600));
    expect(r.marginBp).toBe(4000);
    const incl = evaluatePrice({ ...base, vatMode: "included" }, ILS(1770));
    expect(incl.priceBeforeVat).toBe(ILS(1500));
    expect(incl.customerPrice).toBe(ILS(1770));
  });
  it("rejects impossible margins instead of returning Infinity", () => {
    const r = calculatePrice({ ...base, targetMarginBp: 10000 });
    expect(r.priceBeforeVat).toBeNull();
    expect(r.marginBp).toBeNull();
  });
});
