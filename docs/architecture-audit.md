# Transformotion Apps — Architecture & Enforcement Discovery Audit

**Audit Date:** 2026-04-20
**Repository:** https://github.com/transformotion/transformotion-apps
**Default Branch:** develop
**AWS Region:** ap-southeast-2

---

## 1. Repository & Project Structure

**Repository Details:**
- **Name:** transformotion-apps
- **Remote URLs:**
  - origin: https://github.com/transformotion/transformotion-apps.git
  - v0-designs: https://github.com/transformotion/transformotion-apps-b8.git
- **Default Branch:** develop

**Monorepo Tool:** pnpm workspaces (v10.33.0) + Turborepo 2.0.0

**Top-level folder structure:**
```
transformotion-apps/
├── apps/
│   ├── stock-analyser/      ← Next.js frontend + Lambda functions
│   ├── budget-tracker/      ← Lambda functions only (UI lives in stock-analyser)
│   └── web/                 ← Platform launchpad (Next.js)
├── functions/               ← Platform-level Lambda handlers
│   ├── accounts/
│   ├── claude-proxy/
│   ├── first-login/
│   ├── forgot-provider/
│   ├── invitations/
│   └── user/
├── infrastructure/          ← AWS CDK (TypeScript)
├── packages/                ← Shared workspace packages
│   ├── api-client/
│   ├── auth-client/
│   ├── budget-domain/
│   ├── cycle-engine/
│   ├── lambda-middleware/
│   └── ui/
├── contracts/               ← Data model docs per app
├── docs/                    ← Architecture/testing briefs
├── migration-artifacts/     ← Export fixtures for testing
└── MONOREPO.md
```

**Project Manifests (package.json paths, excl. node_modules):**
- `./package.json` (root)
- `apps/stock-analyser/package.json`
- `apps/budget-tracker/package.json`
- `apps/launchpad/package.json`
- `apps/stock-analyser/functions/portfolio/package.json`
- `apps/stock-analyser/functions/watchlist/package.json`
- `apps/stock-analyser/functions/analysis-cache/package.json`
- `apps/stock-analyser/functions/cycle-check/package.json`
- `apps/budget-tracker/functions/budget-transactions/package.json`
- `apps/budget-tracker/functions/budget-rules/package.json`
- `apps/budget-tracker/functions/budget-settings/package.json`
- `apps/budget-tracker/functions/budget-ai/package.json`
- `apps/budget-tracker/functions/budget-export/package.json`
- `apps/budget-tracker/functions/budget-migrate/package.json`
- `functions/accounts/package.json`
- `functions/claude-proxy/package.json`
- `functions/first-login/package.json`
- `functions/forgot-provider/package.json`
- `functions/invitations/package.json`
- `functions/user/package.json`
- `packages/api-client/package.json`
- `packages/auth-client/package.json`
- `packages/budget-domain/package.json`
- `packages/cycle-engine/package.json`
- `packages/lambda-middleware/package.json`
- `packages/ui/package.json`
- `infrastructure/package.json`

**pnpm-workspace.yaml:**
```yaml
packages:
  - 'apps/*'
  - '!apps/web-vite-backup'
  - 'apps/stock-analyser/functions/*'
  - 'apps/budget-tracker/functions/*'
  - 'packages/*'
  - 'functions/*'
  - 'infrastructure'
```

---

## 2. Tech Stack

**Primary Languages:**
- TypeScript 5.4.0 (root), 5.7.3 (apps)
- Node.js ≥22.0.0 (engines requirement)

**Frontend:**
- React 19.x + Next.js 16.2.0 (App Router, static export)
- Tailwind CSS v4.2.0
- Radix UI (component primitives)
- Zustand (state management)
- react-hook-form + Zod (forms + runtime validation)
- Recharts (charting)

**Backend:**
- AWS Lambda (Node.js 22 runtime)
- AWS API Gateway (REST and HTTP)
- AWS DynamoDB (On-Demand)
- AWS Cognito (authentication)
- AWS SES (email)
- AWS Secrets Manager (API keys)

**Package Manager:** pnpm 10.33.0
**Build Orchestration:** Turborepo 2.0.0
**IaC:** AWS CDK v2.100.0 (TypeScript)

**Third-party Services:**
- Anthropic Claude API (via claude-proxy Lambda)
- AWS Cognito (multi-tenant auth with custom groups)

---

## 3. Architecture

**Pattern:** Multi-tenant SaaS platform — monorepo container with per-app bounded contexts. Each app owns its UI, Lambda functions, infrastructure stacks, and data contracts. Shared platform layer handles auth, accounts, and shared API routes.

**Layers:**
1. **Presentation:** React/Next.js in `apps/` (static export to S3 + CloudFront)
2. **API Gateway:** Shared platform API (HTTP) + per-app separate gateways (Budget Tracker has its own)
3. **Lambda:** Platform functions in `functions/`; app functions in `apps/<app>/functions/`
4. **Data:** DynamoDB (all tables account-scoped via `accountId` partition key)
5. **Infrastructure:** CDK in `infrastructure/` (platform stacks + per-app stacks)

**Bounded Contexts:**
- **Stock Analyser** — market cycle analysis (RSI/MACD/volume), portfolio tracking, watchlist
- **Budget Tracker** — expense tracking, classification, budget vs actual, cashflow
- **Platform/Launchpad** — multi-tenant entry point, Cognito group-based app access

**Import Rules (from MONOREPO.md, enforced by eslint-plugin-boundaries):**

| From | Can Import | Cannot Import |
|---|---|---|
| apps/stock-analyser/ | packages/* | apps/budget-tracker/, apps/launchpad/ |
| apps/budget-tracker/ | packages/* | apps/stock-analyser/, apps/launchpad/ |
| packages/* | (nothing outside packages/) | apps/*, infrastructure/* |
| infrastructure/* | functions/* (file paths) | apps/* directly |

**Data Contracts:**
- `apps/stock-analyser/contracts/DATA_CONTRACTS.md` — PortfolioHolding, StockAnalysisResult, WatchlistItem, EnrichedHolding; cache keys with TTLs; mock/real separation
- `apps/budget-tracker/contracts/` — Transaction, BudgetSettings, CustomRule, BuiltinRule (v1.1); separate contract files per domain area
- `contracts/<app>/` — top-level canonical contract docs (mirrored to app directories)

**Key Architectural Decisions (from DEVELOPMENT_PLAN.md):**
- Multi-tenancy via `accountId` (not user-based); all DynamoDB queries scoped
- Cognito groups control app access: `stock-app`, `budget-app`, `admin`, `transformotion`, `family`
- Static export to S3 + CloudFront (Next.js `output: 'export'`)
- OIDC authentication for GitHub Actions (no long-lived AWS keys)
- On-Demand DynamoDB capacity
- Mobile-first design (375px baseline)

---

## 4. Infrastructure as Code

**Tool:** AWS CDK (TypeScript) v2.100.0
**Location:** `infrastructure/`
**CDK Entry:** `infrastructure/bin/app.ts`
**Target Cloud:** AWS
**Region:** ap-southeast-2
**Account:** 959516291617

**Stack Inventory (14 total, 7 per environment):**

| Stack | Purpose |
|---|---|
| `TransformotionDev/Prod-Network` | S3 bucket + CloudFront distribution + ACM cert |
| `TransformotionDev/Prod-Auth` | Cognito User Pool + groups + custom attributes |
| `TransformotionDev/Prod-AuthApi` | forgot-provider Lambda + API Gateway |
| `TransformotionDev/Prod-PlatformTables` | DynamoDB: users, accounts, invitations, analysis-cache |
| `TransformotionDev/Prod-Api` | Platform REST API Gateway + Cognito authoriser + platform Lambda routes |
| `TransformotionDev/Prod-StockAnalyserTables` | DynamoDB: portfolio-v2, watchlist-v2 |
| `TransformotionDev/Prod-StockAnalyserApi` | Stock Analyser Lambda functions + routes on platform API |
| `TransformotionDev/Prod-BudgetTrackerTables` | DynamoDB: budget transactions, rules, settings |
| `TransformotionDev/Prod-BudgetTrackerApi` | Budget Tracker Lambda functions + own API Gateway |

**IaC Source Layout:**
```
infrastructure/
├── bin/app.ts                  ← CDK app entry, all stack instantiations
├── lib/
│   ├── platform/               ← NetworkStack, AuthStack, PlatformApiStack, etc.
│   ├── stock-analyser/         ← StockAnalyserTablesStack, StockAnalyserApiStack
│   └── budget-tracker/         ← BudgetTrackerTablesStack, BudgetTrackerApiStack
└── cdk.json
```

**Shared Construct Library:** None — CDK constructs are defined inline in each stack file. No separate construct library package.

---

## 5. CI/CD

**Platform:** GitHub Actions
**Auth:** OIDC (`GitHubActionsDeployRole`, no long-lived credentials)
**ROLE_ARN:** `arn:aws:iam::959516291617:role/GitHubActionsDeployRole`

**Workflows (`.github/workflows/`):**

### ci.yml — PR Validation
- **Trigger:** PR to `main` or `develop`
- **Jobs:** typecheck (`pnpm turbo typecheck`), lint (`pnpm turbo lint`), CDK synth dev + prod
- **Note:** Lint currently partially disabled — Stock Analyser and Budget Tracker skip ESLint (ESLint 10 flat config incompatibility)

### deploy-platform.yml — Platform Infrastructure
- **Trigger:** Push to `develop`/`main` on paths: `infrastructure/lib/platform/**`, `infrastructure/bin/**`, `functions/**`
- **Dev job:** CDK deploy all platform stacks → dev; deploys web app to S3
- **Prod job:** Same for prod (main branch only)
- **Commands:** `cdk deploy`, `aws s3 sync`, `aws cloudfront create-invalidation`

### deploy-stock-analyser.yml — Stock Analyser
- **Trigger:** Push to `develop`/`main` on `apps/stock-analyser/**`, `infrastructure/lib/stock-analyser/**`, `packages/**`, `functions/**`; also `workflow_dispatch` with `target: dev|prod`
- **Dev job:** `cdk deploy TransformotionDev-StockAnalyserApi` → `pnpm build` (Next.js static) → `aws s3 sync` → CloudFront invalidation
- **Prod job:** Same with prod stacks + prod S3 bucket
- **Env vars baked at build:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CLAUDE_API_URL`, `NEXT_PUBLIC_COGNITO_*`, `NEXT_PUBLIC_BUDGET_API_URL`

### deploy-budget-tracker.yml — Budget Tracker
- **Trigger:** Push to `develop`/`main` on `apps/budget-tracker/**`, `infrastructure/lib/budget-tracker/**`
- **Status:** Placeholder — `echo` only; activates when scaffolding complete

### cd.yml — Full Platform Redeploy
- **Trigger:** `workflow_dispatch` only
- **Purpose:** Manual full redeploy of all stacks + apps

**CloudFront Distribution:** `E1128DYYBLMWYK` (dev), `${{ vars.CLOUDFRONT_DISTRIBUTION_ID_PROD }}` (prod)

---

## 6. Testing

**Frameworks:** Vitest 1.0.0

**Test File Locations:**
- `packages/budget-domain/src/__tests__/` — 6 files:
  - `budget-tracking.test.ts`
  - `cashflow.test.ts`
  - `category-tree.test.ts`
  - `csv.test.ts`
  - `exclusions.test.ts`
  - `rules.test.ts`

**Test Count:** ~60–80 unit tests total; all in `packages/budget-domain`

**Zero test coverage for:**
- `apps/stock-analyser/` (no test files)
- `apps/budget-tracker/` (no test files)
- `apps/launchpad/` (no test files)
- All Lambda functions (`functions/`, `apps/*/functions/`)
- All shared packages except `budget-domain`

**Coverage Threshold:** Not configured

**Disabled Tests:** None found (no `.skip` or `xit()`)

**Contract Tests:** None. Contracts are markdown documents only — no schema validation, no Pact tests, no OpenAPI spec validation.

**Vitest Config:** `packages/budget-domain/vitest.config.ts`

**Test Run Command:**
```bash
cd packages/budget-domain && pnpm test
```

---

## 7. Existing Enforcement Mechanisms

### ESLint

**Status:** ✅ Configured at root; ❌ Disabled for app workspaces in CI

**Config:** `.eslintrc.cjs` (root)

**Active Rule Sets:**
- `eslint-plugin-boundaries` (v6.0.2) — cross-app import enforcement
  - Apps cannot import from other apps
  - Packages cannot import from apps

**CI Status:** `pnpm turbo lint` runs on PRs but:
- `apps/stock-analyser/` — ESLint skipped (commit 46cfad4): ESLint 10 flat config incompatibility with eslint-plugin-boundaries
- `apps/budget-tracker/` — ESLint skipped (commit 3bceb35): same reason

**Net effect:** Boundary rules are defined but **not enforced in CI**.

### Prettier

**Status:** ❌ Not configured. No `.prettierrc`, `prettier.config.*`, or Prettier dependency at root.

### TypeScript

**Status:** ✅ Configured; strict mode enabled

**Root `tsconfig.json` key flags:**
```json
{
  "strict": true,
  "esModuleInterop": true,
  "skipLibCheck": true,
  "moduleResolution": "bundler"
}
```

**CI Enforcement:** `pnpm turbo typecheck` runs on all PRs — this is the primary working quality gate.

**Notable exception:** `transactions-tab.tsx` has `// @ts-nocheck` at top (disables all TS checks for that file).

### Architecture / Boundary Enforcement

**Tool:** `eslint-plugin-boundaries` (v6.0.2)
**Status:** ✅ Rules defined; ❌ **Not enforced in CI** (apps skip linting)

### Schema Validation

**Status:** Zod (runtime, forms only — not used to validate API responses or Lambda I/O)

No build-time schema enforcement. Contracts are markdown.

### IaC Policy Checks

**Status:** ❌ Not configured. No cdk-nag, Checkov, tfsec, or OPA.

### Pre-commit Hooks

**Status:** ❌ Not configured. No Husky, lefthook, or `.pre-commit-config.yaml`.

### Commit Message Conventions

**Status:** ❌ Not enforced. Commits follow Conventional Commits style in practice but no commitlint configured.

### Secret Scanning / SAST / Dependency Scanning

**Status:** ❌ None configured in CI or pre-commit.

### Suppressions

**`@ts-ignore` / `@ts-nocheck`:** Present in at least `transactions-tab.tsx` (file-level `@ts-nocheck`). Rough count across the codebase: ~10–15 suppressions.

**`eslint-disable`:** Present in several files; exact count not enumerated.

---

## 8. Agent-Facing Configuration

### Root `CLAUDE.md`
```
# Transformotion Apps — Claude Code Instructions

This is a pnpm workspace monorepo. Each app lives in `apps/<app>/` with its own
CLAUDE.md, contracts, infrastructure, and tests.

When working on a specific app, read that app's CLAUDE.md first.

Cross-app contracts live in `/contracts/`. Shared code lives in `/packages/`.
Platform infrastructure lives in `/infrastructure/`.

Before modifying shared code or platform infrastructure, consider the impact
on every app — these changes deploy to all of them.

## Branching strategy

- `main` — production. Never commit directly.
- `develop` — integration branch. Never commit directly.
- Feature branches: `claude-code/<feature-name>` off `develop`, PR back to `develop`.
- v0 branches: `v0/<feature-name>` off `develop`, PR back to `develop`.
- After merge to `develop`, CD pipeline deploys to dev automatically.

## Where to find things

| What | Where |
|---|---|
| Monorepo structure, import rules, deploy triggers | `MONOREPO.md` |
| Stock Analyser app | `apps/stock-analyser/CLAUDE.md` |
| Budget Tracker app | `apps/budget-tracker/CLAUDE.md` |
| Shared packages | `packages/` |
| Platform Lambda handlers | `functions/` |
| AWS CDK infrastructure | `infrastructure/` |
| App contracts (data models, API, state) | `contracts/<app>/` |
| Migration data artifacts | `migration-artifacts/<app>/` |
```

### Per-App CLAUDE.md Files
- `apps/stock-analyser/CLAUDE.md` — exists (content not reproduced here)
- `apps/budget-tracker/CLAUDE.md` — exists (content not reproduced here)

### Other Agent Config
- `.cursorrules` — ❌ Not found
- `.github/copilot-instructions.md` — ❌ Not found

---

## 9. Pain Points (Evidence Gathering)

### Recent Commits (last 20, `git log --oneline -20 develop`)
```
2a1b29a feat(budget): add getBudgetApiClient and budget config
4a037ff fix(ci): skip StockAnalyserTables CDK deploy — tables already exist in AWS
fdc1536 fix(infra): give BudgetTrackerApiStack its own API Gateway
8df41ac chore: merge feat/incorporate-web-launchpad into develop
fa5898e fix(budget): contract compliance + budget API URL in CI deploy
2e120bb fix(budget): convert const arrow helpers to function declarations + add migration page
9ca2f17 feat(web): incorporate v0 launchpad and sign-in into apps/launchpad Next.js app
d779d4a fix(auth): resolve sign-in loop — navigate after React commits session state
858954a feat(budget-tracker): incorporate v0 UI into apps/budget-tracker
3bceb35 fix: skip eslint in budget-tracker (same ESLint 10 flat config issue)
46cfad4 fix: skip eslint run in stock-analyser to unblock CI
789a3db fix: resolve all stock-analyser TypeScript errors for CI
c578e14 fix: resolve pre-existing TypeScript errors in stock-analyser app
8c5c9d8 feat(budget): S2.7 migration endpoint + CDK stack
...
```

### Pain Signals

1. **ESLint disabled** (commits 46cfad4, 3bceb35) — ESLint 10 flat config incompatibility with eslint-plugin-boundaries. Boundary enforcement is now entirely manual.

2. **TypeScript migration strain** (commits c578e14, 789a3db) — pre-existing type errors required fixing when CI was introduced. Indicates code was developed without type checking.

3. **Auth race condition** (commit d779d4a) — sign-in loop caused by navigating before React committed session state to context.

4. **CDK infra drift** (commits 4a037ff, fdc1536) — DynamoDB tables and Lambda functions existed outside CloudFormation; required skipping CDK deploy steps. Root cause: early infra was deployed ad-hoc, not via CDK.

5. **API Gateway contention** (commit fdc1536) — BudgetTrackerApiStack shared platform API Gateway causing CDK circular dependency; fixed by giving budget tracker its own API Gateway late in development.

6. **Repeated fix pattern:** Multiple "fix:" commits close together suggest rapid iteration without stable testing baseline.

### TODO/FIXME/HACK Comments

Minimal — well-maintained. One notable location: `functions/invitations/src/index.ts`. No widespread HACK/XXX comments found.

### Disabled Tests

None found (no `.skip`, `xit`, or `@pytest.mark.skip`).

### `@ts-ignore` / `eslint-disable`

- `// @ts-nocheck` at top of `transactions-tab.tsx` — disables all type checking for that file
- Scattered `eslint-disable` comments for `react-hooks/exhaustive-deps` in budget tracker components
- Rough total: ~10–20 suppressions across the codebase

---

## 10. What's Missing

### Architectural Rules Documented but Not Enforced

| Rule | Documented | Enforced |
|---|---|---|
| Cross-app import boundary (apps cannot import each other) | ✅ MONOREPO.md | ❌ ESLint disabled in CI |
| Packages cannot import from apps | ✅ MONOREPO.md | ❌ ESLint disabled in CI |
| Lambda layer must not contain domain logic | ✅ cowork-testing-brief.md | ❌ No linting rule |
| UI layer must not call repos directly | ✅ cowork-testing-brief.md | ❌ No linting rule |
| All DynamoDB queries scoped to accountId | ✅ DEVELOPMENT_PLAN.md | ❌ No integration test |
| Mobile-first design (375px baseline) | ✅ DEVELOPMENT_PLAN.md | ❌ No automated visual tests |

### Contract Definitions Not Validated

| Contract | Location | Validated? |
|---|---|---|
| Budget Tracker data models (v1.1) | `contracts/budget-tracker/*.md` | ❌ Markdown only |
| Stock Analyser data contracts | `contracts/stock-analyser/*.md` | ❌ Markdown only |
| Lambda API request/response shapes | Implicit in handler code | ❌ No schema |
| Cognito JWT custom claims | Implicit in middleware | ❌ No validation test |

### Tests That Would Catch Common Regressions

1. **API contract tests** — Validate Lambda response shapes against TypeScript interfaces; catch breaking changes when Lambda code changes
2. **Cross-account data isolation tests** — Integration test confirming `accountId` scoping prevents cross-account DynamoDB reads
3. **Cross-app import tests** — Re-enable ESLint boundary rules in CI; currently zero enforcement
4. **Mobile regression tests** — Playwright tests at 375px, 768px, 1024px breakpoints
5. **Migration idempotency tests** — Run `/migrate-from-localstorage` twice; assert no duplicates in DynamoDB
6. **Settings round-trip tests** — Write all 12 `SETTING_KEYS`; read back and assert equality
7. **Auth middleware tests** — Assert `withAuth()` rejects requests without valid Cognito JWT

### Enforcement Mechanisms Not Configured

| Mechanism | Status |
|---|---|
| Prettier | ❌ Not configured |
| Husky / pre-commit hooks | ❌ Not configured |
| Commitlint | ❌ Not configured |
| CDK-nag (AWS security best practices) | ❌ Not configured |
| GitHub Actions secret scanning | ❌ Not configured |
| SAST (CodeQL, Semgrep) | ❌ Not configured |
| Dependency vulnerability scanning | ❌ Not configured |

---

## Summary: Enforcement Status

| Mechanism | Configured | Enforced in CI | Enforced Pre-commit |
|---|---|---|---|
| ESLint (boundaries) | ✅ | ❌ Disabled | ❌ |
| Prettier | ❌ | N/A | N/A |
| TypeScript strict | ✅ | ✅ (`turbo typecheck`) | ❌ |
| Architecture boundary tests | ❌ | N/A | N/A |
| Contract (schema) validation | ❌ | N/A | N/A |
| CDK-nag | ❌ | N/A | N/A |
| Husky | ❌ | N/A | N/A |
| Commitlint | ❌ | N/A | N/A |
| Secret scanning | ❌ | N/A | N/A |
| Unit tests (budget-domain) | ✅ | ❌ Not in CI | ❌ |

**Summary:** TypeScript type-checking is the only reliably enforced quality gate. ESLint boundary rules exist but are bypassed. No tests run in CI. No pre-commit hooks. No IaC policy checks. Contracts are documentation only.
