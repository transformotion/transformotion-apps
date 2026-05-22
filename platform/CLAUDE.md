# Platform — Claude Code operating guide

Read this file before any platform-level work. Read the root `CLAUDE.md` for branching strategy and operating mode.

## Overview

Platform code lives at `platform/`. It is shared across all apps — changes deploy to every app.

| Directory | Contents |
|---|---|
| `platform/infrastructure/` | CDK stack definitions for platform-level AWS resources |
| `platform/functions/` | Lambda function source code shared across apps |

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

## Platform WebSocket stack (`PlatformWsStack`)

`platform/infrastructure/platform-ws-stack.ts`

API Gateway v2 WebSocket shared by all apps for async AI job notifications. The custom Lambda authoriser (`ws-authorizer`) validates the Cognito ID token from `?token=` and checks `accounts[appName]` membership for the app identified by `?app=`.

**Props:**
- `userPool` — from `AuthStack`; used by the authoriser for JWKS verification
- `stage` — `'dev'` | `'prod'`

**Exported values (consumed by other stacks via `bin/app.ts`):**
- `connectionsTable.tableName` → `BudgetTrackerApiStack.wsConnectionsTableName`
- `webSocketApi.apiId` → `BudgetTrackerApiStack.wsApiId` and `PlatformApiStack.wsApiId`
- `wsApiEndpoint` → `PlatformApiStack.wsApiEndpoint` (for claude-proxy WSS push)

**Stack outputs (read by deploy workflows):**
- `WssUrl` — `wss://` URL; extracted by `deploy-budget-tracker.yml` and `deploy-stock-analyser.yml` at build time

## WS Lambda functions

All WS Lambdas live in `platform/functions/ws-*/`.

| Lambda | Package | Role |
|---|---|---|
| `platform-ws-authorizer-{stage}` | `@transformotion/fn-ws-authorizer` | Custom `$connect` authoriser; validates Cognito ID token via `jose` JWKS; checks `accounts[appName]` membership; reads `?app=` to select app scope |
| `platform-ws-connect-{stage}` | `@transformotion/fn-ws-connect` | `$connect` handler; stores `{ connectionId, userId, accountId, app, expiresAt }` in `platform.ws-connections-{stage}` |
| `platform-ws-disconnect-{stage}` | `@transformotion/fn-ws-disconnect` | `$disconnect` handler; deletes connection record |
| `platform-ws-default-{stage}` | `@transformotion/fn-ws-default` | `$default` handler; handles `{ action: 'init' }` handshake — pushes `{ type: 'connected', connectionId }` back to the client |

### Connection handshake

Clients must send `{ action: 'init' }` after connecting. The `ws-default` handler responds with `{ type: 'connected', connectionId }`. The client passes this `connectionId` in the subsequent HTTP POST to `/api/claude` to wire up the completion notification.

### Multi-app authorisation

The `ws-authorizer` reads `?app=` from the query string (defaults to `budget-tracker`). It validates the token against `PERMITTED_APPS` (`budget-tracker,stock-analyser`) and checks the user's `accounts[appName]` JWT claim for the requested `?accountId=`. The resolved `app` value is written to the connection record in `platform.ws-connections-{stage}`.

## Platform API claude-proxy WSS push

`platform/functions/claude-proxy` sends a `{ type: 'job_complete', jobId }` message to the client's WebSocket connection after an async job completes, when `connectionId` was provided in the request body. The push uses `ApiGatewayManagementApiClient` with the `WS_API_ENDPOINT` env var (set by `PlatformApiStack` when `wsApiEndpoint` is passed). The `execute-api:ManageConnections` IAM permission is scoped to the `PlatformWsStack`'s API ID.

## DynamoDB table

| Table | PK | GSI | TTL | Purpose |
|---|---|---|---|---|
| `platform.ws-connections-{stage}` | `connectionId` | `userId-index` | `expiresAt` (1h) | Active WebSocket connections for all apps |

## Adding a new app's WebSocket flow

1. Pass `?app=<appSlug>` in the WebSocket URL when connecting
2. Add the new `appSlug` to the `PERMITTED_APPS` env var in `platform-ws-stack.ts`
3. The authoriser will check `accounts[appSlug]` membership automatically
4. For async AI jobs: pass `connectionId` and `appName: '<appSlug>'` to the claude-proxy HTTP endpoint
