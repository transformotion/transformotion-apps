# Transformotion Apps — Development Plan
**Stock Signal Analyser → Cloud Platform Migration**
*Prepared: April 2026 | Author: Steve Moodie*

---

## Vision

Migrate the current single-file Stock Signal Analyser into **Transformotion Apps**, a multi-tenant PWA platform hosted at `apps.transformotion.com.au`. The platform will support multiple tools — Stock Signal Analyser, Budget Tracker, and Transformotion Framework — with shared auth, account-based multi-tenancy, and infrastructure built cloud-native on AWS from day one.

---

## Table of Contents

1. [Phased Development Plan](#1-phased-development-plan)
2. [Technical Decisions](#2-technical-decisions)
3. [Risk Register](#3-risk-register)
4. [Branch Plan](#4-branch-plan)
5. [Session Plan](#5-session-plan)
6. [Decisions Log](#6-decisions-log)
7. [App Registry](#7-app-registry)
8. [Testing Strategy](#8-testing-strategy)
9. [User, Account & Auth Model](#9-user-account--auth-model)

---

## Pre-Phase 0 Tasks

These must be completed before Phase 0 begins. They are prerequisites, not part of the main phase sequence.

| # | Task | Done? |
|---|------|-------|
| PRE-1 | Fix the "Could not parse response" bug in `stock-signal-analyser.html` (known issue on Recommendations tab). Fix in the existing HTML file and commit to the Stock Analyser repo before starting any new work. | ✓ Fixed; tagged v1.0-localhost |
| PRE-2 | Confirm who controls DNS for `transformotion.com.au` and document the registrar. This determines whether we use Route 53 or just add a CNAME at the existing registrar. | ✓ GoDaddy |
| PRE-3 | Set up AWS billing alert at $10/month threshold so unexpected costs are caught early. | ✓ |
| PRE-4 | Create the `transformotion-apps` GitHub repository with branch protection rules on `main` (require PR, require passing CI, no direct pushes). | ✓ github.com/transformotion/transformotion-apps |
| PRE-5 | Confirm `apps.transformotion.com.au` is the correct URL for the platform launchpad. | ✓ |

---

## 1. Phased Development Plan

### Phase 0 — Foundation (Weeks 1–2)
*Goal: AWS account, domain, monorepo scaffolding, CI/CD skeleton. Nothing deployed yet to production.*

| # | Task | Deliverable |
|---|------|-------------|
| 0.1 | Configure AWS account with billing alerts ($50/month threshold) | ✓ AWS account ready |
| 0.2 | Add CNAME record at DNS registrar: `apps` → CloudFront distribution (done once CloudFront is provisioned in 0.3) | ✓ `apps.transformotion.com.au` resolves |
| 0.3 | Scaffold monorepo structure (apps/, packages/, infra/, functions/, .github/) | ✓ Directory skeleton |
| 0.4 | Bootstrap AWS CDK project in `infra/` with dev and prod stacks | ✓ CDK app compiles and deploys |
| 0.5 | GitHub Actions: CI pipeline (lint + type-check on PR) | ✓ Green CI badge |
| 0.6 | GitHub Actions: CD pipeline (deploy to dev on merge to `develop`) using OIDC (no long-lived AWS keys) | ✓ Dev deploy working |

---

### Phase 1 — Auth & Shell (Weeks 3–5)
*Goal: Users can sign up, log in, and see a Launchpad at apps.transformotion.com.au showing their permitted apps.*

| # | Task | Deliverable |
|---|------|-------------|
| 1.1 | Create React + Vite + TypeScript app in `apps/launchpad/`. **Mobile-first is a hard constraint from this session onwards** — see mobile-first rules below. Tailwind v4 dark theme tokens matching current design palette. | ✓ Dev server runs; layout works at 375px |
| 1.2 | Provision Cognito User Pool via CDK with: **Groups** (`admin`, `stock-app`, `budget-app`, `transformotion`, `family`); **custom attributes** (`custom:active_account` — current active account UUID, `custom:accounts` — comma-separated account UUIDs). Launchpad renders app tiles based on `cognito:groups` claim in JWT. Users not in a group cannot see or access that app — enforced in both the UI and the Lambda authoriser. | ✓ Users can sign up; groups exist |
| 1.3 | Auth flows: Sign Up, Confirm Email, Sign In, Forgot Password, Sign Out — custom styled components matching dark theme | ✓ All auth screens live |
| 1.4 | Protected route wrapper — redirects unauthenticated users to sign-in; token refresh; sign out | ✓ Route guard works |
| 1.5 | Launchpad (home screen after login) — renders app cards based on Cognito group membership: `stock-app` → Stock Signal Analyser; `budget-app` → Budget Tracker; `transformotion`/`admin` → all apps | ✓ Launchpad renders correctly per user |
| 1.6 | App shell layout: top nav (desktop), bottom tab nav (mobile ≤768px), tab routing stubs for all 7 Stock Analyser tabs | ✓ Shell renders at all breakpoints |
| 1.7 | Deploy frontend to S3 + CloudFront via CDK; ACM cert; custom domain; update DNS CNAME | ✓ HTTPS live on `dev.apps.transformotion.com.au` |

**Mobile-first rules (enforced from S1.1 onwards):**
- Write mobile CSS first; add desktop styles with Tailwind `md:` and `lg:` prefixes only
- Never use `max-width` media queries — always `min-width`
- Every component must work at 375px before it is considered done
- Bottom tab navigation on mobile; sidebar on desktop
- Test on a real mobile device or browser mobile emulation before marking any session complete

---

### Phase 2 — Backend API & Multi-Tenancy (Weeks 6–9)
*Goal: Lambda-backed API Gateway, account-based data model, Anthropic proxy — all data scoped to accountId.*

| # | Task | Deliverable |
|---|------|-------------|
| 2.1 | API Gateway (HTTP API) + Cognito JWT authorizer via CDK | Auth'd endpoints work |
| 2.2 | API client package in `packages/api-client/` — typed wrappers, auth token injection, error types | Shared typed API client |
| 2.3 | Anthropic API proxy Lambda: `POST /api/claude` — retrieves key from Secrets Manager at `/prod/anthropic/api-key`, forwards request to Anthropic, streams response. Browser never calls Anthropic directly. | Proxy endpoint works |
| 2.4 | Portfolio Lambdas: `GET /portfolio` + `POST /portfolio` — account-scoped | Portfolio persists in DynamoDB |
| 2.5 | Watchlist Lambdas: `GET /watchlist` + `POST /watchlist` — account-scoped | Watchlist in DynamoDB |
| 2.6 | Analysis cache Lambdas: `GET /analysis-cache` + `POST /analysis-cache` — account-scoped, with TTL | Cache in DynamoDB |
| 2.7 | Remove `portfolio-cache.json` bridge; browser POSTs directly to API Gateway | Local file bridge retired |
| 2.8 | First-login data migration: detect localStorage data on first DynamoDB hit; offer one-click import. Automatic — users do nothing. | Migration flow works |
| 2.9 | Provision platform DynamoDB tables via CDK: `platform.users`, `platform.accounts`, `platform.account-members`, `platform.invitations`. All use UUID partition keys, On-Demand capacity, TTL enabled. | Platform tables created |
| 2.10 | Lambda middleware: every Lambda function extracts `userId` (Cognito sub) and `accountId` from the verified JWT on every request. All DynamoDB queries scoped to `accountId`. A user can never access another account's data. The `userId` alone is never used as a partition key for app data — all app data uses `accountId` as the primary scoping key; private per-user data uses a composite key of `accountId#userId`. | Middleware in place; cross-account access blocked |
| 2.11 | Account management Lambdas: create account, get account, update account display name, delete account | Account CRUD works |
| 2.12 | Member management Lambdas: invite member by email (creates `platform.invitations` record + sends SES email), accept invitation, remove member, update member role and app permissions | Invite flow end-to-end |
| 2.13 | Account switcher in the React app shell: dropdown in the header showing the user's accounts. Switching accounts updates `custom:active_account` Cognito attribute and re-scopes all data. | Account switcher works |

---

### Phase 3 — Core App Migration (Weeks 10–14)
*Goal: All 7 tabs from the single HTML file re-implemented as React components with full feature parity.*

| # | Task | Deliverable |
|---|------|-------------|
| 3.1 | Shared Claude hook `useClaude()` — calls `POST /api/claude` proxy, handles streaming, loading/error states | Hook ready |
| 3.2 | Cycle position scoring engine in `packages/cycle-engine/` — extracted from HTML, TypeScript, unit tested | Package with tests |
| 3.3 | **Market Analysis tab** — React component, same prompts, sector drill-through working | Tab live |
| 3.4 | **Recommendations tab** — with bottom-of-cycle screener | Tab live |
| 3.5 | **ETFs tab** | Tab live |
| 3.6 | **Precious Metals tab** | Tab live |
| 3.7 | **Analyser tab** — cycle gauge (SVG), **TradingView free widget embed** (same embed code as current HTML version), signals panel | Tab live |
| 3.8 | **Portfolio tab** — CSV import, holdings table, P&L, cycle alerts, sell signal with CMC brokerage calc, sync to DynamoDB | Tab live |
| 3.9 | **Watchlist tab** — persistent in DynamoDB (account-scoped), cycle alerts, refresh | Tab live |
| 3.10 | Fast / Live mode toggle — same UX; Live mode calls Lambda proxy | Mode works |
| 3.11 | PWA: service worker (Vite PWA plugin), app manifest, offline shell, install prompt | Installable on iOS + Android |
| 3.12 | Parity review — side-by-side test of all tabs vs HTML version; fix gaps; sign off checklist | Parity checklist signed off |

---

### Phase 4 — Notifications & Automation (Weeks 15–16)
*Goal: Email alerts are cloud-native — no local server dependency.*

| # | Task | Deliverable |
|---|------|-------------|
| 4.1 | SES domain verification for `transformotion.com.au`, DKIM, move out of sandbox | Emails send reliably |
| 4.2 | Lambda: `cycle-check` — queries DynamoDB for all accounts, finds portfolios with score ≥ threshold | Function ready |
| 4.3 | EventBridge Scheduler: trigger `cycle-check` daily at 8 AM AEST | Cron works |
| 4.4 | Email template: dark-theme HTML, same design as current `notify.js` | Email renders correctly |
| 4.5 | Per-account notification preferences (on/off, threshold) stored in DynamoDB; settings screen in UI | Settings screen |
| 4.6 | Retire `server.js`, `notify.js`, `portfolio-cache.js` — localhost server no longer needed | Local server removed |

---

### Phase 5 — Platform & Second App (Weeks 17–22)
*Goal: Platform supports multiple apps. Budget Tracker migrated. Admin UI for user management.*

| # | Task | Deliverable |
|---|------|-------------|
| 5.1 | Platform landing page at `apps.transformotion.com.au` — app tile cards (Stock Analyser, Budget Tracker, future apps). Tiles only shown based on user's Cognito groups. | Landing page live |
| 5.2 | Admin dashboard: user list, account list, group assignment, usage metrics, error rates. Only visible to `admin` group. | Admin panel |
| 5.3 | Invitation flow UI: account owner can invite users by email, assign roles (owner/admin/member/viewer), grant access to specific apps. | Invite flow end-to-end in UI |
| 5.4 | Budget Tracker DynamoDB tables: `budget-tracker.accounts`, `budget-tracker.transactions`, `budget-tracker.categories`, `budget-tracker.rules`, `budget-tracker.budgets` — full schema defined (see 5.5.1 below). Tables must exist before any data migration. | Tables created |
| 5.5 | Budget Tracker data migration — see sub-tasks 5.5.1–5.5.6 below | Migration complete |
| 5.6 | Migrate Budget Tracker into the React monorepo. Same approach as Stock Analyser migration in Phase 3. Full feature parity with existing HTML version. Detailed session plan written separately before this phase begins. | Budget Tracker live |

#### 5.5 Budget Tracker Data Migration — Detail

**5.5.1 — DynamoDB table schemas**

Full attribute structure for each table:

| Table | PK | SK | Key attributes |
|-------|----|----|----------------|
| `budget-tracker.accounts` | `accountId` | `accountRecordId` | `name`, `type` (spending/savings/investment), `currency`, `openingBalance`, `createdAt` |
| `budget-tracker.transactions` | `accountId` | `transactionId` (UUID) | `date`, `amount`, `description`, `merchant`, `categoryId`, `subcategoryId`, `notes`, `tags`, `isReconciled`, `createdAt` |
| `budget-tracker.categories` | `accountId` | `categoryId` (UUID) | `name`, `colour`, `icon`, `budgetTarget`, `period`, `parentCategoryId` (null for top-level) |
| `budget-tracker.rules` | `accountId` | `ruleId` (UUID) | `priority`, `matchType` (contains/equals/startsWith), `matchField` (description/merchant/amount), `matchValue`, `targetCategoryId`, `targetSubcategoryId`, `isActive` |
| `budget-tracker.budgets` | `accountId` | `budgetId` (UUID) | `categoryId`, `amount`, `period` (monthly/weekly/annual), `startDate`, `endDate` |

**5.5.2 — Export script**

Reads all Budget Tracker localStorage keys and structures the data into the schema above. Exports as a single JSON file. The JSON includes a `version` field and `exportedAt` timestamp so the correct export can be identified if multiple exist. User saves this file locally as a backup before migration begins.

**5.5.3 — Import Lambda**

Accepts the JSON export, validates structure and version, then writes each record to the correct DynamoDB table scoped to the user's `accountId`. Uses the original record IDs as DynamoDB sort keys — running the import twice never creates duplicates (idempotent).

**5.5.4 — Import UI**

Appears automatically on first login to Budget Tracker if localStorage data is detected. Shows a pre-migration summary: *X transactions, Y categories, Z rules, N accounts*. Single **Migrate Now** button. Progress indicator while importing. Success confirmation showing record counts written to each table. After successful migration, Budget Tracker localStorage data is cleared.

**5.5.5 — Rollback**

If the migration result looks wrong, the user re-imports from the saved JSON file. The idempotent import overwrites with the correct data without creating duplicates. No data is lost as long as the export file was saved.

**5.5.6 — Budget Tracker feature migration session plan**

To be written in detail when Phase 4 is complete, following the same tab-by-tab approach used for Stock Analyser in Phase 3. Write this plan before starting 5.6.

---

### Phase 6 — Hardening & Launch (Weeks 23–26)
*Goal: Production-grade, observable, cost-controlled.*

| # | Task | Deliverable |
|---|------|-------------|
| 6.1 | CloudWatch dashboards: Lambda errors, API latency, DynamoDB consumed capacity, Claude proxy usage | Dashboards live |
| 6.2 | AWS Budgets alert at $50/month threshold | Budget alarm set |
| 6.3 | WAF on CloudFront: rate limiting, geo restrictions if needed | WAF active |
| 6.4 | End-to-end tests: Playwright covering all 7 Stock Analyser tabs + auth flows + invitation flow | E2E suite green |
| 6.5 | Load test: simulate 50 concurrent users running portfolio refresh | Pass criteria met |
| 6.6 | Accessibility audit: WCAG 2.1 AA | A11y issues fixed |
| 6.7 | Production cutover: DNS CNAME swap to prod CloudFront, deprecation notice on localhost app | Prod live |
| 6.8 | Post-launch: monitor for 2 weeks, fix any regressions | Stable |

---

## 2. Technical Decisions

### 2.1 Monorepo Structure
```
transformotion-apps/
├── apps/
│   ├── web/                    # React + Vite + TypeScript (Stock Analyser + shell)
│   └── budget/                 # Budget Tracker (Phase 5 — may share apps/launchpad/)
├── packages/
│   ├── api-client/             # Typed API wrappers (shared across apps)
│   ├── cycle-engine/           # Cycle scoring logic (extracted from HTML, tested)
│   └── ui/                     # Shared component library (long-term)
├── infra/
│   └── lib/                    # AWS CDK stacks
├── functions/
│   ├── accounts/               # Lambda: account + member CRUD
│   ├── invitations/            # Lambda: invitation flow
│   ├── portfolio/              # Lambda: portfolio CRUD (account-scoped)
│   ├── watchlist/              # Lambda: watchlist CRUD (account-scoped)
│   ├── analysis-cache/         # Lambda: cache CRUD (account-scoped)
│   ├── claude-proxy/           # Lambda: Anthropic API proxy using Secrets Manager key
│   └── cycle-check/            # Lambda: daily alert check (account-scoped)
├── test-data/                  # Sample CSVs, mock responses, seed scripts
├── .github/
│   └── workflows/              # CI/CD pipelines
└── DEVELOPMENT_PLAN.md
```

**Decision:** Turborepo for monorepo task orchestration (build, lint, test caching across packages).

### 2.2 Frontend Stack
| Concern | Choice | Rationale |
|---------|--------|-----------|
| Framework | React 18 + Vite | Industry standard, fast HMR, great TypeScript support |
| Language | TypeScript (strict) | Catches the class of bugs encountered in vanilla JS |
| Styling | Tailwind CSS v4 | Utility-first, mobile-first breakpoints |
| Mobile layout | Bottom tab nav ≤768px, top nav/sidebar on desktop | Matches platform conventions for installed PWA |
| Design baseline | 375px (iPhone SE) — scale up, never down | Mobile-first constraint enforced from S1.1 |
| State | Zustand | Lightweight; no Redux overhead for this app size |
| Data fetching | TanStack Query | Caching, background refresh, optimistic updates |
| Routing | React Router v7 | File-based routing option available |
| Charts | TradingView free widget embed | Already proven in HTML version; no rebuild needed |
| PWA | Vite PWA plugin | Workbox-backed service worker; installable on iOS + Android |

### 2.3 Backend Stack
| Concern | Choice | Rationale |
|---------|--------|-----------|
| Compute | AWS Lambda (Node.js 22) | Serverless; cost scales to zero |
| API | API Gateway HTTP API | Cheaper than REST API; sufficient for this use case |
| Auth | Amazon Cognito | AWS-native, handles JWT, MFA, email verification, Groups |
| Database | DynamoDB (single-table per domain) | Serverless; no cold-start connection overhead vs RDS |
| Secrets | AWS Secrets Manager (`/prod/anthropic/api-key`) | Stores Anthropic API key; never exposed to browser |
| Email | Amazon SES | Reliable, cheap at low volume; stays in AWS ecosystem |
| Scheduler | EventBridge Scheduler | Replaces local node-cron; runs even when laptop is off |
| CDN | CloudFront + S3 | Standard static hosting on AWS |
| DNS | Existing registrar (to be confirmed) | CNAME record for `apps` subdomain; no full DNS migration needed |
| IaC | AWS CDK (TypeScript) | Same language as the rest of the stack |

### 2.4 Anthropic API Key Handling
**Decision:** Anthropic key stored in **AWS Secrets Manager** at `/prod/anthropic/api-key`. A Lambda proxy (`POST /api/claude`) retrieves the key at call time and forwards the request to Anthropic. The browser never holds the API key.

**Key implications:**
- Removes `anthropic-dangerous-direct-browser-access: true` header requirement from Phase 2 onwards
- `useClaude()` hook calls the proxy, not Anthropic directly
- Secrets Manager charges ~$0.40/month per secret — negligible
- Each account uses the platform's shared key (or optionally their own — to be decided)

### 2.5 Cognito Groups & Custom Attributes
**Groups** control Launchpad rendering and Lambda authorisation:
| Group | Access |
|-------|--------|
| `admin` | All apps + admin UI |
| `transformotion` | All apps + admin UI (platform team) |
| `stock-app` | Stock Signal Analyser |
| `budget-app` | Budget Tracker |
| `family` | Granted `stock-app` and/or `budget-app` as appropriate |

**Custom attributes** on Cognito user record:
| Attribute | Type | Purpose |
|-----------|------|---------|
| `custom:active_account` | String (mutable) | Currently selected accountId |
| `custom:accounts` | String (mutable) | Comma-separated list of accountIds the user belongs to |

### 2.6 DynamoDB Schema
All app data scoped by `accountId`. The `userId` alone is never used as a partition key for app data. Private per-user data within an account uses a composite key of `accountId#userId`.

**Platform tables (shared across all apps):**
```
platform.users          PK: userId              { name, email, activeAccount }
platform.accounts       PK: accountId           { name, ownerId, createdAt }
platform.account-members  PK: accountId, SK: userId  { role, appPermissions, joinedAt }
platform.invitations    PK: invitationId        { accountId, email, status, expiresAt }
```

**Stock Analyser tables:**
```
stock-analyser.portfolio   PK: accountId   { holdings: [...], updatedAt }
stock-analyser.watchlist   PK: accountId   { tickers: [...], updatedAt }
stock-analyser.cache       PK: accountId, SK: cacheKey   { result, computedAt, expiresAt }
```

**Budget Tracker tables (Phase 5):**
```
budget-tracker.accounts       PK: accountId   { ... }
budget-tracker.transactions   PK: accountId, SK: transactionId   { ... }
budget-tracker.categories     PK: accountId, SK: categoryId   { ... }
budget-tracker.rules          PK: accountId, SK: ruleId   { ... }
budget-tracker.budgets        PK: accountId, SK: budgetId   { ... }
```

### 2.7 CI/CD Strategy
- **PR → `develop`:** lint, type-check, unit tests, integration tests (no deploy)
- **Merge → `develop`:** deploy to `dev.apps.transformotion.com.au`; E2E tests run against dev
- **Merge → `main`:** deploy to `apps.transformotion.com.au` (production)
- All deployments via CDK in GitHub Actions using OIDC (no long-lived AWS keys in GitHub secrets)
- No merge to `main` if any test fails. Coverage threshold: 80% on `cycle-engine` and CSV import packages.

### 2.8 Anthropic Claude API Version
Continue using `claude-sonnet-4-6` (or latest Sonnet at time of migration). Keep `anthropic-version: 2023-06-01` header. The `anthropic-dangerous-direct-browser-access: true` header is removed from Phase 2 onwards — all calls go via the Lambda proxy.

### 2.9 Claude API Integration Pattern
All Claude API calls follow the async job pattern:
- POST /api/claude → returns jobId immediately (bypasses API Gateway 29-second timeout)
- Background Lambda calls Anthropic (up to 120s)
- Frontend polls GET /analysis-cache/job:{jobId} every 2.5s, up to 48 polls (120s total)
- Implemented via shared `callClaudeWithRetry()` utility
- Exponential backoff on 429 rate limit errors: retry at 20s, 45s, 90s
- Only shows error to user after all three attempts fail
- Per-ticker calls used for portfolio enrichment to stay within the 29s timeout

### 2.10 v0 Design Integration
v0.dev (by Vercel) is used for UI design generation. Integration workflow:
1. Iterate designs in v0 — output pushed to `github.com/transformotion/transformotion-apps-b8`
2. Run `scripts/sync-v0.sh` to update `v0-reference/` locally (gitignored — never committed)
3. Update `docs/data-contracts.md` before writing any integration code
4. Claude Code adapts v0 components — never imports or copies verbatim
5. `TransformotionLogo` component always used — never the v0 version
6. One tab integrated and deployed at a time
7. This workflow applies to all apps (Stock Analyser, Budget Tracker, Transformotion Framework)

### 2.11 Cache Architecture
Two-layer cache:
- **DynamoDB `stock-analyser.cache-dev`**: primary persistent store with TTL
- **Zustand**: fast in-session copy, hydrated from DynamoDB on load
Cache key format: `DATATYPE#{identifier}` (e.g. `ANALYSIS#BHP.AX`, `MARKET#ASX`)
Shared cache: `accountId=SHARED` for market/analysis data that benefits all users
TTL always in Unix seconds: `Math.floor(Date.now() / 1000) + (hours × 3600)` — never use `Date.now()` directly (milliseconds will be rejected or immediately expire)
localStorage: **completely removed** from the React app. Zero localStorage calls permitted.

---

## 3. Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|-----------|
| R1 | Yahoo Finance blocks CORS from Lambda | High | Medium | Keep cycle scoring client-side; Yahoo Finance calls stay in the browser. Lambda handles data persistence and Claude proxy only. |
| R2 | Cognito User Pool costs exceed expectations | Low | Low | Free tier = 50,000 MAU. Family/friends scale is well within free tier. |
| R3 | DynamoDB account-scoped schema needs remodel mid-project | Medium | High | Finalise all access patterns before writing any Lambda code in Phase 2. |
| R4 | Feature parity gaps during HTML → React migration | High | High | Run both apps in parallel until parity checklist (3.12) signed off. Keep localhost server alive through Phase 4. |
| R5 | Claude API response format changes break JSON parsing | Low | Medium | `parseJSON()` is already robust; add integration tests pinning to specific response shapes. |
| R6 | AWS costs spike unexpectedly | Medium | Medium | Budget alert at $10/month (PRE-3) and $50/month (Phase 0). CloudFront egress is the main variable cost. |
| R7 | DNS propagation delay at cutover | Low | Low | Set TTL to 60s 24 hours before the swap. Test prod CloudFront URL directly before pointing DNS. |
| R8 | CMC Markets changes CSV export format | Medium | Medium | Column detection is already flexible. Add CSV format version check and user-visible warning. |
| R9 | React + mobile-first migration stalls | Medium | High | Phase 3 is the largest phase. Time-box each tab at 1 week max. Feature-flag unfinished tabs. |
| R10 | Secrets Manager key retrieval adds latency to Claude calls | Low | Medium | Cache the secret in Lambda memory for the execution context lifetime (standard practice). |
| R11 | Budget Tracker scope creep delays Phase 5 | Medium | Medium | Write a separate Budget Tracker plan before Phase 5 begins. Only build what's in that spec. |
| R12 | accountId middleware fails silently, leaking cross-account data | Low | High | Unit test middleware thoroughly. Add DynamoDB condition expressions asserting `accountId` match on every write. |
| R13 | Transformotion Framework has external client data requiring stricter isolation | Medium | High | Scope Framework separately before touching it. May need its own subdomain, auth pool, and stricter IAM. |
| R14 | Anthropic rate limits hit during heavy usage | Medium | Medium | `callClaudeWithRetry()` with exponential backoff; cache-first strategy reduces API calls; prompts kept under 300 tokens. |
| R15 | v0 design repo diverges significantly from main app patterns | Low | Medium | `docs/data-contracts.md` reviewed before every integration; Claude Code adapts rather than copies v0 code. |
| R16 | TradingView widget unavailable for some tickers | Low | Low | Fallback links to Yahoo Finance and Google Finance shown if widget shows symbol-not-found error. |
| R17 | Social IDP credentials expire or are revoked | Low | High | Credentials in Secrets Manager; monitor via CloudWatch; document renewal in `docs/social-idp-setup.md`. |

---

## 4. Branch Plan

### Repository: `transformotion-apps` (new GitHub repo)

```
main                  ← production; protected; requires PR + passing CI
│
develop               ← integration branch; auto-deploys to dev environment
│
├── phase/0-foundation
├── phase/1-auth-shell
├── phase/2-backend-api
├── phase/3-core-migration
├── phase/4-notifications
├── phase/5-platform
└── phase/6-hardening
```

### Working branches (off phase branch or develop)
```
feature/<ticket>-<short-description>
fix/<ticket>-<short-description>
chore/<description>
```

### Current repo (`Stock Analyser`)
Keep `main` alive and functional throughout the migration. Tag `v1.0-localhost` after PRE-1 fix. Only retire after Phase 6 production cutover.

---

## 5. Session Plan

Each session maps to ~1–3 hours of focused work. Sessions are designed to leave the app in a working state at the end.

### Pre-Phase 0 Sessions (current `Stock Analyser` repo)

| Session | Goal | Key tasks |
|---------|------|-----------|
| S-PRE | Fix Recommendations parse bug; tag v1.0 | Diagnose and fix "Could not parse response"; commit; `git tag v1.0-localhost && git push origin v1.0-localhost` |

### Phase 0 Sessions

| Session | Goal | Key tasks |
|---------|------|-----------|
| S0.1 | AWS setup | Configure AWS account; PRE-2 DNS confirmed; billing alerts at $10 and $50/month |
| S0.2 | Monorepo scaffold | Turborepo; apps/ packages/ infra/ functions/ test-data/ directories; root tsconfig |
| S0.3 | CDK bootstrap | NetworkStack (CloudFront, S3); dev/prod stage separation; deploy empty stack; add DNS CNAME |
| S0.4 | CI/CD pipeline | GitHub Actions CI (lint + typecheck on PR); CD (cdk deploy via OIDC on merge to develop) |

### Phase 1 Sessions

| Session | Goal | Key tasks |
|---------|------|-----------|
| S1.1 | React app scaffold (mobile-first) | ✓ Vite + React + TS; Tailwind v4 dark theme tokens; verify layout at 375px before any wider breakpoint |
| S1.2 | Cognito stack | ✓ CDK: User Pool with Groups and custom attributes; App Client; deploy to dev |
| S1.3 | Auth UI | ✓ Sign up, confirm email, sign in, forgot password — custom dark-theme components |
| S1.4 | Protected routes | ✓ Route guard, token refresh, sign out, redirect logic |
| S1.5 | Launchpad | ✓ Post-login home; reads `cognito:groups` from JWT; renders app cards per group |
| S1.6 | App shell | ✓ Top nav (desktop), bottom tab nav (mobile ≤768px); routing stubs for 7 Stock Analyser tabs |
| S1.7 | CloudFront deploy | ✓ S3 + CloudFront; ACM cert; custom domain; live at dev.apps.transformotion.com.au |
| S1.8 | Transformotion branding | Apply brand colours, Bebas Neue font, logo wordmark to all screens. Replace generic icons with professional SVG icons for each app tile. |
| S1.9 | Social identity providers | Google, Microsoft, Facebook IDPs configured in Cognito CDK stack. Apple placeholder. Forgot-which-IDP helper Lambda. `docs/social-idp-setup.md` created. |
| S1.10 | v0 design integration setup | v0 remote added; `scripts/sync-v0.sh` created; `v0-reference/` folder set up; `docs/data-contracts.md` created. |
| S1.11 | v0 UI integration — tab by tab | Integrate v0 designs for all 7 tabs plus Launchpad and auth screens. Each tab integrated and verified before moving to next. |

### Phase 2 Sessions

| Session | Goal | Key tasks |
|---------|------|-----------|
| S2.1 | Platform DynamoDB tables | CDK: platform.users, platform.accounts, platform.account-members, platform.invitations; On-Demand; TTL |
| S2.2 | API Gateway + middleware | HTTP API; Cognito JWT authorizer; CORS; accountId resolution middleware layer |
| S2.3 | Account + member Lambdas | Account CRUD; invite by email; accept/remove/update role |
| S2.4 | Claude proxy Lambda | Fetch key from Secrets Manager; forward to Anthropic; stream response; handle missing key |
| S2.5 | App data Lambdas | Portfolio, watchlist, analysis cache — all account-scoped; test with Postman |
| S2.6 | Account switcher UI | Header dropdown; updates `custom:active_account`; re-scopes all data |
| S2.7 | api-client package | Typed wrappers for all endpoints; error types |
| S2.8 | First-login migration | Detect localStorage data; one-click import to DynamoDB; idempotent |

### Phase 3 Sessions

| Session | Goal | Key tasks |
|---------|------|-----------|
| S3.1 | useClaude() hook | Calls `POST /api/claude`; streaming; loading/error states |
| S3.2 | cycle-engine package | Extract RSI/MACD/volume scoring from HTML into TypeScript; unit tests |
| S3.3 | Market Analysis tab | Component; prompts; sector drill-through navigation |
| S3.4 | Recommendations tab | Component; bottom-of-cycle screener |
| S3.5 | ETFs + Metals tabs | Both simpler — one session |
| S3.6 | Analyser tab | Cycle gauge (SVG); TradingView free widget embed; signals panel |
| S3.7 | Portfolio tab part 1 | CSV import; holdings table; P&L display |
| S3.8 | Portfolio tab part 2 | Cycle alerts; sell signal; net proceeds calc; sync to DynamoDB |
| S3.9 | Watchlist tab | Persistent in DynamoDB; cycle alerts; refresh |
| S3.10 | PWA | Manifest; service worker; install prompt; offline shell |
| S3.11 | Parity review | Side-by-side all tabs vs HTML version; fix gaps; sign off checklist |

### Phase 4 Sessions

| Session | Goal | Key tasks |
|---------|------|-----------|
| S4.1 | SES setup | Domain verification; DKIM; move out of sandbox |
| S4.2 | cycle-check Lambda | Query all account portfolios; filter by per-account threshold |
| S4.3 | Email template | Dark-theme HTML matching current notify.js |
| S4.4 | EventBridge + prefs | 8 AM AEST cron; per-account opt-in/threshold; test trigger endpoint |
| S4.5 | Retire localhost server | Remove server.js, notify.js, portfolio-cache.js from Stock Analyser repo |

### Phase 5 Sessions

| Session | Goal | Key tasks |
|---------|------|-----------|
| S5.1 | Platform landing page | App tile cards by Cognito group |
| S5.2 | Admin UI | /admin route (group-gated); user list; account list; group assignment; CloudWatch metrics |
| S5.3 | Invitation UI | Account settings → invite by email → magic link → auto-join account |
| S5.4 | Budget Tracker DynamoDB | CDK: budget-tracker.* tables |
| S5.5 | Budget Tracker migration | Export script; import Lambda; one-click UI on first login; idempotent |
| S5.6–S5.N | Budget Tracker features | Per separate Budget Tracker session plan (written before Phase 5 begins) |

### Phase 6 Sessions
*(Plan in detail once Phase 5 is complete)*

---

## 6. Decisions Log

| # | Topic | Decision |
|---|-------|----------|
| 6.1 | Domain | `transformotion.com.au` already exists. DNS provider to be confirmed before Phase 0 starts (PRE-2). Target subdomain: `apps.transformotion.com.au`. Transformotion Framework may warrant `framework.transformotion.com.au` — to be decided when that app is scoped. |
| 6.2 | AWS Account | Single AWS account. Dev and prod environments in the same account, separated by CDK stack naming and IAM. Multi-account via AWS Organizations is a future consideration if the platform grows. |
| 6.3 | Multi-tenancy | Family and friends will be invited relatively soon after launch. **Data isolation is a day-one requirement — not something to retrofit.** Account-based multi-tenancy (platform.accounts, platform.account-members) must be built in Phase 2 before any app data is stored. |
| 6.4 | Pricing | Internal and family/friends use only for now. No Stripe. Replace Phase 5 billing work with: Budget Tracker migration, admin UI for user and account management, invitation flow. |
| 6.5 | Mobile | PWA is the final mobile story. No native iOS or Android app planned. Mobile-first constraint applies from S1.1: design at 375px first, bottom tab nav on mobile. |
| 6.6 | Apps | **Second app: Budget Tracker** (Phase 5). **Third app: Transformotion Framework** (future — scoped separately before development begins). |
| 6.7 | Pre-migration bug | Fix "Could not parse response" on Recommendations tab **before** starting Phase 0 (PRE-1). Tag `v1.0-localhost` after the fix. |
| 6.8 | Data migration | **Automatic on first login.** The app detects if localStorage data exists and offers one-click migration to DynamoDB. No manual export scripts for end users. |
| 6.9 | API key storage | Anthropic key stored in **AWS Secrets Manager** at `/prod/anthropic/api-key`. Lambda proxy retrieves it and calls Anthropic server-side from Phase 2. Browser never holds the key. `anthropic-dangerous-direct-browser-access` header removed from Phase 2 onwards. |
| 6.10 | Charts | **TradingView free widget embed** confirmed as the charting solution. Same embed code as current HTML version — no rebuild needed. |
| 6.11 | Cognito Groups | Groups: `admin`, `stock-app`, `budget-app`, `transformotion`, `family`. Custom attributes: `custom:active_account`, `custom:accounts`. Launchpad renders based on group membership decoded from JWT. Enforced in both UI and Lambda authoriser. |
| 6.12 | UI Design tooling | v0.dev (by Vercel) is used for UI design generation. v0 generates React + Tailwind components from natural language prompts. Output stored in `github.com/transformotion/transformotion-apps-b8`. Integrated via `scripts/sync-v0.sh`. `docs/data-contracts.md` maps every UI element to its real data source before any integration code is written. |
| 6.13 | Chart solution | TradingView free widget embed confirmed. Default chart type: Step Line (style=6). Symbol format: `ASX:{ticker}` for ASX, `NASDAQ:{ticker}` / `NYSE:{ticker}` for US. Implemented in Analyser tab. |
| 6.14 | Social identity providers | Google, Microsoft (via OIDC), and Facebook configured in Cognito. Apple placeholder added (greyed out — $99/year Apple Developer Program required to activate). Credentials stored in AWS Secrets Manager. Setup instructions in `docs/social-idp-setup.md`. |
| 6.15 | Forgot-which-IDP helper | POST /auth/lookup-provider Lambda implemented. Rate limited to 5 requests per IP per 15 minutes using `platform.rate-limits-dev` DynamoDB table. Sends SES hint email — never reveals provider in API response (prevents account enumeration). |
| 6.16 | localStorage policy | Completely removed from the React app. Zero localStorage calls permitted. Permanent data → DynamoDB. Session UI state → Zustand. User preferences → `platform.users-dev`. |
| 6.17 | Async job pattern for Claude calls | All Claude API calls use async fire-and-forget. Frontend POSTs to /api/claude and receives a jobId immediately. Background Lambda runs Anthropic call (up to 120s). Frontend polls /analysis-cache/job:{jobId} every 2.5s for up to 120s (48 polls). Prevents API Gateway 29-second timeout on large prompts. |
| 6.18 | Rate limit handling | All Claude calls use a shared `callClaudeWithRetry()` utility. Retry at 20s, 45s, 90s. Only shows error after all three attempts fail. Error message checks current mode before suggesting switch to Fast. |
| 6.19 | Cache-first strategy | Every tab checks DynamoDB cache before calling Claude. Cache keys follow `DATATYPE#{identifier}` convention. Shared cache (`accountId=SHARED`) benefits all users. Tab state persists across tab switches via Zustand — never resets on tab switch. |
| 6.20 | User preferences persistence | Fast/Live mode preference persists via `platform.users-dev` DynamoDB table. `PUT /api/user/preferences` endpoint. Zustand initialised from DynamoDB on login. `lastAnalysedTicker` also persisted so Analyser tab restores last result on page reload. |
| 6.21 | TTL calculation | Always use `Math.floor(Date.now() / 1000)` for Unix seconds. Never use `Date.now()` directly (returns milliseconds — DynamoDB rejects or immediately expires). |
| 6.22 | v0 integration workflow | When v0 designs change, run `scripts/sync-v0.sh`. Tell Claude Code to review changes and update `docs/data-contracts.md`. Steve reviews and approves before implementation begins. Applies to all apps. |
| 6.23 | GitHub organisation | All repos moved to `transformotion` GitHub org. Stock Analyser: `github.com/transformotion/stock-analyser`. Monorepo: `github.com/transformotion/transformotion-apps`. v0 design repo: `github.com/transformotion/transformotion-apps-b8`. |
| 6.24 | Anthropic API rate limits | Organisation limit: 30,000 input tokens per minute. All prompts target under 300 tokens. Rate limit errors trigger automatic retry with exponential backoff. |

---

## 7. App Registry

This section defines all planned apps. It exists to ensure the platform foundation — monorepo structure, Cognito groups, DynamoDB naming, Launchpad design — is built to support all apps from day one, even if the apps themselves are built in later phases.

**When a new app is identified, add it to this registry before writing any code.** The registry must be updated before any monorepo folder, Cognito group, DynamoDB table, or Launchpad tile is created for that app.

---

### App 1 — Stock Signal Analyser
| Field | Value |
|-------|-------|
| Status | Exists as single HTML file — migrating in Phase 3 |
| Route | `apps.transformotion.com.au/stocks` |
| Cognito group | `stock-app` |
| DynamoDB tables | `stock-analyser.portfolio`, `stock-analyser.watchlist`, `stock-analyser.cache` |
| Target users | Steve, Liz, family, friends |
| Data migration | Automatic on first login from localStorage |

**Key features:** market analysis, sector rotation, recommendations, bottom-of-cycle screener, ETFs, precious metals, analyser with cycle gauge and TradingView chart, portfolio with CMC CSV import, watchlist, buy/sell/accumulate alerts.

---

### App 2 — Budget Tracker
| Field | Value |
|-------|-------|
| Status | Exists as single HTML file — migrating in Phase 5 |
| Route | `apps.transformotion.com.au/budget` |
| Cognito group | `budget-app` |
| DynamoDB tables | `budget-tracker.accounts`, `budget-tracker.transactions`, `budget-tracker.categories`, `budget-tracker.rules`, `budget-tracker.budgets` |
| Target users | Steve, Liz (shared household account) |
| Data migration | One-click migration on first login. Export script reads localStorage; import Lambda writes to DynamoDB. Idempotent. |
| Session plan | To be written when Phase 4 is complete, before Phase 5 begins |

**Key features:** transaction management, auto-categorisation rules, budget targets, reporting, multi-account support.

---

### App 3 — Transformotion Framework
| Field | Value |
|-------|-------|
| Status | Future — not yet built as a web app |
| Route | `framework.transformotion.com.au` (own subdomain likely — to be confirmed during scoping) |
| Cognito group | `transformotion` |
| DynamoDB tables | `transformotion.frameworks`, `transformotion.assessments`, `transformotion.clients` (preliminary — confirm during scoping) |
| Target users | Steve, Transformotion colleagues, external clients |
| Session plan | To be written when Budget Tracker migration is complete |

**Key features:** TBD — to be scoped as a separate exercise before development begins.

**Note:** This app serves external clients and may require stricter data isolation, client-specific access controls, and more formal branding than the personal apps. These requirements must be scoped in detail before migration begins. May warrant a separate Cognito User Pool and AWS account.

---

### Platform tables (shared across all apps)
| Table | Purpose |
|-------|---------|
| `platform.users` | User profiles |
| `platform.accounts` | Account definitions |
| `platform.account-members` | Who belongs to what account, with roles and app permissions |
| `platform.invitations` | Pending invitations |

---

## 8. Testing Strategy

### 8.1 Testing Pyramid

Three levels of testing, built from the bottom up:
- **Unit tests (Vitest)** — many, fast, test pure functions in isolation
- **Integration tests (Vitest + AWS SDK mocks)** — medium, test Lambda functions with mock DynamoDB
- **End-to-end tests (Playwright)** — few, slow, test full user flows in a real browser

### 8.2 Unit Tests (Vitest)

**Install:** `npm install -D vitest`
**VS Code extension:** Vitest (search in Extensions marketplace)

Write unit tests alongside each feature as it is built. Key areas:

**`cycle-engine` package (S3.2 — highest priority):**
- RSI calculation: correct values for known price series
- MACD calculation: histogram, signal line, crossover detection
- Volume trend: confirming vs diverging correctly identified
- Cycle score: correct score for known combinations of indicators
- Signal generation: correct signal type and text for each condition
- Stage classification: early/mid/late/peak boundaries correct

**CSV import:**
- CMC Stock Holdings format: ticker, shares, last price detected
- CMC Profit & Loss format: Cost AUD column detected, avg cost calculated
- Gifted shares: zero cost basis imports correctly
- USD holdings: FX rate conversion applied correctly
- TOTALS row: skipped correctly
- Duplicate tickers: handled without creating duplicate holdings

**Ticker normalisation:**
- `VOO:US` → `VOO`
- `A200` → `A200.AX`
- `BHP:AU` → `BHP.AX`
- `F100` → `F100.AX`
- `NDQ` → `NDQ.AX`
- `VOO` (no suffix) → `VOO` (US stock, no `.AX`)

**Cache staleness:**
- Fresh/recent/stale/expired thresholds for each context type
- TTL values match defined thresholds

**JSON parser:**
- Valid JSON returns correctly
- Trailing text after JSON is stripped
- Markdown backticks around JSON are stripped
- Deeply nested JSON parses correctly

**Budget Tracker rule engine:**
- Auto-categorisation rules apply in correct priority order
- Rules match on description, amount, merchant correctly
- Conflicting rules: highest priority rule wins

---

### 8.3 Integration Tests (Vitest + mocks)

Test each Lambda function with a mocked DynamoDB and mocked Cognito JWT:

**Portfolio Lambda:**
- GET returns only the current `accountId`'s holdings
- POST creates a new holding correctly
- PUT updates an existing holding
- DELETE removes a holding
- Wrong `accountId` in token: returns 403
- Missing token: returns 401

**Cache Lambda:**
- GET returns shared cache entry for any user in account
- GET returns private cache entry only for correct `accountId`
- Expired TTL entry: not returned
- POST stores with correct TTL

**Account management Lambdas:**
- User cannot read another account's data
- Invitation flow: creates invitation, sends email, accepts correctly
- Role enforcement: viewer cannot write data

---

### 8.4 End-to-End Tests (Playwright)

**Install:** `npm install -D @playwright/test && npx playwright install`
**VS Code extension:** Playwright Test for VSCode (search in Extensions marketplace)

Scaffolded in Phase 1 (`tests/e2e/`). Tests written in Phase 6 unless a tab is complex enough to warrant earlier coverage.

**Auth flows:**
- Sign up with email, confirm email, sign in
- Forgot password flow
- Sign out
- Unauthenticated user redirected to login
- Wrong-group user cannot see restricted app tile

**Stock Analyser:**
- Import CMC Profit and Loss CSV: 7 holdings appear
- Gifted shares: ANZ shows zero cost basis and 100% gain
- Run market analysis: sectors appear
- Click sector: Recommendations tab opens with sector picks
- Search by company name: results appear
- Search by ticker: analysis appears
- Add to watchlist: stock appears on Watchlist tab
- Portfolio refresh: cycle data populates for all holdings

**Budget Tracker:**
- Data migration: localStorage data migrates to DynamoDB on first login
- Add transaction: appears in list
- Auto-categorisation rule: new transaction categorised correctly
- Shared account: Liz sees same transactions as Steve

---

### 8.5 Test Data

Create a `test-data/` folder in the monorepo root containing:

| File | Purpose |
|------|---------|
| `sample-portfolio-holdings.csv` | CMC Stock Holdings format |
| `sample-portfolio-pnl.csv` | CMC Profit and Loss format with Cost AUD column |
| `sample-portfolio-with-gifted.csv` | Includes ANZ with zero cost basis |
| `sample-portfolio-usd.csv` | Includes VOO:US with FX rate |
| `mock-claude-analysis-response.json` | Valid Anthropic API response |
| `mock-claude-malformed-response.json` | Response with trailing text after JSON |
| `mock-claude-cycle-response.json` | Valid cycle position response |
| `seed-dynamodb.ts` | Script to populate DynamoDB with test data for E2E tests |

---

### 8.6 CI Enforcement

- Unit and integration tests: run on every pull request
- E2E tests: run on merge to `develop`
- No merge to `main` if any test fails
- Test coverage report generated on every PR
- Coverage threshold: **80%** on `cycle-engine` and CSV import packages

---

## Appendix A — Current vs Target Architecture

| Concern | Current (HTML) | Target | Status |
|---------|----------------|--------|--------|
| Frontend | Single HTML file | React + Vite + TypeScript | ✅ Live at dev.apps.transformotion.com.au |
| Hosting | `localhost:3000` | S3 + CloudFront | ✅ Live |
| Auth | None | Cognito | ✅ Live — email/password + Google/Microsoft/Facebook |
| Account model | None | UUID-based accounts | 🔄 In progress — Phase 2 |
| API key | localStorage | AWS Secrets Manager | ✅ Live |
| Claude API calls | Direct from browser | Lambda proxy | ✅ Live |
| Rate limiting | None | Exponential backoff retry | 🔄 In progress |
| Cache | localStorage | DynamoDB with TTL | 🔄 In progress — partial |
| Portfolio storage | localStorage | DynamoDB | 🔄 In progress |
| Watchlist storage | localStorage | DynamoDB | 🔄 In progress |
| localStorage | Used throughout | Fully removed | ✅ Zero localStorage calls |
| Charts | Yahoo Finance iframe | TradingView widget | ✅ Live |
| UI design | Custom HTML/CSS | v0 + React + Tailwind | 🔄 In progress |
| Email alerts | node-cron + Nodemailer | EventBridge + Lambda + SES | ⏳ Phase 4 |
| CI/CD | Manual git push | GitHub Actions OIDC | ✅ Live |
| Observability | None | CloudWatch | ⏳ Phase 6 |
| Testing | None | Vitest + Playwright | ⏳ Phase 6 |
| Second app | None | Budget Tracker | ⏳ Phase 5 |
| Third app | None | Transformotion Framework | ⏳ Future |

---

---

## 9. User, Account & Auth Model

This section is written to be self-contained. A developer who has never spoken to the product owner should be able to implement the complete auth and account system correctly from this section alone.

---

### 9.1 Concepts and Definitions

**User** — a person with a Cognito account. Identified by their Cognito `sub` UUID, used as `userId` throughout the system. A user exists independently of any account.

**Account** — a shared data space. All app data (portfolio, watchlist, transactions, etc.) belongs to an account, not a user. A user can belong to multiple accounts and switch between them.

**Account Member** — the relationship between a user and an account. Has a role and a set of app permissions.

**Role** — what a member can do within an account:
| Role | Can do |
|------|--------|
| `owner` | Full access; invite/remove members; delete the account; grant/revoke app permissions per member. Cannot be removed by others. |
| `admin` | Invite/remove members (except owner); update member roles (except owner). Cannot delete the account. |
| `member` | Read and write all app data within the account. Cannot manage members. |
| `viewer` | Read-only access to all app data. Cannot write any data. |

**App Permission** — a flag per app per member. Two independent layers control access:
1. **Cognito group** — can the user access this app at all (platform-level)
2. **App permission on `platform.account-members`** — can this user access this specific account's data in this app (account-level)

Both layers must pass. A user in the `stock-app` Cognito group with no `stock-app` permission on a given account cannot see that account's stock data.

**Example:** Steve invites Liz to his household account with permissions `[stock-app, budget-app]`. Liz is in the `stock-app` and `budget-app` Cognito groups. She sees both apps in the Launchpad and can access the household account data in both. If Steve later invites a colleague to a work account with `[transformotion]` permission only, the colleague sees only the Transformotion app and only the work account data.

---

### 9.2 DynamoDB Schema — Full Detail

**`platform.users`**
| Field | Type | Notes |
|-------|------|-------|
| `userId` | String (PK) | Cognito `sub` UUID |
| `email` | String | |
| `displayName` | String | |
| `avatarUrl` | String | Optional |
| `activeAccountId` | String | Mirrors `custom:active_account` Cognito attribute — both updated together on account switch |
| `createdAt` | String (ISO 8601) | |
| `updatedAt` | String (ISO 8601) | |

**`platform.accounts`**
| Field | Type | Notes |
|-------|------|-------|
| `accountId` | String (PK) | UUID generated at account creation — never changes |
| `displayName` | String | Mutable |
| `ownerId` | String | `userId` of creator. Ownership must be transferred before owner leaves. |
| `createdAt` | String (ISO 8601) | |
| `updatedAt` | String (ISO 8601) | |

**`platform.account-members`**
| Field | Type | Notes |
|-------|------|-------|
| `accountId` | String (PK) | |
| `userId` | String (SK) | |
| `role` | String | `owner` / `admin` / `member` / `viewer` |
| `appPermissions` | String Set | e.g. `{stock-app, budget-app}`. Check membership with DynamoDB `contains` condition. |
| `joinedAt` | String (ISO 8601) | |
| `invitedBy` | String | `userId` of the person who invited them |

**`platform.invitations`**
| Field | Type | Notes |
|-------|------|-------|
| `invitationId` | String (PK) | UUID |
| `accountId` | String | |
| `email` | String | Invitee email address |
| `role` | String | Role to assign on acceptance |
| `appPermissions` | String Set | App permissions to grant on acceptance |
| `invitedBy` | String | `userId` |
| `status` | String | `pending` / `accepted` / `expired` |
| `expiresAt` | Number | Unix epoch — DynamoDB TTL attribute (7 days from creation) |
| `createdAt` | String (ISO 8601) | |

GSI: `email-index` on `email` — used to look up pending invitations for a given email address at signup/login.

---

### 9.3 OAuth2 / Login Flow — Step by Step

Full **Authorization Code Flow with PKCE** (Cognito Hosted UI):

1. User visits `apps.transformotion.com.au`
2. React app checks for a valid access token in memory (tokens are stored **in memory only** — not localStorage, not cookies)
3. No valid token found → redirect to Cognito Hosted UI login page
4. User enters credentials on Cognito Hosted UI
5. Cognito redirects back to `apps.transformotion.com.au/callback` with an authorization code
6. React app exchanges the code for three tokens via the Cognito token endpoint:
   - **Access token** (JWT, short-lived — 1 hour) — sent as `Authorization: Bearer` header on every API call
   - **ID token** (JWT — contains user claims: Cognito groups, custom attributes)
   - **Refresh token** (opaque, long-lived — 30 days) — used to silently obtain new access tokens
7. Tokens stored **in memory only**
8. React app reads ID token claims:
   - `sub` → `userId`
   - `cognito:groups` → which apps the user can access (Launchpad tiles)
   - `custom:active_account` → currently active `accountId`
   - `custom:accounts` → all accounts the user belongs to
9. React app calls `GET /api/user` to load full user profile from `platform.users`
10. If no profile exists → trigger first-login flow (see 9.4)
11. Launchpad renders app tiles based on `cognito:groups`

**Token refresh:**
- The `api-client` package intercepts 401 responses and automatically exchanges the refresh token for a new access token
- Refresh is transparent — the user never sees a logout
- If the refresh token is expired (30 days) → redirect to Cognito login

---

### 9.4 First Login Flow

Triggered when a user logs in and no `platform.users` record exists for their `userId`.

**Case A — User signed up independently (not invited):**
1. Create `platform.users` record
2. Create a default account (`displayName: "[Name]'s Account"`) — `platform.accounts` record
3. Create `platform.account-members` record with `role: owner`, `appPermissions` matching their Cognito groups
4. Update `custom:active_account` and `custom:accounts` Cognito attributes
5. If Stock Analyser localStorage data detected → offer one-click migration to DynamoDB (Section 2, task 2.8)
6. Redirect to Launchpad

**Case B — User was invited before signing up:**
1. On signup, Cognito triggers a post-confirmation Lambda
2. Lambda queries `platform.invitations` via `email-index` GSI for pending invitations matching this email
3. For each pending invitation: create `platform.account-members` record; update invitation status to `accepted`
4. Create `platform.users` record with `activeAccountId` set to the first invited account
5. Update Cognito `custom:active_account` and `custom:accounts` attributes
6. Redirect to Launchpad — invited account is immediately visible

**Case C — Existing user accepts an invitation:**
1. User clicks the invitation link in the email
2. Link: `apps.transformotion.com.au/accept-invite?token=<invitationId>`
3. If not logged in → login flow first, then return to this URL
4. Lambda validates the invitation (not expired, email matches logged-in user's email)
5. Creates `platform.account-members` record
6. Updates `custom:accounts` Cognito attribute to include the new `accountId`
7. Prompts user to switch to the new account or stay on current

---

### 9.5 Invitation Flow — Detail

**Initiator (account owner or admin):**
1. Opens account settings in the app
2. Enters invitee email address
3. Selects role: `member` or `viewer` (owners/admins cannot grant `owner` role via invite)
4. Selects which apps this member can access — checkboxes, limited to apps in the invitee's Cognito groups
5. Clicks **Send Invitation**
6. Lambda: checks email is not already a member of this account (reject if so); creates `platform.invitations` record with 7-day TTL; sends SES email

**Invitation email contains:**
- Who invited them and to which account
- Which apps they will have access to
- Call to action: **Accept Invitation** button
- Link format: `apps.transformotion.com.au/accept-invite?token=<invitationId>`
- Expiry notice: link expires in 7 days

**Invitee (accepting):**
- If they already have an account: log in → invitation auto-applied → prompted to switch to new account
- If they are new: sign up → post-confirmation Lambda detects pending invitation → auto-applied (Case B above)

---

### 9.6 Account Switcher — Behaviour

The account switcher is a dropdown in the top navigation bar (desktop) and accessible from the profile menu (mobile).

**On switch:**
1. User selects a different account from the dropdown
2. React app calls `PUT /api/user/active-account` with the new `accountId`
3. Lambda validates the user is a member of that account, then updates `custom:active_account` Cognito attribute and `platform.users.activeAccountId`
4. React app:
   - Clears all TanStack Query cache (all data is account-scoped — stale data from the old account must not appear)
   - Updates global account context in Zustand store
   - Re-fetches all data for the new account
   - No full page reload — React state updates cleanly
5. All app tabs now show data for the new account

---

### 9.7 Lambda Middleware — JWT Extraction

Every Lambda function (except public endpoints like `/accept-invite`) runs this middleware before any business logic:

```typescript
function extractAuthContext(event: APIGatewayProxyEvent): AuthContext {
  // API Gateway JWT authorizer has already verified the token signature.
  // Claims are in requestContext — do not re-verify the token in Lambda.
  const claims = event.requestContext.authorizer?.jwt?.claims;

  if (!claims) throw new UnauthorizedError('No token claims');

  const userId     = claims['sub'] as string;
  const accountId  = claims['custom:active_account'] as string;
  const groups     = (claims['cognito:groups'] as string[]) || [];

  if (!userId)    throw new UnauthorizedError('No userId in token');
  if (!accountId) throw new UnauthorizedError('No active account in token');

  return { userId, accountId, groups };
}
```

All DynamoDB queries use `accountId` as the partition key condition. **No Lambda ever queries without an `accountId` filter.** A user cannot access data from an account they are not a member of — even if they know the `accountId` — because the middleware extracts `accountId` from the verified JWT, not from the request body or URL.

---

### 9.8 Role Enforcement in Lambda

Write operations check the member's role before proceeding:

```typescript
async function assertCanWrite(accountId: string, userId: string): Promise<void> {
  const member = await getMember(accountId, userId);
  if (!member) throw new ForbiddenError('Not a member of this account');
  if (member.role === 'viewer') throw new ForbiddenError('Viewers cannot write data');
}

async function assertIsAdmin(accountId: string, userId: string): Promise<void> {
  const member = await getMember(accountId, userId);
  if (!member) throw new ForbiddenError('Not a member of this account');
  if (!['owner', 'admin'].includes(member.role)) throw new ForbiddenError('Admin required');
}
```

---

### 9.9 App Permission Enforcement

Before returning or writing app-specific data, the Lambda verifies the member has permission for that app:

```typescript
async function assertAppPermission(
  accountId: string,
  userId: string,
  app: string
): Promise<void> {
  const member = await getMember(accountId, userId);
  if (!member?.appPermissions?.includes(app)) {
    throw new ForbiddenError(`No ${app} permission for this account`);
  }
}
```

This is the **second layer** of defence:
- **Layer 1** — API Gateway Cognito authorizer: does this user have access to this app at all (Cognito group)?
- **Layer 2** — Account-member app permission: does this user have access to this specific account's data in this app?

Both must pass. Neither layer alone is sufficient.

---

### 9.10 Security Rules Summary

These rules must never be violated:

| # | Rule |
|---|------|
| 1 | The `accountId` always comes from the verified JWT — never from the request body or URL parameters |
| 2 | Every DynamoDB query includes an `accountId` condition — no exceptions |
| 3 | Tokens are stored in memory only — never in localStorage or cookies |
| 4 | The Anthropic API key never leaves the Lambda — fetched from Secrets Manager and used within the same Lambda execution; never returned to the browser |
| 5 | A `viewer`-role member can never write data, regardless of which endpoint they call |
| 6 | An `admin` cannot elevate a member to `owner` — only the current `owner` can transfer ownership |
| 7 | Deleting an account requires `owner` role and at least one explicit confirmation step in the UI |
| 8 | Invitations expire after 7 days — expired invitations are ignored even if the token is structurally valid |

---

*This plan is a living document. Update it at the start of each session with progress, decisions made, and any scope changes.*
