# Launchpad - AI Agent operating guide

This file is the authoritative Launchpad agent guide. The sibling `CLAUDE.md`
file is a Claude Code compatibility mirror and must remain semantically
equivalent. Any instruction added, removed, or modified here must be reflected
in `CLAUDE.md` in the same PR.

Read this file before any Launchpad work. Read the root `AGENTS.md` for
branching strategy, architecture governance, and operating mode.

## Overview

Next.js app at `apps/launchpad/`. Static export deployed to S3/CloudFront.
Serves at the root host and `/launchpad/*` sign-in/callback paths.

Launchpad is the control-plane app. It owns the auth domain, live
auth/control-plane API surface, and active Launchpad-owned Cognito/auth
foundation.
Launchpad app tile visibility is driven by the decoded JWT `apps` claim exposed
through `@transformotion/auth-client`; site-admin users retain override
visibility for configured app tiles.

## Quick reference

| What | Value |
|---|---|
| basePath | root app, plus `/launchpad` and `/sign-in` auth paths |
| Deploy workflow | `.github/workflows/deploy-launchpad.yml` |
| CDK entrypoint | `infrastructure/bin/launchpad.ts` |
| CDK stack target | `Transformotion{Stage}-Launchpad*` |
| Current stacks | `Transformotion{Stage}-LaunchpadAuth`, `Transformotion{Stage}-LaunchpadControlPlane` |
| Control-plane API env | `NEXT_PUBLIC_LAUNCHPAD_CONTROL_PLANE_API_URL` |
| Cognito client var | `NEXT_PUBLIC_LAUNCHPAD_COGNITO_CLIENT_ID` |

## Architecture references

| Topic | Document |
|---|---|
| Auth model, groups, tokens, control-plane APIs | [/docs/architecture/auth.md](/docs/architecture/auth.md) |
| Data ownership and table schemas | [/docs/architecture/data.md](/docs/architecture/data.md) |
| CDK stacks and Lambda names | [/docs/architecture/cdk.md](/docs/architecture/cdk.md) |
| URL routing, CloudFront, deploy triggers | [/docs/architecture/urls-and-deploy.md](/docs/architecture/urls-and-deploy.md) |
| #363 deployment and runtime validation | [/docs/migrations/m9-363-closeout.md](/docs/migrations/m9-363-closeout.md) |

## CDK stacks owned

| Stack | Contents |
|---|---|
| `Transformotion{Stage}-LaunchpadAuth` | Launchpad-owned Cognito User Pool, Hosted UI domain, app clients, groups, Hosted UI customisation, social credential secret placeholders, auth-domain tables, and pre-token trigger |
| `Transformotion{Stage}-LaunchpadControlPlane` | Launchpad-owned REST API, Cognito authoriser, AI runtime config table, and control-plane Lambdas |
| Future `Transformotion{Stage}-Launchpad*` stacks | Additional #386 auth-domain infrastructure, deployed through the Launchpad lane |

Source: `apps/launchpad/infrastructure/`.

## Lambda functions

| Lambda | Source | Routes |
|---|---|---|
| `launchpad-forgot-provider-{stage}` | `apps/launchpad/functions/forgot-provider` | `POST /auth/lookup-provider` |
| `launchpad-account-provisioning-{stage}` | `apps/launchpad/functions/account-provisioning` | `POST /auth/setup` |
| `launchpad-user-{stage}` | `apps/launchpad/functions/user` | `GET /api/user/profile`, `PUT /api/user/preferences` |
| `launchpad-accounts-{stage}` | `apps/launchpad/functions/accounts` | account and member administration routes |
| `launchpad-invitations-{stage}` | `apps/launchpad/functions/invitations` | `POST /accounts/{accountId}/invitations` |
| `launchpad-ai-runtime-config-{stage}` | `apps/launchpad/functions/ai-runtime-config` | site-admin AI provider/model config routes |
| `launchpad-pre-token-generation-{stage}` | `apps/launchpad/functions/pre-token-generation` | Cognito pre-token trigger for `LaunchpadAuth` |

## Ownership rules

- Add new auth/control-plane behavior under `apps/launchpad/`, not `platform/`.
- Launchpad owns AI provider/model configuration as control-plane state, but
  app-owned AI proxy Lambdas own provider execution.
- Launchpad Settings exposes the site-admin-only AI Engine Settings UI for
  provider/model selection. It must not manage provider secrets or app runtime
  execution.
- Keep Launchpad infrastructure under `apps/launchpad/infrastructure/`.
- Do not add new platform-owned auth/control-plane routes as a shortcut.
- LaunchpadAuth is the active auth source. Do not reintroduce
  Platform-auth fallback paths without an explicit architecture issue.

## Deployment rules

- Launchpad deploys through `.github/workflows/deploy-launchpad.yml`.
- The Launchpad workflow deploys all `Transformotion{Stage}-Launchpad*`
  stacks, extracts `ControlPlaneApiUrl` and `LaunchpadAuth` outputs, injects
  frontend auth/control-plane env vars, and builds/deploys the frontend.
- `docs/migrations/m9-386-dev-auth-cutover-checklist.md` records the completed
  dev cutover and historical validation evidence.
- Platform deploy must not cascade into Launchpad deploy.
- Future auth-domain stacks must use `Transformotion{Stage}-Launchpad*` names
  so the Launchpad deploy lane owns them without Platform orchestration.
- Any change to Launchpad routes, env vars, stack outputs, or workflow behavior
  must update `docs/architecture/*` in the same PR.
