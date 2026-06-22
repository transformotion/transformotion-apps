# Settings Ownership — App-specific vs Platform-wide (ADR)

**Status:** Accepted — owner-confirmed 2026-06-22 (resolves #356).
**Scope:** Where a given user/account setting is owned, stored, and surfaced — the platform (Launchpad control plane) vs an individual app (Stock Analyser, Budget Tracker).
**Document type:** Architecture decision record (CONTRIBUTING §11). Not itself normative; its ruling is ratified into `docs/architecture/data.md` / `auth.md` as implementing PRs land.

## Context

Settings exist at two levels and were never formally split:

- **Platform/identity settings** — the user's cross-app profile: display name, notification preference. Owned by the Launchpad control plane (`launchpad-users` item: `displayName`, `preferences.notificationsEnabled`), surfaced on the **Launchpad Profile** screen.
- **Per-app operational settings** — e.g. Budget Tracker's `budget-tracker.settings` table (CSV format mappings, budget config) and Stock Analyser's settings service (analyser preferences). Owned by each app, in its own store/table.

#356 asked for a decision on the boundary so new settings land in the right place.

## Decision

**The discriminator is a single question: "Does this setting mean anything with the app NOT open?"**

- **Yes → it is a PLATFORM setting.** It belongs to the cross-app identity/profile, owned by the **Launchpad control plane** and surfaced on the **Launchpad Profile** screen. Examples: display name (shown across every app), notification preference (governs platform-level messaging like invitations). These persist on the `launchpad-users` item and are edited via `PUT /api/user/preferences`.

- **No → it is a PER-APP setting.** It only has meaning inside one app's workflow, so it is owned, stored, and surfaced by **that app**, in that app's own table/store — never in the platform user item. Examples: Budget Tracker CSV mappings / budget configuration (`budget-tracker.settings`), Stock Analyser analyser preferences. The Launchpad does not aggregate or proxy these.

There is **no platform-wide generic "settings" table** beyond the user profile item. Platform settings are the small, identity-scoped set on `launchpad-users`; everything app-specific stays in-app.

## Rationale

- Keeps the cross-app identity surface (the Launchpad Profile) coherent and small — only things a user expects to apply *everywhere*.
- Avoids coupling the control plane to per-app feature config, which changes at each app's cadence and means nothing outside that app.
- Matches the existing implementation (display name + notifications on the Launchpad Profile, #498/#501/#502; BT/SA settings in-app), so it ratifies reality rather than reorganising it.

## Consequences

- New **identity/cross-app** settings → add to the `launchpad-users` profile + the Launchpad Profile screen (and the `UpdateUserPreferencesRequest` contract).
- New **app-operational** settings → add to that app's own settings store/table and surface in-app; do **not** route them through the Launchpad control plane.
- `notificationsEnabled` is the platform notification preference; a future notification-delivery system reads it. Per-app notification *channels*, if ever needed, would be per-app settings under this rule.
