/**
 * Single source of truth for parsing `cognito:groups` into an exact-match group
 * list (M16 Phase 6 / D11). Shared by the backend claim extractor
 * (`lambda-middleware/auth.ts`) and the frontend auth client
 * (`auth-client/cognito-auth.ts`) so admin status — now sourced solely from the
 * `site-admin` Cognito group — is derived identically on both sides.
 *
 * `cognito:groups` arrives in DIFFERENT shapes depending on the path:
 *   - Cognito SDK / Amplify decoded token payload, or a clean array → `string[]`.
 *   - A JSON-stringified array string, e.g.
 *     `'["budget-app-access","admin","site-admin","stock-app-access"]'` — the
 *     canonical Cognito serialisation, and how the multi-group form is delivered
 *     on dev. The inner per-element DOUBLE QUOTES are the trap: stripping only
 *     the outer `[]` leaves tokens like `"site-admin"` that never exact-match
 *     `site-admin` → a silent admin lockout for any multi-group admin.
 *   - Unquoted bracket / comma / space forms, e.g. `"[a, b]"`, `"a,b"`, `"a b"`,
 *     and a bare single group `"site-admin"`.
 *
 * The parser tolerates all of these and returns trimmed, UNQUOTED, exact-match
 * tokens (callers MUST use exact `.includes(...)`, never substring matching).
 */
export function parseCognitoGroups(raw: string[] | string | undefined | null): string[] {
  if (raw == null) return [];

  // Already an array (amplify decoded payload / SDK).
  if (Array.isArray(raw)) {
    return raw.map(stripToken).filter(Boolean);
  }
  if (typeof raw !== 'string') return [];

  const trimmed = raw.trim();

  // JSON-stringified array form — parse it so the inner per-element quotes are
  // removed. This is the dev/API-Gateway delivery shape and the regression cause.
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(stripToken).filter(Boolean);
    } catch {
      // Not valid JSON (e.g. an unquoted bracket form "[a, b]") — fall through.
    }
  }

  // Bare / unquoted-bracket / space / comma forms.
  return trimmed
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(/[\s,]+/)
    .map(stripToken)
    .filter(Boolean);
}

/** Trim and strip a single pair of surrounding single/double quotes from a token. */
function stripToken(value: unknown): string {
  return String(value).trim().replace(/^["']+|["']+$/g, '').trim();
}
