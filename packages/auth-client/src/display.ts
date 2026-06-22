/**
 * Shared name-display helpers (#494).
 *
 * The three apps each re-derived a first name / initials from `user.name` inline
 * (`user.name.split(' ')[0]`), which on a name that had collapsed to the full
 * email rendered the whole address in the sidebar. The auth client now guarantees
 * `user.name` is a real name or the email LOCAL part (never the full email — see
 * `CognitoAuthService.getCurrentUser`), so the first whitespace token is always a
 * safe first name. These helpers centralise that derivation so every surface reads
 * identically. (Full auth-bootstrap unification across the apps is tracked in #491.)
 */

/** Anything carrying a display `name` — the auth `User` and the app view-models all satisfy this. */
type NamedUser = { name?: string | null }

/**
 * Compose the `User.name` from ID-token claims (#494, #501). The result is NEVER the
 * full email — a sidebar that renders `name.split(' ')[0]` on a full address showed the
 * whole email; the email LOCAL part is the only email-derived fallback. Order:
 *
 *   control-plane displayName → given + family → OIDC `name` claim → given alone
 *     → email local part → email
 *
 * `displayName` is the user's EXPLICITLY-set name, projected into the token's
 * `display_name` claim by the pre-token-generation trigger from the control-plane
 * `launchpad-users.displayName` (#501). It is the source of truth and wins, so the
 * name a user sets in Profile appears in EVERY app (all read `user.name` from the
 * token). When it is absent the rest of the chain is exactly the #494 order — so
 * nothing changes for users who have not set a displayName. The `name` claim sits
 * above `given` alone because IdPs that map only `name` (Microsoft, Facebook before
 * #494's mapping change) still yield a real full name, split to a correct first name.
 */
export function composeDisplayName(claims: {
  displayName?: string | null
  givenName?: string | null
  familyName?: string | null
  nameClaim?: string | null
  email?: string | null
}): string {
  const displayName = claims.displayName?.trim() || undefined
  if (displayName) return displayName // control-plane source of truth (#501)
  const given = claims.givenName?.trim() || undefined
  const family = claims.familyName?.trim() || undefined
  const nameClaim = claims.nameClaim?.trim() || undefined
  const email = claims.email?.trim() || undefined
  const localPart = email ? email.split('@')[0] || undefined : undefined
  if (given && family) return `${given} ${family}`
  return nameClaim ?? given ?? localPart ?? email ?? ''
}

/**
 * First name for greetings and sidebars. Safe to split because `user.name` is
 * never the full email (#494): it is a real name or the email local part.
 */
export function userFirstName(user: NamedUser | null | undefined): string {
  const name = (user?.name ?? '').trim()
  return name.split(/\s+/)[0] || name
}

/** Up to two UPPERCASE initials from the display name (e.g. "Steve Moodie" → "SM"). */
export function userInitials(user: NamedUser | null | undefined): string {
  const parts = (user?.name ?? '').trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
}
