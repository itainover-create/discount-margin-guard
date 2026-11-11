import Image from "next/image";
import symbol from "../../../public/brand/orion-symbol.webp";
import wordmark from "../../../public/brand/orion-wordmark.webp";
import signature from "../../../public/brand/orion-signature.webp";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Official ORION brand assets, extracted from the supplied poster and used unmodified
 * (no redraw, no recolour, original proportions). They are designed for a dark ground,
 * so they are only ever placed on the brand's charcoal-navy surfaces.
 */
export function OrionSymbol({ className, priority }: { className?: string; priority?: boolean }) {
  return <Image src={symbol} alt="ORION" priority={priority} className={cn("h-auto w-10 select-none", className)} draggable={false} />;
}

export function OrionWordmark({ className }: { className?: string }) {
  return <Image src={wordmark} alt="ORION" className={cn("h-auto w-28 select-none", className)} draggable={false} />;
}

/** The founder's signature — a visual brand element only; never used to sign or authorise documents. */
export function OrionSignature({ className }: { className?: string }) {
  return <Image src={signature} alt="חתימת המותג" className={cn("h-auto w-44 select-none", className)} draggable={false} />;
}

export function Slogan({ className }: { className?: string }) {
  return (
    <p dir="ltr" className={cn("brand-caps text-[10px] text-gold-400", className)}>
      {t.brand.slogan}
    </p>
  );
}

/** Symbol + wordmark + slogan, stacked as on the poster. */
export function OrionLockup({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <OrionSymbol priority className={size === "lg" ? "w-56" : "w-36"} />
      <OrionWordmark className={cn("mt-4", size === "lg" ? "w-64" : "w-44")} />
      <div className="mt-4 flex items-center gap-3 text-gold-500" aria-hidden>
        <span className="h-px w-10 bg-gold-500/50" />
        <span className="text-[10px]">✦</span>
        <span className="h-px w-10 bg-gold-500/50" />
      </div>
      <Slogan className={cn("mt-3", size === "lg" ? "text-xs" : "text-[10px]")} />
    </div>
  );
}

/** Product name set in the interface typeface, paired with the parent brand. */
export function ProductMark({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)} dir="ltr">
      <OrionSymbol className="w-11 shrink-0" priority />
      <div className="leading-none">
        <div className="text-[19px] font-semibold tracking-tight text-white">
          Profit<span className="text-gold-400">Lens</span>
        </div>
        {!compact && <div className="brand-caps mt-1.5 text-[9px] text-gold-400/90">by Orion</div>}
      </div>
    </div>
  );
}

export function DevelopedBy({ className }: { className?: string }) {
  return (
    <span dir="ltr" className={cn("text-xs tracking-wide", className)}>
      {t.brand.developedBy}
    </span>
  );
}
