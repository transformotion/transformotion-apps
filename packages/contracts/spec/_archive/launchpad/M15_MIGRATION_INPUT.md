# Launchpad Contract Migration Input

> M15 migration note: migrated as current contract material and ownership input.
> Structure cleanup and executable conversion follow in #136/#137/#139.

## Source Material

This file captures the current post-M9 Launchpad contract inputs from the
runtime repo guidance and architecture docs. It is intentionally not the final
scope-first executable contract bundle. See `CURRENT_STATE_SURFACES.md` for the
#135 correction inventory of concrete frontend, API, auth, data, and
control-plane surfaces.

Runtime source material inspected for #135:

- `AGENTS.md`
- `CONTRIBUTING.md`
- `docs/architecture/auth.md`
- `docs/architecture/inventory.md`
- GitHub issue #390 kickoff and sequencing notes

## Current Ownership Baseline

Launchpad owns auth and control-plane concerns after M9:

- Cognito User Pool.
- Hosted UI/domain configuration.
- app clients.
- Cognito groups.
- social IdP configuration.
- pre-token-generation trigger.
- users, accounts, account-members, invitations, and rate-limit tables.
- auth/control-plane APIs.
- Launchpad frontend auth/control-plane environment wiring.

Stock Analyser and Budget Tracker consume LaunchpadAuth-issued claims and own
their app runtimes. Platform owns neutral substrate only.

## Contract Inputs To Reconcile In Later Issues

#136/#137/#139 should turn this migration input into explicit contract files for:

- Cognito app client and frontend environment contracts.
- token claim contracts covering `apps`, `accounts`, and `site_admin`.
- user, account, account member, invitation, and app entitlement shapes.
- Launchpad control-plane API request/response contracts.
- Launchpad AI runtime configuration contracts.
- canonical mock data and mock handlers for auth/control-plane flows.

## Known Stale Risk

Any contract text implying Platform owns auth-domain resources, shared
control-plane APIs, app access administration, or app entitlement presentation is
pre-M9 and must be reconciled during #136/#139 rather than carried forward as
current architecture.
