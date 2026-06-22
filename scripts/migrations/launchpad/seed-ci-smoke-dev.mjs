#!/usr/bin/env node
/**
 * CI smoke-user provisioning (STAGE-GUARDED, dev-only, idempotent, additive).
 *
 * The post-deploy smoke check (scripts/ci/verify-deploy.sh [5/5]) calls an
 * account-scoped route (SA /portfolio) and derives X-Account-Id from the CI user's
 * `accounts` claim — which requires the CI user to hold a REAL account in that app
 * (there is no site-admin data bypass, D9; the pre-token reads the MEMBERSHIP row's
 * `appSlug`). The CI user's accounts were a one-off m9-386 cutover artifact, reproduced
 * by NO seed (its SA account even lost its `appSlug`, breaking the SA lane — #470/#146).
 *
 * This dedicated fixture closes the from-scratch reproducibility gap: it reproduces the
 * EXACT corrected live state that fixed #470 — so a clean dev rebuild == current live and
 * the SA smoke goes green via the real path. It is NOT folded into seed-dev-personas.mjs
 * (the v0 persona set-of-record, which must keep mirroring b8 seed.ts) nor into
 * seed-auth-domain-dev.mjs (a live-COPY reseed with no hardcoded data) — both are the
 * wrong target.
 *
 * Mirrors the THREE live writes that fixed #470:
 *   1. account 03d2eb72 → appSlug = stock-analyser
 *   2. account 03d2eb72 → name    = "CI Smoke - Stock Analyser"
 *   3. membership (03d2eb72 / CI-user-sub) → appSlug = stock-analyser   ← pre-token reads this
 *
 * Cognito user: created if missing (no other seed auto-creates ci-cutover-smoke@…); its
 * password is the CI_COGNITO_PASSWORD secret, which this script does not know — pass
 * --ci-password to set it so the user can authenticate for the smoke. The account/member
 * DATA (the #470 gap) is provisioned regardless.
 *
 * SAFETY: dev only (hard refuses any other stage). Additive — never deletes, never
 * overwrites: every write is conditional on attribute_not_exists, so an existing row is a
 * no-op (the live fix already corrected the current pool; this is for a fresh rebuild).
 *
 * NOTE (out of scope, flagged): the CI user's BUDGET-TRACKER smoke account is a separate
 * pre-existing artifact, not reproduced here — a from-scratch rebuild would leave the BT
 * lane needing its own CI smoke account by the same mechanism. Tracked separately.
 *
 * Usage: node scripts/migrations/launchpad/seed-ci-smoke-dev.mjs [--ci-password <pw>] [--dry-run]
 */
import { execFileSync } from 'node:child_process';

const args = parseArgs(process.argv.slice(2));
const stage = args.stage ?? 'dev';
const dryRun = args['dry-run'] === 'true';
const ciPassword = args['ci-password'];
const email = args.email ?? 'ci-cutover-smoke@transformotion.com.au';

if (stage !== 'dev') fail(`Refusing: this seed is dev-only (got --stage ${stage}).`);

const REGION = 'ap-southeast-2';
const AUTH_STACK = 'TransformotionDev-LaunchpadAuth';
const T = {
  users: 'launchpad-users-dev',
  accounts: 'launchpad-accounts-dev',
  members: 'launchpad-account-members-dev',
};

// The CI user's smoke accounts — reproduced VERBATIM from current live (real ids, real
// names), so a rebuild == current live state and a re-run against live is an all-no-op.
//
//  • SA (03d2eb72): a CLEAN ORPHAN (only the CI user) that was BROKEN (missing appSlug) +
//    non-reproduced. Repaired + renamed "CI Smoke - Stock Analyser" by the #470 live fix;
//    reproduced here in the corrected shape.
//  • BT (aed9dcdf "Steve's Budget"): a HEALTHY (appSlug=budget-tracker) but SHARED real
//    account — the CI user is one of 4 members (incl. real users). We reproduce ONLY the
//    CI user's SLICE: the account row + the CI user's own owner membership (the other
//    members are real users / separate fixtures, out of this CI-smoke seed's scope). No
//    repair — the account is already valid; the membership appSlug is denormalized to the
//    current convention (live happens to be null, but resolves via the account fallback).
const SMOKE_ACCOUNTS = [
  { accountId: '03d2eb72-88f6-4f5e-b14a-e805c11870e3', appSlug: 'stock-analyser', name: 'CI Smoke - Stock Analyser', role: 'owner' },
  { accountId: 'aed9dcdf-81b5-47a1-a0d5-5afbae940e93', appSlug: 'budget-tracker', name: "Steve's Budget", role: 'owner' },
];
const GROUPS = ['stock-app-access', 'budget-app-access']; // access groups the memberships imply

const now = new Date().toISOString();

main().catch((err) => { console.error(err); process.exit(1); });

async function main() {
  console.log(`CI smoke seed — stage=${stage} email=${email} dryRun=${dryRun}`);
  const userPoolId = stackOutput(AUTH_STACK, 'UserPoolId');
  console.log(`UserPoolId: ${userPoolId}\n`);

  // 1. CI user (created if missing; reused if present — no double-create).
  const sub = ensureUser(userPoolId, email);
  console.log(`sub/userId = ${sub}`);

  if (ciPassword) {
    if (!dryRun) runAws(['cognito-idp', 'admin-set-user-password', '--region', REGION,
      '--user-pool-id', userPoolId, '--username', sub, '--password', ciPassword, '--permanent']);
    console.log('password set (permanent) from --ci-password');
  } else {
    console.log('NOTE: no --ci-password — if the user was just created, set its password to the '
      + 'CI_COGNITO_PASSWORD secret value so the smoke can authenticate.');
  }

  for (const g of GROUPS) {
    if (!dryRun) runAws(['cognito-idp', 'admin-add-user-to-group', '--region', REGION,
      '--user-pool-id', userPoolId, '--username', sub, '--group-name', g]);
  }
  console.log(`groups: ${GROUPS.join(', ')}`);

  // user row (first-class directory entity; #496)
  putIfAbsent(T.users, 'userId', {
    userId: sub, email, emailLower: email.toLowerCase(),
    status: 'active', createdAt: now, updatedAt: now,
  });

  // Per app: the account row (appSlug + name) AND the membership row with the
  // DENORMALIZED appSlug the pre-token reads — so each lane's account-scoped smoke
  // resolves an X-Account-Id from the CI user's claim.
  for (const a of SMOKE_ACCOUNTS) {
    putIfAbsent(T.accounts, 'accountId', { accountId: a.accountId, appSlug: a.appSlug, name: a.name, createdAt: now });
    putIfAbsent(T.members, 'accountId', { accountId: a.accountId, userId: sub, email, appSlug: a.appSlug, role: a.role, joinedAt: now });
  }

  console.log('\n=== CI SMOKE SEED SUMMARY ===');
  console.log(`user=${email} sub=${sub}`);
  for (const a of SMOKE_ACCOUNTS) console.log(`  ${a.appSlug.padEnd(14)} ${a.accountId}  "${a.name}"  (${a.role})`);
  console.log('Verify: a CI-user token carries both apps in `accounts` → SA /portfolio and '
    + 'BT /api/budget/v1/settings each derive X-Account-Id → 2xx.');
}

// ---------------------------------------------------------------------------
function ensureUser(userPoolId, userEmail) {
  const existing = listUserByEmail(userPoolId, userEmail);
  if (existing) { console.log(`  user exists (reused): ${userEmail}`); return existing.Username; }
  if (dryRun) { console.log(`  [dry-run] would create ${userEmail}`); return `dry-${userEmail}`; }
  try {
    runAws(['cognito-idp', 'admin-create-user', '--region', REGION, '--user-pool-id', userPoolId,
      '--username', userEmail, '--user-attributes', `Name=email,Value=${userEmail}`, 'Name=email_verified,Value=true',
      '--message-action', 'SUPPRESS']);
  } catch (e) {
    if (!String(e).includes('UsernameExistsException')) throw e;
  }
  const u = listUserByEmail(userPoolId, userEmail);
  if (!u) fail(`Could not resolve ${userEmail} after create`);
  return u.Username;
}

function listUserByEmail(userPoolId, userEmail) {
  const res = awsJson(['cognito-idp', 'list-users', '--region', REGION, '--user-pool-id', userPoolId,
    '--filter', `email = "${userEmail}"`]);
  return (res.Users ?? [])[0];
}

/** Conditional put — creates the row only when absent (safe re-run; never clobbers). */
function putIfAbsent(tableName, pkAttr, item) {
  console.log(`  put-if-absent ${tableName}: ${JSON.stringify(item)}`);
  if (dryRun) return;
  try {
    runAws(['dynamodb', 'put-item', '--region', REGION, '--table-name', tableName,
      '--item', JSON.stringify(toDynamoItem(item)),
      '--condition-expression', `attribute_not_exists(${pkAttr})`]);
  } catch (e) {
    if (String(e).includes('ConditionalCheckFailedException')) {
      console.log('    (exists — no-op)');
    } else throw e;
  }
}

function parseArgs(argv) {
  const p = {};
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (!t.startsWith('--')) continue;
    const k = t.slice(2); const next = argv[i + 1];
    if (!next || next.startsWith('--')) p[k] = 'true'; else { p[k] = next; i += 1; }
  }
  return p;
}
function stackOutput(stackName, outputKey) {
  const v = runAws(['cloudformation', 'describe-stacks', '--region', REGION, '--stack-name', stackName,
    '--query', `Stacks[0].Outputs[?OutputKey=='${outputKey}'].OutputValue`, '--output', 'text']).trim();
  if (!v || v === 'None') fail(`Missing ${outputKey} from ${stackName}`);
  return v;
}
function runAws(a) {
  return execFileSync('aws', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function awsJson(a) {
  const out = runAws([...a, '--output', 'json']);
  return out ? JSON.parse(out) : {};
}
function toDynamoItem(item) {
  return Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toAttr(v)]));
}
function toAttr(v) {
  if (v === null) return { NULL: true };
  if (typeof v === 'string') return { S: v };
  if (typeof v === 'number') return { N: String(v) };
  if (typeof v === 'boolean') return { BOOL: v };
  if (Array.isArray(v)) return { L: v.map(toAttr) };
  if (typeof v === 'object') return { M: Object.fromEntries(Object.entries(v).map(([k, c]) => [k, toAttr(c)])) };
  return { S: String(v) };
}
function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
