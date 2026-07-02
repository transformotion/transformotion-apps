# Notification preferences — behaviour (M19 #534, #571)

Behaviour spec for the Stock Analyser notification preferences card. The
canonical TypeScript shapes and visibility resolvers live in
`notification-preferences.ts`; this file describes behaviour only.

## The controls

Notification controls at three grains, plus the existing personal toggles:

- **APP-WIDE** (the #571 kill-switch, admin-controlled, single platform record):
  - `notificationsEnabled` — whether the daily market-analysis notification job
    is allowed to run **platform-wide**. **Default ON.** When OFF, the job
    early-returns and NO sends happen for ANYONE until re-enabled. Use case:
    pause sends when AI credit is exhausted. This is NOT per-account and NOT
    per-user — one global flag.
- **ACCOUNT-level** (owner/manager-controlled, per-account):
  - `intervalDays` — how often the job processes this account. Floor: 1 day
    (`MIN_NOTIFICATION_INTERVAL_DAYS`).
  - `typeSelection` (`activeTypes`) — which notification types (Portfolio /
    Watchlist) are active for the account.
- **PER-MEMBER** (each write-access member controls their OWN):
  - `receiveConsent` — whether THIS member is delivered notifications.
    **Default OFF (opt-in).**
- The existing personal **theme / analysis-text** toggles are unaffected and
  shown to everyone exactly as today.

There is **no account-level master on/off switch** — delivery consent is
per-member only. The only master switch is the APP-WIDE `notificationsEnabled`
kill-switch, which gates the whole job (account interval + per-member consent
have no effect while it is OFF).

## The visibility model — two independent axes

Evaluated per control, per user (`resolveNotificationVisibility(ctx)`):

- **AXIS 1 — APPLICABILITY**: does this setting apply to the user AT ALL?
  "Applicable" = the user *could-ever-be-subject-to* it, NOT whether it is
  currently active. If NOT applicable → **HIDDEN** entirely (not rendered).
  Applicability = the user has the notification feature at all = has write
  access to the account (owner / manager / member — a `viewer` is read-only and
  can never receive), OR is a supervisory admin (site-admin / app-admin).
- **AXIS 2 — ENTITLEMENT**: can the user EDIT it?
  - Applicable + entitled → **EDITABLE**.
  - Applicable + not entitled → **READ-ONLY** (visible, disabled).

### Resulting matrix

| Control                | Owner/Manager   | Plain member            | Viewer | App/Site admin |
| ---------------------- | --------------- | ----------------------- | ------ | -------------- |
| `notificationsEnabled` | read-only       | HIDDEN                  | HIDDEN | editable       |
| `intervalDays`         | editable        | read-only (applicable)  | HIDDEN | editable       |
| `typeSelection`        | editable        | read-only (applicable)  | HIDDEN | editable       |
| `receiveConsent`       | editable (own)  | editable (own)          | HIDDEN | editable (own) |
| theme/analysis-text    | editable        | editable                | editable | editable     |

**`notificationsEnabled` has a DISTINCT entitlement** (`resolveEngineToggleVisibility`):
it is a PLATFORM control, so only supervisory admins (site-admin / SA app-admin)
may EDIT it. Owners/managers SEE it READ-ONLY (it affects whether their
account's sends go out, so it is applicable to them), but cannot flip a
platform-wide switch. Members/viewers: HIDDEN. This differs from account-config,
where owners/managers are editable.

### Key consequences (verified by the resolvers)

- A **VIEWER** sees **NO** notification settings at all — not account config,
  not a consent toggle — because a viewer can never receive notifications (no
  write access → excluded from delivery), so the entire notification feature is
  INAPPLICABLE. They see only theme/analysis-text. (`allHidden === true`, the
  card does not render.)
- A **PLAIN MEMBER** always sees `intervalDays` + `typeSelection` **read-only**
  (applicable because they COULD opt in — independent of whether their consent
  is currently on), plus their own **editable** `receiveConsent` toggle.
- "Applicable" for account-config = "user is entitled to the notification
  feature at all" (has write access / can receive), **NOT** "currently
  receiving."
- **Site/app-admin** see everything editable (supervisory).

### Role source

Render off the user's role/entitlement for the **active account**
(owner / manager / member / viewer) plus the group-derived supervisory flags
(site-admin / app-admin), per `contracts/auth-model.md`. In v0 these come from
the shared mock control-plane store (the Persona Switcher), so switching persona
immediately re-gates the card.

## Storage

- **App-wide engine config** (`notificationsEnabled`): a SINGLE global settings
  row (NOT per-account, NOT per-user), default ON. Canonical key shape
  `pk: 'SETTINGS'`, `sk: 'NOTIFICATION_ENGINE'`. Admin-controlled.
- **Account-level config** (`intervalDays`, `typeSelection`): per-account, in
  the SA settings store (`stock-analyser.settings`), owner/manager-controlled.
  Canonical key shape `pk: 'SETTINGS'`, `sk: 'NOTIFICATIONS#${accountId}'`.
- **Per-member `receiveConsent`**: per `(account, member)`, default OFF.
  Canonical key shape `pk: 'NOTIFICATION_CONSENT#${accountId}'`,
  `sk: 'USER#${userId}'`.

## CONSTRAINT (load-bearing)

The role-conditional rendering above is a **UX convenience, NOT access
control**. Runtime MUST enforce authorization server-side, independently of what
the card rendered:

- **`notificationsEnabled` writes** (the #571 kill-switch): the server checks
  **site-admin / SA app-admin** authority, **fail-closed**. Owner/manager and
  below are **rejected EVEN IF the request is crafted directly past a disabled
  or hidden UI** — the read-only control shown to owners/managers is presentation
  only, never a grant. A non-admin can never enable or disable the platform job.
- **Account-config writes** (`intervalDays`, `typeSelection`): the server checks
  owner/manager role via the D8 control-plane pattern (claims + a live
  membership-row read), **fail-closed**; it rejects anyone else **even if the
  request is crafted directly** (e.g. a plain member or viewer bypassing the
  disabled/hidden control).
- **`receiveConsent` writes**: the server checks the writer is writing their
  **OWN** member record; a member cannot change another member's consent.

A hidden or disabled control is presentation only; the server is the real
boundary. The v0 mock handlers deliberately do not re-check role — they model
the persisted store, not the access decision.

## Scope

This is the v0/contract + surface design for the preferences UI only. The
background JOB that CONSUMES these prefs (the kill-switch early-return on
`notificationsEnabled === false`; scheduler reads `intervalDays`; delivery gate
reads `receiveConsent`) is separate M19 build work, sequenced after this.
Standard post-change: run `pnpm check:contracts` in runtime.
