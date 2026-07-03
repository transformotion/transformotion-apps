# Contributing to Transformotion Apps

This document describes how the Transformotion Apps platform is built: what it
is for, how decisions get made, how documents relate, where code lives, and
how work flows through the team.

It is the operating substrate for everything else. New contributors — human
or Claude — read this first. Existing contributors return to it when a
question arises about where something belongs, who owns it, or how a change
should be sequenced.

The discipline this document carries is what prevents architectural drift.
Read it through once before contributing; refer back to specific sections as
needed.

---

## 1. Platform goals and design/reference workflow

This section is canonical. Other documents reference these goals by number;
the full statements live here.

### 1.1 The four goals

The platform exists to deliver four goals. Every architectural decision is
evaluated against these. A change that does not serve any goal needs
justification; a change that improves one goal at the cost of another must
make the trade-off visible.

- **Goal 1 — Work on one app without affecting another.** Code-level
  isolation (no cross-app imports), build-level isolation (per-app
  typecheck, lint, test), deployment-level isolation (path-filtered
  workflows, independent stack composition). The presence of any app's
  code inside another app's tree is a Goal-1 violation regardless of
  whether the imports are clean.

- **Goal 2 — Deploy a new app without affecting existing ones.** The
  platform supports a canonical "shape of an app" that new apps can adopt
  without reinventing infrastructure, contracts, or boilerplate. Adding
  an app does not require modifying existing apps' code, infrastructure,
  or deploy pipelines.

- **Goal 3 — Platform cohesion.** Update once, reuse everywhere, monitor
  as a platform. Concerns shared across apps (auth, observability, UI
  primitives, configuration patterns) live in canonical locations and are
  consumed rather than copied. Cross-app monitoring exists at the
  platform level, not just per-app.

- **Goal 4 — Invite people in based on the permissions model.** The
  multi-dimensional permission model (app access **derives from account
  membership**, with Cognito groups maintained as a projection of that
  membership; account membership and role via DynamoDB) is the canonical
  way users reach app data. Invitation flows, account switching, and role
  enforcement are first-class platform capabilities, not app-specific
  features.

### 1.2 Contracts and UI ownership

Contracts and existing runtime UI surfaces are canonical in this repository.
`packages/contracts/` is the source of truth for contract TypeScript shapes,
executable constants, typed mocks, and behavioural specs. Existing UI surfaces
are implemented in runtime and reviewed visually by the owner.

v0 (vercel.com/v0) is retained as optional, per-task reference material for
net-new visual design only. If v0 is used, its output is not canonical until it
is ported into this repository with a cited v0 commit and visual evidence.

This ownership model imposes specific requirements:

- The persistence pattern must have a swap point at the data-access layer.
  Components call `transactionRepository.findAll()` (or equivalent) without
  knowing whether the implementation reads localStorage or hits an HTTP
  endpoint.

- Contracts must be importable without dragging in AWS SDK or other
  production-only dependencies.

- The build pipeline must support both modes. Production builds tree-shake
  or code-split the localStorage implementations out; development builds
  retain them.

- The archived v0 sync flow (`scripts/sync-v0.sh` and `v0-reference/`) is no
  longer a build or CI dependency. It remains only as historical evidence.

For the full architectural treatment of the v0 workflow as a system, see
the architectural inventory's Section 1.9.

### 1.3 How the goals and constraint apply

Architectural decisions are evaluated against the four goals and the v0
ownership model. Documents that record decisions (the architecture documents at
`docs/architecture/`, the contracts policy, this document) state which
goals each decision serves. The convention is "Goals served: 1, 3
primarily; 2 indirectly" or similar.

When two contributors disagree about an architectural choice, the
resolution is to identify which goals each option serves and which it
costs. The choice with the better goal-serving profile wins; if no clear
winner, the trade-off is documented and the decision is escalated.

---

## 2. The document map

This section catalogues every documentation home in the repository, what
each is for, when each is updated, and who owns each.

### 2.1 The discipline rule

**Any pull request that changes what is described in an architectural
document must update the corresponding document in the same PR.**

Code conforms to documents. Documents are not retrofitted to describe
whatever code happens to land. If during implementation a document is
discovered to be wrong or incomplete, the work pauses and the document is
corrected before proceeding.

This rule prevents architectural drift. It applies to all documents in the
"normative" category below.

### 2.2 Document categories

Documents fall into three categories with different update disciplines:

**Normative documents** describe how the platform is structured and how it
must behave. The discipline rule applies. They change rarely, and only via
PRs that also change the code they describe.

**Trajectory documents** describe what work is happening, in what order,
and toward what end. They change whenever scope shifts, but the change is
visible — a PR that revises the plan revises this document in the same PR.

**Operational documents** describe how the team works. They change when
ways of working change. Changes are themselves PRs.

### 2.3 Catalogued documents

| Document | Path | Category | Purpose | Owner |
|---|---|---|---|---|
| Plan | `/PLAN.md` | Trajectory | The current trajectory of work. Goals, constraint, milestones, gating relationships, sequencing. The single source of truth for what is being worked on and in what order. | Steve |
| Contributing (this document) | `/CONTRIBUTING.md` | Operational | Ways of working, document map, repo conventions, workflow rules, discipline rule, status-tag system, operating-agreement items. | Steve |
| Monorepo guide | `/MONOREPO.md` | Operational | Workspace structure, import boundaries, build/deploy triggers. Branch naming convention. | Steve |
| Security | `/SECURITY.md` | Operational | Security policy, vulnerability reporting, secret-handling rules. | Steve |
| Architecture index | `/docs/architecture/README.md` | Normative | Index of architecture documents. Lists all `docs/architecture/*.md` files with their scope. | Steve |
| Auth | `/docs/architecture/auth.md` | Normative | Authentication and permissions. Cognito pool, app clients, two-dimension permission model, pre-token Lambda, helpers. | Steve |
| Data | `/docs/architecture/data.md` | Normative | Data model. Table conventions, account-scoping invariant, PK/SK patterns, GSI conventions. May also cover data-access pattern (canonical persistence shape) per Stage 0b ratification. | Steve |
| URLs and deploy | `/docs/architecture/urls-and-deploy.md` | Normative | URL routing, CloudFront, S3 layout, deploy triggers, Next.js basePath per app. | Steve |
| CDK | `/docs/architecture/cdk.md` | Normative | CDK stack topology, cross-stack references, deploy ordering. | Steve |
| Contracts policy | `/docs/architecture/contracts.md` (TBD by Stage 0b) | Normative | The policy for how contracts are organised: where they live, what is normative vs descriptive, single-source-of-truth rules. Location may shift to an extension of an existing document per Stage 0b ratification. | Steve |
| Contracts package | `/packages/contracts/` | Normative | The actual contracts: TypeScript shapes, API endpoints, data models, state management, typed mocks, and behavioural notes. | Per-app team |
| Agent guide | `/AGENTS.md` and `/apps/<app>/AGENTS.md` | Operational | Canonical AI-agent operating guidance. Required at root and for every app. Minimum per-app content: app's purpose, key entry points, app-specific conventions, app-specific gotchas, sync flow if v0-driven. | Root / per-app team |
| Claude Code mirror | `/CLAUDE.md` and `/apps/<app>/CLAUDE.md` | Operational | Claude Code compatibility mirror for the corresponding AGENTS.md file. Must remain semantically equivalent; changes to one without the other are governance drift. | Root / per-app team |
| Architectural inventory | `/docs/architecture/inventory.md` | Normative (living document) | The current-state inventory of the platform — what is true about code, infrastructure, and operating state right now. Updated as state changes per the discipline rule (Section 2.1). Findings carry status tags including **Resolved by M*N* / PR #*N*** and **Superseded by [reference]** for living-document use. | Steve |

Documents that have been superseded live in `/docs/archive/` with a header
noting the supersession date and the document that replaced them.

### 2.4 Document relationships

`PLAN.md` references the goals from this document by number. The full goal
statements live here in Section 1; PLAN.md states which goals each
milestone serves.

Architecture documents at `docs/architecture/*.md` reference the goals by
number. Each document states which goals it serves at the top.

Per-app `AGENTS.md` files reference the architecture documents and this
document for global conventions. Sibling `CLAUDE.md` files are Claude Code
compatibility mirrors. They cover only app-specific concerns and must remain
semantically equivalent to the corresponding AGENTS file.

The contracts policy governs `/packages/contracts/`. Drift between contracts
policy and package content is a documentation reconciliation concern.

---

## 3. Repository structure

This section establishes where things live in the repo. Decisions here are
about *where* code lives, not *what* it does. Decisions about what code
does (architectural patterns, specific contracts, specific schemas) live in
the architecture documents.

### 3.1 Top-level directories

```
/
├── apps/                  # User-facing applications, including launchpad
├── platform/              # Platform-owned deployable artefacts (Lambdas, CDK)
├── packages/              # Shared code consumed by 2+ apps or platform
├── packages/contracts/    # Canonical contracts package
├── docs/                  # Documentation (architecture, archive, inventory)
├── scripts/               # Repository-level scripts (e.g., sync-v0.sh)
└── infrastructure/        # CDK app entrypoint only; stacks live with their owners
```

### 3.2 The `apps/` directory

`apps/` contains user-facing applications. Each app is a Next.js workspace
with its own routing, components, and (where applicable) Lambdas and
infrastructure.

```
apps/
├── launchpad/             # The platform shell — sign-in, app tile rendering
├── stock-analyser/        # Stock Signal Analyser
├── budget-tracker/        # Budget Tracker
└── <future-app>/
```

Launchpad is treated as an app. It consumes platform services through
packages like any other app. It owns the platform shell UI (sign-in flow,
tile rendering, account switcher) but not the platform substrate (auth
substrate, multi-tenancy services, account-resolution Lambdas — these live
in `platform/` or `packages/`).

Each app has the following internal structure:

```
apps/<app>/
├── app/                   # Next.js routing
├── components/            # App-specific React components
├── lib/                   # App-specific TypeScript modules
├── stores/                # App-specific Zustand stores (auth, domain state)
├── functions/             # App-specific Lambda handlers
├── infrastructure/        # App-specific CDK stacks
├── contracts/             # Forbidden — see Section 2.3 (contracts root only)
├── public/                # Static assets
├── AGENTS.md              # Canonical per-app agent guide (required)
├── CLAUDE.md              # Claude Code compatibility mirror (required)
├── README.md              # Per-app human-readable overview
├── package.json
└── tsconfig.json
```

Tests are co-located with the code they test (`foo.ts` next to
`foo.test.ts`).

### 3.3 The `platform/` directory

`platform/` contains platform-owned deployable artefacts. These are
artefacts owned by the platform itself, not by any specific app, and not
shared code consumed by apps (which lives in `packages/`).

The rule for what goes in `platform/` versus `packages/`:

- If it is a *deployable artefact* owned by the platform (a Lambda
  handler, a CDK stack), it goes in `platform/`.
- If it is *shared code consumed by apps* (a TypeScript library, a
  configuration helper, a UI component package), it goes in `packages/`.

```
platform/
├── functions/             # Platform Lambda handlers
│   ├── auth/              # Auth-related Lambdas (account-provisioning, pre-token-generation, forgot-provider, invitations)
│   ├── accounts/          # Account management Lambda
│   ├── claude-proxy/      # Anthropic API proxy
│   └── user/              # Platform user data Lambda
└── infrastructure/        # Platform CDK stacks (Network, Auth, AuthApi, PlatformTables, PlatformApi)
```

### 3.4 The `packages/` directory

`packages/` contains shared code consumed by 2+ apps or by the platform.
Each package has a single, articulable responsibility describable in one
sentence. Packages do not become "kitchen sinks"; concerns are split into
separate packages rather than accumulating into omnibus packages.

`packages/brand-tokens/` contains the compile-time/data-only Transformotion
brand token source for M18. It may export brand palette constants, semantic
theme maps, CSS custom-property maps, typography metadata, chart/category
colour tokens, and canonical public logo paths. It must not export React
components, layouts, navigation, app shells, dashboards, runtime persistence,
auth/session behaviour, or app-specific UI.

```
packages/
├── api-client/            # Typed HTTP client for the platform API gateway
├── auth-client/           # Cognito and mock auth service implementations
├── budget-domain/         # Budget Tracker domain types and pure helpers
├── fn-claude-proxy-core/  # Shared Claude proxy mechanics for app-owned proxy Lambdas
├── lambda-middleware/     # Shared withAuth/withAuthOnly wrappers and helpers
├── rate-limit-middleware/ # Shared DynamoDB-backed rate-limit helpers
├── runtime-config/        # Runtime profile + provider resolution helpers (selectProvider, resolveProfile, normaliseCrossAppUrl, createConfig, config sub-types)
├── cdk-constructs/        # Shared CDK constructs (the shared construct library)
├── ui/                    # UI packages, organised by concern (see below)
└── <other-concern>/
```

UI packages are organised under `packages/ui/`. This is purely
organisational — `packages/ui/` is not itself a package. Each UI concern is
a separate package:

```
packages/ui/
├── primitives/            # Radix-primitive wrappers (button, input, card, etc.)
├── forms/                 # Form components and hooks
├── app-shell/             # Layout, navigation, header, footer
├── auth-ui/               # Sign-in flow, account switcher, etc.
└── <other-ui-concern>/
```

The decision rule for "should this go in a package?" is in Section 3.6.

### 3.5 Contracts

Contracts are authored in this repo under `packages/contracts/`, where
`src/<scope>/` holds executable TypeScript shapes/constants and `spec/<scope>/`
holds behavioural/narrative specs. `<scope>` is `_shared`, `platform`,
`launchpad`, an app slug, or a future ratified scope.

```
packages/contracts/
+-- src/
¦   +-- _shared/           # Shared contract shapes and version metadata
¦   +-- launchpad/         # Launchpad auth/control-plane contracts
¦   +-- stock-analyser/    # Stock Analyser contracts
¦   +-- budget-tracker/    # Budget Tracker contracts
+-- spec/                  # Behavioural contract notes by scope
```

Per-app mirrors of contracts at `apps/<app>/contracts/` are forbidden.
`v0-reference/` is an archived historical trail and must not be imported by
runtime code, CI, or deploy workflows. If implementation requires a contract
change, make the contract change in `packages/contracts/`, run
`pnpm check:contracts`, and then implement runtime changes against the package.

The contracts policy document (location ratified in Stage 0b) governs what
goes in each contract file, the normative-vs-descriptive classification,
and the relationship between contracts and TypeScript domain packages.

### 3.5.1 Existing UI ownership

Existing runtime UI surfaces are repo-owned. UI-affecting PRs should include
the visual evidence appropriate to the blast radius: screenshots, browser
checks, or explicit owner validation. v0 is optional for net-new visual design
only; if v0 output is used, cite the v0 commit and include a visual comparison
or disposition list in the runtime PR.

The standing tool for those screenshots is **`tools/ui-screenshots/`** (Playwright;
boots the app in mock mode, drives named surface states, captures each). It is a
standalone dev tool — deliberately outside the pnpm workspace, so its browser
dependency never enters the root or app install (see its `README.md` for setup and
for how to add a surface/state). Capture is **on-demand only; it is not wired into
CI** (visual-regression CI is a separate, later decision).

**Screenshot artefact policy — PR-attachment-only.** Captured PNGs are **not**
committed to the repo. Drag-drop them into the PR body in the GitHub UI (GitHub
hosts them permanently); `out/` is gitignored. Visual history lives on the PR, not
in `git` — committing binaries would grow the repo forever for no ongoing benefit.

### 3.5.2 Contract-first development classification

Before implementing runtime work, classify it as one of:

1. `Contract-changing`
2. `Non-contract UI polish`
3. `Runtime-only`
4. `Emergency hotfix`

**Contract-changing work updates `packages/contracts/` before or alongside
runtime implementation.** A change is contract-changing if it adds, removes,
renames, or changes:

- frontend/backend data fields
- API request/response payloads
- WSS message shapes
- cache/job/result shapes
- auth/session/claim shapes
- runtime configuration shapes
- mock data assumptions
- UI state that depends on a new or changed shape
- persistence/storage shape
- app settings/configuration shape

Normal contract-changing workflow:

1. Update canonical contracts in `packages/contracts/` first or in the same PR.
2. Update typed mocks/spec notes when examples, behaviour, or UI-visible
   assumptions change.
3. Run `pnpm check:contracts`.
4. Implement runtime backend/frontend against the repo-owned contracts.
5. Reference the contract files and validation in the PR body.

**Non-contract UI polish is allowed.** UI polish is non-contract-changing when
it only affects styling, spacing/layout, copy text, icons, responsive
behaviour, accessibility attributes, modal/scrollbar polish, or component
arrangement that does not change data/API/WSS/cache/mock/settings/runtime
semantics. Existing surfaces are reviewed directly in runtime. Net-new visual
designs may use v0 as optional reference material when the task calls for it.

**Emergency contract-changing work is allowed only for urgent fixes.** The
issue must be urgent, the owner must explicitly approve any delayed contract
reconciliation, and the PR must include an emergency reconciliation note.
Urgent means app unusable, auth broken, data loss/corruption risk, security
issue, deployment blocked, provider/model execution broken, or severe
user-facing regression.

The emergency fix must be the smallest safe change. The PR must list affected
contract surfaces and affected UI/mock surfaces, and the `packages/contracts/`
reconciliation must land in the same PR or in an immediate tracked follow-up
explicitly approved by the owner.

The emergency reconciliation note must include:

- why the delayed contract update was necessary
- explicit owner approval reference
- affected contract files/surfaces
- affected UI/mock surfaces
- contract reconciliation PR or issue link
- expected reconciliation deadline
- validation plan
### 3.6 The decision rule — where new code lives

When a new piece of code is written, the question is: does it go in
`apps/<app>/`, `platform/`, or `packages/`?

The rule:

- **If it is plausibly platform-shared, put it in a package now.** The
  test for "plausibly platform-shared" is: it has no app-specific business
  logic and represents a generic UI or platform concern that another app
  could reasonably use.

- **If it is a deployable artefact owned by the platform itself** (a
  Lambda, a CDK stack), it goes in `platform/`.

- **Otherwise, it goes in `apps/<app>/`.**

The "plausibly platform-shared" test is intentionally permissive. We
prefer premature abstraction to delayed abstraction in this codebase
because the bilateral duplication problem (75% of stock-analyser duplicated
into budget-tracker) was a direct result of "I'll make it shared later"
that never happened.

When a new piece of code is borderline, the decision is made together
rather than unilaterally. Open an issue describing the decision needed,
tag it `architecture-decision`, and wait for ratification before
proceeding. The decision and rationale are recorded in the issue and
referenced from any code or documentation it produces.

### 3.7 The infrastructure split

CDK infrastructure follows ownership, mirroring the code structure:

- Per-app stacks live at `apps/<app>/infrastructure/`.
- Platform stacks live at `platform/infrastructure/`.
- Shared CDK constructs (the shared construct library) live at
  `packages/cdk-constructs/`.
- The `infrastructure/` directory at repo root contains *only* the CDK
  app entrypoint (`bin/app.ts`) that imports and wires stacks from the
  per-app and platform locations.

This split was completed in M7 (issue #250). The `infrastructure/lib/` directory no longer exists.

### 3.8 Tests

Tests are co-located with the code they test. A file at
`apps/stock-analyser/lib/portfolio.ts` has its tests at
`apps/stock-analyser/lib/portfolio.test.ts`.

The rationale: lower friction to write, harder to lose, visible in the
same directory as the code being tested. The alternative (a mirror tree
under `__tests__/`) makes test coverage harder to assess at a glance.

Test file suffix: `.test.ts` for unit tests, `.test.tsx` for tests of
React components. Integration tests use the same suffix; their nature is
clear from imports and content.

The shape of the test pyramid (unit, integration, end-to-end) and CI
gating are normative concerns documented in the architecture documents.
This document records only the file location convention.

---

## 4. Workflow

### 4.1 Branch naming

Branches use prefixes by source:

- `claude-code/<descriptive-name>` — Claude-Code-driven work. The most
  common case.
- `v0/<descriptive-name>` — v0-pushed branches synced from
  `transformotion-apps-b8`.
- `<author>/<descriptive-name>` — Manual branches authored by a human
  contributor.
- `feature/<name>` and `fix/<name>` — Acceptable but not preferred;
  prefer the source-prefixed form above.

The descriptive name uses kebab-case and describes the *change*, not the
issue number. Issue references go in commit messages and PR bodies, not
branch names.

### 4.2 Pull requests

Every PR references at least one issue. The PR body includes "Closes
#N" or "Fixes #N" for the issue it closes, or "Refs #N" for issues it
relates to but does not close.

Every PR must also complete the `v0 freshness` section when it changes
UI-affecting or contract-affecting paths. Link the matching v0 PR/commit, or
select `No v0 impact` and explain why no v0 change is required. CI enforces
this declaration for the path classes in Section 3.5.1.

PRs without a corresponding issue are acceptable only for trivial work
(typo fixes, comment-only changes, single-line style adjustments). When in
doubt, open the issue first.

PR titles do not have a required format, but should be descriptive enough
that the merge commit is meaningful in `git log`.

**Important note on auto-close behaviour:** GitHub's automatic
`Closes #N` issue-closing only fires when the PR merges into the
default branch (`main`). PRs in this repository merge into `develop`
first, then `develop` merges to `main` periodically. This means a PR
landing on `develop` does *not* auto-close referenced issues, even
with `Closes #N` syntax. Issues need to be closed manually after the
PR merges to `develop`, with a comment indicating which PR closed
them. Auto-close fires only when the change reaches `main`.

PRs must pass all CI checks before merge. Current required checks:
typecheck, lint baseline, CDK synth. Test execution becomes a required
check when the test pyramid work lands (PLAN.md tracks).

### 4.3 The discipline rule applied to PRs

Any PR that changes what is described in a normative document
(`docs/architecture/*.md`, `MONOREPO.md`, the contracts policy, per-app
contracts) updates the document in the same PR.

A PR that discovers a normative document is wrong or incomplete pauses,
opens an issue describing the documentation gap, and either (a) updates
the document in the same PR, or (b) does not merge until the documentation
question is resolved in a separate PR. Merging code that contradicts the
documentation without updating the documentation is the failure mode this
rule prevents.

If the PR's scope makes the documentation update too large to land
together, the PR is split: one PR updates the document, a follow-up PR
lands the code change. This is rare but the right pattern when it
applies.

### 4.4 Issues, milestones, and the GitHub Project

Every actionable unit of work is an issue. Bug, feature, refactor,
documentation update — each gets an issue.

**Before filing: check for existing coverage.** Search GitHub for the
problem or feature before opening a new issue. A surprising number of
issues get filed twice — once when the problem is first noticed, once
when it surfaces again later and the earlier issue wasn't closed because
the work landed on `develop`, not `main` (see Section 4.2). Use
`gh issue list --search "<keyword>"` or the GitHub search UI. If a
duplicate exists and is open, add a comment to the existing issue rather
than filing a new one.

**At filing: attach a milestone.** Every issue gets a milestone when it
is filed, not later. If the work fits into the current numbered
milestone, attach it there. If it belongs in a future milestone, attach
it to that milestone. If it is genuinely unsequenced, attach it to the
"Backlog — unsequenced items" milestone (see Section 4.9). An issue
without a milestone is invisible to the project board's roadmap view and
accumulates into the stale-open debt that periodic audits have to clean
up. There is no valid reason to leave an issue unmilestoned.

Issues belong to a milestone. Milestones map to `PLAN.md` milestones
(M-setup, M0–M14, plus the "Backlog — unsequenced items" milestone).
The first issue of each milestone is a "kickoff" issue capturing the
preconditions for the milestone to start; subsequent issues reference
the kickoff issue as parent.

Dependencies between issues are declared via GitHub's "blocked by" /
"blocks" relationship. Dependencies between milestones are expressed at
the issue level: the first issue of milestone Mn is "blocked by" the
gating issues from milestone Mn-1.

**The GitHub Project lives at the organisation level:**
[github.com/orgs/transformotion/projects/1](https://github.com/orgs/transformotion/projects/1)
— "Platform development".

The Project provides views over issues and PRs:

- A kanban board (Backlog / Todo / In Progress / In Review / Done)
  for day-to-day work tracking.
- A roadmap view grouped by milestone for trajectory visibility.

The Status field has five options that drive the kanban columns:

| Status | Meaning |
|---|---|
| **Backlog** | Issue raised but not yet prioritised. Typical state for items in the "Backlog — unsequenced items" milestone. |
| **Todo** | Prioritised (in a numbered milestone), not yet started. |
| **In Progress** | Actively being worked. |
| **In Review** | A PR linked to the issue is open, awaiting review or CI. |
| **Done** | Issue is closed. |

Lifecycle semantics:

| Lifecycle meaning | Project Status | Rule |
|---|---|---|
| **Backlog** | `Backlog` | Issue is raised but not yet prioritised. |
| **Ready** | `Todo` | Issue is understood, sequenced, assigned to a milestone or intentionally prioritised from Backlog, and no active work is occurring. |
| **In Progress** | `In Progress` | Planning, investigation, architecture review, implementation planning, implementation, or active validation work is underway. |
| **In Review** | `In Review` | Implementation work is complete enough for review and is waiting for CI, CDK synth/diff validation, deployment, smoke testing, runtime validation, approval, or review. |
| **Done** | `Done` | Acceptance criteria are satisfied, required deployment has completed, and required validation has completed. For deploy-affecting work, PR merge alone is not sufficient. |

Do not move deploy-affecting work directly from PR merge to Done.
Deployment and validation remain part of the work.

The Backlog/Todo distinction matters: an issue in a numbered milestone
has been prioritised by the act of being placed in that milestone, so
it sits at Todo; an issue in the "Backlog — unsequenced items"
milestone has not been prioritised yet, so it sits at Backlog. An
unsequenced issue can be triaged into Todo state without yet being
promoted to a numbered milestone — that signals "next backlog item to
pick up" without committing to a specific milestone.

Project automation rules are configured to:

- Add new issues to the Project automatically when attached to a
  milestone.
- Set Status to Backlog when an item is first added.
- Move cards to Done when the issue is closed.
- Move cards to Done when a linked PR is merged.

This automation is not the final authority for deploy-affecting work. If
automation moves a card to Done before required deployment or runtime
validation is complete, move it back to In Review until validation passes.

**Issue filing with a numbered milestone — set Status to Todo immediately.** The automation always defaults to Backlog regardless of which milestone is attached. When you file an issue and attach it to a numbered milestone, also set its Project Status to Todo at the same time — manually, via the issue sidebar or the Project board. Leaving it at Backlog contradicts the milestone assignment (numbered milestones are prioritised by definition) and makes the roadmap view inaccurate, because the roadmap filters on Status.

Milestone completion percentage updates automatically as issues close.
A 100%-closed percentage is a progress signal, **not** the definition of done:
a milestone is complete only when its in-scope features function end-to-end and
its deferrals are reconciled — see Section 4.4.1 (functional completion + the
deferral ledger).

**Roadmap view behaviour.** The Roadmap view positions items by date. The project has no custom target-date fields, so positioning falls back to the built-in `Closed` date — meaning open issues have no timeline position and do not appear in the date range the view is currently showing. For forward-looking tracking of active work, use the Kanban view (Status-based), which shows open issues regardless of date. The Roadmap view is most useful as a "what shipped when" retrospective in this project's current configuration. If you need open issues to appear on the roadmap at a specific point in time, add a custom `Target date` field to the project and populate it.

**Milestone pairing rule:** Numbered milestones in `PLAN.md` and
GitHub Milestones are paired. Creating or removing a numbered
milestone in `PLAN.md` requires creating or closing the corresponding
GitHub milestone in the same PR. The discipline rule (Section 2.1)
applies — `PLAN.md` is a normative document and the GitHub state it
references is part of what the document describes.

**Milestone content pairing rule:** GitHub Milestone descriptions
mirror `PLAN.md` milestone content (Purpose, Outcome, Goals served,
Gate, Dependencies). When `PLAN.md` content for a milestone changes,
the corresponding GitHub Milestone description is updated in the
same PR. Descriptions don't auto-sync — they are part of what the
PR landing the change is responsible for.

**Milestone close convention:** Milestones close when their in-scope work is
functionally complete (Section 4.4.1 Rule A) AND their deferral ledger is
reconciled (Rule D) — not merely when the issue-closure percentage reaches 100%.
Closure is a manual step (GitHub doesn't auto-close milestones). The PR landing
the final issue's resolution may include the milestone closure as a follow-up
step, or it may be done as a separate small action immediately after. Either is
acceptable; what matters is that closed milestones disappear from the active list
once their work is genuinely complete — features functioning, deferrals homed.

**Bootstrap exception:** Milestones whose work establishes the
issue-tracking infrastructure itself (notably M-setup) are exempt
from the "every PR closes an issue" rule (Section 4.4). Such PRs
land work *before* the issue infrastructure exists to track it. The
milestone closes based on its `PLAN.md` outcomes being met, evidenced
by merged PRs, rather than by issue closures. This exception applies
only to bootstrap milestones; subsequent milestones follow the
standard pattern.

For the close-time disciplines — manually closing issues that landed on
`develop`, closing parent trackers when all children close, and the
periodic audit that catches what slips through — see Section 4.5.

### 4.4.1 Milestone definition of done and deferral discipline

A milestone's completion percentage (Section 4.4) counts closed issues — it is a
progress signal, **not** the definition of done. Merged PRs and closed issues do
not by themselves mean a milestone is complete: a PR can deliver nothing, and a
closed issue can have shipped a stub. M11's pending-invitations failure — a
feature "delivered" by merged PRs that never functioned end-to-end, because a
deferral came due and nobody revisited it — is why these four rules exist.

**Rule A — Functional completion.** A milestone is COMPLETE only when its
in-scope features FUNCTION end-to-end, VERIFIED against the working artifact — a
real run, the feature actually doing the thing, in the environment that owns it.
"PRs merged" and "issues closed" are not completion; completion is the feature
working, observed. For deploy-affecting work this means verified *after*
deployment against the live surface (consistent with the Done lifecycle in
Section 4.4), never at PR merge.

**Rule B — No homeless deferral.** A CUT or deferred item is legitimate only when
it is recorded with both (1) a NAMED HOME — a specific milestone or a tracked
GitHub issue that owns it — and (2) its trigger condition (what must become true
for it to come due). Deferring to "Phase N", "later", or "until X ships" with no
tracked owner is PROHIBITED. A disposition list (Section 8.A) or a PR
"documented seams" section that defers an item must name where it lives next. An
un-homed deferral is a defect in the PR, the same class as a missing §2.1 doc
update.

**Rule C — Trigger review.** When a deferral's trigger condition is met (e.g.
"bundles shipped"), the items deferred against that trigger MUST be reviewed for
whether they are now due. The contributor who satisfies a trigger owns checking
what it unblocks — search the named home for items gated on it. A met trigger
with un-reviewed dependents is how a deferral silently rots into a gap.

**Rule D — Close requires a deferral ledger.** Closing a milestone (Section 4.4
close convention) requires reconciling EVERY item that milestone deferred: each
is either (a) done and verified (Rule A), or (b) rehomed to a named owner
(Rule B) — a specific later milestone or tracked issue. No milestone closes with
un-homed deferrals of its own scope. The close-out PR or close action records the
ledger — for each deferred item, its disposition (done / rehomed-to-#NNN). A 100%
issue-closure percentage does **not** authorise closure if the ledger is
incomplete.

### 4.5 Close-out hygiene

Three disciplines keep the issue tracker clean over time. They apply
at the moment work is completed, and periodically as a standing audit.

**Manually close issues when the closing PR merges to `develop`.** As
described in Section 4.2, `Closes #N` in a PR body does not auto-close
the issue when the PR merges to `develop` — auto-close only fires on
`main`. This is a predictable source of stale-open accumulation. The
discipline: when a PR merges to `develop`, close the issues it resolves
immediately — with a comment stating which PR closed them. Do not wait
for `develop` to reach `main`; that merge may not happen for weeks, and
by then the context is lost. The comment is the audit trail: it records
why the issue closed and links back to the work.

**Close parent trackers when all their children close.** A tracker
issue — one whose purpose is to group related child issues — has done
its job when all its children are closed. It should close at that
point, with a comment summarising the completed scope and citing the
closing children. Leaving parent trackers open after their children
close is the second predictable source of stale-open accumulation. The
rule: when you close the last issue in a set tracked by a parent,
check the parent and close it too.

Worked example from M7: issue #253 was a parent tracker for five
deduplication-gate issues (#290–#294). When #294 (the last child)
closed, #253 was checked, confirmed all five children were closed, and
closed with a comment listing them. Without the discipline, #253 would
have remained open indefinitely.

**Periodic audit: catch what slips through.** Even with the above
disciplines, issues accumulate. Run a close-out audit at every
milestone boundary:

1. `gh issue list --milestone "<closed-milestone>" --state open` —
   any open issues against a just-closed milestone should have been
   closed when the milestone closed. Inspect each: work done but
   not closed (close with comment), or genuinely outstanding (move to
   the appropriate open milestone).

2. `gh issue list --state open --search "no:milestone"` — issues
   without a milestone violate the at-filing rule (see above). Attach
   each to the appropriate milestone.

The audit at M7 close (2026-05-25) found six stale-open issues: two
were `CLOSED_BY_PR_NOT_AUTOCLOSED` (develop-not-main pattern), one
was `CLOSED_BY_SIDE_EFFECT` (orphan stack deleted during M7 without
closing the tracking issue), and three were unmilestoned issues that
needed milestone assignment. All six were resolved in a single
follow-up action.

### 4.6 When new problems are discovered mid-work

If during a PR a new problem is discovered (a bug elsewhere, a
documentation gap, a structural concern, a missing test), the rule is:

1. The new problem becomes a tracked issue.
2. The issue is assigned to a milestone (the current one if it belongs
   there, a future one if not, or the backlog if unscheduled).
3. The current PR's scope does not expand to fix the new problem unless
   the new problem is genuinely in-scope.
4. The "we'll fix that later" failure mode is prevented by the new issue
   existing in GitHub, not by intent.

The exception is the discipline rule: if the new problem is that a
normative document is wrong, the document update happens in the same PR
or the PR pauses until resolved. Documentation problems are not deferred
the way code problems can be.

### 4.7 Updating the architectural inventory

The architectural inventory at `docs/architecture/inventory.md` is a
living document — findings are updated as state changes, not appended
as separate notes.

When a PR addresses an inventory finding, the PR updates the finding
in `inventory.md` in the same PR. The discipline rule (Section 2.1)
applies. Specifically:

- **Resolving a finding:** Change the finding's status tag to
  **Resolved by M*N* / PR #*N***. Update the finding's text to
  describe the new state. Preserve a brief note of what changed
  (typically one sentence) so the resolution is auditable in the
  document, not just in git history.
- **Refining a finding:** If verification or investigation reveals a
  finding was wrong or incomplete, update the text and the status
  tag to match what was actually found. The git history preserves
  the previous version.
- **Superseding a finding:** When deeper investigation produces a
  better-shaped finding that subsumes earlier ones, set the older
  finding's status to **Superseded by [reference]** and keep its
  description for context.

PRs that introduce new findings (e.g., M1 verifications producing
findings the inventory didn't have) add them to the relevant section
with appropriate status tags.

The inventory is one of the documents that PRs are most likely to
touch over the platform's lifetime. Updates are normal — not a
sign of drift.

### 4.8 Commit messages

Commit message style is freeform; the merge commit is the unit that
matters in the long-term log. Conventional Commits style (`feat:`,
`fix:`, `refactor:`, etc.) is acceptable but not required.

Commit messages reference issues where relevant ("Refs #42", "Closes
#43"). The PR body is the canonical place for issue references; commit
messages are convenience.

### 4.9 The Backlog milestone

`PLAN.md`'s "Beyond M14" section lists items scoped but not yet
sequenced into numbered milestones. Each such item has a corresponding
GitHub Issue, and those issues belong to a milestone called "Backlog
— unsequenced items" so they remain visible in the GitHub Project
rather than disappearing into "no milestone."

The Backlog milestone is a holding area, not a deliverable. It has no
gate condition and never closes. Issues enter it when raised but not
yet sequenced; they leave it when:

- **Promoted to a numbered milestone**, in which case `PLAN.md`'s
  "Beyond M*N*" section is updated (the item moves to a numbered
  milestone description) in the same PR, and the issue's milestone
  is reassigned.
- **Folded into an existing numbered milestone's outcomes** during
  work on that milestone, in which case `PLAN.md` is updated and the
  issue's milestone is reassigned.
- **Closed as obsolete or won't-do**, with explanatory comment.

The bidirectional rule: `PLAN.md` references and GitHub issues are
paired. Items being added to `PLAN.md`'s "Beyond M*N*" section without
a corresponding GitHub Issue is a documentation gap — the `PLAN.md`
text references a thing that isn't tracked anywhere actionable. Either
the item gets a tracked issue in the Backlog milestone, or the
`PLAN.md` reference gets removed.

**Status field interaction:** Issues in the Backlog milestone usually
have Status = Backlog (raised but not prioritised). When an issue in
the Backlog milestone is triaged as "next backlog item to pick up
soon" but not yet promoted to a numbered milestone, its Status can be
moved to Todo while remaining in the Backlog milestone. This signals
prioritisation without committing to a specific milestone's
sequencing. When the item is later promoted to a numbered milestone,
both the milestone and the Status (if not already Todo) get updated
together.

### 4.10 Cross-stack resource moves

When relocating an AWS resource (Lambda, table, route registration, etc.) between CDK stacks, the deploy order matters. CloudFormation cross-stack exports create dependencies between stacks; if the deploy sequence isn't right, CFN refuses to delete an export still referenced by another stack.

The pattern that works:

1. **New stack first.** Deploy the stack that gains the resource. The new resource exists; new exports get created.
2. **Consumer stack with `--exclusively`.** Deploy the stack whose CFN template references those exports (typically PlatformApiStack for route registrations). Use `cdk deploy <stack-name> --exclusively` so CDK does NOT cascade into dependent stacks. The consumer picks up the new exports; old export references drop out.
3. **Old stack last.** Deploy the stack that loses the resource. By this point, the old exports are no longer referenced — CFN can clean them up.

Without `--exclusively` in step 2, `cdk deploy` cascades into the old stack's redeploy, which fails because the old stack's exports are still being referenced by the consumer's *previous* CFN template (the one that hasn't redeployed yet). `--exclusively` breaks that loop.

This pattern applies to any cross-stack resource move — not just Lambdas. Table moves, IAM role moves, gateway resource moves all hit the same mechanic.

Worked example: M6 #176 relocated the budget-migrate Lambda from BudgetTrackerApiStack to MigrationsApiStack. The deploy sequence was:

1. `cdk deploy TransformotionDev-MigrationsApi` — creates the new Lambda; exports its ARN
2. `cdk deploy TransformotionDev-Api --exclusively` — Platform's CFN gets the new route registration with the new Lambda ARN; old route registration drops out
3. `cdk deploy TransformotionDev-BudgetTrackerApi` — old MigrateFn definition removed; old Lambda ARN export disappears (no longer referenced)

If step 2 had run without `--exclusively`, CDK would have tried to redeploy BudgetTrackerApiStack as part of the cascade, which still had the export reference at that point — failure.

---
## 5. Architectural patterns

This section documents the canonical architectural patterns that all platform code conforms to. The patterns here bind both new code and migrations of existing non-conforming code.

The principles in this section serve the four goals stated in Section 1.1 and the v0 constraint stated in Section 1.2. Where a pattern decision involves trade-offs, the trade-off is resolved in favour of those goals and that constraint.

### 5.1 Layered architecture

All data access in the platform follows a strict layered architecture. Three layers, clearly separated:

**Business logic layer.** UI components, application services, request handlers. The code that does work users care about. This layer calls domain interfaces by name; it never references physical implementations.

**Data-access layer.** Implementations of domain interfaces. Each implementation knows about exactly one physical store (DynamoDB, localStorage, an HTTP API, Redis, etc.) and implements the domain interface against it.

**Physical store.** The actual storage technology. DynamoDB tables, localStorage, S3 buckets, Redis instances, HTTP APIs. The data-access layer encapsulates these.

The strict rule: **business logic never references physical implementations directly**. A UI component calls `transactionRepository.findAll()`, not `dynamoClient.query(...)`. A Lambda handler calls `cacheService.get(key)`, not `dynamodb.getItem(...)`.

This separation serves two concrete needs:

1. **The design/reference workflow** (Section 1.2). UI components must work against local/mock implementations in development and real APIs in production. Only the layered architecture's swap point at the data-access layer makes this possible — the same UI component, the same domain interface, two different implementations.

2. **Physical-layer flexibility.** Decisions about where data physically lives are encapsulated. A cache currently in DynamoDB could move to Redis later; only the data-access layer changes. Business logic doesn't know and doesn't care.

The layered architecture applies broadly. All data access goes through domain interfaces — both client-side and server-side. New code conforms; existing non-conforming code is migrated.

### 5.2 Domain interfaces and implementations

**Domain interfaces** declare data-access shapes in store-agnostic terms. They live canonically in `packages/contracts/`. A domain interface specifies what operations exist (`findAll`, `getById`, `save`, `delete`) and what types they take and return. It does not specify how those operations are implemented.

**Implementations** of a domain interface live in the data-access layer. Each implementation is named for its physical store. Examples:

- `DynamoTransactionRepository` — implements `TransactionRepository` against DynamoDB
- `LocalStorageTransactionRepository` — implements `TransactionRepository` against browser localStorage
- `HttpTransactionRepository` — implements `TransactionRepository` by calling a platform API
- `DynamoTTLCacheService` — implements `CacheService` against DynamoDB with TTL semantics

The implementation name makes the physical store explicit. A reader can tell at a glance where data goes.

Multiple implementations of the same domain interface coexist. A single domain interface (`TransactionRepository`) typically has at least two implementations — one for v0 (localStorage) and one for production (HTTP-via-ApiClient on client-side, DynamoDB on server-side). They never conflict because only one is wired in at a time.

### 5.3 Implementation selection

The decision of which implementation gets wired in is made at the environment layer, not at runtime. Implementations are selected by configuration; nothing flips during execution.

**Client-side selection: build-time config.** The build mode (`MODE` in Vite, equivalent in Next.js) determines which implementation is bundled. Production builds include only the production implementation; v0 builds include only the mock implementation. The unused implementation is tree-shaken out — production bundles do not carry mock code.

The build-time config is typically driven by an environment variable like `NEXT_PUBLIC_RUNTIME_PROFILE`, set per build environment. The variable is consumed at the module level where the implementation is wired into the domain interface. See §5.8 for the canonical pattern documentation.

**Server-side selection: deployment-time config via CDK.** Lambdas receive their physical-store choice via environment variables defined in their CDK stack definition. A Lambda using `CacheService` reads (for example) `CACHE_BACKEND=dynamodb` at startup and wires the corresponding implementation.

Deployment-time config is set in CDK because that is where deployment topology is defined. Different stages (`dev`, `prod`) can use different physical stores if needed; the CDK stack decides.

The shared principle: the implementation choice is an environment concern, not a runtime concern. Code does not test "are we in mock mode?" at every call site. The wiring is decided once, at the appropriate environment layer.

### 5.4 Domain interface naming conventions

Domain interface names are store-agnostic — they describe what is being accessed, not where it lives. Two naming patterns apply, distinguished by what the interface abstracts.

**Repository pattern** — for interfaces that abstract a collection of entities. The consuming code thinks of the data as "entities in a collection we look up, save, modify, delete." Operations are CRUD-shaped: `findById`, `findAll`, `save`, `delete`, etc.

Repository names end with `Repository`. Examples:

- `TransactionRepository` — operations on transactions
- `WatchlistRepository` — operations on watchlists
- `AccountRepository` — operations on accounts

**Service pattern** — for interfaces that abstract a capability rather than a collection. The consuming code thinks of the data as something it invokes operations on, but the operations don't map cleanly to CRUD on identifiable entities. Examples include caches (key-value memoisation, not entity collections), email sending (a capability, not a thing), and orchestration utilities.

Service names end with `Service`. Examples:

- `CacheService` — cache reads/writes by key
- `EmailService` — sending email
- `RateLimiterService` — rate-limit decisions

**A practical test for which pattern applies.** Try writing the interface signature in your head. If the operations naturally include `findById`, `getAll`, `save`, `delete` operating on entities with identity — it's a Repository. If the operations are whatever-makes-sense for the capability without that CRUD shape — it's a Service.

Where an interface seems to fit neither cleanly, the test usually reveals which way to lean. Force-fitting a poorly-matched name confuses readers; if neither pattern fits well, write down what the interface actually does and the right name usually emerges.

### 5.5 Table-naming policy

Logical entities (commonly called "tables", though the policy applies regardless of physical storage backend) follow a canonical naming rule.

**The rule:** `{scope}.{entity}-{stage}`

- `scope` is one of:
  - `platform` — for tables used by multiple apps or by platform infrastructure
  - An app slug (`stock-analyser`, `budget-tracker`, `launchpad`, etc.) — for tables owned by a single app
- `.` separates scope from entity
- `entity` describes what the table holds (`accounts`, `transactions`, `analysis-cache`, etc.)
- `-` separates entity from stage
- `stage` is the deployment environment (`dev`, `prod`, etc.)

All components are lowercase. Multi-word components within `scope` and `entity` use hyphens (`stock-analyser`, `analysis-cache`).

**Scope is categorical, not stylistic.** A table prefixed `platform.` is platform-scoped — used by multiple apps or by platform infrastructure. A table prefixed `stock-analyser.` is app-scoped — owned by stock-analyser, accessed by stock-analyser Lambdas only. The categorisation matters because IAM grants follow scope: platform-scoped tables grant access to platform-eligible Lambdas; app-scoped tables grant access only to that app's Lambdas.

The policy applies to all logical tables regardless of physical storage backend. DynamoDB, Redis, or other future storage choices follow the same naming convention.

The policy does not apply to other AWS resources (S3 buckets, SQS queues, Lambda function names) — those follow their own conventions or CDK defaults.

**No reserved prefixes** beyond the ones already in use. Future expansion can add reserved prefixes if needed; over-specifying now is premature.

**Examples:**

```
platform.accounts-{stage}              # platform-scoped, used by all apps
platform.account-members-{stage}       # platform-scoped
stock-analyser.portfolio-{stage}       # app-scoped to stock-analyser
stock-analyser.watchlist-{stage}       # app-scoped to stock-analyser
budget-tracker.transactions-{stage}    # app-scoped to budget-tracker
budget-tracker.rules-{stage}           # app-scoped to budget-tracker
```

Existing tables that don't conform are migrated to canonical form. No grandfathering — the rule is universal.

### 5.6 Auth model

Auth follows the same layered architecture as data access. The platform's auth concerns — JWT claim consumption, authorization decisions, cross-Lambda trust — apply the patterns documented in 5.1 through 5.4 to a different domain.

**Helper interface in `packages/lambda-middleware/`.** All Lambda handlers use the canonical helper interface for auth concerns. The interface has two layers:

- **Middleware wrappers** (`middleware.ts`) — `withAuth(handler)` provides JWT plus account context; `withAuthOnly(handler)` provides JWT without account context (for routes that operate on the user themselves rather than account-scoped data). Both internally call `extractAuthClaims` to read raw claims; consumers do not import `extractAuthClaims` directly.
- **Claim-based helpers** (`auth.ts`) — `requireAppAccess`, `requireAnyAppAccess`, `requireSiteAdmin`. These operate on the typed `auth` object provided by the wrappers and throw 403 on authorization failure.
- **Policy layer** (`policy.ts`, M16 D9) — `requireAccountData(appSlug)` for app-data routes (`.read` = claims-only, viewer passes; `.write` = claims + live members row, viewer denied) and `requireAccountAdmin(...)` for supervisory/ownership routes. There is no site-admin data bypass. The former `requireAccountAccess` / `requireAccountOwner` helpers were deleted in M16 Phase 5.

The full interface and per-helper semantics are documented in `auth.md`.

**JWT-claim consumption is layered.** Raw claim reads occur only in the middleware layer (`packages/lambda-middleware/`). Business-logic Lambdas access claims via the typed `auth` object provided by `withAuth` / `withAuthOnly`, using documented helpers when authorization decisions are needed. New Lambdas never read claims directly — that is the middleware layer's responsibility.

This is a layering rule of the same shape as 5.1's data-access architecture. The middleware layer encapsulates raw-claim concerns; business logic operates on typed values. Direct claim access in business-logic code is non-conforming and migrates to helper-mediated access.

**Cross-Lambda trust uses Pattern B with strict constraints.** When one platform Lambda invokes another (currently only `budget-ai → claude-proxy`), the receiving Lambda does not validate JWT signatures itself. Trust comes from IAM scope strictly limiting which callers can invoke. The caller propagates JWT claims via a synthetic event; the receiver reads them as if validated.

This is consistent with the platform's general edge-validation posture (API Gateway validates at the edge; claim-reading helpers trust prior validation). Pattern A — per-hop JWT re-validation — would create an asymmetric posture inside the platform and adds operational complexity without proportionate benefit at the platform's current threat model (single trust domain, all Lambdas under common operational control).

The pattern is permitted only with the following constraints, all binding:

- IAM scope is load-bearing. Receiving Lambdas have IAM policies that strictly limit invokers. Reviewers of these policies must understand that policy broadness has security consequences beyond least-privilege.
- CI verification of IAM scope is mandatory. A check confirms that receiving Lambdas using Pattern B have invoke-permission policies locked to expected callers. If a policy drifts to allow unexpected callers, CI fails. Without this verification, Pattern B is not acceptable.
- Platform-Lambda-to-platform-Lambda only. External services or third-party callers must use Pattern A or go through API Gateway.

If the platform's threat model changes (third-party Lambda code, multi-tenant Lambda deployment), Pattern B would be reconsidered.

**Client-side auth follows the same layered architecture as data access.** A domain interface (`AuthService`) lives in contracts. Implementations are named for what they wrap: `CognitoAuthService` (production) and `MockAuthService` (v0). Selection is build-time per 5.3. Components, services, and hooks access claim-derived data only via the `AuthService` interface — never by reading JWT claims directly. Frontend treatment of auth is symmetric to Lambda treatment: typed access via interface; raw access only in the implementation layer.

### 5.7 Contracts

A **contract** documents the binding interface between a provider and one or
more consumers. Contracts cover any provider/consumer boundary worth
documenting: HTTP APIs, Lambda-to-Lambda calls, Lambda-to-AWS service usage,
TypeScript domain interfaces, data model schemas, runtime configuration shapes,
structured-output schemas, and internal helper APIs. Contracts are inherently
normative; changes are spec changes that all parties must accommodate.

**Contracts are normative by definition.** Anything in `packages/contracts/` is
a binding interface specification. Observation, history, project state, and
other non-binding content do not belong in active contract files; they live in
operations docs, architecture inventory, git history, or `spec/_archive/`.

#### Canonical location

Contracts live canonically in this repository under `packages/contracts/`.
The package is dependency-light and must not import AWS SDKs, app code,
platform code, infrastructure code, or browser-only runtime implementations.

- `packages/contracts/src/` contains executable TypeScript shapes, constants,
  schemas, examples, and typed mocks.
- `packages/contracts/spec/` contains behavioural and narrative contract notes.
- `packages/contracts/spec/_archive/` preserves historical inputs only.

`v0-reference/` is a frozen historical archive marker. It is not a generated
build input, not a source of truth, and not a runtime import target.

#### Single source of truth

Each contract has exactly one canonical location in `packages/contracts/`.
Runtime code imports contract types and constants from `@transformotion/contracts`
or its exported subpaths. Independent type declarations in runtime code that
mirror contract types are non-conforming, even when convenient.

#### Authoring discipline

Contract-changing work goes through this workflow:

1. Edit `packages/contracts/` first or in the same PR as the runtime change.
2. Update contract examples, typed mocks, behavioural specs, and version metadata
   when the change affects shape, semantics, or UI-visible assumptions.
3. Run `pnpm check:contracts`.
4. Implement consumers against `@transformotion/contracts`.
5. Record the contract files changed and validation in the PR body.

Preserve the single-writer rule: keep one active contract PR chain at a time so
shape changes do not race each other.

#### Scope-first executable structure

Contracts are organised as executable TypeScript-first bundles:

```
packages/contracts/
  src/
    _shared/
      api.ts
      auth.ts
      runtime-config.ts
      ai-runtime.ts
      contract-version.ts
    launchpad/
      types.ts
      api.ts
      mocks.ts
      invitations.ts
      redemption.ts
    stock-analyser/
      types.ts
      api.ts
      market-analysis.ts
      recommendations.ts
      etfs.ts
      metals.ts
      structured-output.ts
      cache-freshness.ts
      notification-preferences.ts
      notification-run-history.ts
      mocks.ts
    budget-tracker/
      types.ts
      api.ts
      mocks.ts
      wss.ts
  spec/
    <scope>/
      behaviour.md
      navigation.md
      backend/*.md
```

Shared shapes live in `_shared/` and must not be duplicated into app scopes.
App-specific shapes live under that app's scope. Markdown specs describe
behaviour, validation, IAM, DynamoDB, Lambda, WSS, AI runtime, and external
dependency expectations where TypeScript alone is insufficient.

#### Minimum contract content

Contract files should include enough detail for the consumer to implement or
mock the boundary without inventing shapes:

- operation or helper name
- request and response types
- status/error vocabulary when externally visible
- auth or authorization expectations when relevant
- cache/job/WSS shapes when relevant
- example values or typed mocks for UI/dev consumers
- behavioural notes for invariants that TypeScript cannot express
### 5.8 Runtime configuration: profile + override pattern

The platform selects between provider implementations across multiple architectural concerns (auth, data, AI, cache, email sender, file storage) using a single foundational pattern: a profile env var sets the high-level mode, and optional per-concern override env vars allow targeted swaps.

**Profile.** `NEXT_PUBLIC_RUNTIME_PROFILE` accepts `mock` or `live`. Defaults to `mock` if unset. Local development reads `mock` (preserving v0 workflow); deploy workflows explicitly set `live` for deployed environments.

**Per-concern overrides.** Each concern has an optional `NEXT_PUBLIC_<CONCERN>_OVERRIDE` env var. When set with a valid value, the override wins; otherwise the concern's profile default applies.

**Resolution order.**

1. If the override env var is set and has a valid value: use it.
2. Otherwise, use the profile's default for this concern.
3. If the profile is unset or invalid: default to `mock`.

**Concerns.**

| Concern | mock profile | live profile |
|---|---|---|
| Auth | `mock` | `cognito` |
| Data | `local` | `dynamo` |
| AI | `mock` | `claude` |
| Cache | `memory` | (TBD) |
| Email sender | `mock` | `ses` |
| File storage | `local` | `s3` |

The pattern accommodates future concerns by adding a row; the resolution logic stays unchanged.

**Implementation.** The `@transformotion/runtime-config` package provides the canonical resolution helper:

```typescript
import { selectProvider } from '@transformotion/runtime-config';

const authProvider = selectProvider({
  override: process.env.NEXT_PUBLIC_AUTH_OVERRIDE,
  profileDefaults: { mock: 'mock', live: 'cognito' },
  validValues: ['mock', 'cognito'],
});
```

**Call site discipline.** Each app's `lib/config/index.ts` is the canonical resolution point — it calls `selectProvider` once at app startup, stores the resolved values in the config object (e.g., `config.auth.provider`), and downstream factories receive the resolved value as a parameter rather than reading env vars directly. This keeps runtime decisions centralised, testable, and visible.

**Relationship to Section 5.3.** Section 5.3 (Implementation selection) covers the architectural pattern of having multiple implementations behind a domain interface. Section 5.8 covers the specific env var semantics and resolution mechanism. The two work together: 5.3 establishes the pattern; 5.8 defines how the choice is made.

---

## 6. Utility categories and conventions

Some code in this repository is not part of the running platform's architecture. It is tooling — utilities that solve specific operational concerns. These utilities live as their own peer categories at the repository root, alongside `apps/`, `packages/`, and `platform/`.

This section documents the principle and the specific utility categories currently established.

### 6.1 What is a utility category

A utility category is a top-level repo directory housing a coherent class of operational tools. Three properties define a utility category:

1. **Distinct from the running platform's code.** Utilities are not part of the architecture documented in Section 5. They are tools that operate alongside the platform, not within it.
2. **Has its own infrastructure if needed.** Utilities that require AWS resources (Lambdas, API routes, etc.) bring their own CDK stacks, kept separate from `platform/infrastructure/`. The infrastructure separation matches the conceptual separation: utility infrastructure isn't platform infrastructure.
3. **Permanent in the repository.** The category itself persists; individual utilities within the category may be one-shot (run once and become reference / replay material), but the category remains as a documented home for similar future tooling.

When a piece of code fits all three criteria, it belongs in a utility category, not in `apps/` or `platform/`.

### 6.2 Data migration utilities

`migration-utilities/` is the established category for data migration tooling.

**Purpose.** A data migration utility moves data from one storage location into another (typically as a one-shot migration during platform activation or schema change). Each migration utility is:

- Specific to one app's namespace (`budget-tracker/`, `stock-analyser/`, etc.)
- Specific to one data type within that app (`transactions/`, `watchlists/`, etc.)
- One Lambda per migration; each instance runs once per user
- Named for what it does, not for the technology underneath

The category as a whole is permanent. Individual utilities are not — each runs once for each user, then sits in the repository as documentation, replay capability, or reference for future similar migrations.

**Repo structure.**

```
migration-utilities/
  infrastructure/                          # CDK stacks for the utilities namespace
  budget-tracker/                          # target app namespace
    transactions/                          # data type within app
      src/                                 # Lambda code
      package.json
  stock-analyser/                          # future migrations group here
    watchlist/
      src/
      package.json
```

The hierarchy reflects the URL path structure (Section 6.3): top-level by app namespace, then by data type, with the Lambda code beneath.

**Data artefacts** for migrations live separately at `migration-artifacts/<app>/`. Migration utilities (the code) and migration artifacts (the data being migrated) are different categories with different concerns; they live in different locations.

### 6.3 URL namespace for utilities

Utilities exposed as HTTP endpoints follow a dedicated URL namespace:

```
/api/migrations/<app>/<data-type>/<operation>
```

For example:

```
POST /api/migrations/budget-tracker/transactions/import
POST /api/migrations/stock-analyser/watchlist/import
```

The `/api/migrations/` namespace is distinct from app-level API namespaces (`/api/budget/...`, `/api/stocks/...`). The distinction matters: a utility endpoint is not part of the app's API surface; it's a separate operational tool that happens to share the same API Gateway infrastructure.

**No version segment** in utility paths. Utilities are one-shot per instance; if a utility's data structure changes, the Lambda is updated directly rather than a new version being introduced. There will never be a `/v1/` and `/v2/` of the same utility active simultaneously, so versioning adds noise without value.

This is a deliberate departure from app-level API versioning (where `/v1/` is canonical). The reasoning: app APIs may need to support multiple consumer versions during migrations; utility endpoints don't have that constraint.

### 6.4 Utility infrastructure

Utility categories that need AWS infrastructure carry their own CDK stacks at `<category>/infrastructure/`. For example, `migration-utilities/infrastructure/` holds the CDK stacks for the `/api/migrations/...` namespace.

Utility infrastructure is a peer to `platform/infrastructure/`, not a child of it. The two are conceptually distinct:

- `platform/infrastructure/` holds infrastructure for the running platform — API stacks, table stacks, auth stacks
- `<category>/infrastructure/` holds infrastructure for utilities — separate stacks, owned by the utility category

The same separation principle that keeps the running platform's code out of utility directories also keeps the running platform's infrastructure out of utility infrastructure directories.

**AWS function naming.** Lambdas within a utility category follow a naming convention that matches the URL path:

```
migration-<app>-<data-type>-<stage>
```

For example:

- `migration-budget-tracker-transactions-dev`
- `migration-stock-analyser-watchlist-dev`

The function name and URL path mirror each other. This makes operational debugging easier: matching a CloudWatch log stream to a URL route is direct.

---

## 7. Operating principles

These are standing rules about how to *work safely* on this codebase. They
emerged from prior failure modes and are codified to prevent recurrence.

### 7.1 Verify current state before acting on architectural prompts

Before acting on any prompt that touches multi-component architecture, the
first step is "confirm what's actually deployed against what the prompt
assumes." Treating documented decisions as past tense ("sub-phase 7f
marked optional, presumably resolved") is the recurring failure mode. The
sub-phase may have been deferred. The rename may not have landed. The
helper may not exist yet.

This rule applies to humans and Claude Code alike. Before scoping work
that depends on a prior decision, verify the decision is in the deployed
code or document, not just in the conversation history.

The verification mechanism is one of:

- A `grep` or `view` against the codebase confirming the expected state.
- A read of the relevant architecture document confirming the documented
  state matches.
- A Claude Code report confirming the runtime state matches.

If verification surfaces a discrepancy, that is itself a finding to
record (open an issue, update PLAN.md or the relevant document) before
proceeding with the original work.

**Specific application: writing or rewriting normative documents.**
When drafting or rewriting any normative document (architecture docs,
`MONOREPO.md`, `README.md`, contracts policy), a ground-truth check
of the relevant code, directories, and existing documents is a
prerequisite, not a nice-to-have. Drafting against
remembered-or-imagined state produces documents that contradict
reality and need re-writing once the discrepancies surface. The
pattern is: list the directories or files the document will describe,
read them, then write. This applies whether the document is being
created or rewritten, and whether the writer is human or Claude.

### 7.2 Audit cheerful PR-description framings before reading the rest

PR descriptions that say "drift removed", "simplified to X-only", "cleaned
up unused code" are exactly the kind of cheerful framings that make
destructive changes sound benign. When you see them, audit the changes
they describe before reading the rest of the description.

The pattern is: a PR's stated scope is auth-related, but the diff also
contains "drift cleanup" that touches unrelated repositories. The
cleanup might be correct, but it is out of scope, and "scope creep is
fine when it happens to be correct" is not a rule we operate by — "scope
creep gets caught regardless" is.

The audit mechanism is to read the diff, not the description, and verify
that every changed file is in scope. Files outside the stated scope get
flagged for either (a) reverting in this PR and re-doing in a properly-
scoped PR, or (b) explicit acknowledgement and rationale in the PR
description.

### 7.3 Architecture decisions are evaluated against the goals

When two contributors disagree about an architectural choice, the
resolution is to identify which of the four goals (Section 1.1) each
option serves, which it costs, and whether the v0 constraint (Section
1.2) is preserved.

A change that does not serve any goal needs justification — not a
prohibition, but a forced rationale. A change that improves one goal at
the cost of another must make the trade-off visible in the PR or issue.

The goals are not aesthetic preferences; they are the criteria by which
the platform's success is measured. Decisions made without reference to
them tend to drift toward whoever spoke last.

### 7.4 Source-reference packages must use bare specifiers, not `.js` extensions

Packages in `/packages/` that are consumed directly from source (via
`"main": "./src/index.ts"` in `package.json`, no compiled `dist/`) must
use bare specifiers for internal imports:

```typescript
// Correct — source-reference package
import type { Transaction } from "./contracts";

// Wrong — correct only for published ESM packages with compiled dist/
import type { Transaction } from "./contracts.js";
```

The `.js` extension is the ESM convention for *published packages* where
the emitted `.js` files exist in `dist/`. In source-reference packages
there are no `.js` files; `tsc --noEmit` resolves `.js` → `.ts` via
`moduleResolution: "bundler"` and passes, but Turbopack does not apply
that mapping and fails with a module-not-found error at build time.

This failure mode is silent at typecheck (passes) and loud only at
`next build`. The root cause PR is #228. The fix is in PR (M6 cleanup).

The rule: if a package has `"main": "./src/index.ts"` and no build step,
every internal import in that package uses a bare specifier.

### 7.5 `ignoreBuildErrors: true` must never be re-added without a tracking issue

`typescript.ignoreBuildErrors: true` in `next.config.mjs` suppresses all
TypeScript errors from `next build`. It is an escape hatch for situations
where a build must ship despite known errors — not a setting to leave in
place. The specific risk: it hides regressions introduced by subsequent
changes.

If you are tempted to add it, the required steps are:

1. Identify the specific TS errors it would suppress.
2. Open a GitHub Issue documenting each error, its root cause, and the
   remediation plan.
3. Add the setting with a comment that references the issue: e.g.,
   `// ignoreBuildErrors: true — tracked in #NNN`.
4. Set a gate in PLAN.md: the setting must be removed before the relevant
   milestone closes.

`ignoreBuildErrors: false` (the default) is the required state for apps
that have passed their initial stabilisation. Removing the setting and
finding it was hiding nothing (as in the M6 cleanup for budget-tracker)
is the expected outcome when stabilisation is done correctly.

### 7.6 Lambda-to-Lambda interface contracts must be verified against the target handler's actual API

When one Lambda invokes another (e.g., `budget-ai` → `claude-proxy`),
the request body field names and response shape must match the *target
Lambda's handler code*, not the documentation or prior mental model.

The failure mode: the calling Lambda uses field names that the target
does not recognise, the target silently ignores them, returns an error,
and the caller's middleware wraps it as a 500. All three bugs in the
AI Review Lambda (PR #229) followed this pattern:

- `max_tokens` sent, `maxTokens` expected → request rejected silently
- `messages: [...]` sent, `prompt: string` expected → request rejected silently
- Response parsed as content-blocks array, actual response was a string → TypeError at runtime

The rule: whenever a Lambda calls another Lambda directly (not via HTTP),
read the target Lambda's handler source before writing the invocation
code. The interface contract lives in the target's code, not in any
external document.

### 7.7 DynamoDB settings table keys must be cleaned up when removed from the whitelist

The `budget-tracker.settings` table is a key-value store where each
`settingKey` corresponds to a field in `BudgetSettings`. When a field is
removed from `BudgetSettings` (and therefore from the Lambda's
`SETTING_KEYS` whitelist), the corresponding DynamoDB rows do not delete
themselves — they remain in the table, invisible to the application but
present in every full scan.

When removing a field from `BudgetSettings`, the required steps are:

1. Remove from `SETTING_KEYS` and `DEFAULT_SETTINGS` in the settings
   Lambda.
2. Update the canonical contract in `packages/contracts/`, run
   `pnpm check:contracts`, then remove any runtime mirrors such as the
   `BudgetSettings` type in `packages/budget-domain/src/contracts.ts`.
3. Create a one-shot migration script in
   `scripts/migrations/budget-tracker/` to delete the orphaned rows.
   Use `DRY_RUN=true` by default.
4. Run the script and verify the final row count equals the number of
   live setting keys.

The M6 cleanup (PR this text landed in) removed 10 orphaned keys left
over from the budget-data restructure (PR #225). The migration script is
`scripts/migrations/budget-tracker/delete-inert-settings.ts`.

### 7.8 Scope discipline under context pressure

When working on a long task that spans multiple stages, the original scope-limiting instructions can drift out of active working memory. This is especially true if context is compressed mid-session or if intermediate findings suggest an obvious next step. The discipline is to treat the original scope as binding throughout the entire task, not just until something interesting comes up.

If a prompt says "diagnose only," that instruction applies until the user explicitly authorises a wider scope. Producing a diagnosis and then proceeding to implementation is a violation, even if the implementation is correct and would have been authorised had it been asked. The user authorises scope changes; the AI does not infer them.

When in doubt: surface findings, ask, wait. Asking adds at most a few seconds; assuming costs trust and produces work that has to be reviewed retroactively for whether it should have happened at all.

This pattern was surfaced in M6 when CC, after thorough diagnosis of a rules PATCH bug, proceeded directly to implementation, commit, push, and PR — all without the user's authorization, despite an explicit "diagnose only" instruction. The fix itself was correct; the boundary violation that produced it was not.

### 7.9 Architecturally clean wins ties

When two implementation paths both satisfy the functional requirements
and serve the same goals (Section 1.1, Section 7.3), prefer the one
that is architecturally cleaner. "Architecturally cleaner" means fewer
cross-cutting dependencies, fewer coupling points, and fewer sources of
cascading change.

The rule is a *tiebreaker*, not a trump card. It does not justify
choosing a more complex path that incidentally avoids one dependency
while introducing two others. It applies when the options are roughly
equivalent on every other dimension and one of them is structurally
tidier.

This applies to humans and Claude Code alike.

**Specific application:** When choosing between an approach that
propagates a shared concern (e.g., a config object, a construct
reference) through every consumer versus one that emits the concern
once and lets consumers read it directly (e.g., via CloudFormation
exports, env vars, or a canonical config file), choose the emission
pattern — it is structurally cleaner because each consumer is
independently deployable and independently testable.

This rule was established in M7 / issue #346 when choosing between
Path V (propagate the `api`/`authoriser`/`apiResource` constructs from
PlatformApiStack into SA/BT/MU stacks via props, keeping all stacks
coupled to the platform synth) and Path M (emit CF exports from
PlatformApiStack; SA/BT/MU stacks import at deploy time via
`Fn.importValue`, enabling per-app CDK entry points and independent
deployment). Both paths were functional. Path M was chosen because it
removed the coupling that forced SA/BT/MU to re-synthesise with the
platform on every platform stack change.

---

## 8. Working Agreement — scope provenance and decision discipline

This section codifies process lessons from the M11/M16 account-lifecycle
milestone. It is normative and applies to all phase work.

Every feature, endpoint, or UI surface built in a phase MUST carry a
**provenance tag**, recorded in the phase brief and the PR body, *before*
implementation:

- **prototyped** — it exists in the v0 prototype (cite the screen or behaviour).
- **contracted** — it is defined in the m16/m17 contracts (cite the type, route,
  or `behaviour.md` clause).
- **net-new** — neither.

**Rules.**

1. **No net-new work inside a phase.** If an item is net-new, STOP and raise it as
   a backlog issue — do not build it as part of phase work. Net-new may enter the
   build path only via the normal route: prototype in v0 → promote to contract →
   implement. The owner may explicitly fast-track, but only as a recorded,
   deliberate exception.
2. **Sub-questions never legitimise an unscoped parent.** Before resolving a detail
   question about a feature (e.g. "should `deleteAccount` block or cascade?"),
   confirm the feature itself is prototyped or contracted. If the parent has no
   provenance, the parent is the issue — raise it; do not answer the sub-question.
3. **Per-phase gap analysis precedes wiring.** Before a phase's implementation
   begins, enumerate the phase's needs against the prototype/contract coverage as a
   single gap list. Anything the phase needs that is not covered is resolved (or
   explicitly deferred) UP FRONT, not discovered during wire-up. The gap list is the
   phase's scope boundary: items not in it are out of scope by construction.
4. **Scope-expanding suggestions must be tagged in the same breath.** Any
   recommendation that adds scope ("complete the surface", "while we're here", "for
   consistency", "for parity") MUST state the candidate's provenance tag and flag
   net-new *before* the recommendation. An untagged additive recommendation is a
   process violation.
5. **Verify the artifact, not the report.** Decisions are made against the actual
   code/contract/prototype state, not against a summary of it. When a report and an
   artifact could disagree, check the artifact.

**Enforcement.** Phase briefs carry provenance tags per item; PRs restate them;
reviewers reject untagged or net-new-tagged phase work. These rules are mirrored in
the project custom instructions that govern the chat-side design partner, since the
same drift originates there.

### 8.A — v0 is the design of record (reproduction, not re-decision)

The rules above govern whether work is in scope. This subsection governs how a
prototyped surface is built: the v0 prototype is the settled design, and wire-up
reproduces it rather than re-deciding it.

**v0 is the authoritative source of truth for the UI** — layout, markup,
structure, class names, controls, and copy. This is the same reason the
contracts are owned by v0: design and shape originate in v0, and runtime
consumes them. Runtime's job is to **wire the backend to the v0 surface and its
contracts — not to design, restyle, re-arrange, or re-word UI**. Every UI change
(layout, control, copy, styling) originates in v0 and reaches runtime via the
v0 change → contract/sync path, **never the reverse**. A UI difference between
runtime and v0 is a runtime defect to reconcile toward v0, not a v0 gap to
backfill from runtime — unless the owner has explicitly declared runtime ahead
for that surface.

1. Settled v0 decisions are read from v0, not re-raised. Where the prototype
   shows how a surface looks or behaves, that is binding. At wire-up a question
   the prototype already answers is answered by consulting the prototype — it
   does not return to the owner. Re-opening a v0-settled decision during wiring
   is the failure this rule exists to prevent.

2. Two authorities. v0 is canonical for user-facing
   experience and behaviour. The ADR and contracts are canonical for
   authorization rules and data/API shapes. Pure authorization logic
   (role-removal scope, last-owner guard, block-if-members) is decided in the
   ADR/contract and is NOT re-prototyped in v0 mocks. Any user-facing surface or
   interaction MUST exist in v0 before runtime builds it.

3. The two gates are independent. The four-way classification in AGENTS.md
   (contract-changing / non-contract polish / runtime-only / emergency) tests
   contract-SHAPE drift. The provenance gate (§8 rule 1) tests whether the
   behaviour/UX exists in v0 or contract at all. Passing the first does not
   discharge the second. "Runtime-only / no v0 impact" justifies only changes to
   HOW an already-agreed contract or prototype is implemented — never the
   introduction of behaviour or UX absent from both. (Phase 6 delete-account
   changed no shape yet introduced a whole feature; parked as #447 by this gate,
   not the shape gate.)

4. Presentation is ported verbatim; only persistence is rebuilt. The earlier
   framing of "rebuild the surface" applies to the **data/persistence layer
   only** (v0's mock store → live services), and that framing was being
   over-read as licence to re-create the markup. It is not. **Presentation —
   JSX structure, element arrangement, class names, controls, and copy — is
   PORTED VERBATIM, not re-derived.** The mechanical procedure: start from the
   v0 component as the literal baseline and change ONLY (a) import paths (v0
   module paths → runtime package paths) and (b) the data/persistence source
   (mock → live service/contract). Everything else is copied byte-for-byte.
   Re-styling, re-arranging, re-wording, or re-implementing the markup is itself
   a deviation. Every deviation — added, removed, or changed control, layout, or
   copy — MUST appear in the PR body as a provenance-tagged disposition list
   (keep / cut / disable + reason); **net-new or layout/copy deviations stop and
   are raised in v0 first, not built runtime-side.** Reference example: PR #446
   (member-management), whose "Control disposition (every v0 control)" table is
   the canonical form — including a net-new affordance flagged as "KEEP (added)".

5. Disposition list plus visual diff. The disposition list captures INTENDED
   deviation; it does not catch SILENT drift — wrong data rendered, a projection
   left unwired, styling not carried (e.g. a greeting showing a username where v0
   shows displayName). A UI-bearing rebuild PR for a prototyped surface therefore
   also carries a visual diff against the v0 surface. Disposition list = intent;
   visual diff = result; both required.

6. Real-world seams. Where a v0 surface mocks a real-world mechanism it cannot
   embody — email delivery, an inbox, SMS, an external IdP screen, a payment
   page — v0 is canonical for the experience UP TO the seam, and the real
   mechanism replaces the mock AT the seam. The mocked stand-in is explicitly NOT
   a surface to reproduce. The experience v0 proves around the seam still binds:
   what the user can do, the post-seam surface (e.g. the redemption screen after
   the email click), and the proven states (valid / expired / wrong-identity /
   already-redeemed). Which mocked surfaces are real-world seams MUST be named in
   the phase gap analysis ("redemption email = real-world seam; v0 canonical to
   the click, real email beyond"), not asserted during wire-up by whoever is
   building.

The gap analysis (§8 rule 3) remains the front gate; it now also enumerates
real-world seams and expected rebuild deviations, up front.

---

## 9. The status-tag system

Documents that have a "status" column for findings (the architectural
inventory; verification reports; audit-style outputs) use a six-tag
system. The tags are deliberately distinct because each implies a
different resolution path.

| Tag | Meaning |
|---|---|
| **Confirmed** | Verified against current code or runtime evidence in this work or attached verification reports. |
| **Inferred** | Derived from code patterns, prior conversation history, or surrounding evidence — but not directly verified. |
| **Status uncertain — verify** | Known to have been planned, may or may not have landed; not safe to treat as either pending or done without checking. |
| **Stale-by-decision** | The divergence is the result of a deliberate choice to retire or replace something; cleanup is sequenced. |
| **Aspirational-never-built** | Documented as intent, no implementation has caught up. |
| **Deferred** | Scaffolded with intent to complete, paused for reasons orthogonal to whether it should exist. |
| **Resolved by M*N* / PR #*N*** | Finding has been addressed; the finding's text is updated to describe the new state, with a note of what changed and the reference to the milestone or PR that resolved it. Used in living documents like the architectural inventory. |
| **Superseded by [reference]** | Finding has been subsumed by another finding, usually after deeper investigation. Description preserved for context; reference points to the superseding finding. Used in living documents. |

The tags exist to make divergence between code and documents visible
rather than invisible. A finding without a status tag implicitly claims
"Confirmed", which is often false. Living documents (such as the
architectural inventory) use the full set including **Resolved by** and
**Superseded by**; one-off audit outputs typically use only the first
six.

---

## 10. Archived documents

Documents that have been superseded live in `/docs/archive/`. Each
archived document carries a header at the top:

```
> **Archived YYYY-MM-DD**
>
> This document was superseded by [/path/to/new-document.md] on
> [date]. It is preserved for historical reference and to keep
> conversational and git-history references valid. It does not
> describe current state and must not be cited as authoritative.
```

Currently archived:

- `docs/archive/DEVELOPMENT_PLAN.md` — superseded by `/PLAN.md`. The
  earlier-plan record. Section 9 (auth model) is wholly superseded by
  `docs/architecture/auth.md`.
- `docs/archive/STABILISATION_FREEZE.md` — superseded jointly by
  `/PLAN.md` (the phase-plan portions) and this document (the discipline
  rules and decision log).

Other documents that may be candidates for archival are listed in
PLAN.md's documentation reconciliation milestone (Stage 0c).

---

## 11. Changing this document

This document is itself operational — changes to ways of working are made
by changing this document, in PRs.

Changes to Section 1 (goals and v0 constraint) are major operating
principle changes and are escalated rather than made unilaterally.

Changes to Section 2 (document map) accompany document creation or
archival.

Changes to Section 3 (repository structure) are coordinated with the
relevant code reorganisation and ratified through the architecture
decision process.

Changes to Section 4 (workflow), Section 7 (operating principles), and
Section 8 (Working Agreement — scope provenance and decision discipline)
are made when ways of working change. The change itself is a PR and goes
through normal review.

Changes to Section 5 (architectural patterns) and Section 6 (utility
categories and conventions) are made when canonical architectural
decisions change. Such changes are typically ratified through dedicated
decision work (e.g., milestone-scoped decision documents) before
landing in this document.

Changes to Section 9 (status-tag system) and Section 10 (archived
documents) are mechanical.
