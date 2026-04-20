# Stabilisation Freeze

**Status:** ACTIVE
**Started:** 2026-04-20
**Expected end:** Once Phase 4 (stock analyser migration) is complete
and stable in production.

## What this means

No new features will be built in any Transformotion repo during this
freeze. Only stabilisation work is permitted:

- Turning on existing enforcement (ESLint, boundary rules, pre-commit
  hooks, CI test gates)
- Converting markdown contracts to executable Zod schemas
- Adding IaC policy checks (cdk-nag)
- Migrating the monolithic stock analyser HTML into the monorepo
- Fixing documented architectural drift (e.g. Budget Tracker API
  Gateway rollback to shared platform Gateway)
- Bug fixes required to ship the above

## What this does not mean

The freeze is not a halt. Work continues on the stabilisation sequence.
The freeze restricts *scope*, not *activity*.

## Why

The architecture documented in `MONOREPO.md` and `DEVELOPMENT_PLAN.md`
is sound. The enforcement layer under it has been partially or fully
disabled. Until enforcement is restored and contracts are executable,
new features compound drift rather than ship value.

## How to know the freeze is lifting

The freeze lifts when:

- ESLint boundary rules run in CI for all apps and must pass
- Existing tests are wired into CI and must pass
- Contract schemas are executable (Zod) and validated in Lambda
  handlers and API client
- `cdk-nag` runs on CDK synth and must pass
- The monolithic stock analyser is migrated and decommissioned
- The Budget Tracker API Gateway is rolled back to the shared platform
  Gateway and the underlying CDK circular dependency is resolved
  properly
