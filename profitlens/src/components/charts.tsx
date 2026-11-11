"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatMoney } from "@/lib/format";

/** Chart series colours (validated for colour-vision deficiency; see globals.css). */
export const SERIES = { revenue: "#3b5ba5", cost: "#cf7f3a", profit: "#17a08c", loss: "#b93a34" };
const AXIS = { fontSize: 11, fill: "#747a8c" };
const GRID = "#ece7df";

function compactMoney(minor: number): string {
  const shekels = minor / 100;
  const abs = Math.abs(shekels);
  const text = abs >= 1_000_000 ? `${+(abs / 1_000_000).toFixed(1)}M` : abs >= 10_000 ? `${+(abs / 1000).toFixed(0)}K` : abs >= 1000 ? `${+(abs / 1000).toFixed(1)}K` : `${Math.round(abs)}`;
  return `${shekels < 0 ? "−" : ""}₪${text}`;
}

export function Legend({ items }: { items: { color: string; label: string; line?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className={item.line ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-[3px]"} style={{ background: item.color }} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

interface TooltipRow {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  dataKey?: unknown;
}

function MoneyTooltip({ active, payload, label, title }: { active?: boolean; payload?: TooltipRow[]; label?: string | number; title?: (label: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div dir="rtl" className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-(--shadow-lift)">
      <div className="mb-1 font-semibold text-ink">{title ? title(String(label)) : label}</div>
      {payload.map((row) => (
        <div key={String(row.dataKey)} className="flex items-center justify-between gap-5 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="size-2 rounded-[2px]" style={{ background: row.color }} aria-hidden />
            {row.name}
          </span>
          <span className="num font-semibold text-ink">{formatMoney(Number(row.value))}</span>
        </div>
      ))}
    </div>
  );
}

export interface TrendPoint {
  label: string;
  revenue: number;
  costs: number;
  profit: number;
}

/** Revenue and direct costs as paired columns, profit as a line — one shared ₪ axis. */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-[280px] w-full" role="img" aria-label="הכנסות, עלויות ישירות ורווח לאורך זמן">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={12} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compactMoney} width={52} />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: "rgb(26 30 41 / 0.04)" }} />
          <ReferenceLine y={0} stroke="#cfc8bb" />
          <Bar dataKey="revenue" name="הכנסה לפני מע״מ" fill={SERIES.revenue} radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="costs" name="עלויות ישירות" fill={SERIES.cost} radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Line
            dataKey="profit" name="רווח לפני תקורה" type="monotone" stroke={SERIES.profit} strokeWidth={2}
            dot={{ r: 4, fill: SERIES.profit, stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5.5, stroke: "#fff", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface RankPoint {
  label: string;
  value: number;
}

/** Ranked horizontal bars for one signed measure (profit / contribution). Losses are drawn in red and labelled. */
export function RankChart({ data, name, ariaLabel }: { data: RankPoint[]; name: string; ariaLabel: string }) {
  const height = Math.max(120, data.length * 38 + 28);
  const hasNegative = data.some((d) => d.value < 0);
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 0, left: hasNegative ? 56 : 4 }} barCategoryGap={10}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compactMoney} />
          <YAxis
            type="category" dataKey="label" tick={{ ...AXIS, fill: "#4a5062", fontSize: 12 }} tickLine={false} axisLine={false} width={132}
            tickFormatter={(value: string) => (value.length > 19 ? `${value.slice(0, 18)}…` : value)}
          />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: "rgb(26 30 41 / 0.04)" }} />
          <ReferenceLine x={0} stroke="#cfc8bb" />
          <Bar dataKey="value" name={name} radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.map((point) => (
              <Cell key={point.label} fill={point.value < 0 ? SERIES.loss : SERIES.profit} />
            ))}
            <LabelList dataKey="value" position="right" formatter={(value) => compactMoney(Number(value))} style={{ fontSize: 11, fill: "#4a5062", fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
