/**
 * Dev-tools gate (M11 Chunk 3, port of v0 PR #53).
 *
 * `NEXT_PUBLIC_DEV_TOOLS` controls dev-only surfaces (persona switcher, the
 * Redemption Demo harness). Default ON; prod MUST set it to `false`.
 *
 * SECURITY: this is a CLIENT flag and is NOT a security boundary — it only
 * hides/blocks UI. Any capability that can mutate real state (the redemption
 * demo's bypass/impersonation) is ALSO refused SERVER-SIDE against the deployed
 * environment (see invitation-redemption `STAGE` guard). Keep this ORTHOGONAL to
 * `auth.provider`: cognito + dev-tools-on is a valid staging combo.
 */
export function devToolsEnabled(): boolean {
  // Default ON; only an explicit "false" disables (so prod must set it).
  return process.env.NEXT_PUBLIC_DEV_TOOLS !== 'false';
}

/**
 * Three-fold enforcement helper for NAV/menu entries: an entry is visible only
 * when dev-tools are on. (Floating components early-return null on
 * `!devToolsEnabled()`; gated routes call `notFound()` — see those call sites.)
 */
export function devToolVisible(): boolean {
  return devToolsEnabled();
}
