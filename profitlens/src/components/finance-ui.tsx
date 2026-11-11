"use client";

import type { ReactNode } from "react";
import { Badge, type Tone } from "@/components/ui";
import { formatMoney, formatPercent, formatSignedMoney } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<JobStatus, Tone> = {
  draft: "neutral",
  quoted: "info",
  approved: "gold",
  in_progress: "warning",
  completed: "positive",
  cancelled: "negative",
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{t.status[status]}</Badge>;
}

export function SampleBadge() {
  return (
    <Badge tone="gold" className="h-5 px-2 text-[10.5px]">
      {t.common.sample}
    </Badge>
  );
}

/** Money with a sign-aware colour: green for gains, red for losses. */
export function ProfitText({ value, className, signed }: { value: number | null; className?: string; signed?: boolean }) {
  if (value == null) return <span className={cn("text-muted", className)}>—</span>;
  return (
    <span className={cn("num font-semibold", value > 0 && "text-positive", value < 0 && "text-negative", className)}>
      {signed ? formatSignedMoney(value) : formatMoney(value)}
    </span>
  );
}

export function MarginBadge({ bp, target }: { bp: number | null; target: number }) {
  if (bp == null) return <span className="text-muted">—</span>;
  const tone: Tone = bp < 0 ? "negative" : bp < target ? "warning" : "positive";
  return (
    <Badge tone={tone} className="num">
      {formatPercent(bp)}
    </Badge>
  );
}

export function Money({ value, className }: { value: number | null | undefined; className?: string }) {
  return <span className={cn("num", className)}>{formatMoney(value)}</span>;
}

/** A label/value line inside a financial summary. */
export function SummaryRow({ label, value, strong, hint, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; hint?: ReactNode; tone?: "positive" | "negative" }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2", strong && "border-t border-line-strong pt-3")}>
      <div className="min-w-0">
        <div className={cn("text-sm", strong ? "font-semibold text-ink" : "text-ink-2")}>{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className={cn("num shrink-0 text-sm", strong ? "text-base font-bold" : "font-medium", tone === "positive" && "text-positive", tone === "negative" && "text-negative")}>
        {value}
      </div>
    </div>
  );
}
