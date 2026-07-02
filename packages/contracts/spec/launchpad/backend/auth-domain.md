# Launchpad Backend Auth-Domain Contract

## Ownership

Launchpad owns the active auth domain after M9: Cognito user pool, Hosted UI
domain, app clients, user/account/member/invitation tables, pre-token claim
enrichment, and auth administration workflows.

Platform must not be represented as owner of auth-domain product behavior.

## Cognito App Clients

Cognito app-client shape is represented by `CognitoAppClientContract` in
`types.ts`. Current clients are public authorization-code clients with `openid`,
`email`, and `profile` scopes.

Each app has its own callback/logout paths. Frontend environments consume those
values through the runtime config contract rather than hardcoded cross-app
ownership.

## Token Claims

Pre-token generation emits the shared `TransformotionTokenClaims` shape (see
`types.ts`): `apps` (entitled app slugs), `accounts` (per-app account
memberships), and `groups` (`cognito:groups`).

The normative meaning of those claims — Cognito groups as the **sole authority**
for site-admin / app-access / app-admin, the one-directional app-access
invariant, and the claim shape — is defined CANONICALLY in the generated mirror
of the runtime auth model and is **not restated here**:

> `contracts/auth-model.md` — generated, read-only mirror of
> `transformotion-apps/docs/architecture/auth.md` (the source of truth).

## IAM And External Dependencies

Auth-domain Lambdas require scoped access to Cognito, SES for provider lookup,
and the Launchpad-owned user/account/member/invitation/rate-limit tables. IAM
must not grant app runtime table access from auth-domain handlers.
