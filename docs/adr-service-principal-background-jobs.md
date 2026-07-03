# Service-Principal Authorization for Scheduled Background Jobs (ADR)

**Status:** Accepted — M19 Phase-0, owner-ratified (Option A). Resolves #529.
**Scope:** How a scheduled EventBridge→Lambda background job authorizes to read and write account-scoped data when it carries **no user JWT**. Sits beside **D8** (`docs/adr-m16-runtime-architecture.md` §D8); **D8 is unchanged** by this ADR.
**Goals served:** 3 (architecture coherence) primarily; 1 and 2 (M19 background intelligence / operational hygiene).
**Document type:** Architecture decision record (CONTRIBUTING §11). **Not itself normative** — its decision is ratified into `docs/architecture/auth.md` (service-principal authorization model), `docs/architecture/cdk.md` (per-job execution roles and least-privilege policies), and `docs/architecture/inventory.md` as the M19 implementing PRs land. Those PRs cannot begin until the #529 gate and the rest of the M19 Phase-0 decision batch are ratified.

**Amendment (owner-ratified, M19 #529/#531 reconciliation):** The SHARED analysis-cache write (`ANALYSIS#{ticker}`) goes through the **analysis-cache Lambda's service-principal auth path**, **not raw `PutItem`** — superseding the earlier "job writes raw DDB directly to the SHARED partition" language. This gives a single writer, a single auth chokepoint, and one definition of the cache-write shape. The **IAM-plane authorization, D8-isolation, and fail-closed framing are unchanged**; only the SHARED-write *mechanism* changes. The access mechanism for the cross-account reads (holdings/watchlist) and the per-account notification-state write remains **OPEN** (Lambda service-principal path vs IAM-scoped direct) — see the Decision section.

## Context

D8 is **entirely request-scoped**: tokens identify the principal only; reads check token claims; writes check claims **plus** a live membership-row read, and fail closed on that row. A scheduled job (`EventBridge → Lambda`) carries **no user JWT**, so there is no D8 path for it to read or write account-scoped data.

M19's background jobs need a defined model: scheduled market-analysis cache-write, background portfolio/watchlist refresh across all accounts, and buy/sell notifications. The existing `cycle-check` Lambda — today a stub (`apps/stock-analyser/functions/cycle-check`), whose header states its intended behaviour as "queries DynamoDB for all accounts' portfolios; sends SES email for any score ≥ threshold," EventBridge 8 AM AEST — is the same class of job and must adopt the same pattern.

**Ratified constraint (#529).** The model must be **additive to D8, not a relaxation of it**:

> The service-principal model must be ADDITIVE to ADR D8, not a relaxation of it: it may introduce no read path that trusts a claim a real user's request would not, and must preserve the "writes fail closed on the live membership row" property for any user-scoped data. D8's request-scoped guarantees for real users may not be eroded to solve the cron-auth problem.

## Decision

**Background jobs authorize in the IAM plane, not the claims plane.**

- Each scheduled job runs as a Lambda with a **dedicated, least-privilege execution role**. That role **is** the service-principal identity — there is **no long-lived service secret**; credentials are STS-rotated by the Lambda runtime.
- The job authorizes as a **service principal in the IAM plane, never the claims plane** — so **by construction it cannot trust a user-claim it lacks**; the "additive, not erosive" bar is met **structurally**, not by policy choice. The job never invokes D8's user claims-plane write tier.
- **SHARED analysis-cache write — settled mechanism (owner-ratified).** The refreshed `ANALYSIS#{ticker}` write goes through the **analysis-cache Lambda via a service-principal auth path** (a distinct branch from D8's user-write tier), **not raw `PutItem`**. This keeps a **single writer, a single auth chokepoint, and one definition of the cache-write shape** (no shape duplication between Lambda and job). The SHARED partition is global, non-account-scoped data, so it is not subject to D8's per-account membership write check; D8's user-scoped guarantees are untouched.
- **Constraint — the service-principal write branch is SHARED-only.** The Lambda's service-principal (JWT-less) write branch is **restricted to SHARED-prefix cache keys** — `MARKET`, `RECS`, `ETF`, `METALS`, `ANALYSIS`, `CYCLE` — and **must reject any account-scoped key**. (#594: the ETF prefix is `ETF`, matching the real `ETF#{market}` key; the earlier `ETFS` entry never matched a real key and silently rejected scheduled ETF writes.) This is precisely what makes the JWT-less write **additive to D8, not a relaxation of it**: the branch can only write global, non-account-private cache data (a stock's analysis is identical for every account and is intended to be shared cross-account — see `resolveWriteAccountId` forcing these prefixes to `accountId='SHARED'`), so there is **no membership row to check and nothing private at risk**. It is **not** a general JWT-less write path; it **cannot reach the per-account partition**. Account-scoped writes (e.g. the #532 notification-state table) are **explicitly out of this branch** and remain governed by the fail-closed membership + consent re-check (mechanism still OPEN — #531/#529).
- **Sanctioned exception — engine-internal feed-history direct-write (#637, owner-ratified).** The Metals engine's `METALS_CLOSES#{date}` / `METALS_BASELINE#{year}` rows are **raw metals.dev feed-history bookkeeping** (used only to compute 30-day / YTD change) — **engine-internal and never tab-read**. They are written **directly** by the metals engine (its own SHARED-scoped `PutItem` grant to `accountId='SHARED'`), **outside the service-principal chokepoint, by design** — NOT a defect and NOT to be normalised onto the chokepoint. Rationale: they are a **different data class** from tab-facing shared AI results; the chokepoint exists to protect **tab-read** shared results, and routing raw feed bookkeeping through it would couple engine internals into that mechanism for no benefit. Timestamp shape is canonical (`cachedAt` epoch seconds, matching the chokepoint + frontend PUT writers). **Boundary rule (retires the latent ETFS-shape gap):** any prefix that **IS tab-read MUST** use the service-principal path (a tab-read key left off `SHARED_PREFIXES`/the allowlist silently fails writes — the ETFS defect, #594); a **feed-history** prefix **MUST NOT** be half-migrated onto it — it must **stay out of `SHARED_PREFIXES`** (adding it there is the latent gap this ADR retires). Enforced by a guard test: `isSharedServiceCacheKey('METALS_CLOSES#…')` / `('METALS_BASELINE#…')` must remain `false`, so the gap **structurally cannot fire unsanctioned**.
- **P&W warm-set read — consent-EXEMPT symbol enumeration (M19, owner-ratified).** The daily P&W `ANALYSIS#` warm step (see `docs/caching-and-warming.md` §2/§4.1) reads a **cross-account `Scan` of `portfolio`/`watchlist` projecting the `ticker` attribute only** to build the distinct union of holdings to warm. This is a **third read shape, distinct from the cross-account READ branch below, and it is deliberately NOT consent/status-gated.** Rationale — it is symbol enumeration feeding a **SHARED-only producer**: the warmed output is `ANALYSIS#{ticker}`, non-account-private data identical for every account and intended to be shared cross-account (same basis as the SHARED-write branch), and the read reveals nothing about *who* holds what (it unions symbols to decide what to compute, then discards the account dimension). Adding no gate here is **additive-safe, not erosive**: no account-scoped payload is read out and nothing account-scoped is written, so D8's per-account guarantees are untouched. **Consent gates DELIVERY, not the warm-set** — the fail-closed delivery-time membership + consent re-check on the account-scoped WRITE branch is unchanged, and because notification evaluation is a pure reader (Option B), a member who never consents is still never delivered to. The boundary rule: a cross-account read that emits **account-scoped** output stays on the gated READ branch below; a cross-account read that feeds **only SHARED, non-private** output (this one) is consent-exempt by design. IAM is unchanged (the `ticker`-projected `Scan` is already covered by the role's `grantReadData` on those tables).
- **Account-scoped background access — settled direction (owner-ratified, #529/#531).** Account-scoped access uses the **service-principal Lambda path (JWT-less)**, as **two branches distinct from the SHARED-write branch above**:
  1. **Account-scoped WRITE branch** — the per-account notification-state write (#532). It carries a **fail-closed membership + consent re-check before every write**, re-establishing D8's write property (no lingering write capability for a disabled/removed principal) in job code.
  2. **Cross-account READ branch** — holdings/watchlist reads and account enumeration. It carries its **own active/status + consent gate**. This is **not a mirror of D8's user read path** (which is claims-only, **zero** table reads): a cron has no claims, so this branch **adds a status/consent table read by design**. Adding a check is **additive, not erosive** — but it is **its own tier, not a copy of an existing one**.
  The authorization plane (IAM service-principal, fail-closed, D8-isolated) is settled; the remaining work is the concrete gate/query design under #531.
- IAM scope is least-privilege, **no broader than** the operations below. (Drawn against the actual control-plane and app tables — the enumeration/membership source is the Launchpad control plane, **`launchpad-accounts-{stage}` / `launchpad-account-members-{stage}`**, not a `platform.accounts` table, which does not exist.)

| Operation | Table | Access (and mechanism) |
|---|---|---|
| Account enumeration (whom to process; filter `appSlug = stock-analyser`) | `launchpad-accounts-{stage}` (control plane) | read-only |
| Live membership/status re-check (fail-closed guard) | `launchpad-account-members-{stage}` (control plane) | read-only |
| Holdings / watchlist read for refresh | `stock-analyser.portfolio-{stage}`, `stock-analyser.watchlist-{stage}` | read-only — **cross-account READ branch (service-principal Lambda path); own active/status + consent gate** |
| Refreshed market-analysis cache-write | SHARED partition of `stock-analyser.analysis-cache-{stage}` | write — **via analysis-cache Lambda service-principal path (settled; not raw `PutItem`)** |
| Per-account notification-state write | `stock-analyser.notification-state-{stage}` (net-new; #532) | write — **account-scoped WRITE branch (service-principal Lambda path); fail-closed membership + consent re-check before every write** |

## Safety property that moves — and the obligation it creates

D8 enforces "writes fail closed on the live row" **in middleware**. Background per-user writes (notifications) and cross-account reads (holdings) do **not** pass through that middleware. The property is therefore **re-established in job code as a hard, tested obligation**:

> Before any per-account processing or per-user write, the job re-checks live **account + membership status** (active / not-disabled / not-removed) **and consent**, and **fails closed** (skips the account) on any doubt or lookup failure.

This preserves D8's **property** — no lingering write capability for a disabled or removed principal — though the **mechanism** differs (coded check vs middleware guarantee). It **must be covered by tests**: a coded obligation can be forgotten in a way a middleware guarantee cannot, so the test suite is what makes the property non-optional.

## Rationale

- **Credential hygiene.** A dedicated, STS-rotated execution role removes any long-lived service secret. The identity is the role, managed by IAM and rotated by the runtime.
- **D8-plane isolation, structural not policy.** Because the job runs below the request-middleware and never enters the claims plane, it is *incapable* of trusting a user claim — the additive guarantee is a property of the architecture, not a rule that a future change might quietly relax.
- This is the cost trade chosen over **Option B** (per-account token-minting), which would re-introduce the claims plane into the job path and a minting/rotation surface. At M19's scale, Option A's IAM-plane isolation and credential hygiene win; the accepted cost is that the per-user-write safety check now lives in job code (see below).

## Consequences (decided deliberately)

- **The per-user-write safety check lives in job code, not middleware** — accepted, *with the mandatory test coverage above*. This is the explicit cost of Option A over Option B.
- **Background jobs act under a distinct service-principal identity, logged separately** from user actions, so the audit trail distinguishes machine writes from user writes.
- **Fail-closed is the default everywhere.** An account the job cannot verify (status, membership, or consent) is **skipped, never processed on assumption**.
- **One background-auth pattern governs all scheduled jobs** — M19's jobs **and** the existing `cycle-check` stub. New scheduled jobs adopt this model; they do not invent a third.
- **Account enumeration** (listing all accounts to know whom to process) is the one irreducibly cross-account, control-plane operation: IAM-scoped **read-only** on `launchpad-accounts-{stage}`. It does not touch D8.

## Cross-references

- **D8** (`docs/adr-m16-runtime-architecture.md` §D8) — request-scoped authorization. Unchanged; this ADR sits beside it and extends the model to no-JWT jobs without eroding it.
- **#530** (cache design) — the SHARED analysis-cache write target: reuse the existing SHARED partition (no new analysis table) at 24h TTL. This ADR's settled SHARED-write mechanism (Lambda service-principal path) is how that write happens.
- **#531** (scheduler design) — consumes the consent/status gating as the daily job's per-account **skip rules**; ratified the SHARED-write-via-Lambda mechanism reconciled above.
- **#532** (buy/sell signal rule) — defines the net-new per-account **`stock-analyser.notification-state-{stage}`** table this job writes (`lastVerdict` / `lastNotifiedAt`) and the fire-on-transition predicate.
- **#534** (notification preferences / opt-out) — defines **consent** (default = opted-out), one of the fail-closed gates above.
- **`cycle-check`** stub (`apps/stock-analyser/functions/cycle-check`) — the existing scheduled job that adopts this pattern on implementation.
