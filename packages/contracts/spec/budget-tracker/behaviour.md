# Budget Tracker Behaviour Contract

## Runtime Boundary

Budget Tracker owns its REST API, WSS API, transactions/rules/settings/budget
data tables, AI cache/jobs runtime, AI proxy behavior, and deploy lifecycle.
Platform does not own Budget Tracker runtime behavior.

## REST Behaviour

Routes are represented in `api.ts`. Protected routes require Budget Tracker app
entitlement and account membership before app table access.

Settings include AI review controls represented by `BudgetSettings`. Runtime
code batches review work and emits `BudgetTrackerWsBatchResultMessage` with
pass progress and result counts.

## Category roles (M21)

`Category` and `Subcategory` each carry an optional `role?: CategoryRole`
(`'income' | 'savings'`). A role is **user-assigned**; absent means no role;
multiple categories or subcategories may hold the same role.

- **Income (dashboard/cashflow purposes)** = Σ transactions classified into
  **any** category *or* subcategory whose `role === 'income'`. A category-level
  income role includes every subcategory under it; a subcategory-level role
  includes only that subcategory.
- A role **never** affects budget limits — `budgetAmounts`/`budgetFrequencies`
  and the budget-vs-actual computation are unchanged. The role is purely a
  classification signal for reads.
- The legacy `category.name === "Income"` (and the `t.category === "Income"`
  fallback) detection is **deprecated**; it is removed from domain code in PR-2
  after a one-off backfill sets `role: 'income'` on existing categories named
  "Income".

## Savings goal (M21)

`BudgetData.savingsGoal?` is an optional per-account goal
(`{ targetAmount; linkedSubcategoryId? }`) that travels through the existing
budget-data read/write routes — there is no new route. Progress **this month**:

- `linkedSubcategoryId` set → progress = Σ|transactions| classified into that
  subcategory this month.
- otherwise (implicit goal) → progress = (role-based income − spending) this
  month, using the income definition above.

## Dashboard insight (M21)

`GET /api/budget/v1/dashboard-insight` returns
`{ text, generatedAt, stale }`. The server reads the per-account derived row
(`PK = accountId`, `SK = 'AI_INSIGHT#DASHBOARD'`; a D12 account-shared,
service-principal-written, viewer-readable row — see
`docs/architecture/data.md` § D12). If the row is absent, older than 24h, or
invalidated, the server regenerates the text from the app-level AI config (D9)
**within the same request**, writes it back, and returns it. Invalidation is
**event-driven, not scheduled**: transaction mutation handlers set an
`invalidatedAt` marker (or delete the row). Auth: `requireAccountData` for the
read (a `viewer` may read); regeneration runs server-side under that request.

## AI Review rule suggestion (accept-writes-rule)

Each `ReviewBatchResult` may carry two additional fields so that accepting an AI
Review suggestion can also create a custom `MatchingRule` (via the existing
`POST /api/budget/v1/rules`), not just recategorise the one transaction:

- `suggestedPattern` — the **minimal stable merchant token** distilled from the
  transaction description (e.g. `VERCEL`, `BP TANAWHA`, `COLES`). It is **NOT**
  the full description, an amount, a date, or a reference number.
- `suggestedRuleName` — a short, human-readable rule name (e.g. `Vercel hosting`).

**The AI output is REQUIRED to populate both fields** for every reviewed
transaction. They are optional at the TypeScript level only so the contract can
roll out additively ahead of the runtime prompt and the Review-tab UI; a
consumer must not assume presence (see the client-validation rule below).

**Verbatim system prompt requirement.** The AI Review system prompt MUST
instruct the model to return `suggestedPattern` and `suggestedRuleName` on every
object, with the minimal-token guidance above and worked examples, e.g.:

| Description (source transaction) | `suggestedPattern` | `suggestedRuleName` |
|---|---|---|
| `VERCEL              INC. HTTPSVERCEL. CA` | `VERCEL` | `Vercel hosting` |
| `BP TANAWHA 4556 TANAWHA QLD` | `BP TANAWHA` | `BP fuel` |
| `COLES 0342 MOOLOOLABA` | `COLES` | `Coles groceries` |

**Self-match invariant.** A `suggestedPattern` MUST match its own source
transaction's description under the app's normal matching semantics — a
case-insensitive, whitespace-flexible `contains` match (the `applyRules` /
`normalisePattern` convention in `@transformotion/budget-domain`, where the
pattern is regex-escaped and whitespace runs are collapsed to `\s+`, matched
with the `i` flag).

**Client-validation rule.** Consumers MUST validate the invariant client-side
and treat a non-conforming (or absent) `suggestedPattern` as **absent**: it is
not offered as a prefill, and the user must supply a pattern before a rule can be
saved.

## Mock Behaviour

`MockAIService.reviewTransactions()` must produce `ReviewBatchResult`
compatible findings and must not bypass the public service contract used by
live review flows. When it supplies `suggestedPattern` / `suggestedRuleName`,
those must satisfy the self-match invariant above.
