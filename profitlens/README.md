# ProfitLens

**Know your profit. Price with confidence.** — job costing and profitability analytics for small Israeli service businesses.
A product of **ORION** · *Where great minds shape the future.* · **Developed by Alon Novitarger**

ProfitLens answers one question: *how much do I actually earn from every job, and what should I charge next time?*
Create job → estimate costs → calculate price → record actual costs → understand profit.

Hebrew, right-to-left and ILS (₪) by default. It is a business management and estimation tool — **not** certified accounting software, and it does not issue tax invoices or produce official tax reports.

## Quick start

```bash
cd profitlens
npm install
npm run dev          # http://localhost:3000
```

With no environment variables the app runs in **demo mode**: accounts and data are kept in the browser's `localStorage` on that device only. The UI labels this clearly. Demo mode is fully functional (registration, onboarding, jobs, costs, reports, CSV) but has no server, no backup, no password recovery and is not a security boundary.

## Connecting Supabase (production data)

1. Create a Supabase project.
2. SQL Editor → run `supabase/migrations/0001_profitlens_schema.sql` (tables, constraints, indexes, triggers, RPCs and Row Level Security).
3. Authentication → keep **Confirm email** enabled (team invitations rely on a verified address).
4. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API).
5. `npm run build && npm start`.

Only the public anon key is used; there is no service-role key anywhere in the app. All authorization is enforced in the database by RLS.

> **Status of the Supabase path:** the schema and RLS policies are verified against a real PostgreSQL 16 (`npm run test:rls`, 41 assertions). The browser adapter (`src/lib/backend/supabase.ts`) is implemented against the same interface as the demo backend but **has not been run against a live Supabase project** — no credentials were available during development. Do a full click-through after connecting your project.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development server / production build / production server |
| `npm test` | Unit tests (Vitest): financial engine, money parsing, data-layer isolation, CSV, date filters, validation, reports |
| `npm run test:rls` | Applies the migration to a throwaway local Postgres and runs the RLS/role test-suite (needs PostgreSQL 15+ binaries) |
| `npm run test:e2e` | Browser smoke test in demo mode (needs Playwright + Chromium; start the app first, `BASE_URL=http://localhost:3000`) |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm run check` | typecheck + lint + unit tests + build |

## Financial definitions

All money is stored and calculated as **integer agorot**; percentages as **basis points**. No floating-point value is used for a monetary result (`src/lib/finance`).

- **Revenue** = price **before VAT**. VAT is never revenue. VAT rate defaults to 18% and is editable; presentation can be "VAT added", "VAT included" or "no VAT". The app never decides a user's tax status.
- **Direct costs** = materials + labor (hours × internal hourly cost) + transportation + contractors + other + configured payment fees.
- **Profit before allocated overhead** = revenue − direct costs. **Margin** = profit ÷ revenue (undefined, shown as "—", when revenue is zero).
- **Markup** = profit ÷ cost. Shown separately and never confused with margin.
- **Required price** = total estimated cost ÷ (1 − target margin).
- **Overhead allocation**: none / fixed per job / by job hours (monthly overhead ÷ billable hours × job hours) / % of revenue.
- **Operating contribution after allocated overhead** = profit − allocated overhead. A management estimate, not certified net profit.
- Estimates and actuals are separate cost entries and are never mixed. Reports count **completed** jobs by completion date.

## Architecture

```
src/lib/finance/     money.ts (integer primitives), engine.ts (all calculations — pure, tested)
src/lib/backend/     types.ts (Backend interface) · local.ts (demo) · supabase.ts
src/lib/store.tsx    client state: session, workspace, data, mutations
src/lib/reports.ts   aggregations, warnings   ·   exports.ts / csv.ts   ·   validation.ts (Zod)
src/lib/permissions.ts  role matrix (mirrored by the SQL policies)
src/lib/i18n/        shared Hebrew dictionary (add a sibling file for another language)
src/components/      ui/ (design system), brand/, shell/, jobs/, charts.tsx, scene-3d.tsx
src/app/             (auth)/login·register·onboarding   (app)/dashboard·jobs·pricing-calculator·analytics·customers·team·settings   about, landing
supabase/            migrations/ and tests/
```

Stack: Next.js (App Router) · React · TypeScript · Tailwind CSS v4 · Radix Dialog · Recharts · Zod · React Hook Form · Lucide · Supabase JS. UI primitives are hand-written in the shadcn/ui style (`src/components/ui`); the shadcn CLI was not used.

Roles: **owner** (everything, including deleting the business), **administrator** (everything except deleting the business), **team member** (reads operational data; creates/updates jobs, customers and cost entries; no deletes except cost entries, no settings or team management).

## Brand assets

`public/brand/orion-symbol|wordmark|signature.(webp|png)` were cut out of the supplied poster photo (`scripts/extract-brand-assets.py`) — not redrawn or recoloured — and are only placed on the brand's dark navy ground. Because the source was a ~720 px phone photo they are soft at large sizes: **replace them with the original vector/high-resolution files when available** (same file names, nothing else changes). The signature is a visual brand element only.

## Known limitations

- The data set is loaded into the browser per session and lists are paginated client-side; fine for a small business, but very large histories would need server-side pagination.
- Team invitations are recorded, not e-mailed: the invited person registers with that address and is attached to the business.
- Only Hebrew ships. Shared vocabulary lives in `src/lib/i18n`; screen-specific copy is still inline and must be extracted to add English.
- Route protection is a client-side guard; the security boundary for data is RLS (Supabase mode). Demo mode has no server-side boundary.
- Out of scope by design: bookkeeping, tax reporting, invoices, payroll, bank connections, payment processing, inventory, messaging, OCR, AI.

## Deployment

Any Node host works; Vercel is the simplest: import the repository, set **Root Directory** to `profitlens`, add the two `NEXT_PUBLIC_SUPABASE_*` variables, deploy. Without the variables the deployment runs in demo mode.

Roadmap (not built): receipt scanning, voice expense entry, AI explanations, CSV import, historical pricing recommendations, WhatsApp, customer-facing quote links, more currencies, subscription billing, industry templates.
