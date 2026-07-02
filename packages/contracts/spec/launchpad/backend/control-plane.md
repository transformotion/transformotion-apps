# Launchpad Backend Control-Plane Contract

## Ownership

Launchpad owns the control-plane REST API, including account APIs, user
preferences, invitations, provider lookup, account setup, and AI runtime
configuration.

## AI Runtime Config

The executable route and data shapes are in `api.ts` and
`../_shared/ai-runtime.ts`.

Routes:

- `GET /api/admin/ai-runtime-config`
- `PUT /api/admin/ai-runtime-config/platform-default`
- `PUT /api/admin/ai-runtime-config/apps/{appSlug}/override` _(deprecated M15.1)_
- `DELETE /api/admin/ai-runtime-config/apps/{appSlug}/override` _(deprecated M15.1)_

Authorization is site-admin only. Non-site-admin requests return forbidden.

As of M15.1, app-specific provider/model override editing is owned by each app
(Budget Tracker and Stock Analyser) through their own account-scoped ai-config
endpoints. Launchpad now owns only the **platform default**. The two
`apps/{appSlug}/override` write routes above are **deprecated** and retained for
a safe runtime transition; they will be removed in a future milestone. `GET`
remains available for a read-only effective summary across apps.

The DynamoDB table is `launchpad-ai-runtime-config-{stage}`. Records use
`pk = AI_CONFIG`; `sk = PLATFORM#default`, `APP#stock-analyser`, or
`APP#budget-tracker`; plus provider, model, and updatedAt. Provider secrets are
not stored in this table.

The app AI proxies read this table read-only and resolve app override,
platform default, then environment fallback.

## Mockability

Mock handlers in `mocks.ts` must compile against the same TypeScript contracts
as live code. Mock AI runtime config must preserve site-admin behavior and
supported model lists.
