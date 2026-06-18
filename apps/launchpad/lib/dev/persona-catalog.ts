/**
 * Persona catalog — the runtime `listPersonas()` for the dev persona switcher.
 *
 * Mirrors the B1 seed-of-record (scripts/migrations/launchpad/seed-dev-personas.mjs,
 * itself the v0 seed @ transformotion-apps-b8 dd34783). These 8 personas are the
 * users B1 provisions into the live dev LaunchpadAuth pool; switching to one mints
 * its REAL session via the B2 endpoint. `leo` is `disabled` (non-mintable — the
 * B2 allow-list excludes it) and is shown non-switchable.
 *
 * Blurbs are derived with the SAME entitlement-shape logic as v0's
 * `describePersona` (groups-authoritative: app-admin > app-access > membership),
 * so the surface reads identically — the catalog is the only thing that changed.
 *
 * This is dev-tooling data, intentionally NOT sourced from the contracts package:
 * it is a fixed fixture of the seed, decoupled from runtime auth shapes.
 */

export type PersonaStatus = 'active' | 'disabled'

export interface Persona {
  /** Stable persona id — matches the B2 mint allow-list key (e.g. `priya`). */
  id: string
  /** Cognito sign-in email — the cross-walk to the live minted session. */
  email: string
  /** Display label for the row + FAB. */
  label: string
  /** Entitlement-shape one-liner (v0 `describePersona` parity). */
  blurb: string
  status: PersonaStatus
  siteAdmin: boolean
  /** App slugs this persona is app-admin for (display + parity). */
  appAdmin: string[]
}

const APP_LABEL: Record<string, string> = {
  'stock-analyser': 'Stock Analyser',
  'budget-tracker': 'Budget Tracker',
}

type Seed = {
  id: string
  email: string
  label: string
  status: PersonaStatus
  /** Cognito groups the persona holds (seed-of-record). */
  groups: string[]
  /** Distinct account memberships (count drives the blurb). */
  accountCount: number
}

// Seed-of-record (B1). Order matches the seed/v0 list.
const SEED: Seed[] = [
  { id: 'steve',  email: 'steve@example.com',        label: 'Steve Moodie', status: 'active',   groups: ['site-admin', 'stock-app-access', 'budget-app-access'],   accountCount: 4 },
  { id: 'ava',    email: 'ava.chen@example.com',     label: 'Ava Chen',     status: 'active',   groups: ['stock-app-access', 'stock-app-admin', 'budget-app-access'], accountCount: 3 },
  { id: 'noah',   email: 'noah.patel@example.com',   label: 'Noah Patel',   status: 'active',   groups: ['stock-app-access', 'budget-app-access'],                accountCount: 2 },
  { id: 'mara',   email: 'mara.silva@example.com',   label: 'Mara Silva',   status: 'active',   groups: ['budget-app-access', 'budget-app-admin'],                accountCount: 2 },
  { id: 'leo',    email: 'leo.kim@example.com',      label: 'Leo Kim',      status: 'disabled', groups: ['stock-app-access'],                                     accountCount: 1 },
  { id: 'priya',  email: 'priya.nair@example.com',   label: 'Priya Nair',   status: 'active',   groups: ['stock-app-access'],                                     accountCount: 0 },
  { id: 'marcus', email: 'marcus.webb@example.com',  label: 'Marcus Webb',  status: 'active',   groups: ['stock-app-access', 'stock-app-admin'],                  accountCount: 0 },
  { id: 'jordan', email: 'jordan.diaz@example.com',  label: 'Jordan Diaz',  status: 'active',   groups: [],                                                       accountCount: 0 },
]

export function appLabel(slug: string): string {
  return APP_LABEL[slug] ?? slug
}

function accessSlugs(groups: string[]): string[] {
  return Object.keys(APP_LABEL).filter((slug) => groups.includes(`${slug.split('-')[0]}-app-access`))
}

function adminSlugs(groups: string[]): string[] {
  return Object.keys(APP_LABEL).filter((slug) => groups.includes(`${slug.split('-')[0]}-app-admin`))
}

function accountPhrase(n: number): string {
  if (n === 0) return 'no account'
  return `${n} account${n === 1 ? '' : 's'}`
}

/**
 * Entitlement-shape blurb — verbatim parity with v0 `describePersona`:
 * disabled → site-admin → app-admin > app-access > bare membership > none.
 */
function describePersona(s: Seed): string {
  if (s.status === 'disabled') return 'Disabled user — sign-in is blocked'
  if (s.groups.includes('site-admin')) return 'Site-admin — full platform supervisory access'
  const admin = adminSlugs(s.groups).map(appLabel)
  const access = accessSlugs(s.groups).map(appLabel)
  const phrase = accountPhrase(s.accountCount)
  if (admin.length > 0) return `${admin.join(' + ')} app-admin · ${phrase}`
  if (access.length > 0) return `${access.join(' + ')} access · ${phrase}`
  if (s.accountCount > 0) return `Member of ${phrase}`
  return 'No app access'
}

const CATALOG: Persona[] = SEED.map((s) => ({
  id: s.id,
  email: s.email,
  label: s.label,
  blurb: describePersona(s),
  status: s.status,
  siteAdmin: s.groups.includes('site-admin'),
  appAdmin: adminSlugs(s.groups),
}))

/** The mintable + non-mintable persona set, in seed order. */
export function listPersonas(): Persona[] {
  return CATALOG
}

/** Lookup by Cognito email (the live-session cross-walk). */
export function personaByEmail(email: string | undefined): Persona | undefined {
  if (!email) return undefined
  const lower = email.toLowerCase()
  return CATALOG.find((p) => p.email.toLowerCase() === lower)
}
