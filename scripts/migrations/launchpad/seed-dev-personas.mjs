#!/usr/bin/env node
/**
 * B1 — Dev persona provisioning (STAGE-GUARDED, dev-only, idempotent, additive).
 *
 * Provisions the v0 seed-of-record persona set (transformotion-apps-b8
 * components/launchpad/data/seed.ts @ dd34783) into the LIVE dev LaunchpadAuth
 * pool + control-plane tables, so a B2-minted token reproduces each persona's
 * exact entitlement view:
 *   - Cognito user (admin-create-user, email_verified, SUPPRESS) + permanent password
 *   - Cognito group memberships (site-admin / {app}-app-access / {app}-app-admin)
 *   - launchpad-users / -accounts / -account-members / -app-admin-grants rows
 *   - per-persona password in Secrets Manager (/launchpad/dev/personas/<id>/password)
 *
 * Binding: DynamoDB userId == the created Cognito sub. This pool uses email as a
 * sign-in alias, so Cognito assigns a UUID Username that EQUALS the sub; we read
 * it back from list-users and key every row on it (matches auth.userId = sub AND
 * the pre-token trigger's event.userName).
 *
 * SAFETY: dev only (hard refuses any other stage). Additive — never deletes. Uses
 * execFileSync (no shell) so /launchpad/... secret names are not path-mangled.
 * Idempotent: existing users/passwords/secrets are reused; put-item overwrites.
 *
 * Usage: node scripts/migrations/launchpad/seed-dev-personas.mjs [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const args = parseArgs(process.argv.slice(2));
const stage = args.stage ?? 'dev';
const dryRun = args['dry-run'] === 'true';

if (stage !== 'dev') fail(`Refusing: this seed is dev-only (got --stage ${stage}).`);

const REGION = 'ap-southeast-2';
const AUTH_STACK = 'TransformotionDev-LaunchpadAuth';
const T = {
  users: 'launchpad-users-dev',
  accounts: 'launchpad-accounts-dev',
  members: 'launchpad-account-members-dev',
  grants: 'launchpad-app-admin-grants-dev',
};

// ---------------------------------------------------------------------------
// Persona set (v0 seed.ts @ dd34783)
// ---------------------------------------------------------------------------
const ACCOUNTS = [
  { accountId: 'acct-sa-steve', appSlug: 'stock-analyser', name: "Steve's Account" },
  { accountId: 'acct-sa-steve-household', appSlug: 'stock-analyser', name: "Steve's Household" },
  { accountId: 'acct-sa-apex', appSlug: 'stock-analyser', name: 'Apex Capital' },
  { accountId: 'acct-sa-research', appSlug: 'stock-analyser', name: 'Research Desk' },
  { accountId: 'acct-bt-steve', appSlug: 'budget-tracker', name: "Steve's Account" },
  { accountId: 'acct-bt-steve-liz', appSlug: 'budget-tracker', name: 'Steve & Liz Household' },
  { accountId: 'acct-bt-household', appSlug: 'budget-tracker', name: 'Household' },
  { accountId: 'acct-bt-studio', appSlug: 'budget-tracker', name: 'Studio Finances' },
];

const PERSONAS = [
  {
    id: 'steve', email: 'steve@example.com', displayName: 'Steve Moodie', status: 'active',
    groups: ['site-admin', 'stock-app-access', 'budget-app-access'],
    memberships: [
      ['acct-sa-steve', 'stock-analyser', 'owner'],
      ['acct-sa-steve-household', 'stock-analyser', 'owner'],
      ['acct-bt-steve', 'budget-tracker', 'owner'],
      ['acct-bt-steve-liz', 'budget-tracker', 'owner'],
    ],
    appAdmin: [],
  },
  {
    id: 'ava', email: 'ava.chen@example.com', displayName: 'Ava Chen', status: 'active',
    groups: ['stock-app-access', 'stock-app-admin', 'budget-app-access'],
    memberships: [
      ['acct-sa-apex', 'stock-analyser', 'owner'],
      ['acct-sa-research', 'stock-analyser', 'viewer'],
      ['acct-bt-studio', 'budget-tracker', 'manager'],
    ],
    appAdmin: ['stock-analyser'],
  },
  {
    id: 'noah', email: 'noah.patel@example.com', displayName: 'Noah Patel', status: 'active',
    groups: ['stock-app-access', 'budget-app-access'],
    memberships: [
      ['acct-sa-research', 'stock-analyser', 'owner'],
      ['acct-bt-household', 'budget-tracker', 'owner'],
    ],
    appAdmin: [],
  },
  {
    id: 'mara', email: 'mara.silva@example.com', displayName: 'Mara Silva', status: 'active',
    groups: ['budget-app-access', 'budget-app-admin'],
    memberships: [
      ['acct-bt-studio', 'budget-tracker', 'owner'],
      ['acct-bt-household', 'budget-tracker', 'manager'],
    ],
    appAdmin: ['budget-tracker'],
  },
  {
    id: 'leo', email: 'leo.kim@example.com', displayName: null, status: 'disabled',
    groups: ['stock-app-access'],
    memberships: [['acct-sa-apex', 'stock-analyser', 'member']],
    appAdmin: [],
  },
  {
    id: 'priya', email: 'priya.nair@example.com', displayName: 'Priya Nair', status: 'active',
    groups: ['stock-app-access'],
    memberships: [], // access, no accounts — now durable post-#473 fix
    appAdmin: [],
  },
  {
    id: 'marcus', email: 'marcus.webb@example.com', displayName: 'Marcus Webb', status: 'active',
    groups: ['stock-app-access', 'stock-app-admin'],
    memberships: [], // app-admin, no account
    appAdmin: ['stock-analyser'],
  },
  {
    id: 'jordan', email: 'jordan.diaz@example.com', displayName: 'Jordan Diaz', status: 'active',
    groups: [], // removed end-state
    memberships: [],
    appAdmin: [],
  },
];

const now = new Date().toISOString();
const created = [];

main().catch((err) => { console.error(err); process.exit(1); });

async function main() {
  console.log(`B1 persona seed — stage=${stage} dryRun=${dryRun}`);
  const userPoolId = stackOutput(AUTH_STACK, 'UserPoolId');
  console.log(`UserPoolId: ${userPoolId}\n`);

  // Accounts first (memberships reference them).
  for (const acct of ACCOUNTS) {
    put(T.accounts, { ...acct, createdAt: now });
  }
  console.log(`accounts: ${ACCOUNTS.length} put\n`);

  for (const p of PERSONAS) {
    console.log(`--- ${p.id} (${p.email}) ---`);
    const sub = ensureUser(userPoolId, p.email);
    console.log(`  sub/userId = ${sub}`);

    const password = ensurePasswordSecret(p.id);
    if (!dryRun) {
      runAws(['cognito-idp', 'admin-set-user-password', '--region', REGION,
        '--user-pool-id', userPoolId, '--username', sub, '--password', password, '--permanent']);
    }

    for (const g of p.groups) {
      if (!dryRun) runAws(['cognito-idp', 'admin-add-user-to-group', '--region', REGION,
        '--user-pool-id', userPoolId, '--username', sub, '--group-name', g]);
    }
    console.log(`  groups: ${p.groups.join(', ') || '(none)'}`);

    // Status: leo disabled, everyone else enabled (idempotent).
    if (!dryRun) {
      const cmd = p.status === 'disabled' ? 'admin-disable-user' : 'admin-enable-user';
      try { runAws(['cognito-idp', cmd, '--region', REGION, '--user-pool-id', userPoolId, '--username', sub]); }
      catch (e) { console.log(`  (status ${cmd} note: ${String(e).split('\n')[0]})`); }
    }

    put(T.users, {
      userId: sub, email: p.email, emailLower: p.email.toLowerCase(),
      ...(p.displayName ? { displayName: p.displayName } : {}),
      status: p.status, createdAt: now, updatedAt: now,
    });

    for (const [accountId, appSlug, role] of p.memberships) {
      put(T.members, { accountId, userId: sub, appSlug, role, joinedAt: now });
    }

    for (const appSlug of p.appAdmin) {
      put(T.grants, { appSlug, userId: sub, grantedAt: now });
    }

    created.push({ id: p.id, email: p.email, sub, groups: p.groups, status: p.status });
    console.log(`  memberships: ${p.memberships.length}  appAdminGrants: ${p.appAdmin.length}\n`);
  }

  const memberCount = PERSONAS.reduce((n, p) => n + p.memberships.length, 0);
  const grantCount = PERSONAS.reduce((n, p) => n + p.appAdmin.length, 0);
  console.log('=== B1 SEED SUMMARY ===');
  console.log(`users=${PERSONAS.length} accounts=${ACCOUNTS.length} members=${memberCount} appAdminGrants=${grantCount} passwordSecrets=${PERSONAS.length}`);
  console.log('persona -> sub:');
  for (const c of created) console.log(`  ${c.id.padEnd(8)} ${c.sub}  [${c.status}]`);
  console.log('\nMACHINE_SUMMARY=' + JSON.stringify({ created }));
}

// ---------------------------------------------------------------------------
function ensureUser(userPoolId, email) {
  const existing = listUserByEmail(userPoolId, email);
  if (existing) return existing.Username;
  if (dryRun) { console.log(`  [dry-run] would create ${email}`); return `dry-${email}`; }
  try {
    runAws(['cognito-idp', 'admin-create-user', '--region', REGION, '--user-pool-id', userPoolId,
      '--username', email, '--user-attributes', `Name=email,Value=${email}`, 'Name=email_verified,Value=true',
      '--message-action', 'SUPPRESS']);
  } catch (e) {
    if (!String(e).includes('UsernameExistsException')) throw e;
  }
  const u = listUserByEmail(userPoolId, email);
  if (!u) fail(`Could not resolve ${email} after create`);
  return u.Username;
}

function listUserByEmail(userPoolId, email) {
  const res = awsJson(['cognito-idp', 'list-users', '--region', REGION, '--user-pool-id', userPoolId,
    '--filter', `email = "${email}"`]);
  return (res.Users ?? [])[0];
}

function ensurePasswordSecret(personaId) {
  const name = `/launchpad/dev/personas/${personaId}/password`;
  // Reuse an existing secret value so re-runs keep passwords stable.
  try {
    const out = runAws(['secretsmanager', 'get-secret-value', '--region', REGION, '--secret-id', name,
      '--query', 'SecretString', '--output', 'text']);
    const val = out.trim();
    if (val && val !== 'None') return val;
  } catch { /* not found — create below */ }
  const password = 'Aa1' + randomBytes(15).toString('hex'); // upper+lower+digit, len 33
  if (dryRun) { console.log(`  [dry-run] would create secret ${name}`); return password; }
  try {
    runAws(['secretsmanager', 'create-secret', '--region', REGION, '--name', name,
      '--description', `Dev persona ${personaId} login password (B1)`, '--secret-string', password]);
  } catch (e) {
    if (String(e).includes('ResourceExistsException')) {
      runAws(['secretsmanager', 'put-secret-value', '--region', REGION, '--secret-id', name, '--secret-string', password]);
    } else throw e;
  }
  return password;
}

// ---------------------------------------------------------------------------
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
function put(tableName, item) {
  console.log(`  put ${tableName}: ${JSON.stringify(item)}`);
  if (dryRun) return;
  runAws(['dynamodb', 'put-item', '--region', REGION, '--table-name', tableName, '--item', JSON.stringify(toDynamoItem(item))]);
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
  return { S: String(v) };
}
function fail(msg) { console.error(`ERROR: ${msg}`); process.exit(1); }
