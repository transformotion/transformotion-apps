# Transformotion Apps - Claude Code compatibility mirror

Root `AGENTS.md` is the authoritative AI-agent operating guide for this repository. This `CLAUDE.md` file is maintained for Claude Code compatibility and must remain semantically equivalent to `AGENTS.md`.

Any instruction added, removed, or modified in `AGENTS.md` must be reflected here in the same PR. Any PR modifying this file must either update `AGENTS.md` as well or explicitly explain why no AGENTS change is required. Changes to one without the other are governance drift.

This is a pnpm workspace monorepo containing multiple apps and platform code.
Claude Code keeps this file in context for compatibility, but `AGENTS.md` is
the canonical instruction source.

## Operating documents

Four documents define how this repository works. Read them before substantive work:

- **[`AGENTS.md`](./AGENTS.md)** - canonical AI-agent operating rules,
  architecture governance, and migration safety instructions.

- **[`PLAN.md`](./PLAN.md)** — current trajectory of work. Goals, milestones (M-setup, M0–M14, Backlog), gating relationships. Tells you what's in scope right now and what's deferred.
- **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** — ways of working. Document map, repository conventions, workflow rules, the discipline rule, status-tag system, operating principles. Tells you how to do work correctly.
- **[`docs/architecture/inventory.md`](./docs/architecture/inventory.md)** — living current-state inventory of the platform. What is true about code, infrastructure, and operating state right now. Updated as state changes.

For monorepo structure (current state), import boundaries, and deploy triggers, see **[`MONOREPO.md`](./MONOREPO.md)**.

When working on a specific app, read that app's `AGENTS.md` first. Claude Code may also read the sibling `CLAUDE.md` compatibility mirror:

- `apps/stock-analyser/AGENTS.md`
- `apps/budget-tracker/AGENTS.md`
- `platform/AGENTS.md` for platform-level work

## Operating mode

Several principles affect almost every session:

**The discipline rule** (`CONTRIBUTING.md` Section 2.1): PRs that change what a normative document describes update that document in the same PR. PLAN.md, CONTRIBUTING.md, MONOREPO.md, README.md, and `inventory.md` are all normative. GitHub Milestone descriptions are also paired with PLAN.md content.

**Verification mode**: Verification work captures findings, it doesn't fix problems. If a verification surfaces a real issue requiring fix work, the issue gets a tracked GitHub Issue per `CONTRIBUTING.md` Section 4.6; the current PR's scope does not expand to fix it. Out of scope and worth being explicit about: the verification PR closes its issue with findings recorded in the inventory; the fix work happens later in whichever milestone owns it.

**Issue filing at time of discovery**: When recon and fix happen in the same session — which is common and fine — a GitHub issue is still required, created *before the fix code is written*. The issue is the audit trail. PR bodies are not searchable by topic; future contributors need to be able to search GitHub for "matcher whitespace bug" and find the diagnosis, not trawl every PR body from a six-month window. The sequence is: discover bug during recon → file issue → write fix → reference issue number in PR → issue closes on merge. Example: a recon surfaces a whitespace-normalisation gap in the rules matcher. The fix is two lines and will land in the same session. File the issue first, write the fix, reference the issue in the PR body. This adds thirty seconds and creates a permanent, searchable record. See `CONTRIBUTING.md` Section 4.6 for the full issue-filing convention.

**Deploy watch rule**: After merging a PR to `develop`, check whether any changed files match an `on.push.paths` filter in a deploy workflow (`.github/workflows/deploy-*.yml`). If yes, a deploy run has been triggered automatically — find it with `gh run list --workflow=<deploy-workflow.yml> --limit=1`, watch it with `gh run watch <run_id>`, and report final status before ending the session. The session does not end at merge; it ends after deploy confirmation. If the PR's changed files do not match any `on.push.paths` filter (e.g. the PR only changes CLAUDE.md, docs, or other excluded paths), no deploy workflow triggers and the session ends at merge confirmation.

**Issue lifecycle awareness**: Follow the issue lifecycle in `CONTRIBUTING.md` Section 4.4. Treat `Todo` as Ready, planning/recon/architecture review as In Progress, and deploy validation as part of the work. Do not report deploy-affecting work as Done until deployment and required validation have succeeded.

**Recon completeness on artifacts being modified**: When a recon precedes a modification to an AWS resource, an IAM policy, a workflow file, or any other artifact with sibling state, enumerate the full state of the artifact, not just the named attribute being changed. For an inline IAM policy named X on role Y, also list all *other* inline policies on role Y. For a workflow file's env block, also report the full workflow trigger and other env blocks on the same file. The goal is to surface sibling state the change might collide with or be misled by.

This rule emerged from M7 recons where the named attribute checked out cleanly but a sibling attribute affected the fix sequence (e.g., #264 captured TransformotionDevDeploy's policy state but not the sibling CDKAssumeBootstrapRoles policy on the same role, which had to be verified before the delete-and-recreate sequence could run).

**Normative-doc impact check before implementation**: Before any implementation prompt's recon completes, enumerate which normative documents (per `CONTRIBUTING.md` §2.3) and accompanying artifacts will need updating in the same PR if the change lands. Section 2.1's discipline rule requires these updates to be paired with the code change; this principle moves the check from review-time catch to recon-time anticipation.

Categories to consider in the impact check:
- IAM policies, infrastructure resources → `cdk.md`, `inventory.md`
- Auth flows, identity providers, claims → `auth.md`
- Lambda handlers, API endpoints → `MONOREPO.md`, `CONTRIBUTING.md` §3, `contracts/<scope>/`, `inventory.md`
- Build patterns, env vars, runtime config → `CONTRIBUTING.md` §5, `inventory.md`, deploy workflow env blocks, GH Actions variables/secrets
- Repository structure → `CONTRIBUTING.md` §3, `MONOREPO.md`
- Operating mode, agent behaviour → `AGENTS.md` and this compatibility mirror

This rule emerged from cumulative M7 evidence. PRs #259, #261 (multiple rounds), the M6 launchpad-at-root work, the budget-tracker gateway consolidation, and the platform-functions migration all shipped code without their accompanying §2.1 obligations, requiring downstream cleanup PRs (#262, #266, #267, #269, #279, #283 among others) to make up the gap.

## Boundary Discipline

When the user instructs "diagnose only," "recon only," "don't take action," "verify only," or any similar scope-limiting language, the constraint is binding. It applies for the entire session until the user explicitly authorises a different scope. It is not overridden by:

- Context summarisation (older instructions remain binding even after compression)
- Intermediate findings (no matter how clear the next step seems)
- Perceived urgency (the user can authorise faster work; you cannot self-authorise)
- Prior successful work in the same session
- The apparent correctness of the proposed change

NEVER take any of these actions without explicit user confirmation in the user's most recent message:

- git commit
- git push
- gh pr create
- gh pr merge
- Modifying production data
- Modifying production infrastructure
- Approving or accepting changes that would otherwise require sign-off

When in doubt about scope, ask. Surface findings as text and stop. Asking costs little; unauthorised action costs trust.

The user's confirmation must be in the immediately preceding message, not implied by earlier conversation. If you find yourself reasoning "the user would obviously want X next," you are about to violate this boundary. Stop and ask.

A correct fix delivered through a boundary violation is still a violation. The correctness of the work does not retroactively authorise it.

If the user retroactively accepts work that violated this boundary (e.g., "just merge it"), this is pragmatism, not validation of the violation. Future sessions must still respect the boundary.

## Branching strategy

- `main` — production. Never commit directly.
- `develop` — integration branch. Never commit directly.
- Feature branches off `develop`, PR back to `develop`. Naming convention per `CONTRIBUTING.md` Section 4.1 — `claude-code/<feature-name>` for Claude-Code-driven work, `v0/<feature-name>` for v0-pushed work, `<author>/<feature-name>` for manual work.
- After merge to `develop`, CD pipeline deploys to dev automatically.

## Where to find things

Note: some paths are migrating per `CONTRIBUTING.md` Section 3 — see `MONOREPO.md` for current state and `CONTRIBUTING.md` Section 3 for target state.

| What | Where (current) |
|---|---|
| Cross-app contracts | `/contracts/<scope>/` |
| Shared packages | `/packages/` |
| Platform Lambda handlers | `/platform/functions/` |
| Platform infrastructure | `/platform/infrastructure/` |
| Per-app infrastructure | `/apps/<app>/infrastructure/` |
| Migration data artefacts | `/migration-artifacts/<app>/` |
| Architecture invariants | `/docs/architecture/` |
| Archived superseded docs | `/docs/archive/` |

Before modifying shared code or platform infrastructure, consider the impact on every app — these changes deploy to all of them.

## Runtime configuration pattern

The platform uses a profile + override pattern to select between provider implementations across architectural concerns. Set `NEXT_PUBLIC_RUNTIME_PROFILE=mock` (default; local dev) or `live` (deployed). Per-concern overrides (e.g., `NEXT_PUBLIC_AUTH_OVERRIDE`) allow targeted swaps without changing the profile.

| Concern | mock profile | live profile | Implemented |
|---|---|---|---|
| Auth | mock | cognito | Yes (#177, #189) |
| Data | local | dynamo | #178 |
| AI | mock | claude | #181 |
| Cache | memory | (TBD) | future |
| Email sender | mock | ses | future |
| File storage | local | s3 | future |

Resolution order: override env var (if set with valid value) > profile default > `mock` fallback. See `CONTRIBUTING.md` Section 5.8 for the canonical pattern documentation.
