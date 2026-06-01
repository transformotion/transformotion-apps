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
auth/control-plane API surface. #386 adds `LaunchpadAuth` as the staged
Launchpad-owned Cognito/auth foundation; live auth still uses Platform
AuthStack until cutover. Platform-owned auth-domain resources are migration
debt.

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
| `Transformotion{Stage}-LaunchpadAuth` | Staged Launchpad-owned Cognito User Pool, Hosted UI domain, app clients, groups, Hosted UI customisation, social credential secret placeholders, auth-domain tables, and pre-token trigger |
| `Transformotion{Stage}-LaunchpadControlPlane` | Launchpad-owned REST API, Cognito authoriser, and control-plane Lambdas |
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
| `launchpad-pre-token-generation-{stage}` | `apps/launchpad/functions/pre-token-generation` | Staged Cognito pre-token trigger for `LaunchpadAuth` |

## Ownership rules

- Add new auth/control-plane behavior under `apps/launchpad/`, not `platform/`.
- Keep Launchpad infrastructure under `apps/launchpad/infrastructure/`.
- Do not add new platform-owned auth/control-plane routes as a shortcut.
- Platform-owned live Cognito, auth-domain tables, and rollback routes are
  current migration debt, not precedent.
- Do not cut live auth over to `LaunchpadAuth` without an explicit #386 cutover
  PR and validation plan.
- Reseed/validate the staged `launchpad-*` auth tables before any cutover.
- #386 owns physical auth-domain re-home into Launchpad.
- Preserve platform rollback routes until the issue that removes them explicitly
  says to decommission them.

## Deployment rules

- Launchpad deploys through `.github/workflows/deploy-launchpad.yml`.
- The Launchpad workflow deploys all `Transformotion{Stage}-Launchpad*`
  stacks, extracts `ControlPlaneApiUrl`, can consume future
  `LaunchpadAuth` outputs, injects frontend auth/control-plane env vars, and
  builds/deploys the frontend.
- `LAUNCHPAD_AUTH_CUTOVER_ENABLED` must remain `false` until the explicit #386
  auth cutover PR. Deploying `LaunchpadAuth` alone must not switch live auth.
- Dev cutover must follow
  `docs/migrations/m9-386-dev-auth-cutover-checklist.md`.
- Platform deploy must not cascade into Launchpad deploy.
- Future auth-domain stacks must use `Transformotion{Stage}-Launchpad*` names
  so the Launchpad deploy lane owns them without Platform orchestration.
- Any change to Launchpad routes, env vars, stack outputs, or workflow behavior
  must update `docs/architecture/*` in the same PR.
