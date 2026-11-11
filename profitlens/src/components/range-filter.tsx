"use client";

import { CalendarDays } from "lucide-react";
import { useMemo, useState } from "react";
import { Input, Select } from "@/components/ui";
import { RANGE_PRESETS, resolveRange, type DateRange, type RangePreset } from "@/lib/dates";
import { formatDate, type DateFormat } from "@/lib/format";
import { t } from "@/lib/i18n";

export function useRange(initial: RangePreset = "this_month") {
  const [preset, setPreset] = useState<RangePreset>(RANGE_PRESETS.includes(initial) ? initial : "this_month");
  const [custom, setCustom] = useState<DateRange>({ from: null, to: null });
  const range = useMemo(() => resolveRange(preset, undefined, custom), [preset, custom]);
  return { preset, setPreset, custom, setCustom, range };
}

export function rangeLabel(preset: RangePreset, range: DateRange, format: DateFormat): string {
  if (!range.from && !range.to) return preset === "custom" ? "לא נבחר טווח — מוצגת כל התקופה" : t.range.all;
  return `${formatDate(range.from, format)} – ${formatDate(range.to, format)}`;
}

export function RangeFilter({ state, format }: { state: ReturnType<typeof useRange>; format: DateFormat }) {
  const { preset, setPreset, custom, setCustom, range } = state;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Select aria-label="תקופת הדוח" value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)} className="w-auto min-w-44 ps-9">
          {RANGE_PRESETS.map((value) => (
            <option key={value} value={value}>
              {t.range[value]}
            </option>
          ))}
        </Select>
      </div>
      {preset === "custom" ? (
        <>
          <Input type="date" aria-label="מתאריך" className="w-auto" value={custom.from ?? ""} onChange={(e) => setCustom({ ...custom, from: e.target.value || null })} />
          <span className="text-muted">–</span>
          <Input type="date" aria-label="עד תאריך" className="w-auto" value={custom.to ?? ""} onChange={(e) => setCustom({ ...custom, to: e.target.value || null })} />
        </>
      ) : (
        <span className="num text-xs text-muted">{rangeLabel(preset, range, format)}</span>
      )}
    </div>
  );
}
