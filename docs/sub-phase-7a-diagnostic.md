# Sub-phase 7a diagnostic — Budget Tracker consolidation

Generated 2026-04-22. Read-only investigation. No code changes.

> **Post-diagnostic note (added 2026-04-22):** The `apps/launchpad` workspace referenced throughout this
> document was renamed to `apps/launchpad` via PR #39. The content and findings of this diagnostic
> remain accurate; only the path prefix changed.

---

## Executive summary

The biggest surprise in this diagnostic is that the path-based URL model described as a *target* state is
already deployed in production. `dev.apps.transformotion.com.au/stock-signal/`,
`/budget-tracker/`, `/launchpad/`, and `/sign-in/` all exist and resolve today — but they are
all routes inside a **single** Next.js application (`apps/stock-analyser`), synced to an S3 bucket root
via `aws s3 sync --delete`. The "consolidation" work is therefore not about changing the URL model; it is
about splitting the production monolith into the two standalone apps (`apps/launchpad` and `apps/budget-tracker`)
that already exist in the repo but are not yet deployed.

The two component trees (`apps/stock-analyser/components/budget-tracker/` and
`apps/budget-tracker/components/budget-tracker/`) have diverged: 7 of 14 shared files differ.
The `apps/budget-tracker` tree is cleaner TypeScript (no `@ts-nocheck`), but the production SA tree
has additional live features (the localStorage→DynamoDB migration UI). Cutover means reconciling these
divergences before deleting the SA copy.

`apps/budget-tracker` builds successfully standalone, but it only has two routes (`/` main app,
`/migrate`). Auth is wired via `window.location.href` to hardcoded prod URLs — no Cognito integration.
The launchpad is still using `MOCK_USER` with no Cognito group checks and no real session.

---

## 1. URL routing reality

### Current architecture

One single S3 bucket (`transformotion-web-dev-959516291617`, `ap-southeast-2`) served by a single
CloudFront distribution (`E1128DYYBLMWYK → dev.apps.transformotion.com.au`).

**S3 object layout (current live dev):**
```
/                          ← root index.html: redirects to /launchpad
/_next/                    ← Next.js static assets (shared JS/CSS chunks)
/404/
/launchpad/index.html
/sign-in/index.html
/stock-signal/index.html
/budget-tracker/index.html
/design-system/index.html
```

All paths above come from **a single `next build` + `aws s3 sync` of `apps/stock-analyser`**.
Timestamps on all objects are `2026-04-22 04:49` — same deploy run.

### How the deploy works today

`deploy-stock-analyser.yml`:
```
aws s3 sync apps/stock-analyser/out s3://transformotion-web-dev-959516291617 --delete
aws cloudfront create-invalidation --distribution-id E1128DYYBLMWYK --paths "/*"
```

The `--delete` flag means every deploy of stock-analyser **replaces the entire bucket contents**.
When `apps/budget-tracker` is deployed independently, this will destroy it unless the sync strategy changes.

### next.config configurations

| App | output | basePath | trailingSlash | ignoreBuildErrors |
|-----|--------|----------|---------------|-------------------|
| apps/stock-analyser | `'export'` | none | `true` | `true` |
| apps/budget-tracker | none (SSR/server) | none | none | `true` |
| apps/launchpad | none (SSR/server) | none | none | `false` |

**Important**: `apps/budget-tracker` is NOT configured for static export. It will require
a server runtime (Vercel, EC2, Lambda@Edge, or conversion to `output: 'export'`).

### CloudFront distribution

- Single distribution: `E1128DYYBLMWYK`
- Custom domain: `dev.apps.transformotion.com.au`
- Origin: `transformotion-web-dev-959516291617.s3.ap-southeast-2.amazonaws.com`
- Single default behaviour — no path-specific behaviours (no `/budget-tracker/*` → different origin)
- 403/404 SPA fallback to `index.html` — required because Next.js static export doesn't serve
  sub-paths directly without this

```
Current (logical model):
  dev.apps.transformotion.com.au
    └── CloudFront E1128DYYBLMWYK
          └── S3 bucket root (apps/stock-analyser/out)
                ├── /launchpad/       ← route in apps/stock-analyser
                ├── /sign-in/         ← route in apps/stock-analyser
                ├── /stock-signal/    ← route in apps/stock-analyser
                ├── /budget-tracker/  ← route in apps/stock-analyser
                └── /design-system/   ← route in apps/stock-analyser

Target (after consolidation):
  dev.apps.transformotion.com.au
    └── CloudFront E1128DYYBLMWYK
          └── S3 bucket root (multi-app)
                ├── /                 ← apps/launchpad (launchpad + sign-in)
                ├── /launchpad/       ← apps/launchpad
                ├── /sign-in/         ← apps/launchpad
                ├── /stock-signal/    ← apps/stock-analyser (basePath='/stock-signal')
                └── /budget-tracker/  ← apps/budget-tracker (basePath='/budget-tracker')
```

### Key S3 deploy strategy change required

Each app must sync only **its own path prefix**. The current `--delete` on the whole bucket
must be scoped:
```bash
# stock-analyser: sync only /stock-signal/ prefix
aws s3 sync apps/stock-analyser/out/stock-signal \
  s3://transformotion-web-dev-959516291617/stock-signal --delete

# budget-tracker: sync only /budget-tracker/ prefix
aws s3 sync apps/budget-tracker/out/budget-tracker \
  s3://transformotion-web-dev-959516291617/budget-tracker --delete

# web (launchpad): sync root, but list prefixes to exclude
# ... or use a separate CloudFront origin path behaviour
```

---

## 2. apps/budget-tracker buildability

### Structure
```
apps/budget-tracker/
  app/
    layout.tsx
    globals.css
    page.tsx         ← renders <BudgetTrackerApp /> (main UI, all tabs)
    migrate/
      page.tsx       ← localStorage export/import tool (standalone, no real API calls)
  components/budget-tracker/   ← 14-file component tree (see §6)
  functions/         ← 6 Lambda functions (deployed via CDK)
  hooks/
  lib/
  stores/
  contracts/
  next.config.mjs    ← typescript.ignoreBuildErrors: true, no output:'export'
  package.json       ← name: @transformotion/budget (note: not "budget-tracker")
```

### Build result

```
pnpm build (in apps/budget-tracker) — SUCCESS in ~5s

Routes generated:
  ○ /        (static)
  ○ /migrate (static)
```

Build succeeds. TypeScript errors ignored (`ignoreBuildErrors: true`). 

**Critical gaps:**
1. Only 2 routes. No auth pages (`/sign-in`, `/callback`, etc.) — auth flow is `window.location.href`
   to hardcoded prod URLs (`https://apps.transformotion.com.au`) in `app/page.tsx`.
2. Not configured for static export (`output: 'export'` missing). Currently uses Next.js server
   rendering — can't be synced to S3 as-is.
3. No `NEXT_PUBLIC_API_URL` or `NEXT_PUBLIC_BUDGET_API_URL` wiring in the build.

### Package name mismatch

`package.json` declares `"name": "@transformotion/budget"` — not `@transformotion/budget-tracker`.
The pnpm workspace includes `apps/*` so it IS picked up. The CDK stack paths reference
`apps/budget-tracker/functions/...` (correct). But the `apps/budget-tracker` app has no
`deploy` workflow step that builds it.

---

## 3. Deploy workflow state

### deploy-budget-tracker.yml — current state

Triggers on:
- Push to `develop` or `main` when `apps/budget-tracker/**` or `infrastructure/lib/budget-tracker/**` change
- `workflow_dispatch`

What it does:
1. Checks required env vars via `check-required-env-vars.sh`
2. Prints: `"Budget Tracker deployment workflow — not yet active. Add deploy steps when app scaffolding is complete."`

**No build. No S3 sync. No CloudFront invalidation. No CDK deploy.**

The job is named `"Budget Tracker (not yet deployed)"` and runs under `environment: dev`.
It has env vars declared at job level (matches Phase 1 sub-phase 2c structure) but does nothing
with them.

### Differences vs deploy-stock-analyser.yml (template to match)

| Feature | stock-analyser | budget-tracker (needed) |
|---------|---------------|------------------------|
| CDK deploy step | ✓ StockAnalyserApi | ✗ missing (BudgetTrackerApi) |
| pnpm install | ✓ | ✗ missing |
| Node + pnpm setup | ✓ | ✗ missing |
| AWS OIDC credential step | ✓ | ✗ missing |
| `pnpm build` in app dir | ✓ | ✗ missing |
| `aws s3 sync ... --delete` | ✓ (full bucket) | ✗ needs path-scoped sync |
| CloudFront invalidation | ✓ `/*` | ✗ needs `/budget-tracker/*` |
| Verify deployment step | ✓ | ✗ missing |
| `NEXT_PUBLIC_BUDGET_TRACKER_APP_URL` | n/a | already commented in workflow |
| `output: 'export'` in next.config | ✓ | ✗ missing — must add |

Additionally, `apps/budget-tracker` must add `basePath: '/budget-tracker'` and
`output: 'export'` to `next.config.mjs` before it can be deployed to S3.

---

## 4. Budget Tracker CDK stacks

### Tables (BudgetTrackerTablesStack)

| Table | PK | SK | GSI |
|-------|----|----|-----|
| `budget-tracker.accounts-dev` | accountId | — | — |
| `budget-tracker.transactions-dev` | accountId | transactionId | accountId-dateIso-index |
| `budget-tracker.rules-dev` | accountId | ruleId | — |
| `budget-tracker.settings-dev` | accountId | settingKey | — |

Also creates a Cognito app client `budget-tracker-dev` with OAuth callbacks to:
- `http://localhost:3002`
- `http://localhost:3002/callback`
- `https://dev.apps.transformotion.com.au/budget` ← still using old `/budget` path, not `/budget-tracker`
- `https://dev.apps.transformotion.com.au/budget/callback`

**Mismatch**: CDK Cognito callback URLs use `/budget` but the deployed path is `/budget-tracker`.
These will need to be updated.

### Lambda functions (BudgetTrackerApiStack)

| Function | Entry | Timeout | Memory |
|----------|-------|---------|--------|
| `budget-transactions-handler-dev` | budget-transactions/src/index.ts | 30s | 512MB |
| `budget-rules-handler-dev` | budget-rules/src/index.ts | 15s | 256MB |
| `budget-settings-handler-dev` | budget-settings/src/index.ts | 15s | 256MB |
| `budget-ai-handler-dev` | budget-ai/src/index.ts | 300s | 512MB |
| `budget-export-handler-dev` | budget-export/src/index.ts | 30s | 256MB |
| `budget-migrate-handler-dev` | budget-migrate/src/index.ts | 120s | 512MB |

All use `NODEJS_20_X` runtime with bundled esbuild (no Docker).

### API Gateway

Budget Tracker has its **own** REST API Gateway:
- Name: `budget-tracker-api-dev`
- ID: `3ndfaitweb`
- Base path: `/api/budget/v1`
- Routes: GET/POST/PATCH/DELETE for transactions, rules, settings; POST for AI (categorise/review/csv-analysis); GET for business-export; POST for migrate-from-localstorage

This is separate from the platform gateway (`transformotion-api-dev`, ID: `yqtrjzrnp3`).

**CORS**: `allowOrigins: Cors.ALL_ORIGINS` — permissive, fine for dev.

Authoriser: `CognitoUserPoolsAuthorizer` using the same user pool as the platform, named
`budget-tracker-jwt-dev`. Results cache 5 minutes.

---

## 5. API Gateway circular dependency

### What happened

Commit `fdc1536` (2026-04-20, Steve Moodie) split Budget Tracker off the platform gateway:

> "Removes cross-stack construct references (api, authoriser, apiResource) that caused a CDK
> DependencyCycle between TransformotionDev-Api and TransformotionDev-BudgetTrackerApi."

### The structural cause

Before the fix, `BudgetTrackerApiStack` accepted three L2 construct props:
```typescript
api: apigateway.RestApi;        // from PlatformApiStack
authoriser: apigateway.CognitoUserPoolsAuthorizer;  // from PlatformApiStack
apiResource: apigateway.Resource;  // the /api resource from PlatformApiStack
```

CDK cross-stack L2 construct references force a CloudFormation dependency between stacks.
`BudgetTrackerApiStack` depended on `PlatformApiStack`. If `PlatformApiStack` also referenced
any construct from `BudgetTrackerApiStack` (e.g., through exported Lambda ARNs, table ARNs,
or SSM parameters consumed back), CDK detected a cycle and refused to synth.

The `PlatformApiStack` may have been importing BudgetTracker Lambda ARNs or table names for
some integration — or the Lambda permission grants (`txTable.grantReadWriteData(fn)`) across
stacks created the cycle. The fix was to stop passing L2 constructs across stacks entirely and
give Budget Tracker its own fully self-contained API Gateway.

### How to reverse it (sub-phase 7f)

Option 1 (preferred): Pass only **string outputs** (ARNs, IDs) across stacks via SSM Parameter Store or
CfnOutput + Fn.importValue, then reconstruct L1/L2 constructs in the consuming stack:
```typescript
// In PlatformApiStack:
const apiId = new cdk.CfnOutput(this, 'ApiId', { value: this.api.restApiId });

// In BudgetTrackerApiStack:
const api = apigateway.RestApi.fromRestApiAttributes(this, 'SharedApi', {
  restApiId: cdk.Fn.importValue('Transformotion-dev-ApiId'),
  rootResourceId: cdk.Fn.importValue('Transformotion-dev-ApiRootResourceId'),
});
```

Option 2: Merge `BudgetTrackerApiStack` into `PlatformApiStack` (single stack, no cross-stack issue).
Simpler but makes the platform stack larger.

Option 3: Keep the separate gateway (current state) but route at CloudFront using path behaviours,
so clients hit one URL regardless of which API Gateway is behind it. This avoids CDK refactoring
but adds CloudFront complexity.

---

## 6. Duplicate component tree reconciliation

### File counts

Both trees have **14 files** with identical names. No files exist in one tree but not the other.

### Files that differ (7 of 14)

| File | SA version | BT version | Assessment |
|------|-----------|-----------|------------|
| `app-shell.tsx` | `updateTransaction/deleteTransaction(id: number)` | `(id: string)` | **BT is newer** — string UUID IDs are correct; SA uses legacy integer IDs |
| `data/builtin-rules.ts` | differs | differs | Need per-file diff to categorise |
| `data/types.ts` | differs | differs | Likely reflects id-type change (number → string) |
| `tabs/budget-tab.tsx` | `@ts-nocheck`, arrow function `getBudgetAmount` | No `@ts-nocheck`, `function` declaration | **BT is newer** — clean TypeScript, functions not arrows |
| `tabs/review-tab.tsx` | differs | differs | Need per-file diff |
| `tabs/rules-tab.tsx` | `@ts-nocheck`, `builtinRule.pattern` (string) | No `@ts-nocheck`, `builtinRule.pattern.source` | **SA has bug fix** — `pattern.source` converts RegExp to string; BT version would fail at runtime if `pattern` is a RegExp object |
| `tabs/transactions-tab.tsx` | `@ts-nocheck`, has `EmptyStateWithMigration` + `getBudgetApiClient` | No `@ts-nocheck`, no `EmptyStateWithMigration` | **SA has live feature** BT does not; but SA uses `@ts-nocheck` |

### @ts-nocheck summary

| File | SA tree | BT tree |
|------|---------|---------|
| tabs/budget-tab.tsx | ✓ `@ts-nocheck` | ✗ clean |
| tabs/rules-tab.tsx | ✓ `@ts-nocheck` | ✗ clean |
| tabs/transactions-tab.tsx | ✓ `@ts-nocheck` | ✗ clean |
| lib/examples/budget-tracker-usage.tsx | ✓ `@ts-nocheck` (orphan) | n/a |

The 4th `@ts-nocheck` file is the orphaned scaffold in SA (§10 below), not in either component tree.

### Cutover strategy implication

The BT tree is the intended canonical home. Before deleting the SA copy:
- The `rules-tab.tsx` `pattern.source` fix in SA must be ported to BT
- The `EmptyStateWithMigration` component from SA's `transactions-tab` must be ported to BT
  (or replaced by the standalone `/migrate` route already in `apps/budget-tracker/app/migrate/`)
- The `id: number` → `id: string` migration in `app-shell.tsx` must be confirmed correct end-to-end
- TypeScript must be fixed in BT's `budget-tab.tsx`, `rules-tab.tsx`, `transactions-tab.tsx`
  (currently passing only because `ignoreBuildErrors: true`)

---

## 7. Launchpad tile mechanism

### How tiles work

Tiles are hardcoded in `apps/launchpad/components/launchpad/launchpad.tsx` as a `const APPS: App[]` array:

```typescript
const APPS: App[] = [
  { id: 'stock-signal', name: 'Stock Signal Analyser', available: true, ... },
  { id: 'budget-tracker', name: 'Budget Tracker', available: true, ... },
  { id: 'transformation-framework', ..., available: false },
]
```

Navigation uses **full-origin URL redirects** set by environment variables in `apps/launchpad/app/launchpad/page.tsx`:
```typescript
const BUDGET_TRACKER_URL = process.env.NEXT_PUBLIC_BUDGET_URL ?? 'http://localhost:3002'
const STOCK_SIGNAL_URL   = process.env.NEXT_PUBLIC_STOCK_URL  ?? 'http://localhost:3000'
```

When Budget Tracker shares the same CloudFront origin, these should become path-relative URLs
(`/budget-tracker/`, `/stock-signal/`) rather than full origin URLs. The env vars
`NEXT_PUBLIC_BUDGET_URL` and `NEXT_PUBLIC_STOCK_URL` are **not currently declared** in
`apps/launchpad/.env.example`.

### Existing authorisation logic (partial)

There IS partial group-based filtering: the `transformation-framework` tile is hidden unless
`userCanAccessFramework` prop is `true`. But the prop is always passed as `false`:
```typescript
<AppGrid apps={APPS} userCanAccessFramework={false} ... />
```

So the filter exists but is hardwired off. The framework tile shows with "Coming Soon" badge regardless.

### User state

Uses `MOCK_USER` (hardcoded: `name: 'Steve Moodie'`, `email: 'steve@example.com'`). No real
Cognito session loaded. The `ProfileMenu` lets you switch between mock accounts but doesn't persist.

### packages/auth-client gap

`packages/auth-client/src/index.ts` defines `AuthService` with no `getGroups()` method.
The `AuthSession` interface has `user: User` and `tokens: AuthTokens` — no Cognito groups exposed.
To implement group-based tile hiding, `getGroups(): Promise<string[]>` or a `groups` field on
`AuthSession` would need to be added. Groups live in the Cognito ID token as the
`cognito:groups` claim.

### Target vs current gap

| Target behaviour | Current state |
|-----------------|--------------|
| Hide tile if user lacks group membership | No group check — tiles always shown based on `available` flag |
| Real Cognito session | `MOCK_USER` hardcoded |
| Path-relative navigation | Full-origin env var URLs |
| apps/launchpad deployed standalone | Not deployed; served from apps/stock-analyser as `/launchpad/` route |

---

## 8. Data migration flow state

### Lambda (budget-migrate-handler)

**Endpoint**: `POST /api/budget/v1/migrate-from-localstorage`

**Request body**:
```typescript
{
  transactions: Omit<Transaction, 'accountId'>[];
  rules:        Omit<CustomRule, 'accountId'>[];
  settings:     Partial<BudgetSettings>;
}
```

**Auth**: `withAuth` middleware + `requireGroup(auth, 'budget-app', 'admin')`.

**Idempotency**: Per-item dedup via natural keys (`date|amount|description|file` for transactions,
`match|category|subcategory` for rules). Settings are unconditional `PutItem` — overwrite on re-run.

**Error handling**: All-or-nothing semantics within `batchWrite` (DynamoDB batch write, 25-item chunks).
No partial-success response. If DynamoDB throws, entire Lambda errors.

**Data transformations applied**:
1. `_ignore` category → `Financial & Insurance / Transfer`
2. `projectBudgets["Financial & Insurance"]` → `projectBudgets["New Car"]`
3. `_legacyId` (integer) stripped; new UUID `transactionId` assigned

### Browser-side flow (in apps/stock-analyser, production)

`apps/stock-analyser/components/budget-tracker/tabs/transactions-tab.tsx` contains
`EmptyStateWithMigration` component:
1. Checks if `localStorage.getItem('budget-tracker-transactions')` has data
2. If yes, shows "Migrate from local storage" button
3. On click: reads `budget-tracker-transactions` and `budget-tracker-settings` from localStorage
4. POSTs to `/migrate-from-localstorage` via `getBudgetApiClient`
5. Shows result count and reloads

There is NO rules migration in the browser component (sends `rules: []` hardcoded).
Settings key used: `budget-tracker-settings` only — not `budget-tracker-custom-rules`,
`budget-tracker-builtin-rules`, `budget-tracker-transaction-filters`.

`apps/budget-tracker` has a SEPARATE standalone `/migrate` page
(`apps/budget-tracker/app/migrate/page.tsx`) that reads from all 5 localStorage keys and provides
export/import of a JSON bundle — but this is localStorage-to-localStorage only, NOT a cloud migration.
The two pages solve different problems.

### Why localStorage

localStorage was the original persistence layer. The migration flow is a one-time operation to
move historical data to DynamoDB when a user first accesses the cloud-backed version.

### S3 transient upload precedent

No S3 presigned URL patterns found in the codebase. Any implementation of direct-file-upload
flow would be new infrastructure.

### Direct upload feasibility

The Lambda accepts a JSON body. For direct upload:
- Option A (simpler): Keep the current POST body — just send the JSON directly, no localStorage reading needed. The migrate Lambda already handles large payloads within API Gateway's 10MB limit.
- Option B (for large datasets): Pre-signed S3 PUT URL → Lambda triggered by S3 event. More complex, needed only if transaction counts exceed API Gateway limits.
- Option A is preferred — it's a backend-compatible change with a client-side UI change only.

---

## 9. Duplicate getBudgetAmount

### Locations

Both trees have `getBudgetAmount` defined **locally inside `budget-tab.tsx`**, not exported:

| Location | Line | Form |
|----------|------|------|
| `apps/stock-analyser/components/budget-tracker/tabs/budget-tab.tsx` | ~174 | `const getBudgetAmount = (subcategory: string): number => { ... }` |
| `apps/budget-tracker/components/budget-tracker/tabs/budget-tab.tsx` | ~122 | `function getBudgetAmount(subcategory: string): number { ... }` |

Both implementations are **identical in logic**:
```typescript
const override = budgetSettings.budgetOverrides?.[subcategory]
if (override === -1) return 0 // Deleted
if (override !== undefined) return override
return DEFAULT_BUDGETS[subcategory] ?? 0
```

The SA version uses arrow syntax, BT version uses function declaration — same behaviour.

### Assessment

This is **not a bug** — it's file-level duplication that exists only because the trees are
parallel copies. Both `budget-tab.tsx` files call the function locally within their own scope;
there is no cross-file mismatch. The function will consolidate to a single copy once the SA tree
is deleted.

The companion function `getBudgetFrequency` is similarly duplicated, similarly benign.

---

## 10. Orphaned scaffold and coupling points

### apps/stock-analyser/lib/examples/budget-tracker-usage.tsx

- First line: `// @ts-nocheck` (the 4th `@ts-nocheck` file in the codebase)
- Claims to be: "Example: Using the new architecture in Budget Tracker components"
- Shows a before/after pattern for migrating from localStorage+useState to Zustand+repositories
- **Not imported anywhere** — no file references `budget-tracker-usage` in either apps/ or packages/
- Last touched:
  - `789a3db` — "fix: resolve all stock-analyser TypeScript errors for CI" (added `@ts-nocheck`)
  - `26086c8` — "refactor: restructure as pnpm workspace monorepo" (original creation)
- Verdict: dead documentation code. Safe to delete.

### Coupling points from apps/stock-analyser to components/budget-tracker/

Files in `apps/stock-analyser` that import from `components/budget-tracker/`:

1. **`apps/stock-analyser/app/budget-tracker/page.tsx`** — imports `BudgetTrackerApp`
2. **`apps/stock-analyser/tsconfig.json`** — path alias: `"components/budget-tracker"` (line 40)
3. **`apps/stock-analyser/docs/api-endpoint-contract.md`** — documentation references (not runtime)

The live coupling is just one file (`app/budget-tracker/page.tsx`). When the route is deleted from
the SA monolith, remove the import, the tsconfig path alias, and the component tree.

---

## Proposed sub-phase 7 shape

Based on the findings above, recommended execution order:

### 7a — Diagnostic (this document) ✓ complete

### 7b — apps/stock-analyser basePath migration
Add `basePath: '/stock-signal'` and adjust deploy sync to path-scoped upload
(`apps/stock-analyser/out/stock-signal → s3://.../stock-signal`). Stock Analyser moves from
root ownership to `/stock-signal/`. **This is the riskiest change** — it breaks the current prod
URL. Requires CloudFront error-page configuration to serve `/stock-signal/index.html` for 403s
under that path.

### 7c — apps/budget-tracker: add static export + basePath
Add `output: 'export'` and `basePath: '/budget-tracker'` to `next.config.mjs`. Fix TypeScript
(`ignoreBuildErrors: false` or fix the violations). Verify `pnpm build` produces
`out/budget-tracker/index.html`.

### 7d — Component tree reconciliation
Port SA-only features to the BT tree:
- `rules-tab.tsx`: port `builtinRule.pattern.source` fix
- `transactions-tab.tsx`: port `EmptyStateWithMigration` (or replace with link to `/migrate`)
- Remove `@ts-nocheck` and fix TypeScript errors in all 3 BT tabs
- Confirm `id: string` type change in `app-shell.tsx` is correct end-to-end

### 7e — apps/launchpad: real Cognito session + group-based tile hiding
Wire real Cognito auth into `apps/launchpad` launchpad. Add `getGroups()` to `packages/auth-client`.
Change tile navigation from full-origin env-var URLs to path-relative (`/stock-signal/`,
`/budget-tracker/`). Deploy `apps/launchpad` to the S3 root (replacing the launchpad routes that
currently come from apps/stock-analyser).

### 7f — API Gateway rollback (restore Budget Tracker to platform gateway)
Refactor `BudgetTrackerApiStack` to consume the platform API Gateway via string ARN/ID exports
(not L2 construct props). This eliminates the `budget-tracker-api-dev` gateway (`3ndfaitweb`)
and routes Budget Tracker API calls through `transformotion-api-dev` (`yqtrjzrnp3`), matching
all other apps.

### 7g — Budget Tracker deploy pipeline
Wire `deploy-budget-tracker.yml` with real steps: CDK deploy (BudgetTrackerApi only — tables
already exist), `pnpm build`, path-scoped S3 sync, path-scoped CloudFront invalidation
(`/budget-tracker/*`), verify-deploy. Fix Cognito callback URLs in CDK from `/budget` → `/budget-tracker`.

### 7h — Delete SA budget-tracker copy
Remove `apps/stock-analyser/components/budget-tracker/`, `apps/stock-analyser/app/budget-tracker/`,
`apps/stock-analyser/lib/examples/budget-tracker-usage.tsx`. Remove tsconfig path alias.
Delete `apps/stock-analyser/app/launchpad/` and `apps/stock-analyser/app/sign-in/` (now served
by apps/launchpad). Update S3 deploy to not sync launchpad/sign-in/budget-tracker paths.

---

*End of diagnostic. Steve reviews before any code changes begin.*
