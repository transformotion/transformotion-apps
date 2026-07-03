# UI-review screenshots (Playwright)

On-demand tool for capturing screenshots of UI surfaces for **PR review**. It boots the
app in mock mode (which auto-authenticates a site-admin persona), navigates to a named
surface, drives named interaction states, and captures each to an image.

It exists to make the **visual-review convention cheap to satisfy**: every PR that changes a
UI surface embeds before/after captures of that surface in the PR body (the #642 / #647
rule). This tool produces those captures.

## Isolation (why it's here and not a workspace package)

`tools/ui-screenshots/` is **deliberately not a pnpm workspace member** (the workspace globs
in `pnpm-workspace.yaml` cover `apps/*`, `packages/*`, … — not `tools/*`). Its Playwright
dependency therefore **never enters the root or app install**: `pnpm install` at the repo
root does not touch it, and app builds stay free of browser binaries. You install and run it
**standalone with `npm`**, below.

## One-time setup

```bash
cd tools/ui-screenshots
npm install                 # installs Playwright (pinned) into this dir only
npm run setup:browser       # downloads the Chromium build once (cached in ~/.cache or %LOCALAPPDATA%)
```

Nothing else is required — the harness boots the app itself in mock mode using `mock.env`
(dummy, well-formed values; mock mode makes no real network calls), so it works on a **fresh
clone with no `apps/stock-analyser/.env.local` present**.

## Run

```bash
npm run capture                       # boot app (mock) + capture every surface & state
npm run capture -- --surface notifications-warm-toggles   # just one surface
npm run capture -- --no-boot          # reuse a dev server you already have on :3000
npm run capture -- --out ./out        # choose the output dir (default ./out)
```

Output lands at `out/<surface>/<state>.png`. The run prints the file list at the end.

> First run is slower — Next.js (Turbopack) compiles the route on first navigation. If port
> 3000 is already busy, either free it or start `pnpm --filter @transformotion/stock-analyser
> dev` yourself and use `--no-boot`.

## Artefact policy — branch-only, removed at merge (agent-friendly, repo stays clean)

Captures are embedded in the PR **during review** but never reach `develop`'s history. The
default `out/` is gitignored (working scratch). To put captures in a PR:

1. Run the harness → PNGs land in `out/<surface>/`.
2. Copy the ones for review into `docs/review/<feature>/` and commit them **in their own
   isolated commit on the PR branch** (e.g. `review(<area>): <surface> screenshots (droppable)`).
3. Embed them in the PR body via a **commit-SHA-pinned** raw URL, so they render during review
   and keep rendering after the branch is deleted:
   `https://github.com/<org>/<repo>/raw/<commit-sha>/docs/review/<feature>/<file>.png`
4. **Before the (squash) merge, `git rm docs/review/<feature>/`** — so `develop` carries no
   binaries. The SHA-pinned embeds still resolve on the (now-closed) PR.

Why this shape (vs. committing permanently, or GitHub drag-drop attachments): an automated
agent can embed images **only** by committing them — GitHub's attachment-upload endpoint is
web-UI-only and not scriptable. Committing to the branch and removing at merge gives
agent-produced review captures **with no human drag-drop step** *and* keeps the repo lean:
review lives on the PR, `develop` stays binary-free.

> Whoever runs the merge drops the review dir first (`git rm docs/review/<feature>/`) so the
> squash lands zero binaries. For agent-run merges, that is the first step of the merge routine.

## Add a surface or a state

Edit `surfaces.mjs` — no new script needed.

- **New state** on an existing surface: add an entry to that surface's `states[]` with a
  `name` and an `actions[]` list. The runner resets to a fresh page load before each state,
  replays the surface's `nav`, then your `actions`, then captures.
- **New surface**: add a block with `name`, `description`, optional `viewport`, a `nav[]`
  (how to reach it from the app root), an optional `clip` (the element to screenshot; omit
  for a full-page shot), and `states[]`.

Locator DSL (used by `nav`, `actions`, and `clip`):

| Spec | Resolves to |
|---|---|
| `{ role: ['switch', 'Warm Market'] }` | `getByRole(role, { name })` |
| `{ text: 'some text' }` | `getByText` (substring; add `exact: true` for exact) |
| `{ label: 'aria-label' }` | `getByLabel` |
| `{ testId: 'x' }` | `getByTestId` |
| `{ selector: 'div.foo', hasText: 'y' }` | `page.locator(selector).filter({ hasText })` |

Action verbs: `{ click }`, `{ waitVisible }`, `{ waitHidden }`, `{ press: 'Enter' }`, `{ wait: ms }`.

Prefer stable, user-facing locators (role + accessible name, visible text) over CSS classes —
they survive restyles. The Stock Analyser `Switch` exposes `role="switch"` with an
`aria-label`, which is why the warm toggles are addressed as `{ role: ['switch', 'Warm Market'] }`.

## CI

Screenshot capture is **not wired into CI** — it is an on-demand dev/agent step. (Automated
visual-regression is a separate, later decision with real flake cost.)
