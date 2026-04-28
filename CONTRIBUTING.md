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

## 1. Platform goals and the v0 constraint

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
  multi-dimensional permission model (app access via Cognito groups;
  account membership and role via DynamoDB) is the canonical way users
  reach app data. Invitation flows, account switching, and role
  enforcement are first-class platform capabilities, not app-specific
  features.

### 1.2 The v0 development workflow constraint

The frontend is developed using v0 (vercel.com/v0). v0 generates UI
components against documented data shapes with mocked persistence
(localStorage). The same components run against real
DynamoDB-via-Lambda persistence in production. This is not a goal — it is a
cross-cutting constraint on every architectural decision involving the
frontend, persistence layer, contracts, or build pipeline.

The constraint imposes specific requirements:

- The persistence pattern must have a swap point at the data-access layer.
  Components call `transactionRepository.findAll()` (or equivalent) without
  knowing whether the implementation reads localStorage or hits an HTTP
  endpoint.

- Contracts are the v0 interface. The contracts directory is what v0 reads
  to know what data shapes to build against. Contracts must be importable
  without dragging in AWS SDK or other production-only dependencies.

- The build pipeline must support both modes. Production builds tree-shake
  or code-split the localStorage implementations out; development builds
  retain them.

- The sync flow between v0 and the main repo (v0 commits to a separate
  repo; `scripts/sync-v0.sh` pulls into a gitignored `v0-reference/`
  directory; Claude Code adapts components into the main repo) is part of
  the workflow, not workflow noise. Architectural decisions that break
  the sync flow break the development model.

For the full architectural treatment of the v0 workflow as a system, see
the architectural inventory's Section 1.9.

### 1.3 How the goals and constraint apply

Architectural decisions are evaluated against the four goals and the v0
constraint. Documents that record decisions (the architecture documents at
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
| Per-app contracts | `/contracts/<scope>/*.md` where `<scope>` is `platform` or an app slug | Normative | The actual contracts: data models, API endpoints, state management. Per-app mirrors at `apps/<app>/contracts/` are not allowed. | Per-app team |
| Per-app guide | `/apps/<app>/CLAUDE.md` | Operational | Per-app guidance for Claude Code agents. Required for every app. Minimum content: app's purpose, key entry points, app-specific conventions, app-specific gotchas, sync flow if v0-driven. | Per-app team |
| Architectural inventory | `/docs/architectural-inventory.md` | Normative (point-in-time snapshot) | Stage 0a output — read-only inventory of the platform's current state at the time of writing. Treated as a baseline for Stage 0b decisions. Does not get updated as state changes; superseded by future inventories. | Steve |

Documents that have been superseded live in `/docs/archive/` with a header
noting the supersession date and the document that replaced them.

### 2.4 Document relationships

`PLAN.md` references the goals from this document by number. The full goal
statements live here in Section 1; PLAN.md states which goals each
milestone serves.

Architecture documents at `docs/architecture/*.md` reference the goals by
number. Each document states which goals it serves at the top.

Per-app `CLAUDE.md` files reference the architecture documents and this
document for global conventions. They cover only app-specific concerns.

The contracts policy document (location ratified in Stage 0b) governs the
per-app contract files at `contracts/<scope>/`. Drift between contracts
policy and per-app contract content is a documentation reconciliation
concern.

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
├── contracts/             # Per-scope normative contracts
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
├── functions/             # App-specific Lambda handlers
├── infrastructure/        # App-specific CDK stacks
├── contracts/             # Forbidden — see Section 2.3 (contracts root only)
├── public/                # Static assets
├── CLAUDE.md              # Per-app guide for Claude Code agents (required)
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

```
packages/
├── api-client/            # Typed HTTP client for the platform API gateway
├── budget-domain/         # Budget Tracker domain types and pure helpers
├── lambda-middleware/     # Shared withAuth/withAuthOnly wrappers and helpers
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

### 3.5 The `contracts/` directory

Contracts live at `contracts/<scope>/*.md` where `<scope>` is `platform` or
an app slug.

```
contracts/
├── platform/              # Platform-wide contracts (Account, User, AccountMember shapes; auth claims)
├── stock-analyser/        # Stock Analyser contracts
├── budget-tracker/        # Budget Tracker contracts
└── <future-app>/
```

Per-app mirrors of contracts at `apps/<app>/contracts/` are forbidden. A
contract has exactly one canonical location at `contracts/<scope>/`. If a
contract drifts between locations, the canonical version wins; the mirror
is removed.

The contracts policy document (location ratified in Stage 0b) governs what
goes in each contract file, the normative-vs-descriptive classification,
and the relationship between contracts and TypeScript domain packages.

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

The migration from the current `infrastructure/lib/<app>/` structure to
this split is tracked in PLAN.md.

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

Milestone completion percentage updates automatically as issues close.
A milestone is "complete" when 100% of its issues are closed.

**Milestone pairing rule:** Numbered milestones in `PLAN.md` and
GitHub Milestones are paired. Creating or removing a numbered
milestone in `PLAN.md` requires creating or closing the corresponding
GitHub milestone in the same PR. The discipline rule (Section 2.1)
applies — `PLAN.md` is a normative document and the GitHub state it
references is part of what the document describes.

### 4.5 When new problems are discovered mid-work

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

### 4.6 Commit messages

Commit message style is freeform; the merge commit is the unit that
matters in the long-term log. Conventional Commits style (`feat:`,
`fix:`, `refactor:`, etc.) is acceptable but not required.

Commit messages reference issues where relevant ("Refs #42", "Closes
#43"). The PR body is the canonical place for issue references; commit
messages are convenience.

### 4.7 The Backlog milestone

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

---

## 5. Operating principles

These are standing rules about how to *work safely* on this codebase. They
emerged from prior failure modes and are codified to prevent recurrence.

### 5.1 Verify current state before acting on architectural prompts

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

### 5.2 Audit cheerful PR-description framings before reading the rest

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

### 5.3 Architecture decisions are evaluated against the goals

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

---

## 6. The status-tag system

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

The tags exist to make divergence between code and documents visible
rather than invisible. A finding without a status tag implicitly claims
"Confirmed", which is often false. Future audits and inventories use this
system; one-off documents may use it where helpful.

---

## 7. Archived documents

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

## 8. Changing this document

This document is itself operational — changes to ways of working are made
by changing this document, in PRs.

Changes to Section 1 (goals and v0 constraint) are major operating
principle changes and are escalated rather than made unilaterally.

Changes to Section 2 (document map) accompany document creation or
archival.

Changes to Section 3 (repository structure) are coordinated with the
relevant code reorganisation and ratified through the architecture
decision process.

Changes to Section 4 (workflow) and Section 5 (operating principles) are
made when ways of working change. The change itself is a PR and goes
through normal review.

Changes to Section 6 (status-tag system) and Section 7 (archived
documents) are mechanical.
