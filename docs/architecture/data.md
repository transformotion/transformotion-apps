# Data model

## Overview

DynamoDB is the canonical datastore for auth-domain data and app data.
Ownership follows runtime ownership:

- **Launchpad auth tables** are owned by `LaunchpadAuthStack` and back
  authentication, token claims, account onboarding, user profile/preferences,
  account administration, member administration, invitations, and auth
  rate-limiting.
- **Per-app tables** are owned by the app that reads/writes them.
- **Platform tables are not part of the active architecture.** The old
  Platform auth/job/WSS tables were removed from Platform CDK ownership during
  #386 auth decommission.

All records in per-app data tables are keyed by `accountId`. The
account-scoping invariant means no handler may read or write another user's
account data.

See [auth.md](./auth.md) for the account membership model and
[cdk.md](./cdk.md) for stack ownership.

## Table naming convention

```
{scope}.{entity}-{stage}
```

or, for Launchpad-owned auth-domain tables:

```
launchpad-{entity}-{stage}
```

Examples:

- `launchpad-accounts-dev`
- `budget-tracker.transactions-prod`
- `stock-analyser.portfolio-dev`

App-specific tables must never use the `platform.` prefix. If a table is only
read or written by one app's Lambdas, it belongs in that app's scope and in that
app's infrastructure stack.

## Launchpad auth tables

Managed by `TransformotionDev-LaunchpadAuth` /
`TransformotionProd-LaunchpadAuth`.

These tables are consumed by Launchpad control-plane APIs and by the
LaunchpadAuth pre-token trigger.

### `launchpad-users-{stage}`

User profile and preferences keyed by Cognito `sub`.

| Attribute | Type | Notes |
|---|---|---|
| `userId` (PK) | String | Cognito `sub` |
| `email` | String | User email |
| `name` | String | Display name |
| `preferences` | Map | Launchpad/app UI preferences |
| `createdAt` / `updatedAt` | String | ISO 8601 |

### `launchpad-accounts-{stage}`

Account container records.

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | UUID |
| `name` | String | Human-readable account name |
| `appSlug` | String | App this account belongs to, e.g. `stock-analyser`, `budget-tracker` |
| `createdAt` | String | ISO 8601 |
| `ownerId` | String | Cognito `sub` of the creator |

The `launchpad-pre-token-generation-{stage}` trigger reads `appSlug` from this
table to build the `accounts` claim.

### `launchpad-account-members-{stage}`

Membership records: which users belong to which accounts, and in what role.

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `userId` (SK) | String | Cognito `sub` |
| `role` | String | `owner \| manager \| member \| viewer` |
| `email` | String | Denormalised for display |
| `joinedAt` | String | ISO 8601 |

**GSI:** `userId-index` (PK: `userId`) - required by the pre-token trigger to
find all account memberships for a user.

### `launchpad-invitations-{stage}`

Pending, redeemed, and expired invitations.

| Attribute | Type | Notes |
|---|---|---|
| `invitationId` (PK) | String | UUID |
| `email` | String | Normalised lowercase |
| `invitedBy` | String | Cognito `sub` of the inviting admin |
| `expiresAt` | Number | Epoch seconds, TTL |
| `status` | String | `pending \| redeemed \| expired` |
| `perApp` | Map | Per-app access configuration |

**GSI:** `email-index` (PK: `email`) - invitation lookup.

### `launchpad-rate-limits-{stage}`

Rate-limit state for Launchpad auth/control-plane endpoints.

| Attribute | Type | Notes |
|---|---|---|
| `key` (PK) | String | Rate-limit key |
| `expiresAt` | Number | Epoch seconds, TTL |
| `count` | Number | Window counter |

## Stock Analyser tables

Managed by `TransformotionDev-StockAnalyserTables` /
`TransformotionProd-StockAnalyserTables`.

### `stock-analyser.portfolio-{stage}`

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `ticker` (SK) | String | |
| `shares` | Number | |
| `avgCost` | Number | |
| `addedAt` | Number | Epoch ms |
| `isGifted` | Boolean | |

### `stock-analyser.watchlist-{stage}`

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `ticker` (SK) | String | |
| `name` | String | Company or instrument name |
| `addedAt` | Number | Epoch ms |
| `addedPrice` | Number | Optional price at addition |

### `stock-analyser.analysis-cache-{stage}`

Cache of AI analysis results and shared market data.

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | `SHARED` for market-wide data |
| `cacheKey` (SK) | String | Namespaced cache key |
| `data` | String | JSON-serialised cached response |
| `cachedAt` | String | ISO 8601 |
| `dataType` | String | Cached data type |
| `mode` | String | Cache mode |
| `expiresAt` | Number | Epoch seconds, TTL |

### `stock-analyser.job-results-{stage}`

Stock Analyser-owned async AI job results used by its app-owned AI proxy.

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `cacheKey` (SK) | String | `job-{jobId}` |
| `result` | Map | AI response payload |
| `status` | String | Job status |
| `expiresAt` | Number | Epoch seconds, TTL |

## Budget Tracker tables

Managed by `TransformotionDev-BudgetTrackerTables` /
`TransformotionProd-BudgetTrackerTables`.

### `budget-tracker.transactions-{stage}`

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `transactionId` (SK) | String | UUID |
| `date` | String | DD/MM/YYYY |
| `dateIso` | String | YYYY-MM-DD |
| `amount` | String | Signed string, preserves imported precision |
| `description` | String | Original CSV description |
| `category` | String | |
| `subcategory` | String | |
| `file` | String | Source CSV filename |
| `_manual` | Boolean | User manually categorised |
| `_business` | Boolean | Excluded from personal P&L |

**GSI:** `accountId-dateIso-index` (PK: `accountId`, SK: `dateIso`).

### `budget-tracker.rules-{stage}`

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `ruleId` (SK) | String | UUID |
| `name` | String | Human-readable rule name |
| `match` | String | Keyword or regex pattern |
| `matchType` | String | `keyword` or `regex` |
| `categoryId` | String | Category reference |
| `subcategoryId` | String | Subcategory reference |
| `enabled` | Boolean | |
| `priority` | Number | Lower value = higher priority |
| `learned` | Boolean | Created via Learn button |
| `createdAt` | String | ISO 8601 |

### `budget-tracker.settings-{stage}`

Key-value store for per-account settings.

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `settingKey` (SK) | String | Settings concept key |
| `value` | Map or List | Shape depends on `settingKey` |

### `budget-tracker.budget-data-{stage}`

Structured budget configuration.

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `concept` (SK) | String | `categories`, `budgetAmounts`, `budgetFrequencies` |
| `value` | Map or List | Shape depends on `concept` |

### `budget-tracker.ai-jobs-{stage}`

Tracks in-progress and completed AI review jobs per account.

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | |
| `jobId` (SK) | String | UUID |
| `userId` | String | Cognito `sub` |
| `status` | String | Job status |
| `createdAt` | String | ISO 8601 |
| `expiresAt` | Number | Epoch seconds, TTL |

**GSI:** `userId-index` (PK: `userId`).

## Account-scoping invariant

Every record in a per-app data table must be keyed by `accountId`. Every
handler that reads or writes per-app data must verify the caller's membership
in that account before touching DynamoDB.

Handlers enforce this by calling:

```typescript
requireAccountAccess(auth, 'stock-analyser', accountId)
// or
requireAccountAccess(auth, 'budget-tracker', accountId, 'member')
```

The `accountId` used in DynamoDB operations is always the one already verified
against the caller's LaunchpadAuth-issued `accounts` claim.

## Account relationships example

Steve creates a Budget Tracker account (`steve-bt-uuid`) and invites Liz. The
resulting Launchpad auth-domain records:

```text
launchpad-accounts-dev:
  accountId=steve-bt-uuid  name="Moodie Family"  appSlug=budget-tracker  ownerId=steve-sub

launchpad-account-members-dev:
  accountId=steve-bt-uuid  userId=steve-sub   role=owner
  accountId=steve-bt-uuid  userId=liz-sub     role=member
```

When Liz signs in, the pre-token Lambda queries `userId-index`, resolves
`appSlug` from `launchpad-accounts-dev`, and emits:

```json
{
  "accounts": {
    "budget-tracker": [
      { "accountId": "steve-bt-uuid", "role": "member" }
    ]
  }
}
```

The active account is selected client-side by sending `X-Account-Id` on
account-scoped API requests.

## CDK constraints to remember

**1. `Table.fromTableName()` does not know about GSIs.** When a handler queries
a GSI, use `Table.fromTableAttributes()` with explicit `globalIndexes`.

**2. Cognito user pool schemas are append-only.** Custom attributes declared on
a user pool cannot be removed. Plan names and types carefully.

**3. Removing CDK cross-stack dependencies does not reorder deploys.** Workflows
must deploy stacks in the required order explicitly.

**4. S3 buckets containing important data should not use `autoDeleteObjects`.**
Use `removalPolicy: RETAIN` for durable buckets.

**5. `cdk import` requires CDK config to match deployed reality exactly.** Run
`aws dynamodb describe-table` before writing import constructs.
