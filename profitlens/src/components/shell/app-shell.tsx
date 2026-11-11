"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  BarChart3, Calculator, ClipboardList, FlaskConical, Info, LayoutDashboard, LogOut, Menu, Settings, Users, UsersRound, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { DevelopedBy, OrionSymbol, ProductMark, Slogan } from "@/components/brand";
import { Button, useConfirm } from "@/components/ui";
import { t } from "@/lib/i18n";
import { canManageBusiness } from "@/lib/permissions";
import { useApp } from "@/lib/store";
import { useRun } from "@/lib/use-run";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard },
  { href: "/jobs", label: t.nav.jobs, icon: ClipboardList },
  { href: "/pricing-calculator", label: t.nav.calculator, icon: Calculator },
  { href: "/analytics", label: t.nav.analytics, icon: BarChart3 },
  { href: "/customers", label: t.nav.customers, icon: Users },
  { href: "/team", label: t.nav.team, icon: UsersRound },
  { href: "/settings", label: t.nav.settings, icon: Settings },
];
const MOBILE_TABS = NAV.slice(0, 4);

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="ניווט ראשי" className="flex flex-col gap-1">
      {[...NAV, { href: "/about", label: t.nav.about, icon: Info }].map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-[14.5px] font-medium transition",
              active
                ? "bg-linear-to-l from-gold-500/20 to-gold-500/5 text-white shadow-[inset_0_0_0_1px_rgb(211_165_127/0.28)]"
                : "text-slate-300/80 hover:bg-white/5 hover:text-white",
            )}
          >
            {active && <span className="absolute inset-y-2.5 start-0 w-[3px] rounded-full bg-gold-400" aria-hidden />}
            <Icon className={cn("size-[18px] shrink-0", active ? "text-gold-300" : "text-slate-400 group-hover:text-gold-300")} strokeWidth={1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { user, organization, role, signOut } = useApp();
  const router = useRouter();
  return (
    <div className="flex h-full flex-col">
      <Link href="/dashboard" onClick={onNavigate} className="mb-7 block px-1" aria-label="ProfitLens — לוח בקרה">
        <ProductMark />
      </Link>
      <NavLinks onNavigate={onNavigate} />
      <div className="mt-auto pt-6">
        <div className="rounded-2xl border border-white/8 bg-white/4 p-3">
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-linear-to-br from-gold-300 to-gold-600 text-sm font-bold text-navy-950">
              {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{organization?.name}</div>
              <div className="truncate text-xs text-slate-400">
                {user?.name} · {role ? t.role[role] : ""}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label={t.nav.signOut}
              title={t.nav.signOut}
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
            >
              <LogOut className="size-4 rtl:-scale-x-100" />
            </button>
          </div>
        </div>
        <div className="mt-5 px-1 text-center">
          <Slogan className="text-[8px] text-gold-400/70" />
          <DevelopedBy className="mt-2 block text-[11px] text-slate-500" />
        </div>
      </div>
    </div>
  );
}

function Banners() {
  const { isDemo, hasSampleData, removeSampleData, role } = useApp();
  const confirm = useConfirm();
  const { run, busy } = useRun();
  if (!isDemo && !hasSampleData) return null;
  return (
    <div className="no-print mb-5 flex flex-col gap-2">
      {isDemo && (
        <div className="flex items-start gap-2.5 rounded-xl border border-info/15 bg-info-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-info">
          <FlaskConical className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>סביבת הדגמה.</b> לא הוגדר חיבור למסד נתונים, ולכן החשבון והנתונים נשמרים בדפדפן הזה בלבד ואינם מגובים או מסונכרנים בין מכשירים.
          </span>
        </div>
      )}
      {hasSampleData && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-gold-500/25 bg-gold-100/70 px-3.5 py-2.5 text-[13px] leading-relaxed text-gold-800">
          <span className="min-w-0 flex-1">
            <b>מוצגים נתוני דוגמה בדיוניים.</b> רשומות המסומנות ״דוגמה״ אינן נתוני העסק שלך, והן נכללות בסיכומים עד שיוסרו.
          </span>
          {role && canManageBusiness(role) && (
            <Button
              size="sm"
              variant="outline"
              loading={busy}
              onClick={async () => {
                const ok = await confirm({
                  title: "הסרת נתוני הדוגמה",
                  text: "כל העבודות, הלקוחות ואנשי הצוות המסומנים ״דוגמה״ יימחקו. הנתונים האמיתיים שהזנת לא יושפעו.",
                  confirmLabel: "הסרת נתוני הדוגמה",
                  danger: true,
                });
                if (ok) await run(removeSampleData, "נתוני הדוגמה הוסרו");
              }}
            >
              הסרת נתוני הדוגמה
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function FullScreenLoader({ label = t.common.loading }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-navy-900" role="status" aria-live="polite">
      <div className="flex flex-col items-center">
        <OrionSymbol priority className="w-24 animate-pulse" />
        <div className="mt-5 text-lg font-semibold text-white" dir="ltr">
          Profit<span className="text-gold-400">Lens</span>
        </div>
        <Slogan className="mt-2" />
        <p className="mt-6 text-sm text-slate-400">{label}</p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { status, error, reload } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (status === "signed_out") router.replace("/login");
    if (status === "no_workspace") router.replace("/onboarding");
  }, [status, router]);

  if (status === "error") {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="card card-pad max-w-md text-center">
          <h1 className="text-lg font-semibold">לא הצלחנו לטעון את הנתונים</h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <Button className="mt-5" onClick={() => void reload()}>
            ניסיון נוסף
          </Button>
        </div>
      </div>
    );
  }
  // Protected area: nothing is rendered until an authenticated workspace is loaded.
  if (status !== "ready") return <FullScreenLoader />;

  return (
    <div className="min-h-dvh lg:ps-[272px]">
      <aside className="no-print fixed inset-y-0 start-0 z-30 hidden w-[272px] border-e border-gold-500/15 bg-linear-to-b from-navy-900 to-navy-950 p-5 lg:block">
        <SidebarBody />
      </aside>

      <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gold-500/15 bg-navy-900 px-4 lg:hidden">
        <Link href="/dashboard" aria-label="ProfitLens">
          <ProductMark compact className="[&_img]:w-9" />
        </Link>
        <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogPrimitive.Trigger className="btn btn-ghost btn-icon text-white hover:bg-white/10 hover:text-white" aria-label="פתיחת תפריט">
            <Menu className="size-5" />
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-[2px]" />
            <DialogPrimitive.Content
              dir="rtl"
              className="fixed inset-y-0 start-0 z-50 w-[86vw] max-w-[320px] overflow-y-auto bg-linear-to-b from-navy-900 to-navy-950 p-5 shadow-(--shadow-pop) [animation:sheet-in_.22s_ease-out]"
            >
              <DialogPrimitive.Title className="sr-only">תפריט ניווט</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">ניווט בין מסכי המערכת</DialogPrimitive.Description>
              <DialogPrimitive.Close className="btn btn-ghost btn-icon btn-sm absolute end-3 top-4 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="סגירת תפריט">
                <X className="size-4" />
              </DialogPrimitive.Close>
              <SidebarBody onNavigate={() => setMenuOpen(false)} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </header>

      <main className="mx-auto w-full max-w-[1280px] px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-12">
        <Banners />
        <div key={pathname} className="rise-in">
          {children}
        </div>
      </main>

      <nav aria-label="ניווט מהיר" className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-gold-500/20 bg-navy-900/97 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {MOBILE_TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-gold-300" : "text-slate-400")}
            >
              <Icon className="size-5" strokeWidth={active ? 2.2 : 1.7} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
