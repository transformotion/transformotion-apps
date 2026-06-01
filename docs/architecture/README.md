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
- **[AGENTS.md](/AGENTS.md)** — Canonical AI-agent operating guide.
- **[docs/migrations/m9-363-closeout.md](/docs/migrations/m9-363-closeout.md)** — #363 deployment and runtime validation checklist; records #386 as the physical auth-domain re-home follow-up.
- **[apps/stock-analyser/AGENTS.md](/apps/stock-analyser/AGENTS.md)** — Stock Analyser operating guide for agents.
- **[apps/budget-tracker/AGENTS.md](/apps/budget-tracker/AGENTS.md)** — Budget Tracker operating guide for agents.
- **[apps/launchpad/AGENTS.md](/apps/launchpad/AGENTS.md)** — Launchpad control-plane operating guide for agents.
- **CLAUDE.md files** — Claude Code compatibility mirrors for the corresponding AGENTS.md files.

## What is NOT in these documents

- Project status, phase plans, or work schedules — see `STABILISATION_FREEZE.md`.
- Migration plans for specific sub-phases — ephemeral documents like `docs/sub-phase-7e-plan.md` exist for the duration of their work, then are deleted.
- Implementation details that change frequently — live in code or in per-app AGENTS.md, with CLAUDE.md mirrors kept equivalent for Claude Code.
