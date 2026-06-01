# Launchpad - Claude Code compatibility mirror

Root `AGENTS.md` is the canonical AI-agent operating guide for this repository.
This file mirrors `apps/launchpad/AGENTS.md` for Claude Code compatibility and
must remain semantically equivalent. Any instruction added, removed, or modified
in `apps/launchpad/AGENTS.md` must be reflected here in the same PR.

Read this file before any Launchpad work. Read the root `AGENTS.md` for
branching strategy, architecture governance, and operating mode.

## Overview

Next.js app at `apps/launchpad/`. Static export deployed to S3/CloudFront.
Serves at the root host and `/launchpad/*` sign-in/callback paths.

Launchpad is the control-plane app. After #363, it owns the live
auth/control-plane API surface. Platform still physically owns Cognito,
auth-domain tables, and rollback routes as migration debt until #386.

## Quick reference

| What | Value |
|---|---|
| basePath | root app, plus `/launchpad` and `/sign-in` auth paths |
| Deploy workflow | `.github/workflows/deploy-launchpad.yml` |
| CDK entrypoint | `infrastructure/bin/launchpad.ts` |
| Control-plane stack | `Transformotion{Stage}-LaunchpadControlPlane` |
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
| `Transformotion{Stage}-LaunchpadControlPlane` | Launchpad-owned REST API, Cognito authoriser, and control-plane Lambdas |

Source: `apps/launchpad/infrastructure/`.

## Lambda functions

| Lambda | Source | Routes |
|---|---|---|
| `launchpad-forgot-provider-{stage}` | `apps/launchpad/functions/forgot-provider` | `POST /auth/lookup-provider` |
| `launchpad-account-provisioning-{stage}` | `apps/launchpad/functions/account-provisioning` | `POST /auth/setup` |
| `launchpad-user-{stage}` | `apps/launchpad/functions/user` | `GET /api/user/profile`, `PUT /api/user/preferences` |
| `launchpad-accounts-{stage}` | `apps/launchpad/functions/accounts` | account and member administration routes |
| `launchpad-invitations-{stage}` | `apps/launchpad/functions/invitations` | `POST /accounts/{accountId}/invitations` |

## Ownership rules

- Add new auth/control-plane behavior under `apps/launchpad/`, not `platform/`.
- Keep Launchpad infrastructure under `apps/launchpad/infrastructure/`.
- Do not add new platform-owned auth/control-plane routes as a shortcut.
- Platform-owned Cognito, auth-domain tables, and rollback routes are current
  migration debt, not precedent.
- #386 owns physical auth-domain re-home into Launchpad.
- Preserve platform rollback routes until the issue that removes them explicitly
  says to decommission them.

## Deployment rules

- Launchpad deploys through `.github/workflows/deploy-launchpad.yml`.
- The Launchpad workflow deploys `LaunchpadControlPlane`, extracts
  `ControlPlaneApiUrl`, injects `NEXT_PUBLIC_LAUNCHPAD_CONTROL_PLANE_API_URL`,
  and builds/deploys the frontend.
- Platform deploy must not cascade into Launchpad deploy.
- Any change to Launchpad routes, env vars, stack outputs, or workflow behavior
  must update `docs/architecture/*` in the same PR.

