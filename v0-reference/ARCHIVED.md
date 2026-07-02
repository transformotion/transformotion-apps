# v0 Reference Archive

`v0-reference/` is no longer a generated build input or contract source of
truth.

Contract authority moved to `packages/contracts/` in this repository during
the v0-retirement Phase 1 migration. Existing runtime UI surfaces are also
repo-owned and reviewed directly in this repository. v0 may still be used as
optional, per-task reference material for net-new visual design, but any v0
output is cited and ported into this repository; it is not canonical by itself.

Final observed v0 contract sync:

- Repo: `transformotion/transformotion-apps-b8`
- Commit: `7b0f993c471c7aa1342b345886a2a9b0d43ce724`
- Commit date: `2026-07-02T16:56:39+10:00`
- Archive date: `2026-07-03`

The deprecated `pnpm sync:v0` command remains only as a manual archival helper.
CI and deploy workflows must not depend on `v0-reference/`.
