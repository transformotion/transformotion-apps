# Data model

## Overview

DynamoDB is the canonical datastore for all platform and app data. Tables are divided into two scopes:

- **Platform tables** — shared infrastructure, used by the platform API and available to all apps. Managed by `PlatformTablesStack`.
- **Per-app tables** — owned exclusively by one app. Managed by that app's `TablesStack`.

All records in per-app data tables are keyed by `accountId`. The account-scoping invariant (see below) means no handler may read another user's data.

See [auth.md](./auth.md) for the account membership model. See [cdk.md](./cdk.md) for stack names.

---

## Table naming convention

```
{scope}.{entity}-{stage}
```

- `scope` is either `platform` (cross-app) or an app slug (`stock-analyser`, `budget-tracker`)
- `stage` is `dev` or `prod`

Examples: `platform.accounts-dev`, `budget-tracker.transactions-prod`, `stock-analyser.portfolio-dev`

**Enforcement rule:** App-specific tables must never use the `platform.` prefix. If a table is only read or written by one app's Lambdas, it belongs in that app's scope (e.g. `stock-analyser.*`, `budget-tracker.*`) and in that app's `TablesStack`.

---

## Platform tables

Managed by `TransformotionDev-PlatformTables` / `TransformotionProd-PlatformTables`.

### `platform.users-{stage}`

User preferences, stored per Cognito `sub`.

| Attribute | Type | Notes |
|---|---|---|
| `userId` (PK) | String | Cognito `sub` |
| `defaultMode` | String | UI preference |
| `notificationsEnabled` | Boolean | |
| `cycleAlertThreshold` | Number | Stock Analyser alert threshold |
| `lastAnalysedTicker` | String | Most recently analysed ticker |

Served by `transformotion-user-{stage}` Lambda (`GET /api/user/profile`, `PUT /api/user/preferences`).

### `platform.accounts-{stage}`

Account container records, shared across all apps.

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | UUID |
| `name` | String | Human-readable account name |
| `appSlug` | String | Which app this account belongs to (`stock-analyser`, `budget-tracker`) |
| `createdAt` | String | ISO 8601 |
| `ownerId` | String | userId of the account creator |

Served by `transformotion-accounts-{stage}` Lambda.

### `platform.account-members-{stage}`

Membership records: which users belong to which accounts, and in what role.

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `userId` (SK) | String | Cognito `sub` |
| `role` | String | `owner \| manager \| member \| viewer` |
| `email` | String | Denormalised for display |
| `joinedAt` | String | ISO 8601 |

**GSI:** `userId-index` (PK: `userId`) — look up all accounts a given user belongs to.

Read by the pre-token generation Lambda to build the `accounts` claim. Also read by account membership handlers.

### `platform.invitations-{stage}`

Pending, redeemed, and expired invitations.

| Attribute | Type | Notes |
|---|---|---|
| `invitationId` (PK) | String | UUID |
| `email` | String | Normalised lowercase |
| `invitedBy` | String | userId of the inviting admin |
| `createdAt` | String | ISO 8601 |
| `expiresAt` | Number | Epoch-seconds (TTL attribute — 7 days) |
| `status` | String | `pending \| redeemed \| expired` |
| `perApp` | Map | Per-app access configuration — see [auth.md](./auth.md) for shape |

**GSI:** `email-index` (PK: `email`) — look up pending invitations for a newly registered user.

Served by `transformotion-invitations-{stage}` Lambda.

---

## Per-app tables

### Stock Analyser

Managed by `TransformotionDev-StockAnalyserTables` / `TransformotionProd-StockAnalyserTables`.

#### `stock-analyser.portfolio-{stage}`

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `ticker` (SK) | String | |
| `shares` | Number | |
| `avgCost` | Number | |
| `addedAt` | Number | Epoch ms |
| `isGifted` | Boolean | |

#### `stock-analyser.watchlist-{stage}`

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `ticker` (SK) | String | |

#### `stock-analyser.analysis-cache-{stage}`

Cache of Claude AI analysis results, keyed per account.

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `cacheKey` (SK) | String | Namespaced cache key (e.g. `MARKET#ASX`, `ANALYSIS#CBA.AX`) |
| `result` | Map | Cached response |
| `expiresAt` | Number | Epoch-seconds (TTL attribute) |

Served by `transformotion-analysis-cache-{stage}` Lambda (`GET/PUT/DELETE /analysis-cache/{key}`).

For full type definitions see [contracts/stock-analyser/DATA_CONTRACTS.md](/contracts/stock-analyser/DATA_CONTRACTS.md).

### Budget Tracker

Managed by `TransformotionDev-BudgetTrackerTables` / `TransformotionProd-BudgetTrackerTables`.

#### `budget-tracker.transactions-{stage}`

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `transactionId` (SK) | String | UUID |
| `date` | String | DD/MM/YYYY (preserved for display) |
| `dateIso` | String | YYYY-MM-DD (for range queries) |
| `amount` | String | Signed — preserved as imported to avoid floating-point issues |
| `description` | String | Original description from CSV |
| `category` | String | |
| `subcategory` | String | |
| `file` | String | Source CSV filename |
| `_manual` | Boolean | `true` = user manually categorised; rules engine will not overwrite |
| `_business` | Boolean | `true` = excluded from personal P&L |

**GSI:** `accountId-dateIso-index` (PK: `accountId`, SK: `dateIso`) — efficient date-range queries.

#### `budget-tracker.rules-{stage}`

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `ruleId` (SK) | String | UUID |
| `match` | String | Keyword or regex pattern, case-insensitive |
| `category` | String | |
| `subcategory` | String | |
| `learned` | Boolean | `true` = created via "Learn" button; `false` = manually authored |
| `createdAt` | String | ISO 8601 |

#### `budget-tracker.settings-{stage}`

Key-value store — each settings field is its own DynamoDB item.

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `settingKey` (SK) | String | `budgetOverrides`, `budgetFreqs`, `customCategories`, `projectBudgets`, `deletedSubs`, `csvFormatMappings`, and others |
| `value` | Map or List | Shape depends on `settingKey` — see [v0-reference/contracts/budget-tracker/data-models.md](/v0-reference/contracts/budget-tracker/data-models.md) |

For full type definitions see [v0-reference/contracts/budget-tracker/data-models.md](/v0-reference/contracts/budget-tracker/data-models.md).

---

## The account-scoping invariant

**Every record in a per-app data table must be keyed by `accountId`. Every handler that reads or writes per-app data must verify the caller's membership in that account before touching DynamoDB.**

Handlers enforce this by calling:

```typescript
requireAccountAccess(auth, 'stock-analyser', accountId)
// or
requireAccountAccess(auth, 'budget-tracker', accountId, 'member')
```

before any DynamoDB operation. The `accountId` used in DynamoDB operations is always the one already verified against the caller's `accounts` claim — never trusted directly from a query parameter without verification.

This invariant means: even if a user knows another account's UUID, they cannot read or write its data. Authorization is enforced at the handler layer, not at DynamoDB's IAM level (LeadingKeys conditions are aspirational — see Issue #42 for platform Lambda IAM hardening).

---

## Account relationships example

Steve creates a Budget Tracker account (`steve-bt-uuid`). He invites Liz. The resulting records:

```
platform.accounts-dev:
  accountId=steve-bt-uuid  name="Moodie Family"  appSlug=budget-tracker  ownerId=steve-sub

platform.account-members-dev:
  accountId=steve-bt-uuid  userId=steve-sub   role=owner
  accountId=steve-bt-uuid  userId=liz-sub     role=member
```

When Liz signs in, the pre-token Lambda queries `userId-index` for `liz-sub`, finds both rows (Liz's own account + Steve's), and builds:

```json
{
  "accounts": {
    "budget-tracker": [
      { "accountId": "liz-bt-uuid",   "role": "owner"  },
      { "accountId": "steve-bt-uuid", "role": "member" }
    ]
  }
}
```

Liz's active account (`custom:active_accounts["budget-tracker"]`) determines which data she sees by default. She can switch accounts via `POST /auth/switch`.

---

## CDK constraints to remember

These CDK and CloudFormation constraints are not obvious and have cost real deploy failures. Noted here so future work doesn't rediscover them.

**1. `Table.fromTableName()` doesn't know about GSIs.** When imported this way, `grantReadData()` only covers the table ARN, not the index ARN. For tables with GSIs that handlers query, use `Table.fromTableAttributes()` with explicit `globalIndexes` list. For tables without GSIs (or where the handler doesn't query the index), `fromTableName` is fine.

**2. Cognito user pool schemas are append-only.** Custom attributes declared on a user pool cannot be removed. They can be abandoned (not written, not read) but remain declared forever. Plan custom attribute names and types carefully — they are permanent.

**3. Removing CDK cross-stack dependencies doesn't reorder deploys.** If you move a resource between stacks or change how stacks reference each other, CDK no longer has a basis to sequence deploys. The workflow-level sequence (which stacks deploy first) may need explicit ordering, often via separate `cdk deploy` steps in CI. The `deploy-platform.yml` file has examples of this pattern (PlatformTables runs in its own step after Api releases its imports).

**4. S3 buckets containing important data should NEVER have `autoDeleteObjects: true`.** This is a CDK convenience for ephemeral dev buckets. For backups buckets, use `removalPolicy: RETAIN` alone and allow manual deletion only.

**5. `cdk import` requires CDK config to match deployed reality exactly.** If the deployed table has a sort key but the CDK construct doesn't declare it (or vice versa), the import changeset will fail. Run `aws dynamodb describe-table` before writing the CDK construct for any table being imported.
