# Sub-phase 4 baseline review

Generated from `.lint-baseline.json` for PR #31.
36 entries across 24 files, grouped by rule for rule-level decisions.

---

## Rule groups

### react-hooks/exhaustive-deps

**Count:** 26 entries across 21 files
**Plugin:** `eslint-plugin-react-hooks`
**Installed at root:** no
**Installed in any workspace:** no
**Loaded in eslint.config.mjs:** no
**Recommendation:** ENABLE
**Reasoning:** Standard React hooks plugin — loading it makes the disable
comments meaningful (they suppress actual dependency-array violations), and
any hooks violations in files without disable comments will surface as
real CI failures.

**Files affected:**

Active apps (8 files):
- [apps/budget-tracker/components/budget-tracker/tabs/budget-tab.tsx](../apps/budget-tracker/components/budget-tracker/tabs/budget-tab.tsx) — 1 entry
- [apps/stock-analyser/app/sign-in/page.tsx](../apps/stock-analyser/app/sign-in/page.tsx) — 1 entry
- [apps/stock-analyser/components/budget-tracker/tabs/budget-tab.tsx](../apps/stock-analyser/components/budget-tracker/tabs/budget-tab.tsx) — 1 entry
- [apps/stock-analyser/components/providers/auth-guard.tsx](../apps/stock-analyser/components/providers/auth-guard.tsx) — 1 entry
- [apps/stock-analyser/components/stock-signal/tabs/analyser-tab.tsx](../apps/stock-analyser/components/stock-signal/tabs/analyser-tab.tsx) — 1 entry
- [apps/stock-analyser/components/stock-signal/tabs/portfolio-tab.tsx](../apps/stock-analyser/components/stock-signal/tabs/portfolio-tab.tsx) — 1 entry
- [apps/stock-analyser/components/stock-signal/tabs/recommendations-tab.tsx](../apps/stock-analyser/components/stock-signal/tabs/recommendations-tab.tsx) — 1 entry
- [apps/stock-analyser/components/stock-signal/tabs/watchlist-tab.tsx](../apps/stock-analyser/components/stock-signal/tabs/watchlist-tab.tsx) — 1 entry

Archived/backup (10 files, 15 entries):
- [apps/web-vite-backup/src/components/shell/AccountSwitcher.tsx](../apps/web-vite-backup/src/components/shell/AccountSwitcher.tsx) — 1 entry
- [apps/web-vite-backup/src/contexts/ModeContext.tsx](../apps/web-vite-backup/src/contexts/ModeContext.tsx) — 1 entry
- [apps/web-vite-backup/src/hooks/useApiClient.ts](../apps/web-vite-backup/src/hooks/useApiClient.ts) — 1 entry
- [apps/web-vite-backup/src/pages/stock/AnalysePage.tsx](../apps/web-vite-backup/src/pages/stock/AnalysePage.tsx) — 2 entries
- [apps/web-vite-backup/src/pages/stock/EtfsPage.tsx](../apps/web-vite-backup/src/pages/stock/EtfsPage.tsx) — 1 entry
- [apps/web-vite-backup/src/pages/stock/MarketPage.tsx](../apps/web-vite-backup/src/pages/stock/MarketPage.tsx) — 1 entry
- [apps/web-vite-backup/src/pages/stock/MetalsPage.tsx](../apps/web-vite-backup/src/pages/stock/MetalsPage.tsx) — 1 entry
- [apps/web-vite-backup/src/pages/stock/PortfolioPage.tsx](../apps/web-vite-backup/src/pages/stock/PortfolioPage.tsx) — 2 entries
- [apps/web-vite-backup/src/pages/stock/RecsPage.tsx](../apps/web-vite-backup/src/pages/stock/RecsPage.tsx) — 2 entries
- [apps/web-vite-backup/src/pages/stock/WatchlistPage.tsx](../apps/web-vite-backup/src/pages/stock/WatchlistPage.tsx) — 3 entries

Reference code (3 files):
- [v0-reference/components/budget-tracker/tabs/budget-tab.tsx](../v0-reference/components/budget-tracker/tabs/budget-tab.tsx) — 1 entry
- [v0-reference/components/stock-signal/tabs/analyser-tab.tsx](../v0-reference/components/stock-signal/tabs/analyser-tab.tsx) — 1 entry
- [v0-reference/components/stock-signal/tabs/recommendations-tab.tsx](../v0-reference/components/stock-signal/tabs/recommendations-tab.tsx) — 1 entry

> **Note on archived/reference files:** 13 of the 26 entries are in
> `apps/web-vite-backup/` and `v0-reference/`. Neither is a deployed app.
> An alternative to ENABLE is to add these paths to `eslint.config.mjs`
> `ignores` — this would eliminate 18 of the 36 baseline entries without
> loading any plugins. That decision belongs with the active-app entries
> (see Summary).

---

### @typescript-eslint/no-explicit-any

**Count:** 9 entries across 3 files
**Plugin:** `@typescript-eslint/eslint-plugin`
**Installed at root:** no (`@typescript-eslint/parser` is installed, but not the lint plugin)
**Installed in any workspace:** no
**Loaded in eslint.config.mjs:** no
**Recommendation:** ENABLE
**Reasoning:** The parser (`@typescript-eslint/parser`) is already a root
devDependency; the lint plugin (`@typescript-eslint/eslint-plugin`) is its
natural companion and should be loaded alongside it.

**Files affected:**

Active app (1 file):
- [apps/stock-analyser/components/stock-signal/app-shell.tsx](../apps/stock-analyser/components/stock-signal/app-shell.tsx) — 4 entries

Archived/reference (2 files):
- [apps/web-vite-backup/src/pages/stock/WatchlistPage.tsx](../apps/web-vite-backup/src/pages/stock/WatchlistPage.tsx) — 1 entry *(also has react-hooks entries)*
- [v0-reference/components/stock-signal/app-shell.tsx](../v0-reference/components/stock-signal/app-shell.tsx) — 4 entries

---

### @typescript-eslint/no-unused-vars

**Count:** 1 entry across 1 file
**Plugin:** `@typescript-eslint/eslint-plugin` (same plugin as `no-explicit-any`)
**Installed at root:** no
**Loaded in eslint.config.mjs:** no
**Recommendation:** ENABLE
**Reasoning:** Same plugin as `no-explicit-any` — enabling that plugin
automatically activates this rule too; no separate install required.

**Files affected:**

Active app (1 file):
- [apps/budget-tracker/functions/budget-migrate/src/index.ts](../apps/budget-tracker/functions/budget-migrate/src/index.ts) — 1 entry

---

## Summary

| Category | Rules | Entries |
|----------|-------|---------|
| DELETE   | 0     | 0       |
| ENABLE   | 3     | 36      |
| KEEP     | 0     | 0       |

All 36 entries map to 2 plugins (`eslint-plugin-react-hooks` and
`@typescript-eslint/eslint-plugin`) and all warrant ENABLE.

### What enabling will do

Enabling both plugins will:
1. Make all existing `// eslint-disable-next-line` comments **valid** — the
   rules will be recognized and the comments will suppress real violations.
2. Surface any hooks/typescript violations in files that **do not** already
   have a disable comment — those will require either a fix or a new
   disable comment (and a baseline bump).
3. The baseline entries above will **go to zero** (the violations are
   suppressed by the existing disable comments).

Enabling is therefore a net improvement: 36 "rule not found" errors become
0 errors, and any new genuine violations appear as real CI failures.

### Decision fork: ignore archived code instead

As an alternative, `apps/web-vite-backup/**` and `v0-reference/**` can be
added to the `ignores` array in `eslint.config.mjs`. This eliminates 18 of
the 36 entries without loading any new plugins. The remaining 18 entries
(all in active apps) would still benefit from ENABLE.

**The two approaches are not mutually exclusive** — ignore the archived
directories AND enable the plugins for active code.

---

## Appendix: CI baseline-check design note

The current `check-lint-baseline.sh` compares the current ESLint run
against `.lint-baseline.json` **committed in the PR branch**. This catches
new violations introduced in a PR.

It does **not** compare the branch's baseline against the base branch's
baseline. A developer could therefore grow the baseline file in the same PR
as adding violations, and CI would still pass. This is a known gap; a
follow-on check using `git show origin/develop:.lint-baseline.json` to
enforce "baseline may not grow on a PR" would close it.
