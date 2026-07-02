# Launchpad Navigation Contract

This file describes behavior for the executable shapes in `types.ts`, `api.ts`,
and `mocks.ts`.

## Entry Points

- `/` and `/launchpad` render the Launchpad shell.
- `/sign-in/callback` and `/launchpad/callback` complete Cognito Hosted UI
  redirects for Launchpad.
- `/signed-out/` is the shared logout landing path.

## Auth Flow

Launchpad uses the `AuthSession` and `TransformotionTokenClaims` shapes from
`../_shared/auth.ts`. Runtime profile selection follows
`RuntimeProviderSelection` from `../_shared/runtime-config.ts`.

Mock mode may bypass Cognito but must still produce claims that satisfy the
shared token contract.

## App Tiles

Tile visibility is based on the `apps` claim, except site admins may see every
registered app. The tile view uses `LaunchpadTile` and `AppRegistryEntry` from
`types.ts`.

Unavailable app tiles may be displayed only when represented by the registry
entry as unavailable. Missing entitlement must not render an app as available.

## Site Admin Navigation

Site-admin settings expose AI runtime provider/model controls backed by the
routes in `api.ts`. Non-admin users must not see or invoke those actions.
