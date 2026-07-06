# Data model

## Overview

DynamoDB is the canonical datastore for auth-domain data and app data.
Ownership follows runtime ownership:

- **Launchpad auth tables** are owned by `LaunchpadAuthStack` and back
  authentication, token claims, account onboarding, user profile/preferences,
  account administration, member administration, invitations, and auth
  rate-limiting.
- **Launchpad control-plane tables** are owned by `LaunchpadControlPlaneStack`
  and back site-admin configuration such as runtime AI provider/model
  selection.
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
| `email` | String | User email (original case) |
| `emailLower` | String | Lowercase email — used by `email-index` GSI for redemption lookup (M16 D4) |
| `displayName` | String (optional) | Human-friendly name. Present only when the IdP supplied a real given/family name **or** the user set one explicitly (#494/#496); **omitted at bootstrap** (no email fallback at write time). **Source of truth for the user's name — the pre-token-generation trigger projects it into the token's `display_name` claim (#501), keyed on the `sub`, so the name a user sets in Profile shows across every app.** Never denormalized onto membership rows (D6). |
| `profileComplete` | Boolean | False until user completes first-time profile setup |
| `status` | String | `active \| disabled`. Absent means `active` (backwards compatibility). |
| `preferences` | Map | `{ notificationsEnabled: boolean }` |
| `activeAccounts` | Map | `{ [appSlug]: accountId }` — active account selection per app, owned by control plane (M16 D7) |
| `createdAt` / `updatedAt` | String | ISO 8601 |

**GSI:** `email-index` (PK: `emailLower`) — exact-email lookup for redemption identity matching and duplicate detection (M16 D4).

**Display name fallback chain (M16, applies at read time — never write-time):**
1. `displayName` (if set and non-empty)
2. Email local part (`email.split('@')[0]`)

Computed at read time; **never** the full email (#494) and never written back to the row. The auth client applies the same rule to the token name (`composeDisplayName`), and the launchpad greeting prefers an explicitly-set `displayName` then the token name — so an unset name resolves to the token's given name, not an email-derived value.

**Row population (#496).** A `launchpad-users` row is created by `POST /auth/setup` (`account-provisioning`) on the user's **first authenticated app load**, and upserted as a backup by **invitation redemption** for the redeeming invitee. Both write the **canonical bootstrap shape** — `userId, email, emailLower, status:'active', preferences:{notificationsEnabled:false}, profileComplete:false, activeAccounts:{}, createdAt, updatedAt` — and **omit `displayName`** unless a real name is available (account-provisioning may add it from Cognito `given_name`/`family_name`). Both are idempotent (`attribute_not_exists(userId)`). The row may also be created incidentally by the first `PUT /api/user/preferences` / `PUT /api/user/active-accounts` upsert. The admin Users & Access directory (`access-summary`) treats this table as its authoritative universe, so a missing row makes a user invisible despite holding memberships/groups. **IAM (#567):** the redemption `ensureUserRow` upsert requires `invitation-redemption` to hold *read-write* on this table — it held read-only from #462 until #567, so every real `/redeem` returned a 500 (`AccessDeniedException` on `PutItem`) and the redemption path was unusable end-to-end.

**No display name denormalization (M16 D6 standing rule).** `displayName` lives only on the user item. Member lists, grant rows, access summaries, and discovery results are enriched at read time via `BatchGetItem` on the users table. Do not copy display names onto membership or grant items.

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
| `role` | String | `owner \| manager \| member \| viewer` (M16 vocabulary) |
| `appSlug` | String | Denormalized from the account (M16 D3). Safe write-once: an account's app never changes. Legacy rows may be missing this field; new writes always set it. Fail-closed on missing `appSlug` — deny rather than guess. |
| `email` | String | Denormalized for display (legacy; prefer user-table read for displayName) |
| `joinedAt` | String | ISO 8601 |

**GSI:** `userId-index` (PK: `userId`) — required by the pre-token trigger to find all account memberships for a user.

**GSI:** `appSlug-index` (PK: `appSlug`, SK: `userId`) — app-scoped member discovery: "all users with membership in any account of app X" (M16 D3). Used by invitee discovery (Phase 7) and app-admin summaries.

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

**Pending-by-account lookup (#555):** `launchpad-accounts-{stage}` reads this table
(read-only) to surface an account's pending invitations on
`GET …/members/detail`. The target account is nested inside each bundle's
`grants[]`, and a single bundle may grant into multiple accounts — a nested-list
attribute cannot back a GSI, so there is no viable target-account index without
denormalising the write path. The handler therefore uses a filtered Scan (the
same pattern as invitation-bundles-list and invitee-search) against this small,
low-volume control-plane table.

**Pending-by-email list (M11):** `launchpad-access-summary-{stage}` also reads
this table (read-only Scan) to build the per-user pending-invitation **list**
(`UserAccessSummary.pendingInvitations`, one row per grant), matched by
lowercased `email`; the count badge `pendingInvites` is the list length (the
contract invariant `pendingInvites === pendingInvitations.length`). Account-invite
targets are resolved to account names (BatchGet on the accounts table, fallback to
id). Only EXISTING users surface anything — invitees who are not yet users are
absent from the directory.

### `launchpad-app-admin-grants-{stage}` (M16 D5)

App-admin grants: policy primitive for app-scoped administrative authority. Kept separate from the membership table so `isAppAdmin(userId, appSlug)` is unambiguous and cannot be confused with account membership.

Managed by `TransformotionDev-LaunchpadAuth` / `TransformotionProd-LaunchpadAuth`.

| Attribute | Type | Notes |
|---|---|---|
| `appSlug` (PK) | String | The entitled app slug |
| `userId` (SK) | String | Cognito `sub` |
| `role` | String | Always `app-admin` (M16 vocabulary) |
| `grantedAt` | String | ISO 8601 |

**GSI:** `userId-index` (PK: `userId`) — reverse lookup: "what apps does this user admin?" Used by access summaries and pre-token `app_admin` claim.

**Policy boundary (standing rule, M16 D5):** App-admin does NOT imply account membership. An app-admin row in this table must never be interpreted as or conflated with a membership row. The tables are separate precisely to prevent policy drift.

### `launchpad-rate-limits-{stage}`

Rate-limit state for Launchpad auth/control-plane endpoints.

| Attribute | Type | Notes |
|---|---|---|
| `key` (PK) | String | Rate-limit key |
| `expiresAt` | Number | Epoch seconds, TTL |
| `count` | Number | Window counter |

## Launchpad control-plane tables

Managed by `TransformotionDev-LaunchpadControlPlane` /
`TransformotionProd-LaunchpadControlPlane`.

### `launchpad-ai-runtime-config-{stage}`

Site-admin-managed AI provider/model selection. This table stores only
provider/model configuration; API keys and provider secrets remain in
Secrets Manager/env/CDK and are not stored here.

| Attribute | Type | Notes |
|---|---|---|
| `pk` (PK) | String | Always `AI_CONFIG` |
| `sk` (SK) | String | `PLATFORM#default`, `APP#stock-analyser`, or `APP#budget-tracker` |
| `provider` | String | `claude` or `openai` |
| `model` | String | Provider/model allowlist: `claude-sonnet-4-6`, `claude-opus-4-8`, `claude-haiku-4-5-20251001`, `gpt-5.4-mini`, `gpt-5.4`, `gpt-5.5`, `gpt-5.4-nano` |
| `updatedAt` | String | ISO 8601 |

Runtime resolution order is app override, then platform default, then
environment fallback. Missing, invalid, or unreadable config falls back to
the app Lambda's env fallback.

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

Cache of AI analysis results and shared market data. The market-wide entries
`MARKET#{region}` (`SHARED` partition, 24h TTL) are **warmed daily** by the
notification engine (#584) so the Market tab reads hit cache instead of running
a live model call; the warm-write runs the SAME grounded computation as a live
Market-tab run (identical-by-construction) and is gated by the #571 kill-switch.
The Metals engine (#627) writes the fixed `METALS` shared cache entry after a
live engine run, with the `packages/contracts` 24h TTL. It also stores private
`SHARED` bookkeeping rows in this table for feed-derived close math:
`METALS_CLOSES#{date}` rolling daily closes and `METALS_BASELINE#{year}` YTD
baselines. Those rows have a rolling ~400-day TTL and let the engine compute
30-day/YTD changes locally from one metals.dev `latest` call plus at most one
cold-start seed/baseline lookup.

**Consume side** — all five AI tabs (Market, Recs, ETFs, Metals, Analyser) share
the cache-first `useScopedAnalysis` hook (`lib/hooks/use-scoped-analysis.ts`,
conforming to `contracts/stock-analyser/analysis-cache.behaviour.md`): idle on
load/scope-change, **Run/Re-run reads the real cache first** (served with no
model call when present & not past TTL via `isCacheExpired`), **Refresh** is the
only force-live, and Live/Fast drives `webSearch`. The hook maps each tab's scope
to its real key (`analysisRealCacheKey`: `market:{region}`→`MARKET#{region}`,
`etfs`→`ETF#{market}`, `analyser`→`ANALYSIS#{ticker}`, `recs`→`RECS#…`,
`metals`→`METALS`) — so the Market tab's Run consumes the #584 warm entry.

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

### `stock-analyser.settings-{stage}`

Stock Analyser-owned settings store for app-wide policy, account/user
preferences, and notification delivery consent.

| Attribute | Type | Notes |
|---|---|---|
| `pk` (PK) | String | `SETTINGS`, `ACCOUNT#{accountId}`, `NOTIFICATION_CONSENT#{accountId}`, or `AI_CONFIG` (#586 app-level AI override) |
| `sk` (SK) | String | `CACHE_FRESHNESS#stock-analyser`, `NOTIFICATION_ENGINE_CONFIG#stock-analyser` (#571 kill-switch), `NOTIFICATIONS#{accountId}`, `USER#{userId}#PREFERENCES`, `USER#{userId}`, or `APP#stock-analyser` (#586 AI Engine override, under `pk=AI_CONFIG`) |

The **AI Engine override** (#586) is **app-level**: ONE record at `AI_CONFIG` /
`APP#stock-analyser` (`{ provider, model, updatedAt }`, top-level shape), read by
BOTH the live app (ai-proxy) and the daily batch engine. It replaced a
per-account `ACCOUNT#{accountId}` / `APP#AI_RUNTIME` row that the batch never
read — see [auth/route classification](./route-classification-m16.md).

The app-wide **engine kill-switch** (#571) lives at `SETTINGS` /
`NOTIFICATION_ENGINE_CONFIG#stock-analyser` — `{ notificationsEnabled, updatedAt }`,
default ON. The notification engine reads it at the top of each daily run and
no-ops (a minimal `engine-disabled` send-log record) when OFF; the EventBridge
rule is unchanged. Write is **site/app-admin only** (server-enforced, fail-closed
via token groups); read is any member (the card resolves toggle visibility).
| `activePolicy` | Map | Cache freshness policy row |
| `intervalDays` | Number | Notification account cadence, minimum 1 |
| `activeTypes` | List | Notification source types, e.g. `portfolio`, `watchlist` |
| `receiveConsent` | Boolean | Per-user delivery opt-in, default off when row absent |
| `updatedAt` | String | ISO 8601 |

### `stock-analyser.notification-state-{stage}`

Durable transition state for M19 background email notifications. This table
has no TTL so standing verdict state survives across runs.

| Attribute | Type | Notes |
|---|---|---|
| `accountId` (PK) | String | Account being processed |
| `sk` (SK) | String | `NOTIF#{type}#{ticker}` |
| `type` | String | `Portfolio` or `Watchlist` |
| `ticker` | String | Normalised ticker |
| `lastVerdict` | String | `BUY`, `SELL`, `HOLD`, or `NEUTRAL` |
| `lastNotifiedAt` | Number | Epoch seconds; set only after delivery |
| `lastProcessedDate` | String | UTC `YYYY-MM-DD` used for cadence checks |

### `stock-analyser.notification-send-log-{stage}` (M19 #572)

Append-only **audit** of each notification run — the source for the run-history
UI (#573) and the adversarial leakage/skip verification. Three levels: a run
summary, one item per evaluated account, with the per-member outcome+reason list
embedded at the leaf (identity + reason, **not** counts — that leaf is the
verification signal). **TTL `expiresAt` (90 days)** — the inverse of
notification-state's no-TTL store, which is why it is a separate table.

| Item | PK | SK | Key attributes |
|---|---|---|---|
| Run summary | `RUN#{runId}` | `SUMMARY` | `runId`, `ranAt` (epoch), `status` (`success`/`partial`/`failed`), `accountsEvaluated`, `accountsProcessed`, `accountsSkippedNotDue`, `accountsSkippedNoEligible`, `emailsSent`, `error?` |
| Per-account | `RUN#{runId}` | `ACCT#{accountId}` | `accountId`, `accountName?`, `status` (`processed`/`skipped-not-due`/`skipped-no-eligible`/`failed`), `transitions[]` (`{ticker,type,fromVerdict,toVerdict}`), `emailsSent`, `memberOutcomes[]`, `error?` |

`memberOutcomes[]` leaf: `{ userId, email?, outcome: sent\|skipped, reason, tickers? }`.
`reason` ∈ `delivered` (sent) / `consent-off` / `disabled` / `viewer` /
`not-a-member` / `lookup-error` / `no-actionable-transition` / `account-not-due`.

- **GSI1** `gsi1-runs-by-recency` (PK `gsi1pk`=`RUNS`, SK `gsi1sk`=`ranAt`) — recent-runs list.
- **GSI2** `gsi2-account-history` (PK `gsi2pk`=`ACCT#{accountId}`, SK `gsi2sk`=`ranAt`) — per-account history.
- By-run reads (verification) use `Query` on `PK=RUN#{runId}` (summary + all accounts in one query).

The engine holds **write-only** on this table (it appends run records); reads are #573's.
The write is **fault-tolerant** (#578): per-account writes are isolated, so one
account whose write fails is recorded as a `failed` marker (`error` set) and the
loop continues rather than dropping the accounts that follow; any write loss
escalates the run to `partial`, and the `SUMMARY` is written **last** so its
`status` reflects the actual write outcome. Member leaves omit `email` when
absent (never `undefined`), and the client uses `removeUndefinedValues` as a
safety net.

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

Handlers enforce this with the data-authority factory (D9, M16):

```typescript
const saData = requireAccountData('stock-analyser');
saData.read(auth, accountId);                          // read tier — claims only, viewer passes
await saData.write(auth, accountId, membershipLoader); // write tier — claims + live members row
```

There is **no site-admin data bypass** — membership is the only grant of data
authority. The `accountId` used in DynamoDB operations is always the one
already verified against the caller's LaunchpadAuth-issued `accounts` claim.
(`requireAccountAccess` was deleted in M16 Phase 5.)

**Row-class authorization in mixed partitions (D12).** Within a single per-app
table, item key shape determines the authorization tier, not the route:

- **Account-shared rows** (`PK=accountId`, no user dimension — e.g. Budget
  Tracker transactions/rules/budget-data/settings) are governed by the D8 write
  tier: a `viewer` reads but cannot write.
- **User-scoped rows** (`SK` carries the user, e.g. Stock Analyser settings
  `SK=USER#{userId}#PREFERENCES`) require membership **and** an SK-owner match.
  A `viewer` may write their **own** preference row because the write affects
  only their own data; cross-user writes within the account are denied. These
  routes therefore use `.read` (membership floor), with the per-user SK scoping
  the mutation to the caller.
- **Account-shared derived rows** (`PK=accountId`, no user dimension, produced
  by the server — e.g. Budget Tracker `SK=AI_INSIGHT#DASHBOARD`, M21) are
  **service-principal-written and viewer-readable**: any member (including a
  `viewer`) may read via `requireAccountData`, but no client write route exists.
  The row is (re)generated server-side from the app-level AI config on a
  miss/stale/invalidated read and invalidated event-driven by the account's own
  mutation handlers (no scheduler). This is the read tier of D8 applied to a
  derived cache: read is a membership floor, writes are the server's alone.

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
