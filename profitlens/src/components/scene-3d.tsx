import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const BARS: { x: number; y: number; h: number; tone: "gold" | "slate" | "teal" }[] = [
  { x: 8, y: 62, h: 34, tone: "slate" },
  { x: 8, y: 44, h: 22, tone: "gold" },
  { x: 26, y: 62, h: 52, tone: "slate" },
  { x: 26, y: 44, h: 30, tone: "gold" },
  { x: 44, y: 62, h: 70, tone: "slate" },
  { x: 44, y: 44, h: 44, tone: "gold" },
  { x: 62, y: 62, h: 96, tone: "slate" },
  { x: 62, y: 44, h: 58, tone: "gold" },
  { x: 80, y: 62, h: 124, tone: "slate" },
  { x: 80, y: 44, h: 72, tone: "gold" },
  { x: 80, y: 14, h: 40, tone: "teal" },
  { x: 62, y: 14, h: 26, tone: "teal" },
];

/**
 * Decorative isometric chart built only from CSS 3D transforms (no WebGL, ~0 KB of JS).
 * The figures are illustrative artwork, not data — it is hidden from assistive technology.
 */
export function Scene3D({ className }: { className?: string }) {
  return (
    <div className={cn("scene pointer-events-none relative mx-auto aspect-square w-full max-w-[420px] select-none", className)} aria-hidden>
      <div className="scene-stack absolute inset-[14%]">
        <div className="scene-plate" />
        <div className="scene-grid" />
        {BARS.map((bar, index) => (
          <div
            key={index}
            className={cn("bar-3d", `bar-${bar.tone}`)}
            style={{ left: `${bar.x}%`, top: `${bar.y}%`, ["--h" as string]: bar.h, ["--d" as string]: `${0.08 * index}s` }}
          >
            <span className="top" />
            <span className="side-a" />
            <span className="side-b" />
          </div>
        ))}
      </div>
      <div className="rise-in absolute end-[2%] top-[10%] rounded-2xl border border-white/10 bg-white/95 px-4 py-3 text-ink shadow-(--shadow-pop)" style={{ animationDelay: "0.9s" }}>
        <div className="text-[11px] font-medium text-muted">שיעור רווח לעבודה</div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="num text-2xl font-bold">40%</span>
          <span className="grid size-6 place-items-center rounded-full bg-positive-soft text-positive">
            <TrendingUp className="size-3.5" />
          </span>
        </div>
      </div>
      <div className="rise-in absolute start-[0%] bottom-[12%] rounded-2xl border border-white/10 bg-navy-800/95 px-4 py-3 shadow-(--shadow-pop) ring-1 ring-gold-500/30" style={{ animationDelay: "1.1s" }}>
        <div className="text-[11px] font-medium text-gold-300/80">מחיר מומלץ לפני מע״מ</div>
        <div className="num mt-0.5 text-xl font-bold text-white">₪1,285.71</div>
      </div>
    </div>
  );
}
