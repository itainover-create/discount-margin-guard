import type { Metadata } from "next";
import Link from "next/link";
import { DevelopedBy, OrionLockup, OrionSignature } from "@/components/brand";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { IS_DEMO_MODE } from "@/lib/backend";
import { t } from "@/lib/i18n";
import pkg from "../../../package.json";

export const metadata: Metadata = { title: "אודות" };

const NOT_INCLUDED = ["הנהלת חשבונות מלאה", "דיווח מס רשמי", "הפקת חשבוניות מס", "חישוב שכר", "חיבור לחשבונות בנק", "סליקת תשלומים"];
const ROADMAP = ["סריקת קבלות", "הזנת הוצאות בקול", "הסברי רווחיות בסיוע AI", "ייבוא CSV ממערכות הנהלת חשבונות", "המלצות תמחור מההיסטוריה", "קישורי הצעת מחיר ללקוח", "מטבעות נוספים", "תבניות לפי ענף"];

export default function AboutPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="bg-linear-to-br from-navy-800 via-navy-900 to-navy-950 px-5 py-16 text-white">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <OrionLockup size="lg" />
            <h1 className="mt-10 text-4xl font-bold tracking-tight" dir="ltr">Profit<span className="text-gold-400">Lens</span></h1>
            <p className="mt-3 text-lg text-slate-300">{t.brand.tagline}</p>
          </div>
        </section>

        <div className="mx-auto grid max-w-5xl gap-5 px-5 py-12 md:grid-cols-2">
          <section className="card card-pad md:col-span-2">
            <p className="eyebrow">המוצר</p>
            <h2 className="mt-2 text-2xl font-bold">כמה אני באמת מרוויח מכל עבודה — ומה לגבות בפעם הבאה?</h2>
            <p className="mt-3 leading-relaxed text-ink-2">
              ProfitLens הוא כלי לניתוח רווחיות ותמחיר עבודות לעסקי שירות קטנים בישראל. הוא מחבר את המחיר שגובים עם העלות המלאה של העבודה — חומרים, שעות, נסיעות, קבלני משנה ותקורה — ומראה מה נשאר.
              ProfitLens הוא מוצר של <span dir="ltr">ORION</span>.
            </p>
          </section>

          <section className="card overflow-hidden">
            <div className="flex flex-col items-center bg-linear-to-br from-navy-800 to-navy-950 px-6 py-8 text-center">
              <OrionSignature className="w-56" />
              <p className="brand-caps mt-3 text-[11px] text-gold-300" dir="ltr">Alon Novitarger</p>
            </div>
            <div className="card-pad">
              <p className="eyebrow">המפתח והמייסד</p>
              <h2 className="mt-2 text-xl font-bold">אלון נוביטרגר</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">ProfitLens תוכנן ופותח על ידי אלון נוביטרגר, כמוצר תוכנה עצמאי.</p>
              <p className="mt-4 text-sm font-semibold text-ink"><DevelopedBy className="text-sm" /></p>
              <p className="mt-3 text-xs leading-relaxed text-muted">החתימה מוצגת כאלמנט מיתוגי בלבד ואינה מהווה אישור, התחייבות או חתימה על מסמך כלשהו.</p>
            </div>
          </section>

          <section className="card card-pad">
            <p className="eyebrow">מידע על היישום</p>
            <dl className="mt-3 divide-y divide-line text-sm">
              {[
                ["מוצר", "ProfitLens"],
                ["גרסה", pkg.version],
                ["חברה", "ORION"],
                ["פיתוח", t.brand.developedBy],
                ["סביבה", IS_DEMO_MODE ? "הדגמה — הנתונים נשמרים בדפדפן בלבד" : "מחובר למסד נתונים (Supabase)"],
                ["שפה וכיווניות", "עברית · RTL"],
                ["מטבע", "שקל חדש (₪)"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5"><dt className="text-muted">{k}</dt><dd className="text-end font-medium" dir="auto">{v}</dd></div>
              ))}
            </dl>
          </section>

          <section className="card card-pad">
            <p className="eyebrow">מה ProfitLens אינו</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.disclaimer}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {NOT_INCLUDED.map((item) => <li key={item} className="badge bg-navy-900/6 text-ink-2">{item}</li>)}
            </ul>
          </section>

          <section className="card card-pad">
            <p className="eyebrow">בהמשך הדרך</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">יכולות מתוכננות שעדיין אינן קיימות במוצר:</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {ROADMAP.map((item) => <li key={item} className="badge bg-gold-100 text-gold-700">{item}</li>)}
            </ul>
          </section>

          <div className="flex justify-center md:col-span-2">
            <Link href="/dashboard" className="btn btn-primary btn-lg">כניסה למערכת</Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
