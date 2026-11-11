import Link from "next/link";
import type { ReactNode } from "react";
import { DevelopedBy, OrionLockup, OrionSignature, ProductMark } from "@/components/brand";
import { Scene3D } from "@/components/scene-3d";
import { IS_DEMO_MODE } from "@/lib/backend";
import { t } from "@/lib/i18n";

/** Two-panel frame for sign-in, registration and onboarding. */
export function AuthFrame({ title, subtitle, children, wide }: { title: string; subtitle?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="relative hidden overflow-hidden bg-linear-to-br from-navy-800 via-navy-900 to-navy-950 lg:flex lg:flex-col lg:items-center lg:justify-between lg:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_400px_at_70%_20%,rgb(211_165_127/0.14),transparent_70%)]" aria-hidden />
        <OrionLockup className="relative" />
        <Scene3D className="relative -my-6 max-w-[380px]" />
        <div className="relative flex w-full items-end justify-between gap-6">
          <div>
            <p className="text-lg font-semibold text-white">{t.brand.tagline}</p>
            <DevelopedBy className="mt-1 block text-slate-400" />
          </div>
          <OrionSignature className="w-36 opacity-90" />
        </div>
      </section>

      <section className="flex flex-col">
        <header className="flex h-16 items-center justify-between bg-navy-900 px-5 lg:hidden">
          <Link href="/" aria-label="ProfitLens">
            <ProductMark compact className="[&_img]:w-9" />
          </Link>
        </header>
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
          <div className={wide ? "w-full max-w-2xl" : "w-full max-w-md"}>
            <div className="rise-in">
              <p className="eyebrow" dir="ltr" style={{ textAlign: "right" }}>
                ProfitLens
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">{title}</h1>
              {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>}
              {IS_DEMO_MODE && (
                <p className="mt-4 rounded-xl border border-info/15 bg-info-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-info">
                  <b>סביבת הדגמה:</b> החשבון נוצר ונשמר בדפדפן הזה בלבד. אין שרת, ואין שחזור סיסמה.
                </p>
              )}
              <div className="mt-7">{children}</div>
            </div>
          </div>
        </div>
        <footer className="px-5 pb-6 text-center text-muted">
          <DevelopedBy />
        </footer>
      </section>
    </div>
  );
}
