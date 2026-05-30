# Transformotion Apps

Multi-tenant PWA platform — Stock Signal Analyser, Budget Tracker, and Transformotion Framework.

**Platform URL:** apps.transformotion.com.au
**AWS Region:** ap-southeast-2
**IaC:** AWS CDK (TypeScript)

## Operating documents

This repository is governed by canonical operating documents. New
contributors, human or AI, read these first.

- **[AGENTS.md](./AGENTS.md)** - canonical AI-agent operating guide.
  Claude Code also reads the compatibility mirror at
  **[CLAUDE.md](./CLAUDE.md)**.
- **[PLAN.md](./PLAN.md)** — current trajectory of work. Goals,
  v0 development constraint, milestones, gating relationships,
  sequencing.
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — ways of working.
  Document map, repository conventions, workflow rules, discipline
  rule, status-tag system, operating principles.
- **[MONOREPO.md](./MONOREPO.md)** — workspace structure, import
  boundaries.

The architectural invariants live at
[`docs/architecture/`](./docs/architecture/) — `auth.md`, `data.md`,
`urls-and-deploy.md`, `cdk.md`. These describe the platform's
canonical structure and behaviour.

## Project tracking

Work is tracked in a GitHub Project (Projects v2) at the organisation
level:

**[github.com/orgs/transformotion/projects/1](https://github.com/orgs/transformotion/projects/1)** — "Platform development"

The Project shows all issues across milestones, with kanban and
roadmap views. Every actionable unit of work has a corresponding
GitHub Issue belonging to a milestone (M-setup, M0–M14, or "Backlog
— unsequenced items"). See `CONTRIBUTING.md` Section 4.4 for how
issues, milestones, and the Project relate.

## Monorepo structure

The directory layout below reflects the structure documented in
`CONTRIBUTING.md` Section 3. Migration from earlier layouts is
tracked in `PLAN.md`.

```
apps/                   User-facing applications
  launchpad/            Platform shell — sign-in, app tile rendering
  stock-analyser/       Stock Signal Analyser
  budget-tracker/       Budget Tracker

platform/               Platform-owned deployable artefacts
  functions/            Platform Lambda handlers (auth, accounts, claude-proxy, user)
  infrastructure/       Platform CDK stacks (Network, Auth, PlatformTables, PlatformApi)

packages/               Shared code consumed by 2+ apps or platform
  api-client/           Typed API client
  budget-domain/        Budget Tracker domain types and helpers
  lambda-middleware/    Shared withAuth/withAuthOnly wrappers
  ui/                   UI packages organised by concern (per-concern packages live here)

contracts/              Per-scope normative contracts
  platform/             Platform-wide contracts
  stock-analyser/       Stock Analyser contracts
  budget-tracker/       Budget Tracker contracts

docs/                   Documentation
  architecture/         Architecture invariants (auth, data, urls-and-deploy, cdk)
  archive/              Superseded documents preserved for historical reference

infrastructure/         CDK app entrypoint only; stacks live with their owners
.github/workflows/      CI/CD pipelines (GitHub Actions + OIDC)
```

Per-app structure within `apps/<app>/` is documented in
`CONTRIBUTING.md` Section 3.2.

## Getting started

```bash
npm install          # installs all workspace dependencies via npm workspaces
npm run dev          # start all dev servers via Turborepo
npm run build        # build all packages
npm run typecheck    # typecheck all packages
npm run test         # run all tests
```

## Branch strategy

- `main` — production (apps.transformotion.com.au)
- `develop` — integration (dev.apps.transformotion.com.au)
- Working branches use prefixes by source per `CONTRIBUTING.md`
  Section 4.1: `claude-code/<n>` (Claude-Code-driven), `v0/<n>`
  (v0-pushed), `<author>/<n>` (manual).

For pull request conventions, the discipline rule, and the operating
principles that govern this codebase, see `CONTRIBUTING.md`.
