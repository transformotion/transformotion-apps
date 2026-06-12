/**
 * Pure status-decision logic for the Stock Analyser active-account store.
 * Kept free of auth/network imports so it can be unit-tested without pulling the
 * Amplify/auth chain.
 */

export const APP_SLUG = 'stock-analyser'

/**
 * - `error` (control-plane fetch failed) is DISTINCT from `no-access` (genuinely
 *   no membership): an outage must never masquerade as revocation. `error` is a
 *   retry state; `no-access` is terminal.
 */
export type AccountAccessStatus = 'idle' | 'loading' | 'ready' | 'no-access' | 'error'

export interface AccountOption {
  accountId: string
  role: string
  /** Display name from the control plane; absent until enriched (falls back to id). */
  name?: string
}

/** Outcome of the control-plane active-accounts read. `ok: false` = fetch failed. */
export type ActiveAccountsResult =
  | { ok: true; selections: Array<{ appSlug: string; accountId: string }> }
  | { ok: false }

/**
 * Decide the access state (addition 2 — `error` must stay distinct from
 * `no-access`):
 *  - fetch FAILED            → `error` (retry)
 *  - has a selection for SA  → `ready`
 *  - member, no selection    → `ready` (deterministic first account)
 *  - no membership at all    → `no-access`
 */
export function resolveAccountState(
  accounts: AccountOption[],
  result: ActiveAccountsResult,
): { status: AccountAccessStatus; activeAccountId: string | null; error: string | null } {
  if (!result.ok) {
    return { status: 'error', activeAccountId: null, error: 'Could not determine your access' }
  }
  const selection = result.selections.find(s => s.appSlug === APP_SLUG)
  if (selection) return { status: 'ready', activeAccountId: selection.accountId, error: null }
  if (accounts.length > 0) return { status: 'ready', activeAccountId: accounts[0]!.accountId, error: null }
  return { status: 'no-access', activeAccountId: null, error: null }
}
