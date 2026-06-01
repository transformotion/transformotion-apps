# M9 #363 Auth Ownership Transition Close-Out

## Purpose

#363 moved live auth/control-plane API behavior into Launchpad ownership and
decoupled platform deploys from application deploys. This document is the
deployment and validation runbook for closing #363.

This is not the final auth-domain architecture. Platform still physically owns
several auth-domain resources. That ownership is migration debt, not target
architecture. #386 owns the next phase: physically re-home the auth domain into
Launchpad.

## Current State After #363

Launchpad owns the live control-plane API surface in
`Transformotion{Stage}-LaunchpadControlPlane`:

- `POST /auth/lookup-provider`
- `POST /auth/setup`
- `GET /api/user/profile`
- `PUT /api/user/preferences`
- `POST /accounts`
- `GET /accounts/{accountId}`
- `PUT /accounts/{accountId}`
- `DELETE /accounts/{accountId}`
- `GET /accounts/{accountId}/members`
- `DELETE /accounts/{accountId}/members/{userId}`
- `POST /accounts/{accountId}/invitations`

Platform still physically owns these auth-domain resources as temporary
migration debt:

- Cognito User Pool
- Hosted UI domain
- Cognito app clients
- Cognito groups and social IdP configuration
- Pre-token-generation trigger
- `platform.users-{stage}`
- `platform.accounts-{stage}`
- `platform.account-members-{stage}`
- `platform.invitations-{stage}`
- `platform.rate-limits-{stage}`
- legacy Platform AuthApi and Platform API control-plane routes retained for
  rollback

## Target State Hand-Off

#386 completes the auth-domain re-home. The target is:

- Launchpad physically and logically owns the auth domain.
- Platform owns neutral substrate only: DNS, ACM, CloudFront/shared hosting, and
  shared build/deploy foundations.
- Platform no longer creates or updates auth/control-plane resources except for
  temporary transition debt explicitly scheduled for removal.

## Deployment Checklist

### 1. Platform Deploy

Run `deploy-platform.yml`.

Purpose:

- validate the substrate-only deployment model
- confirm no application deployment cascade remains
- ensure retained platform rollback resources still deploy cleanly

Validation:

- Platform deploy completes.
- Launchpad, Stock Analyser, Budget Tracker, and migration utility workflows are
  not called by the platform workflow.
- No app frontend or app runtime stack is deployed by the platform workflow.

### 2. Launchpad Deploy

Run `deploy-launchpad.yml`.

Purpose:

- deploy `Transformotion{Stage}-LaunchpadControlPlane`
- deploy the Launchpad frontend
- publish the migrated control-plane routes

Validation:

- `NEXT_PUBLIC_LAUNCHPAD_CONTROL_PLANE_API_URL` is sourced from the
  `ControlPlaneApiUrl` output on `Transformotion{Stage}-LaunchpadControlPlane`.
- Launchpad frontend build receives that value.
- Legacy platform API URLs remain available only as rollback fallback values.

## Runtime Validation Checklist

Validate the following against the deployed Launchpad control-plane API:

- Auth lookup: `POST /auth/lookup-provider`
- Onboarding: `POST /auth/setup`
- User profile: `GET /api/user/profile`
- User preferences: `PUT /api/user/preferences`
- Account create: `POST /accounts`
- Account read/update/delete: `GET/PUT/DELETE /accounts/{accountId}`
- Member list: `GET /accounts/{accountId}/members`
- Member remove: `DELETE /accounts/{accountId}/members/{userId}`
- Invitation create: `POST /accounts/{accountId}/invitations`

Validate authentication:

- sign in
- sign out
- token refresh
- custom claims still populate

Validate application access:

- Stock Analyser authenticated smoke test
- Budget Tracker authenticated smoke test

## Rollback Checklist

Before closing #363, verify rollback remains possible:

- legacy Platform AuthApi `POST /auth/lookup-provider` route still exists
- legacy Platform API onboarding/user/account/invitation routes still exist
- Launchpad can still be rebuilt with rollback API environment values if needed
- no platform rollback route has been deleted in #363

Rollback path:

1. Revert the Launchpad frontend/API routing change or rebuild Launchpad with
   rollback API environment variables.
2. Redeploy Launchpad.
3. Leave platform rollback resources in place until #386 or a later
   decommission issue removes them intentionally.

## #363 Completion Criteria

#363 can close only after:

- #363 PRs are merged.
- Platform deploy succeeds.
- Launchpad deploy succeeds.
- Runtime validation above passes.
- Architecture docs identify remaining Platform auth ownership as migration
  debt and reference #386 for physical re-home.

