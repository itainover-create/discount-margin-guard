import Link from "next/link";
import { DevelopedBy, OrionSignature, OrionSymbol, OrionWordmark, ProductMark, Slogan } from "@/components/brand";
import { t } from "@/lib/i18n";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-gold-500/15 bg-navy-900/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" aria-label="ProfitLens — דף הבית">
          <ProductMark className="[&_img]:w-10" />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="ניווט האתר">
          <Link href="/about" className="btn btn-ghost btn-sm text-slate-300 hover:bg-white/10 hover:text-white">{t.nav.about}</Link>
          <Link href="/login" className="btn btn-ghost btn-sm text-slate-300 hover:bg-white/10 hover:text-white">התחברות</Link>
          <Link href="/register" className="btn btn-gold btn-sm">פתיחת חשבון</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-gold-500/15 bg-navy-950 text-slate-400">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 md:grid-cols-[1.2fr_1fr_auto] md:items-center">
        <div className="flex items-center gap-4">
          <OrionSymbol className="w-16" />
          <div>
            <OrionWordmark className="w-28" />
            <Slogan className="mt-2 text-[8.5px]" />
          </div>
        </div>
        <div className="text-sm leading-relaxed">
          <div className="font-semibold text-white" dir="ltr" style={{ textAlign: "right" }}>ProfitLens</div>
          <p className="mt-1 text-[13px]">{t.brand.tagline}</p>
          <div className="mt-3 flex gap-4 text-[13px]">
            <Link href="/about" className="hover:text-gold-300">{t.nav.about}</Link>
            <Link href="/login" className="hover:text-gold-300">התחברות</Link>
            <Link href="/register" className="hover:text-gold-300">פתיחת חשבון</Link>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <OrionSignature className="w-36 opacity-90" />
          <DevelopedBy className="text-slate-300" />
        </div>
      </div>
      <div className="border-t border-white/5 px-5 py-4 text-center text-[11px] leading-relaxed text-slate-500">{t.disclaimer}</div>
    </footer>
  );
}
