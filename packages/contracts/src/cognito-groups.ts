/**
 * Single source of truth for parsing `cognito:groups` into an exact-match group
 * list (M16 Phase 6 / D11). Shared by the backend claim extractor
 * (`lambda-middleware/auth.ts`) and the frontend auth client
 * (`auth-client/cognito-auth.ts`) so admin status — now sourced solely from the
 * `site-admin` Cognito group — is derived identically on both sides.
 *
 * `cognito:groups` arrives in DIFFERENT shapes depending on the path:
 *   - Cognito SDK / Amplify decoded token payload → a real `string[]`.
 *   - API Gateway REST Cognito authorizer claims map → a STRING. For a user in
 *     multiple groups this is comma- (and sometimes bracket-) joined, e.g.
 *     `"[budget-app-access,site-admin]"` or `"a,b,c"`; a single group is bare
 *     (`"site-admin"`). Some configs use spaces.
 *
 * A naive `.split(' ')` silently fails on the comma/bracket form: a multi-group
 * admin collapses to one token and `groups.includes('site-admin')` returns
 * false — a silent admin lockout. This parser tolerates array, comma, bracket,
 * and whitespace forms, and returns trimmed, exact-match tokens (callers MUST
 * use exact `.includes(...)`, never substring matching).
 */
export function parseCognitoGroups(raw: string[] | string | undefined | null): string[] {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof raw !== 'string') return [];
  return raw
    .replace(/^\s*\[/, '')      // strip a leading "["
    .replace(/\]\s*$/, '')      // strip a trailing "]"
    .split(/[\s,]+/)            // split on commas and/or whitespace
    .map((s) => s.trim())
    .filter(Boolean);
}
