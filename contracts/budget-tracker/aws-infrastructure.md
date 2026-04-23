# AWS Infrastructure

**The AWS resources that back the Budget Tracker.** This is Claude Code's domain — v0 never touches AWS. Documented here so both tools have a shared understanding of what the real adaptors will connect to.

## Overview

```
User browser
    ↓
CloudFront (apps.transformotion.com.au/budget-tracker)
    ↓
S3 (Next.js static export — shared bucket, budget-tracker/ prefix)
    ↓
API Gateway (budget-tracker-api-{stage} — /api/budget/v1/*)
    ↓
Lambda Functions
    ↓
┌─────────────────────────────────────────────┐
│ Cognito    DynamoDB    Secrets Manager      │
│ (Auth)     (Data)      (Anthropic API key)  │
└─────────────────────────────────────────────┘
```

## Cognito

**Shares the platform Cognito User Pool** (`transformotion-{stage}`). Budget Tracker does not create its own user pool.

Budget Tracker has a **dedicated app client**: `BudgetTrackerAppClient` — one of three distinct app clients in the three-client model introduced in sub-phase 7b.5-alpha.

- **Dev client ID:** `291vbglkino4h7b9t39krg9c69`
- **Env var:** `NEXT_PUBLIC_BUDGET_TRACKER_COGNITO_CLIENT_ID`
- **Supported IDPs:** Cognito only (no social sign-in on this client — social sign-in happens at the launchpad and propagates via SSO)
- **Callback URL:** `{host}/budget-tracker/callback`
- **Logout URL:** `{host}/sign-in`

Required group for access (target — sub-phase 7e): `budget-app-user` or `budget-app-admin` or `site-admin`  
Current group (deployed): `budget-app` or `admin`

JWT claims used by Lambda handlers:
- `sub` — userId
- `cognito:groups` — app access authorization (transitional; replaced by `apps` claim after 7e)
- `email`
- `apps` — structured app access claim (available after 7e pre-token Lambda is deployed)
- `accounts` — per-app membership claim (available after 7e pre-token Lambda is deployed)

For the complete auth model see [/docs/architecture/auth.md](/docs/architecture/auth.md).

## DynamoDB tables

All tables follow the naming convention `budget-tracker.<entity>` for easy identification and IAM policy scoping.

### `budget-tracker.accounts`

The household container. One record per shared account.

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | UUID |
| `name` | String | |
| `members` | List of maps | `[{ userId, role, email, joinedAt }]` |
| `createdAt` | String | ISO 8601 |

**GSI:** `userId-index` on `members[].userId` for fast lookup: "which account is this user part of?"

### `budget-tracker.transactions`

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `transactionId` (SK) | String | UUID |
| `date` | String | DD/MM/YYYY (preserved as string for display) |
| `dateIso` | String | YYYY-MM-DD (for range queries) |
| `amount` | String | Preserved as imported |
| `description` | String | |
| `category` | String | |
| `subcategory` | String | |
| `file` | String | Source CSV filename |
| `_manual` | Boolean | |
| `_business` | Boolean | |

**GSI:** `accountId-dateIso-index` with partition key `accountId`, sort key `dateIso` — enables efficient month/range queries.

### `budget-tracker.rules`

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `ruleId` (SK) | String | UUID |
| `match` | String | |
| `category` | String | |
| `subcategory` | String | |
| `learned` | Boolean | |
| `createdAt` | String | |

### `budget-tracker.settings`

Key-value store for per-account settings. Each settings key is its own item so individual fields can be updated without reading/writing the whole record.

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `settingKey` (SK) | String | `budgetOverrides`, `budgetFreqs`, `customCategories`, `projectBudgets`, `deletedSubs`, `csvFormatMappings` |
| `value` | Map or List | Shape depends on `settingKey` — see `data-models.md` |

## Lambda functions

All Lambdas share:
- Runtime: Node.js 20
- Package: `backend/functions/budget/`
- Common middleware: JWT verification, `accountId` resolution, error handling
- Environment variables: `DYNAMO_TABLE_PREFIX=budget-tracker.`, `ANTHROPIC_SECRET_ARN`, `REGION`

### `budget-transactions-handler`

Handles: `GET /transactions`, `POST /transactions/bulk`, `PATCH /transactions/:id`, `DELETE /transactions/:id`

IAM permissions:
- `dynamodb:Query`, `dynamodb:GetItem`, `dynamodb:BatchWriteItem`, `dynamodb:UpdateItem`, `dynamodb:DeleteItem` on `budget-tracker.transactions`

### `budget-rules-handler`

Handles: `GET /rules`, `POST /rules`, `PATCH /rules/:id`, `DELETE /rules/:id`

IAM permissions: same pattern on `budget-tracker.rules`

### `budget-settings-handler`

Handles: `GET /settings`, `PATCH /settings`

IAM permissions: same pattern on `budget-tracker.settings`

### `budget-ai-categorise-handler`

Handles: `POST /ai/categorise`

Calls Anthropic via the **shared `/api/claude` proxy** — does not call Anthropic directly. Rate limiting, retry, cost tracking live in the proxy.

IAM permissions:
- `lambda:InvokeFunction` on `claude-api-proxy` (shared proxy)

### `budget-ai-review-handler`

Handles: `POST /ai/review`

Calls Anthropic via shared proxy with `web_search` tool enabled. Streams batches via API Gateway chunked response.

IAM permissions: same as above

### `budget-ai-csv-analysis-handler`

Handles: `POST /ai/csv-analysis`

IAM permissions: same as above

### `budget-export-handler`

Handles: `GET /business-export`

Streams CSV directly from DynamoDB Query results.

IAM permissions:
- `dynamodb:Query` on `budget-tracker.transactions`

### `budget-migrate-handler`

Handles: `POST /migrate-from-localstorage`

Idempotent bulk import. Uses composite key `{date, amount, description, file}` to deduplicate.

IAM permissions:
- `dynamodb:BatchWriteItem`, `dynamodb:Query`, `dynamodb:PutItem` on all `budget-tracker.*` tables

## Shared resources (already deployed)

These are used by Budget Tracker but built for all Transformotion apps:

| Resource | Purpose |
|---|---|
| `claude-api-proxy` Lambda | Proxies all Claude calls. Handles auth, rate limiting, retry, cost tracking, Secrets Manager lookup |
| `transformotion-users` Cognito User Pool | Shared auth |
| `/prod/anthropic/api-key` Secrets Manager entry | API key for `claude-api-proxy` |
| Shared S3 bucket + CloudFront distribution | Static hosting |

Budget Tracker does not re-create any of these.

## Rate limits and cost controls

Applied in `claude-api-proxy`, not in individual budget Lambdas:

- **Daily budget**: $5 USD per account per day across all budget AI endpoints
- **Per-minute rate limit**: 30 AI calls per account per minute
- **Hard token limits**: 4096 max_tokens per request
- **Timeout**: 30 seconds per AI call; 2 retries on transient failures

## Deployment

- Infrastructure as Code: AWS CDK in `infrastructure/`
- Deploy per environment: `dev` and `prod`
- Dev environment: `dev.apps.transformotion.com.au` — deployed via GitHub Actions on push to `develop`
- CI/CD: already configured (see the Stock Analyser pipeline as the pattern)

## Cost projection (free tier)

For a single household (Steve + Liz):
- **Cognito**: 2 MAUs — free (50k free tier)
- **S3**: <1MB storage — free
- **CloudFront**: <1GB transfer/month — free
- **API Gateway**: ~10k calls/month — free (1M free tier)
- **Lambda**: ~10k invocations/month — free (1M free tier)
- **DynamoDB**: <100MB, <5 WCU, <5 RCU — free (25GB, 25 WCU/RCU free tier)
- **Anthropic API**: ~$2-5/month — billed separately

Total AWS cost: **~$0-1/month** (Route 53 hosted zone only).

## Security

- All Lambdas assume their own IAM role — no shared execution role
- DynamoDB IAM policies are scoped by table AND by `accountId` via `LeadingKeys` condition where possible
- Secrets Manager API key is never logged, never returned to client
- CORS on API Gateway locked to `https://apps.transformotion.com.au` (and `https://dev.apps.transformotion.com.au` for dev)
- All data encrypted at rest (DynamoDB) and in transit (HTTPS only)

## What goes in `/contracts` vs what goes in Claude Code's own docs

This file documents **what** exists and **why**. Implementation details — CDK stack structure, IAM policy JSON, exact ARNs — live in Claude Code's infrastructure docs in `transformotion-apps/infrastructure/README.md`. If v0 ever needs to know about infrastructure, it reads this file, not Claude Code's internal docs.
