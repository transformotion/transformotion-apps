# Architecture documents

These documents describe the architectural invariants of the Transformotion platform. They are the source of truth for how the system is structured, how its parts interact, and what constraints bind new work.

## The discipline

**Any pull request that changes what is described here must update the corresponding document in the same PR.** Code conforms to these documents; these documents are not retrofitted to describe whatever code happened to land.

If during implementation a document is discovered to be wrong or incomplete, work pauses and the document is corrected before proceeding. Architectural drift is prevented by this rule, not by individual vigilance.

## Documents

- **[auth.md](./auth.md)** — Authentication and permissions. Cognito pool, app clients, identity providers, token shape, two-dimensional permission model (app access + account membership), pre-token generation Lambda, invitation flow, revocation.

- **[data.md](./data.md)** — Data model. DynamoDB table conventions, per-app vs platform-scoped tables, account-scoping invariant, PK/SK patterns, GSI conventions.

- **[urls-and-deploy.md](./urls-and-deploy.md)** — URL routing, CloudFront distribution, S3 layout, deploy triggers, Next.js basePath per app.

- **[cdk.md](./cdk.md)** — CDK stack topology, cross-stack references, deploy ordering, env var enforcement.

## Companion documents elsewhere in the repo

- **[MONOREPO.md](/MONOREPO.md)** — Workspace structure, import boundaries, build/deploy triggers.
- **[contracts/](/contracts/)** — Per-app data and API contracts (living documentation adjacent to each app's code).
- **[apps/stock-analyser/CLAUDE.md](/apps/stock-analyser/CLAUDE.md)** — Stock Analyser operating guide for agents.
- **[apps/budget-tracker/CLAUDE.md](/apps/budget-tracker/CLAUDE.md)** — Budget Tracker operating guide for agents.

## What is NOT in these documents

- Project status, phase plans, or work schedules — see `STABILISATION_FREEZE.md`.
- Migration plans for specific sub-phases — ephemeral documents like `docs/sub-phase-7e-plan.md` exist for the duration of their work, then are deleted.
- Implementation details that change frequently — live in code or in per-app CLAUDE.md.
