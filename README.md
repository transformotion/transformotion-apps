# Transformotion Apps

Multi-tenant PWA platform — Stock Signal Analyser, Budget Tracker, and Transformotion Framework.

**Platform URL:** apps.transformotion.com.au  
**AWS Region:** ap-southeast-2  
**IaC:** AWS CDK (TypeScript)

## Monorepo structure

```
apps/launchpad/     Platform shell — sign-in page, launchpad with group-based tile visibility
apps/budget/        Budget Tracker (Phase 5)
packages/api-client Typed API wrappers (shared)
packages/cycle-engine  RSI/MACD/volume cycle scoring (extracted from HTML version)
packages/ui/        Shared component library (long-term)
infra/              AWS CDK stacks
functions/          Lambda functions
test-data/          Sample CSVs and mock API responses for tests
.github/workflows/  CI/CD pipelines (GitHub Actions + OIDC)
```

## Getting started

```bash
npm install          # installs all workspace dependencies via npm workspaces
npm run dev          # start all dev servers via Turborepo
npm run build        # build all packages
npm run typecheck    # typecheck all packages
npm run test         # run all tests
```

## Architecture

See [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) for the full phased plan, technical decisions, DynamoDB schema, auth model, and testing strategy.

## Branch strategy

- `main` — production (apps.transformotion.com.au)
- `develop` — integration (dev.apps.transformotion.com.au)
- `phase/N-name` — phase branches
- `feature/`, `fix/`, `chore/` — working branches off develop
