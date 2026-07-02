# ABG Brand Performance Hub — Claude Agent System

## Project Overview

Multi-brand analytics dashboard for **American Bath Group (ABG)** — 45 brands across bath, shower, and spa categories. Built with React 18 + TypeScript + Vite, Supabase (Postgres + Edge Functions), Tailwind CSS + shadcn/ui, and Recharts.

**Live data sources:** Google Analytics 4 (GA4), Google Search Console (GSC), HubSpot (emails + CRM), Meta (social media).

---

## Master Agent Responsibilities

The master agent orchestrates all sub-agents and owns:

- **Brand context** — always load `src/lib/brands.ts` first; it is the source of truth for which data sources each brand has (`hasGA4`, `hasGSC`, `hasHubSpot`, and social media list in `Index.tsx`).
- **Tab routing** — tabs are defined in `src/pages/Index.tsx`. Any new tab requires an entry in the `tabs` array and a corresponding component render in `<main>`.
- **Edge function coordination** — all data fetching goes through Supabase Edge Functions in `supabase/functions/`. Never call external APIs directly from the frontend.
- **Auth & access** — Supabase auth with `AuthGuard`. RLS policies live in `supabase/migrations/`. Admin routes are in `src/pages/Admin.tsx`.
- **Shared UI** — use components from `src/components/ui/` (shadcn) and shared components like `ScoreCard`, `TabNav`, `WaterFillLoader`, `DateRangePicker`.

---

## Sub-Agent System

### 1. Analytics Agent
**Scope:** GA4 + GSC performance data — traffic, sessions, conversions, search queries, impressions, clicks, CTR, position.

**Key files:**
- `supabase/functions/ga4-data/` — sessions, users, pageviews, conversions
- `supabase/functions/ga4-channel-data/` — channel breakdown (organic, paid, direct, referral, email, social)
- `supabase/functions/gsc-data/` — search queries, clicks, impressions, CTR, position
- `src/components/PerformanceTab.tsx` — primary UI for this agent's output
- `src/components/TrafficAcquisitionTable.tsx` — channel table component

**Rules:**
- Always check `brand.hasGA4` and `brand.hasGSC` before rendering; show disabled state via `TabNav` if both false.
- GA4 property IDs are arrays (`ga4PropertyIds`) — some brands (Neptune) have multiple; aggregate or allow switching.
- Date range is always passed as `dateFrom`/`dateTo` props from `Index.tsx`.
- Use `ScoreCard` component for KPI tiles.

---

### 2. Design Agent
**Scope:** UI/UX, component architecture, Tailwind styling, theming, accessibility.

**Key files:**
- `src/components/ui/` — all shadcn base components
- `tailwind.config.ts` — design tokens (colors, spacing, fonts)
- `src/components/TabNav.tsx` — tab navigation pattern
- `src/components/ScoreCard.tsx` — KPI card pattern
- `src/components/WaterFillLoader.tsx` — branded loading state

**Rules:**
- Follow existing shadcn/Radix patterns — do not introduce new component libraries.
- Use `cn()` from `@/lib/utils` for conditional class merging.
- Disabled tabs use `cursor-not-allowed text-muted-foreground/50` with a `title` tooltip — maintain this pattern for new tabs.
- Active tab uses `after:` pseudo-element underline in `text-accent` — do not break this.
- Max content width is `max-w-[1400px]` centered in `<main>`.
- Loading states must use `WaterFillLoader` — do not use spinners or skeletons for primary loads.

---

### 3. B2B Intelligence Agent
**Scope:** HubSpot CRM — contacts, companies, deals, pipeline data, B2B insights.

**Key files:**
- `supabase/functions/hubspot-contacts/` — CRM contact data
- `supabase/functions/hubspot-data/` — email + marketing data (also used by Email Agent)
- `src/components/HubSpotCRMTab.tsx` — CRM tab UI
- `src/components/ContactCharts.tsx` — CRM chart components

**Rules:**
- Only available for brands where `hasHubSpot: true` and `hubspotBusinessUnitId` is defined.
- Business unit IDs in `brands.ts` scope all HubSpot API calls — always pass `hubspotBusinessUnitId`.
- Brands with HubSpot: ABG Hospitality, Accessible Home Store, Aker, Aquarius, Aquatic, Bootz, Clarion, Comfort Designs, DreamLine, Florestone, Hamilton, IMI, Laurel Mountain, MAAX, Maidstone, Neptune, RBS, Swan, Vintage.ca.

---

### 4. Brand Monitoring Agent
**Scope:** Cross-brand health checks, brand-level data availability, completeness scoring, surface gaps.

**Key files:**
- `src/lib/brands.ts` — brand registry with data source flags
- `src/pages/Admin.tsx` — admin view for system-level monitoring
- `supabase/migrations/` — schema definitions for what data is being stored

**Rules:**
- Source of truth for all 45 brands is `brands.ts`. Changes to brand data source availability must be made here.
- Identify brands missing data sources and flag them:
  - No GA4, no GSC, no HubSpot → data-dark brands
  - Has GSC but no GA4 → limited analytics
- Social media brands are hardcoded in `Index.tsx` (`socialMediaBrandNames`); if a brand gains Meta data, add it to that array.

**Full brand list (45 brands as of project state):**
ABG Home Services, ABG Hospitality, Accessible Home Store, Aker, Amazing Shower Door, American Bath Group, American Whirlpool, Aquarius, Aquatic, Bootz, Briggs Bath, Clarion, Coastal Shower Doors, Comfort Designs, DreamLine, Florestone, Hamilton, IMI, Laurel Mountain, MAAX, Maidstone, Neptune, RBS, Swan, Vintage.ca, Vita Spa — plus remaining brands to reach 45 total (verify current count in `brands.ts`).

---

### 5. Email Agent
**Scope:** HubSpot email marketing — campaigns, open rates, click rates, sends, bounces, unsubscribes, preview.

**Key files:**
- `supabase/functions/hubspot-data/` — email campaign metrics
- `supabase/functions/email-preview/` — render email HTML previews
- `src/components/HubSpotTab.tsx` — Emails tab UI (labeled "Emails" in nav)
- `src/components/EmailPreviewModal.tsx` — modal for email HTML preview

**Rules:**
- Tab ID is `hubspot`, label is "Emails" — do not rename without updating both `tabs` array and the page title logic in `Index.tsx:118`.
- Email preview uses a modal (`EmailPreviewModal`) — keep preview rendering sandboxed.
- Always scope by `hubspotBusinessUnitId`.

---

### 6. SEO Agent
**Scope:** GSC search performance — queries, landing pages, position tracking, click-through optimization.

**Key files:**
- `supabase/functions/gsc-data/` — all GSC data
- `src/components/PerformanceTab.tsx` — GSC section within the performance tab

**Rules:**
- GSC site URLs are in `brands.ts` under `gscSiteUrl`. Use exact URL format when calling GSC API (some use `https://`, some `http://`).
- Brands with GSC: ABG Hospitality, Aker, American Bath Group, American Whirlpool, Aquarius, Aquatic, Bootz, Clarion, Coastal Shower Doors, Comfort Designs, DreamLine, Florestone, Hamilton, Laurel Mountain, MAAX, Maidstone, Neptune, RBS, Swan, Vita Spa.
- Position data: lower = better. Always display with context.
- GSC data has a 48–72 hour delay — note this in any freshness indicators.

---

### 7. Social Media Agent
**Scope:** Meta (Facebook/Instagram) — reach, impressions, engagement, follower growth, post performance.

**Key files:**
- `supabase/functions/social-media-data/` — Meta social data
- `src/components/SocialMediaTab.tsx` — Social Media tab UI

**Rules:**
- Social media availability is controlled by the `socialMediaBrandNames` array in `Index.tsx:46-50` — not in `brands.ts`. This is intentional (Meta access is separate from HubSpot/GA4 config).
- Brands with social data: Laurel Mountain, ABG Home Services, Accessible Home Store, American Bath Group, Arizona Shower Door, Bootz, Coastal Shower Doors, DreamLine, MAAX, MAAX Bath, Maidstone, Swan, Mr.Steam, Vintage Tub, Vintage Tub & Bath - Canada.
- Tab disabled state uses `hasSocialMedia` boolean — update `socialMediaBrandNames` when a brand gains Meta access.

---

### 8. Technical Agent
**Scope:** Supabase (schema, RLS, migrations, Edge Functions), auth, build system, testing, performance.

**Key files:**
- `supabase/functions/` — all Edge Functions (Deno runtime)
- `supabase/migrations/` — all schema migrations
- `supabase/config.toml` — Supabase project config
- `vite.config.ts` — build config
- `vitest.config.ts` — unit test config
- `playwright.config.ts` — E2E test config
- `src/integrations/supabase/client.ts` — Supabase client init

**Rules:**
- Edge Functions use Deno — no Node.js APIs. Use `Deno.env.get()` for secrets.
- All external API calls (GA4, GSC, HubSpot, Meta) must go through Edge Functions — never expose API keys to the browser.
- RLS must be enabled on all tables. Every new table needs a migration.
- Run `bun run test` for unit tests, `bun run build` to verify TypeScript compilation.
- The `shared-login` and `invite-user` Edge Functions handle auth flows — treat with care.
- User activity is logged to `user_activity_log` table — do not remove this logging.

**Tech stack versions:**
- React 18.3, TypeScript 5.8, Vite 8, Tailwind 3.4, shadcn/ui (Radix), Recharts 2.15, Supabase JS 2.99, TanStack Query 5.83

---

### 9. Alerts & Deploy Agent
**Scope:** Monitoring, error surfacing, deployment, CI/CD, environment config.

**Key files:**
- `supabase/functions/` — Edge Function health
- `.env` / Supabase dashboard — environment secrets (never commit secrets)
- `package.json` — scripts: `dev`, `build`, `build:dev`, `preview`, `test`, `lint`

**Rules:**
- Production deploys: `bun run build` must pass with zero TypeScript errors before deploy.
- Edge Functions deploy via Supabase CLI: `supabase functions deploy <function-name>`.
- Alert on: TypeScript errors in build, RLS policy violations, missing env vars in Edge Functions, brands with 0 data sources.
- Never use `--no-verify` to skip git hooks.
- Toast notifications use `sonner` (`toast.success`, `toast.error`) — surface errors to users via toasts, not console.

---

## Conventions

### File Organization
```
src/
  components/         # UI components (one per tab + shared)
  components/ui/      # shadcn base components (do not modify)
  lib/brands.ts       # Brand registry — source of truth
  pages/Index.tsx     # Main dashboard + tab routing
  pages/Admin.tsx     # Admin panel
supabase/
  functions/          # Edge Functions (one dir per function)
  migrations/         # SQL migrations (numbered, never edited after merge)
```

### Adding a New Tab
1. Add entry to `tabs` array in `src/pages/Index.tsx` with `id`, `label`, optional `disabled` + `tooltip`.
2. Create `src/components/<Name>Tab.tsx`.
3. Add `{effectiveTab === "<id>" && <NameTab ... />}` to `<main>` in `Index.tsx`.
4. Update the page `<h1>` title logic if the tab needs a custom label (see existing `hubspot`/`hubspot-crm` pattern).

### Adding a New Brand
1. Add entry to `brands` array in `src/lib/brands.ts` with correct flags.
2. If the brand has Meta social data, add its name to `socialMediaBrandNames` in `Index.tsx`.
3. Supabase Edge Functions pick up brand config from the frontend call — no backend changes needed for brand additions.

### Data Fetching Pattern
- Use TanStack Query (`@tanstack/react-query`) for all async data.
- Call Supabase Edge Functions via `supabase.functions.invoke('<function-name>', { body: { ... } })`.
- Pass `brandId`, `dateFrom`, `dateTo` as the standard payload shape.
- Loading state → `WaterFillLoader`. Error state → `toast.error` + fallback UI.

### TypeScript
- Strict mode on — no `any` without justification.
- Brand type is `Brand` from `src/lib/brands.ts` — always pass the full brand object as a prop, not just the ID.
- Date props are always native `Date` objects, not strings.

---

## Important Constraints

- **Never expose API secrets in frontend code.** GA4, GSC, HubSpot, Meta credentials live only in Edge Function environment variables.
- **Never edit shadcn `src/components/ui/` files** unless fixing a genuine bug — update via shadcn CLI if upgrading.
- **Never drop or squash migrations** — append new ones only.
- **Brand data is the contract.** If a brand's `hasGA4`/`hasGSC`/`hasHubSpot` flag is wrong, fix it in `brands.ts`, not by working around it in components.
- **`user_activity_log` must not be removed** — it tracks tab views and brand selections for internal analytics.
