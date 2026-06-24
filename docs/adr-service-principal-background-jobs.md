# Service-Principal Authorization for Scheduled Background Jobs (ADR)

**Status:** Accepted — M19 Phase-0, owner-ratified (Option A). Resolves #529.
**Scope:** How a scheduled EventBridge→Lambda background job authorizes to read and write account-scoped data when it carries **no user JWT**. Sits beside **D8** (`docs/adr-m16-runtime-architecture.md` §D8); **D8 is unchanged** by this ADR.
**Goals served:** 3 (architecture coherence) primarily; 1 and 2 (M19 background intelligence / operational hygiene).
**Document type:** Architecture decision record (CONTRIBUTING §11). **Not itself normative** — its decision is ratified into `docs/architecture/auth.md` (service-principal authorization model), `docs/architecture/cdk.md` (per-job execution roles and least-privilege policies), and `docs/architecture/inventory.md` as the M19 implementing PRs land. Those PRs cannot begin until the #529 gate and the rest of the M19 Phase-0 decision batch are ratified.

## Context

D8 is **entirely request-scoped**: tokens identify the principal only; reads check token claims; writes check claims **plus** a live membership-row read, and fail closed on that row. A scheduled job (`EventBridge → Lambda`) carries **no user JWT**, so there is no D8 path for it to read or write account-scoped data.

M19's background jobs need a defined model: scheduled market-analysis cache-write, background portfolio/watchlist refresh across all accounts, and buy/sell notifications. The existing `cycle-check` Lambda — today a stub (`apps/stock-analyser/functions/cycle-check`), whose header states its intended behaviour as "queries DynamoDB for all accounts' portfolios; sends SES email for any score ≥ threshold," EventBridge 8 AM AEST — is the same class of job and must adopt the same pattern.

**Ratified constraint (#529).** The model must be **additive to D8, not a relaxation of it**:

> The service-principal model must be ADDITIVE to ADR D8, not a relaxation of it: it may introduce no read path that trusts a claim a real user's request would not, and must preserve the "writes fail closed on the live membership row" property for any user-scoped data. D8's request-scoped guarantees for real users may not be eroded to solve the cron-auth problem.

## Decision

**Background jobs authorize in the IAM plane, not the claims plane.**

- Each scheduled job runs as a Lambda with a **dedicated, least-privilege execution role**. That role **is** the service-principal identity — there is **no long-lived service secret**; credentials are STS-rotated by the Lambda runtime.
- The job reads and writes DynamoDB **directly via IAM-scoped permissions, below the D8 request-middleware**. The job never invokes D8's claims plane, so **by construction it cannot trust a user-claim it lacks**. The "additive, not erosive" bar is met **structurally**, not by policy choice.
- IAM scope is least-privilege, **no broader than** the operations below. (Drawn against the actual control-plane and app tables — the enumeration/membership source is the Launchpad control plane, **`launchpad-accounts-{stage}` / `launchpad-account-members-{stage}`**, not a `platform.accounts` table, which does not exist.)

| Operation | Table | Access |
|---|---|---|
| Account enumeration (whom to process; filter `appSlug = stock-analyser`) | `launchpad-accounts-{stage}` (control plane) | read-only |
| Live membership/status re-check (fail-closed guard) | `launchpad-account-members-{stage}` (control plane) | read-only |
| Holdings / watchlist read for refresh | `stock-analyser.portfolio-{stage}`, `stock-analyser.watchlist-{stage}` | read-only |
| Refreshed market-analysis cache-write | SHARED partition of `stock-analyser.analysis-cache-{stage}` | write (shared partition only) |
| Per-user notification items | notification store (TBD — defined by #533/#534) | write |

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
- **#531** (scheduler design) — consumes the consent/status gating as the daily job's per-account **skip rules**.
- **#534** (notification preferences / opt-out) — defines **consent** (default = opted-out), one of the fail-closed gates above.
- **`cycle-check`** stub (`apps/stock-analyser/functions/cycle-check`) — the existing scheduled job that adopts this pattern on implementation.
