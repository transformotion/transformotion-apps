# Platform Current-State Contract Surfaces

> M15 #135 correction note: this is raw post-M9 migration input from the
> runtime repo. It is not the final #136 scope-first structure and it is not
> executable #137/#139 contract material.

## Runtime Sources Inspected

- `platform/infrastructure/network-stack.ts`
- `platform/infrastructure/storage-stack.ts`
- `platform/infrastructure/github-actions-role-stack.ts`
- `infrastructure/bin/platform.ts`
- `docs/architecture/urls-and-deploy.md`
- `docs/architecture/inventory.md`
- `MONOREPO.md`
- `packages/runtime-config/src/index.ts`

## Ownership Baseline

Platform owns neutral substrate only:

- S3 static website bucket.
- CloudFront distribution and index rewrite behaviour.
- DNS/custom-domain attachment through ACM certificate input.
- backups bucket.
- GitHub Actions deploy roles.
- shared runtime profile/config helper package.

Platform does not own:

- Cognito/auth-domain resources.
- Launchpad control-plane APIs.
- app REST APIs.
- app WebSocket APIs.
- app AI runtimes.
- app execution paths.
- app data tables.

## URL And Static Hosting Boundaries

Canonical app URLs:

- root/sign-in/launchpad:
  - dev: `https://dev.apps.transformotion.com.au/`
  - prod: `https://apps.transformotion.com.au/`
- Stock Analyser:
  - `/stock-analyser/`
- Budget Tracker:
  - `/budget-tracker/`
- Signed out:
  - `/signed-out/`

S3 layout:

- root/Launchpad assets at bucket root or Launchpad-owned paths per deploy
  workflow.
- Stock Analyser static export under `stock-analyser/`.
- Budget Tracker static export under `budget-tracker/`.

CloudFront:

- single distribution.
- S3 origin with Origin Access Control.
- index rewrite function maps directory routes to `index.html` where needed.
- app deploy workflows invalidate their own paths.

## Platform Stack Outputs / Inputs

Network stack outputs:

- CloudFront domain.
- CloudFront distribution ID.
- S3 web bucket name.
- custom domain URL when configured.

Storage stack outputs:

- backups bucket name.

Platform stack inputs:

- stage: `dev` or `prod`.
- ACM certificate ARN for CloudFront custom domains.
- domain names per stage.

## Deploy Boundary Inputs

Platform deploy:

- deploys neutral substrate only.
- must not orchestrate Launchpad, Stock Analyser, Budget Tracker, or Migration
  Utilities deploy workflows.

App deploy workflows consume substrate values for static deployment and
CloudFront invalidation, but own their app stacks and frontend assets.

Documentation-only app files should not trigger app deploys; source,
infrastructure, contract-source, workflow, and relevant package files remain
deploy-eligible.

## Runtime Profile / Env Convention

Shared runtime config convention:

- `NEXT_PUBLIC_RUNTIME_PROFILE=mock | live`.
- invalid or missing profile defaults to `mock`.
- per-concern overrides may override a single provider selection.
- `selectProvider()` resolves override, profile default, then fallback.

Shared URL helper:

- `normaliseCrossAppUrl(envValue, fallback)` ensures cross-app app URLs have
  exactly one trailing slash.

## Stale / Pre-M9 Risks

Do not carry forward any platform contract text that assigns these to Platform:

- auth/control-plane ownership.
- app access administration.
- shared app REST gateway.
- shared app WSS gateway.
- shared AI runtime.
- Stock Analyser or Budget Tracker job result tables.
- app-specific cache/data tables.
