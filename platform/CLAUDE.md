# Platform - Claude Code compatibility mirror

`platform/AGENTS.md` is the authoritative Platform agent guide. This file is
maintained for Claude Code compatibility and must remain semantically
equivalent. Any instruction added, removed, or modified in `platform/AGENTS.md`
must be reflected here in the same PR.

Read `platform/AGENTS.md` before any platform-level work. Read the root
`AGENTS.md` for branching strategy, architecture governance, and operating mode.

## Overview

Platform code lives at `platform/`. It owns neutral substrate plus explicitly retained migration-debt resources. Platform deploys must not cascade into app deploys.

| Directory | Contents |
|---|---|
| `platform/infrastructure/` | CDK stack definitions for platform-level AWS resources |
| `platform/functions/` | Lambda function source code for platform substrate and temporary rollback/decommission paths |

## Infrastructure stacks

| Stack | Class | Deploy workflow |
|---|---|---|
| `Transformotion{Stage}-Storage` | `StorageStack` | `deploy-platform.yml` |
| `Transformotion{Stage}-Network` | `NetworkStack` | `deploy-platform.yml` |
| `Transformotion{Stage}-Auth` | `AuthStack` | `deploy-platform.yml` |
| `Transformotion{Stage}-AuthApi` | `AuthApiStack` | `deploy-platform.yml` |
| `Transformotion{Stage}-PlatformTables` | `PlatformTablesStack` | `deploy-platform.yml` |
| `Transformotion{Stage}-Api` | `PlatformApiStack` | `deploy-platform.yml` |
| `Transformotion{Stage}-PlatformWs` | `PlatformWsStack` | `deploy-platform.yml` |

Full stack topology: [/docs/architecture/cdk.md](/docs/architecture/cdk.md)

## Current migration-debt resources

After #363, Launchpad owns live auth/control-plane APIs. Platform still physically owns Cognito, auth-domain tables, pre-token-generation, and legacy rollback routes only as migration debt. #386 owns physical auth-domain re-home into Launchpad.

After #364/#365, app-owned WSS stacks own live app WSS flows. `PlatformWsStack` is retained during M9 as rollback/decommission debt.

After #366/#367, app-owned AI proxies own live app AI runtime. `platform/functions/claude-proxy` is retained during M9 as rollback/decommission debt.

## Platform work rules

- Do not add new app runtime behavior under `platform/`.
- Do not add new auth/control-plane product behavior under `platform/`.
- Do not add new platform deploy steps that cascade into app deploy workflows.
- Preserve rollback resources unless the current issue explicitly decommissions them.
- Update `docs/architecture/*`, `MONOREPO.md`, and this guide when platform ownership or deploy boundaries change.
