import { BarChart3, Calculator, ClipboardList, Scale, ShieldCheck, TrendingDown } from "lucide-react";
import Link from "next/link";
import { OrionLockup } from "@/components/brand";
import { Scene3D } from "@/components/scene-3d";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { t } from "@/lib/i18n";

const FEATURES = [
  { icon: Calculator, title: "מחשבון תמחור", text: "מזינים עלויות ויעד רווח ומקבלים את המחיר הנדרש — לפני ואחרי מע״מ. וגם הפוך: כמה ארוויח אם אגבה ₪1,500?" },
  { icon: ClipboardList, title: "עלות מלאה לכל עבודה", text: "חומרים, שעות העובדים, השעות שלך, נסיעות, קבלני משנה, עמלות סליקה וחלק יחסי מהתקורה." },
  { icon: Scale, title: "הערכה מול ביצוע", text: "כמה תכננתם שיעלה וכמה עלה באמת — בשקלים ובאחוזים, עם פירוט מה בדיוק גרם להפרש." },
  { icon: TrendingDown, title: "התרעות על עבודות חלשות", text: "עבודה מתחת ליעד הרווח, חריגה בחומרים או בשעות, עבודה בלי עלויות רשומות — מסומנות מיד." },
  { icon: BarChart3, title: "רווח לפי שירות ולקוח", text: "אילו שירותים ולקוחות מייצרים את הרווח — לא רק את ההכנסה הגבוהה ביותר." },
  { icon: ShieldCheck, title: "הנתונים שלך", text: "הפרדה מלאה בין עסקים, ייצוא CSV בכל רגע, ומחיקה מלאה לפי בקשה. בלי פרטי בנק או כרטיסי אשראי." },
];

const STEPS = [
  ["יוצרים עבודה", "לקוח, שירות ותיאור קצר."],
  ["מעריכים עלויות", "חומרים, שעות, נסיעות וקבלנים."],
  ["קובעים מחיר", "לפי יעד הרווח שהגדרתם."],
  ["רושמים עלויות בפועל", "תוך כדי העבודה או בסיומה."],
  ["מבינים את הרווח", "ומתמחרים טוב יותר בפעם הבאה."],
];

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="relative overflow-hidden bg-linear-to-br from-navy-800 via-navy-900 to-navy-950 text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_420px_at_20%_10%,rgb(211_165_127/0.16),transparent_70%)]" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-5 py-14 lg:grid-cols-[1.05fr_1fr] lg:py-20">
            <div className="rise-in">
              <p className="brand-caps text-[11px] text-gold-400" dir="ltr" style={{ textAlign: "right" }}>ProfitLens · by Orion</p>
              <h1 className="mt-4 text-4xl leading-[1.15] font-bold tracking-tight sm:text-5xl lg:text-[56px]">
                כמה באמת נשאר לך
                <br />
                <span className="bg-linear-to-l from-gold-200 via-gold-400 to-gold-300 bg-clip-text text-transparent">מכל עבודה?</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">
                ProfitLens מראה לבעלי עסקי שירות את העלות המלאה של כל עבודה, את הרווח האמיתי שלה — ומה נכון לגבות בפעם הבאה.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register" className="btn btn-gold btn-lg">התחלה בחינם</Link>
                <Link href="/login" className="btn btn-lg border border-white/20 text-white hover:bg-white/10">יש לי חשבון</Link>
              </div>
              <p className="mt-6 text-sm text-slate-400">{t.brand.tagline}</p>
            </div>
            <Scene3D className="lg:max-w-[460px]" />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="eyebrow">הבעיה</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight">יודעים כמה גובים. לא תמיד יודעים כמה נשאר.</h2>
              <p className="mt-4 leading-relaxed text-ink-2">
                קל לשכוח את השעות שלך, את הדלק, את הקבלן שהוזמן ברגע האחרון ואת החלק של העבודה בהוצאות הקבועות של העסק. כך מקבלים עבודות בלי לדעת אם הן בכלל רווחיות.
              </p>
            </div>
            <div className="card tile-3d card-pad">
              <div className="text-[13px] font-semibold text-muted">דוגמה לחישוב</div>
              <dl className="mt-3 divide-y divide-line text-sm">
                {[
                  ["מחיר ללקוח (כולל 18% מע״מ)", "₪1,770"],
                  ["הכנסה לפני מע״מ", "₪1,500"],
                  ["חומרים, עבודה, נסיעות", "−₪900"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2.5"><dt className="text-ink-2">{k}</dt><dd className="num font-medium">{v}</dd></div>
                ))}
                <div className="flex justify-between py-3 text-base font-bold"><dt>רווח לפני תקורה</dt><dd className="num text-positive">₪600 · 40%</dd></div>
              </dl>
              <p className="mt-2 text-xs leading-relaxed text-muted">מע״מ לעולם אינו נספר כהכנסה. כדי להגיע ל־30% רווח על עלות של ₪900 צריך לגבות ₪1,285.71 לפני מע״מ — לא ₪1,170.</p>
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-surface/70">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <p className="eyebrow">הפתרון</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight">תמונה פיננסית ברורה של כל עבודה</h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <div key={title} className="card tile-3d p-6">
                  <div className="chip-3d size-12"><Icon className="size-5" strokeWidth={1.7} /></div>
                  <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <p className="eyebrow">איך זה עובד</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">חמישה צעדים, מעבודה חדשה ועד תמחור טוב יותר</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map(([title, text], index) => (
              <li key={title} className="card p-5">
                <span className="num grid size-9 place-items-center rounded-full bg-navy-900 text-sm font-bold text-gold-200 ring-1 ring-gold-500/40">{index + 1}</span>
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-linear-to-br from-navy-800 to-navy-950 text-white">
          <div className="mx-auto flex max-w-6xl flex-col items-center px-5 py-16 text-center">
            <OrionLockup />
            <h2 className="mt-10 text-3xl font-bold tracking-tight">מוכנים לדעת כמה מרוויחים?</h2>
            <p className="mt-3 max-w-xl text-slate-300">מתאים לטכנאי מיזוג, חשמלאים, אינסטלטורים, עסקי ניקיון, שיפוצים, אחזקה והתקנות — עסקים של אדם אחד עד חמישה.</p>
            <Link href="/register" className="btn btn-gold btn-lg mt-8">פתיחת חשבון</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
