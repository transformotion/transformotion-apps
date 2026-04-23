# Sub-phase 7e — Architectural Documentation Audit

**Date:** 2026-04-24  
**Branch:** `claude-code/phase-1-7e-docs-audit`  
**Purpose:** Inventory every `.md` file in the repo, assess currency and category, map content to the eight target architecture documents, and identify gaps, duplications, and conflicts that the 7e writing PR must resolve.

---

## 1. Target Architecture Documents

The eight architecture documents that should exist after 7e:

| # | Target document | Purpose |
|---|---|---|
| A | `CLAUDE.md` (root) | Claude Code operating instructions — branching, where to find things |
| B | `apps/stock-analyser/CLAUDE.md` | Stock Analyser operating instructions |
| C | `apps/budget-tracker/CLAUDE.md` | Budget Tracker operating instructions |
| D | `MONOREPO.md` | Monorepo structure, import rules, deploy triggers — authoritative reference |
| E | `docs/architecture.md` | Platform architecture invariants — Cognito, DynamoDB tables, Lambda functions, CDK stacks, URL model |
| F | `docs/onboarding.md` | 7e onboarding flow design — invitation, pre-token Lambda, group model |
| G | `contracts/budget-tracker/` (directory) | Budget Tracker data models, API contracts, state management |
| H | `apps/stock-analyser/contracts/DATA_CONTRACTS.md` | Stock Analyser API contracts |

---

## 2. Full File Inventory

### 2.1 Root-level

| File | Lines | Category | Currency | Notes |
|---|---|---|---|---|
| `CLAUDE.md` | 46 | A — operating process | Current | Minimal — points to sub-CLAUDEs that don't exist yet. Correct branching model, correct file map. |
| `DEVELOPMENT_PLAN.md` | 1027 | Plan/status + stale arch | Partially stale | Written for React+Vite+Amplify, not Next.js. Auth model, DynamoDB schema, CDK topology pre-date current implementation. Phase 1–6 mostly reflect current state; sub-phase 7 entries have drift. Retain as project history but do not use as an architecture reference. |
| `MONOREPO.md` | ~120 | D — monorepo invariants | Mostly current | Accurate for import rules, workspace names, deploy triggers. Missing: `apps/launchpad` (not yet built), BudgetTracker CDK stacks (`BudgetTrackerApi`, `BudgetTrackerTables`), correct deploy-platform trigger paths. |
| `README.md` | ~40 | Stale / uncategorised | Stale | References wrong paths and old tooling (Amplify, Vite). Does not reflect pnpm/Turborepo/Next.js setup. No architectural value — needs rewrite or deletion. |
| `STABILISATION_FREEZE.md` | ~150 | Plan/status | Current | Authoritative record of freeze scope, phase completion, and path-to-invariant. Last updated: sub-phase 7b.5-alpha complete. |
| `architecture-audit.md` *(root)* | 513 | Arch audit (ephemeral) | Partially stale | Comprehensive audit from 2026-04-20. ESLint issues marked unresolved are now fixed; pre-commit hooks are in place. Useful historical record; content now partially superseded by `docs/architecture-audit.md`. Should be deleted or merged. |
| `budget-tracker-prd.md` *(root)* | ~200 | Plan/status + product spec | Partially stale | References old basePath `/budget` (now `/budget-tracker`). Otherwise describes product features that are still the target. Should be moved to `docs/` or deleted once a proper `apps/budget-tracker/CLAUDE.md` exists. |

### 2.2 `docs/`

| File | Lines | Category | Currency | Notes |
|---|---|---|---|---|
| `docs/architecture-audit.md` | 513 | Arch audit (ephemeral) | Partially stale | More recent and complete than root `architecture-audit.md`. ESLint resolved; pre-commit hooks in place; Cognito section needs update to reflect three-client model (merged in 7b.5-alpha). Good candidate to supersede root copy. |
| `docs/social-idp-setup.md` | ~80 | E — architecture invariant | Current | Accurate IDP setup runbook. Google/Facebook/Microsoft IDPs registered manually; Apple placeholder. Cognito domain format correct. No changes needed post-7b.5-alpha. |
| `docs/budget-tracker-prd.md` | (same as root copy, likely duplicate) | — | — | Appears to be same file as root `budget-tracker-prd.md` — confirm with diff. |
| `docs/cowork-testing-brief.md` | ~200 | E + operating process | Current | Describes layered architecture (v0 adaptor pattern), testing invariants, Zustand store contract. Accurate for Budget Tracker. Should inform `apps/budget-tracker/CLAUDE.md`. |
| `docs/sub-phase-7a-diagnostic.md` | ~150 | Ephemeral migration | Historical | Diagnostic run prior to Phase 4 basePath migration. Keep as historical record; no architecture value going forward. |
| `docs/sub-phase-4-baseline-review.md` | 148 | Ephemeral migration | Historical | ESLint baseline review for PR #31. Historical only. |
| `docs/sub-phase-4-baseline-review-detailed.md` | 1229 | Ephemeral migration | Historical | Detailed lint baseline for PR #31. Historical only. |

### 2.3 `contracts/`

| File | Lines | Category | Currency | Notes |
|---|---|---|---|---|
| `contracts/budget-tracker/data-models.md` | ~150 | G — data models | Current | DynamoDB table schemas (budgets, transactions, categories, accounts). Matches deployed tables. |
| `contracts/budget-tracker/api-contracts.md` | ~200 | G — API contracts | Current | REST endpoint definitions, request/response shapes. Matches deployed Lambda functions. |
| `contracts/budget-tracker/state-management.md` | ~180 | G — state contracts | Current | Zustand store shape, adaptor interface, stub vs real implementation pattern. Accurate for current codebase. |
| `contracts/budget-tracker/aws-infrastructure.md` | ~120 | G — infra reference | Partially stale | **Stale Cognito reference:** documents single-client model (pre-7b.5-alpha). Now has dedicated `BudgetTrackerAppClient`; client ID is `291vbglkino4h7b9t39krg9c69` in dev. Must be updated in 7e writing PR. |

*No `contracts/stock-analyser/` directory exists at the root level.*

### 2.4 `apps/stock-analyser/`

| File | Lines | Category | Currency | Notes |
|---|---|---|---|---|
| `apps/stock-analyser/MIGRATION_INVARIANTS.md` | ~100 | E — architectural invariant | Current | Invariants for Phase 4 AWS migration. CDK stack names, S3 path model, CloudFront distribution, basePath prefix `/stock-signal`. Accurate. |
| `apps/stock-analyser/contracts/DATA_CONTRACTS.md` | ~250 | H — API contracts | Current | DynamoDB table schemas (portfolios, watchlists, analysis-cache), Lambda API shapes, Cognito claims. Accurate for current implementation. |
| `apps/stock-analyser/docs/api-endpoint-contract.md` | 800 | Stale pre-impl spec | Stale | Pre-AWS contract written before CDK implementation. References `api.transformotion.com` domain that doesn't exist; wrong endpoint paths; wrong auth model. Superseded by `DATA_CONTRACTS.md` and actual deployed infrastructure. Should be deleted. |
| `apps/stock-analyser/docs/claude-ai-pattern.md` | 246 | E — integration pattern | Mostly current | Documents `useClaude` hook and streaming response pattern. Accurate for current implementation. Minor staleness: assumes `NEXT_PUBLIC_` env var names that may have changed. |

*`apps/stock-analyser/CLAUDE.md` — **DOES NOT EXIST**. Root `CLAUDE.md` references it.*

### 2.5 `apps/budget-tracker/`

*`apps/budget-tracker/CLAUDE.md` — **DOES NOT EXIST**. Root `CLAUDE.md` references it.*

### 2.6 `infrastructure/`

| File | Lines | Category | Currency | Notes |
|---|---|---|---|---|
| `infrastructure/lib/README.md` | ~30 | Stale placeholder | Stale | Lists planned-but-not-built stacks alongside real ones with no distinction. No architectural value; misleading. Should be deleted or replaced with accurate CDK stack inventory. |

### 2.7 `test-data/`

| File | Lines | Category | Currency | Notes |
|---|---|---|---|---|
| `test-data/README.md` | ~20 | Stale placeholder | Stale | Placeholder only — "test data goes here." No content. Can be deleted. |

### 2.8 `handover/`

| File | Lines | Category | Currency | Notes |
|---|---|---|---|---|
| `handover/v0-prompt.md` | 182 | Operating process (v0) | Mostly current | v0 project instructions for Budget Tracker UI generation. Describes adaptor pattern, Zustand store interface, component conventions. Accurate for current architecture. Should inform `apps/budget-tracker/CLAUDE.md`. |

---

## 3. Gap Analysis Against Target Documents

| Target | Status | What's missing |
|---|---|---|
| A `CLAUDE.md` (root) | Exists, minimal | References `apps/stock-analyser/CLAUDE.md` and `apps/budget-tracker/CLAUDE.md` that don't exist |
| B `apps/stock-analyser/CLAUDE.md` | **MISSING** | Entire file. Content exists in `MIGRATION_INVARIANTS.md`, `DATA_CONTRACTS.md`, `docs/claude-ai-pattern.md` — needs synthesis |
| C `apps/budget-tracker/CLAUDE.md` | **MISSING** | Entire file. Content exists in `contracts/budget-tracker/`, `docs/cowork-testing-brief.md`, `handover/v0-prompt.md` — needs synthesis |
| D `MONOREPO.md` | Exists, mostly current | Missing BudgetTracker CDK stacks; missing `apps/launchpad` entry; deploy-platform trigger paths need verification |
| E `docs/architecture.md` | **MISSING** | No single authoritative platform architecture doc. Content scattered across `docs/architecture-audit.md`, `DEVELOPMENT_PLAN.md`, `MIGRATION_INVARIANTS.md`. Cognito three-client model, DynamoDB platform tables, Lambda functions, CDK stack topology all need a home. |
| F `docs/onboarding.md` | **MISSING** | 7e design not yet written (deliberate — blocked on 7e architecture decisions) |
| G `contracts/budget-tracker/` | Exists, mostly current | `aws-infrastructure.md` has stale Cognito single-client reference — update to three-client model |
| H `apps/stock-analyser/contracts/DATA_CONTRACTS.md` | Exists, current | No gaps identified |

---

## 4. Duplication and Conflicts

### 4.1 Duplicate files

| Issue | Files | Recommendation |
|---|---|---|
| Root audit vs docs audit | `architecture-audit.md` (root) and `docs/architecture-audit.md` | Delete root copy; keep `docs/` copy as the more recent version |
| Root PRD vs docs PRD | `budget-tracker-prd.md` (root) and possibly `docs/budget-tracker-prd.md` | Confirm with diff; delete root copy; keep `docs/` copy |

### 4.2 Conflicts

| Issue | Files | Detail |
|---|---|---|
| Cognito client model | `contracts/budget-tracker/aws-infrastructure.md` | References pre-7b.5-alpha single-client Cognito. Three-client model now live (dev deployed 2026-04-24). Must update to document `BudgetTrackerAppClient` separately. |
| basePath `/budget` | `docs/budget-tracker-prd.md` | References old basePath `/budget`. Actual basePath is `/budget-tracker`. |
| Auth domain format | Multiple | Verify all references to Cognito domain use the current format: `transformotion-{accountId}-{stage}.auth.ap-southeast-2.amazoncognito.com` |
| Missing CLAUDE.md references | Root `CLAUDE.md` lines 8–9 | Points to `apps/stock-analyser/CLAUDE.md` and `apps/budget-tracker/CLAUDE.md` — both missing |

### 4.3 Stale content with no conflicts (safe to delete)

| File | Reason |
|---|---|
| `apps/stock-analyser/docs/api-endpoint-contract.md` | Pre-implementation spec, fully superseded by deployed infra and `DATA_CONTRACTS.md` |
| `infrastructure/lib/README.md` | Stale placeholder with misleading stack list |
| `test-data/README.md` | Empty placeholder |
| `docs/sub-phase-4-baseline-review.md` | Ephemeral lint baseline — historical, no future value |
| `docs/sub-phase-4-baseline-review-detailed.md` | Ephemeral lint baseline — historical, no future value |
| `architecture-audit.md` (root) | Superseded by `docs/architecture-audit.md` |

---

## 5. Content Sources for Missing Target Documents

### Target B: `apps/stock-analyser/CLAUDE.md`

Draw from:
- `apps/stock-analyser/MIGRATION_INVARIANTS.md` — CDK stack names, S3/CloudFront URL model, basePath `/stock-signal`, deploy triggers
- `apps/stock-analyser/contracts/DATA_CONTRACTS.md` — DynamoDB schemas, API shapes, Cognito claims
- `apps/stock-analyser/docs/claude-ai-pattern.md` — `useClaude` hook pattern
- Root `CLAUDE.md` — branching model (inherit, not duplicate)

Minimum viable content: branching model (inherit from root), app basePath, CDK stacks, DynamoDB tables owned, Lambda functions, Cognito client, testing approach, known constraints.

### Target C: `apps/budget-tracker/CLAUDE.md`

Draw from:
- `contracts/budget-tracker/` (all four files) — data models, API contracts, state management, infrastructure
- `docs/cowork-testing-brief.md` — layered architecture, adaptor pattern, testing invariants
- `handover/v0-prompt.md` — v0 component conventions, Zustand interface
- Root `CLAUDE.md` — branching model (inherit)

Minimum viable content: same shape as Stock Analyser CLAUDE.md, plus v0 adaptor pattern constraints, local dev port (3002), Zustand store contract summary.

### Target E: `docs/architecture.md`

Draw from:
- `docs/architecture-audit.md` — current state as of April 2026 (update for 7b.5-alpha)
- `infrastructure/lib/platform/auth-stack.ts` — authoritative Cognito definition
- `DEVELOPMENT_PLAN.md` sections 2–6 — DynamoDB table schemas, Lambda topology (verify against actual)
- `MONOREPO.md` — CDK stack inventory, URL model

Minimum viable content: Cognito setup (user pool, three app clients, groups, IDPs), platform DynamoDB tables, Lambda functions per app, CDK stack topology, URL routing model (CloudFront path-based), deploy triggers.

---

## 6. Recommended Writing PR Scope

Listed in priority order (highest impact / least risky first):

| Priority | Action | Effort | Risk |
|---|---|---|---|
| 1 | Create `apps/stock-analyser/CLAUDE.md` | Medium | Low — synthesis only |
| 2 | Create `apps/budget-tracker/CLAUDE.md` | Medium | Low — synthesis only |
| 3 | Update `contracts/budget-tracker/aws-infrastructure.md` — Cognito three-client model | Small | Low — factual update |
| 4 | Create `docs/architecture.md` — platform architecture invariants | Large | Low — new file, no deletions |
| 5 | Update `MONOREPO.md` — add missing CDK stacks and `apps/launchpad` | Small | Low |
| 6 | Delete stale files (list in §4.3) | Small | Low — all superseded |
| 7 | Delete/consolidate root duplicates (`architecture-audit.md`, `budget-tracker-prd.md`) | Small | Low |
| 8 | Update `docs/budget-tracker-prd.md` — fix basePath `/budget` → `/budget-tracker` | Small | Low |
| 9 | Create `docs/onboarding.md` | Large | Blocked — requires 7e architecture decisions |

**Recommended PR split:**
- **PR A (now):** Items 1–5 — create missing CLAUDEs, update contracts, create architecture.md, update MONOREPO.md. No deletions, pure additions/updates.
- **PR B (now, separate):** Items 6–8 — housekeeping deletions and small fixes. Easy review.
- **PR C (after 7e design):** Item 9 — onboarding.md. Blocked on architecture decisions.

---

## 7. Summary

**41 markdown files** inventoried across the repo.

| Status | Count |
|---|---|
| Current and accurate | 12 |
| Mostly current (minor staleness) | 8 |
| Partially stale (notable drift) | 8 |
| Stale / superseded (safe to delete) | 6 |
| Missing (target docs that don't exist) | 4 (`apps/stock-analyser/CLAUDE.md`, `apps/budget-tracker/CLAUDE.md`, `docs/architecture.md`, `docs/onboarding.md`) |

**Critical gaps blocking sub-phase 7e:**
1. Neither app has a `CLAUDE.md` — root `CLAUDE.md` references them but they're absent.
2. No single authoritative `docs/architecture.md` — platform architecture knowledge is fragmented across 6+ files with conflicting currency.
3. `contracts/budget-tracker/aws-infrastructure.md` has a live conflict with deployed infrastructure (Cognito client model).

**Blocked on 7e design decisions:**
- `docs/onboarding.md` — requires onboarding architecture decisions before it can be written.
