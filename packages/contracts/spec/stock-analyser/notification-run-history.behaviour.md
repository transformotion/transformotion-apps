# Notification run-history (send-log) — behaviour (M19 #573)

> **#573 extend — run-history is a LIST of runs.** The surface shows the HISTORY
> of past runs (most-recent-first), each run individually expandable into the
> account/member detail below. The per-account MAX-of-grants visibility is
> UNCHANGED — it now applies PER RUN, nested inside each run's expansion.

> **M19 Issue B — surface engine ERRORS for troubleshooting.** Errors are made
> visible at all three levels, each scoped per the EXISTING visibility model
> (the model is UNCHANGED — only what it CARRIES is extended):
> - **Run summary**: an errored-account COUNT (`accountsErrored`) beside status.
> - **Per-account**: an `error` reason (`processing-failed` | `credit-balance` |
>   `write-failed`) — **SUMMARY tier**, so admins see WHICH accounts errored.
> - **Per-member**: the leaf `reason` gains error values (`send-failed`,
>   `credit-balance`; `lookup-error` already existed) — **DETAIL tier**, so
>   "why didn't member X get the email?" reaches ONLY that account's
>   owner/manager, never admin-without-ownership.

Behaviour spec for the Stock Analyser notification run-history section, shown in
the existing #534 Notifications card (SA Settings). The canonical TypeScript
shapes and visibility/scoping resolvers live in
`notification-run-history.ts`; this file describes behaviour only.

This issue designs the **surface + visibility + READ contract** only. The
send-log DATA (the run records themselves) is built backend-side in **#572**;
runtime's read endpoint MUST conform to the contract authored here. Server-side
scoping is enforced separately in runtime (see the CONSTRAINT).

## The read contract — a LIST of runs, three RATIFIED levels each

The read returns a bounded, **most-recent-first** page of runs
(`NotificationRunHistoryPage`): `{ runs: NotificationRunSummary[]; nextCursor? }`.
`limit` defaults to `DEFAULT_RUN_HISTORY_LIMIT` (30). #572's backend lists recent
runs via **GSI1 (`PK=RUNS`, `SK=ranAt`)** in descending `ranAt`, capped at
`limit`; `nextCursor` is the opaque key for the next (older) page, absent at the
end. `projectRunHistoryForViewer(page, ctx, accessibleAccountIds)` scopes EACH
run (below) and drops runs with nothing visible, preserving order + cursor.

Each run is hierarchical: run → accounts → members.

1. **RUN SUMMARY** (`NotificationRunSummary`): `runId`, `ranAt`, `status`
   (`success | partial | failed`), `accountsEvaluated`, **`accountsErrored`**
   (Issue B — the errored-account count), `emailsSent`, and the per-account
   records (`accounts[]`). The scalar rollups drive the collapsed one-liner.
2. **PER-ACCOUNT** (`NotificationRunAccount`): `accountId`, `accountName`,
   `accountStatus` (`processed | skipped | error`), **`error?`** (Issue B —
   `AccountRunErrorReason`, present iff status `error`), `transitions[]` (each a
   ticker + verdict change `from`→`to`), `emailsSent`, and `memberOutcomes[]`.
3. **PER-MEMBER OUTCOME** (LEAF, `NotificationMemberOutcome`): `userId`,
   `email`, `outcome` (`sent | skipped`), `reason`, and `tickers?[]` — present
   and non-empty ONLY for `outcome: 'sent'`.

The leaf `reason` is exactly one of three classes (see `isErrorOutcomeReason`):
- **sent**: `delivered`.
- **routine skip** (not a problem): `consent-off`, `disabled` (engine
  kill-switch #571 was off), `viewer`, `not-a-member`,
  `no-actionable-transition`.
- **error** (a problem — Issue B): `lookup-error`, `send-failed`,
  `credit-balance`.

`AccountRunErrorReason` (account-level): `processing-failed` | `credit-balance`
| `write-failed`.

## The surface — two-level disclosure

In the existing Notifications card, run-history is a **two-level** disclosure:

- **CARD COLLAPSED (default)**: the LATEST run's one-line summary + status chip.
  - **Anyone with an admin grant**: cross-account summary — e.g. "Last run
    Jun 27, 8 emails across 5 accounts" (the cross-account count).
  - **Pure owner/manager (non-admin)**: THEIR account(s)' last-run line only —
    e.g. "Last run Jun 27, 3 emails". NO cross-account count.
- **CARD EXPANDED → LEVEL 1, the RUN LIST**: rows, most-recent-first, one per
  past run. Each row is that run's one-line summary (date, status chip, emails
  [across N accounts]). Runs expand independently.
- **A RUN EXPANDED → LEVEL 2, its PER-ACCOUNT breakdown** (the existing view,
  unchanged): per-account records. An account shown at **detail** renders its
  per-member rows (who, sent/skipped, reason, tickers for sends) + ticker
  transitions. An account shown at **summary** renders only its line, status,
  and emails-sent count (no member rows — they are not in the payload).

So: card-collapsed shows the latest run's one-liner; expanding the card reveals
the LIST of runs; expanding a RUN reveals that run's accounts; account detail
follows the per-account visibility below — applied independently per run.

### Error surfacing (Issue B)

Errors must read as a PROBLEM, visually distinct from a routine skip:

- **Run summary / row**: when any VISIBLE account errored, a red **"N errored"**
  badge sits beside the status chip (collapsed header uses the latest run;
  each run row uses its own `accountsErrored`).
- **Per-account**: an errored account shows a red error banner with its
  `error` reason (e.g. "Processing failed", "Credit balance too low"). This is
  SUMMARY tier — it shows on **both** summary-only and detail accounts, so an
  admin-without-ownership still sees that "Apex Capital — errored" and why.
- **Per-member**: an errored member row is rendered in red (warning icon + red
  reason pill: "Send failed", "Credit balance", "Lookup error"), clearly apart
  from muted routine-skip rows. DETAIL tier — owner/manager of that account
  only.

## Visibility model — PER-ACCOUNT, additive MAX of two grants (CORRECTED v2)

Visibility is resolved **per account** as the MAX of two INDEPENDENT, ADDITIVE
grants — **NOT** a single role lookup:

```
adminGrant(viewer)                    = SUMMARY if viewer is app/site-admin, else HIDDEN
relationshipGrant(viewer, account)    = DETAIL  if viewer is owner/manager OF THIS
                                        account, else HIDDEN
effective(viewer, account)            = strongest of the two:  DETAIL > SUMMARY > HIDDEN
```

`resolveAccountRunVisibility(ctx, accountId, accessibleAccountIds)` returns the
per-account `'detail' | 'summary' | 'hidden'`; `projectRunForViewer(run, ctx,
accessibleAccountIds)` applies it to every account and returns the scoped run
(or `null` when NO account is visible). `accessibleAccountIds` is the set of
accounts the viewer owns/manages, from a LIVE membership read. This runs
**independently per run** in the list: `projectRunHistoryForViewer` maps it over
every run and drops the ones with nothing visible.

### Resulting per-account cases (each verified)

| Viewer vs. account                         | Effective | Renders                          |
| ------------------------------------------ | --------- | -------------------------------- |
| Admin **and** owns/manages this account    | DETAIL    | account line + full member rows  |
| Admin, does **not** own/manage this account | SUMMARY   | account line + status + count    |
| Owner/manager (not admin), owns this acct   | DETAIL    | account line + full member rows  |
| Owner/manager (not admin), another account | HIDDEN    | not in the run for them          |
| Member/viewer of an account                | HIDDEN    | (no section)                     |
| No relationship + not admin                | HIDDEN    | (no section)                     |

### Cross-account header

The run-summary header (ranAt, status, total emails, accounts evaluated) shows
to anyone with **ANY admin grant** (`viewerHasAdminGrant`). A pure owner/manager
(non-admin) gets only their own account line(s) + detail — **no** cross-account
header. Rollups (`accountsEvaluated`, `emailsSent`) are recomputed over the
VISIBLE accounts (both summary and detail accounts contribute their counts).

### KEY CONSEQUENCE — the mixed view

A user who is BOTH admin AND owner/manager of some accounts sees, in ONE view:

- the cross-account run-summary header,
- a **summary** line for EVERY account,
- full member **detail** expanded ONLY on the accounts they own/manage,
- **summary-only** (no member rows) on all other accounts.

**This is a DIFFERENT applicability rule than the preferences controls.** A
plain member sees the #534 read-only account config + their own consent toggle,
but sees NO run-history: the send-log is an administrative view, not a
per-member one. (Compare: for preferences, "applicable" includes plain members.)

### Role source

Render off the group-derived supervisory flags (site-admin / app-admin) for the
admin grant, plus the set of SA accounts the user owns or manages — **across all
accounts, not just the active one** — for the relationship grant, per
`contracts/auth-model.md`. The active-account role is NOT the input: a user can
own account A while merely viewing account B, and the MAX rule is evaluated per
account against that ownership set. In v0 both come from the shared mock
control-plane store (the Persona Switcher), so switching persona immediately
re-scopes the section.

## Source / storage

The run records are produced by the notification job (#572, backend) and read
back through runtime's read endpoint, which lists recent runs via GSI1
(`PK=RUNS`, `SK=ranAt`) and returns a `NotificationRunHistoryPage`. This is a
READ model — v0 does not write runs; the in-memory mock
(`stockAnalyserNotificationRunHistoryMockHandlers.getRunHistory(limit?)`) serves
a bounded, most-recent-first page of canonical demo runs so the two-level
surface + per-run projection can be exercised.

## CONSTRAINT (load-bearing)

The role-conditional render is a **UX convenience, NOT access control**. The
SERVER scopes the **WIRE PAYLOAD** per the MAX rule above — **per account, for
EACH run in the list** (the list does not relax scoping; every run is projected
independently):

- **Per-member detail for an account is sent ONLY if the caller is owner/manager
  of THAT account** (live membership, **fail-closed**).
- **Admin-without-ownership receives summary-only** for an account — the member
  identities/outcomes (and ticker transitions) are **NOT in the response** at
  all. The summary line (name, status, emails-sent count, **and the account-
  level `error` reason**) is all an admin gets for an account they do not
  own/manage. The account `error` is summary-tier and IS sent; the **per-member
  error reasons are DETAIL and are stripped** with the rest of `memberOutcomes`
  (an admin sees "Apex errored — credit balance", never which member or why).
- A pure owner/manager (non-admin) receives ONLY their own accounts' records and
  **no** cross-account header; other accounts (even their existence beyond the
  rollup) are not sent.
- **UI hiding is not the boundary; the payload is.** A viewer crafting the
  request directly still receives exactly what the MAX rule permits — never
  another account's member rows.
- `projectRunForViewer` models this boundary (stripping `memberOutcomes` and
  `transitions` for summary accounts) so v0 and runtime agree on the projection,
  but the SERVER is the real boundary — the client projector is presentation
  only.

## Scope

Surface + visibility + READ contract only — including (Issue B) the new error
fields and the projection's wire-scoping of the per-member error reason
(stripped for summary accounts, exactly like other member detail). Runtime
(CC, Issue B) POPULATES these fields from the engine and conforms the read
endpoint AFTER this lands. The send-log DATA/write is #572 (backend). Standard
post-change: run `pnpm check:contracts` in runtime.
