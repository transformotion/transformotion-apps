# Platform - Claude Code Compatibility Guide

This file mirrors `platform/AGENTS.md` for Claude Code compatibility. `AGENTS.md`
is canonical; update both files together.

Read this file before platform-level work. Read the root `AGENTS.md` for
branching strategy, architecture governance, and operating mode.

## Overview

Platform code lives at `platform/`. Platform is neutral substrate only. It does
not own auth-domain resources, app runtime resources, app APIs, app WSS paths,
or product control-plane behavior.

| Directory | Contents |
|---|---|
| `platform/infrastructure/` | CDK stack definitions for neutral substrate |

## Infrastructure Stacks

| Stack | Class | Deploy workflow |
|---|---|---|
| `Transformotion{Stage}-Storage` | `StorageStack` | `deploy-platform.yml` |
| `Transformotion{Stage}-Network` | `NetworkStack` | `deploy-platform.yml` |
| `Transformotion-GithubActionsRole` | `GithubActionsRoleStack` | `deploy-platform.yml` |

Full stack topology: [/docs/architecture/cdk.md](/docs/architecture/cdk.md)

## Ownership Boundaries

- Launchpad owns authentication, Cognito, auth tables, control-plane APIs, and
  auth administration workflows.
- Stock Analyser owns its REST, WSS, AI runtime, tables, and deployment.
- Budget Tracker owns its REST, WSS, AI runtime, tables, and deployment.
- Migration utilities own their own migration API.
- Platform deploys must not cascade into app deploys.

## Platform Work Rules

- Do not add app runtime behavior under `platform/`.
- Do not add auth/control-plane product behavior under `platform/`.
- Do not add Lambda function packages under `platform/functions/`; that path
  has been decommissioned.
- Do not add platform deploy steps that orchestrate app deploy workflows.
- Update `docs/architecture/*`, `MONOREPO.md`, and this guide when platform
  ownership or deploy boundaries change.
