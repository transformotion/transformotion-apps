#!/usr/bin/env node
/**
 * B1 validation gate (V1–V5) for the dev persona seed. Read-only except for the
 * token issuances in V3 (which are authentications, not data writes). Prints a
 * per-check PASS/FAIL and exits non-zero if any check fails.
 *
 * V1 COUNT   — 8 users, 8 accounts, 12 member rows, 3 app-admin-grants present.
 * V2 GROUPS  — each persona holds EXACTLY its expected Cognito groups.
 * V3 REFRESH — priya + marcus (access, no accounts) RETAIN stock-app-access across
 *              two token issuances (initial + refresh) — the #473 fix on real personas.
 * V4 BINDING — users-row userId == Cognito sub (spot-check).
 * V5 SECRETS — all 8 password secrets present + non-empty (length only, never values).
 */
import { execFileSync } from 'node:child_process';

const REGION = 'ap-southeast-2';
const AUTH_STACK = 'TransformotionDev-LaunchpadAuth';
const T = {
  users: 'launchpad-users-dev', accounts: 'launchpad-accounts-dev',
  members: 'launchpad-account-members-dev', grants: 'launchpad-app-admin-grants-dev',
};
const ACCOUNT_IDS = ['acct-sa-steve', 'acct-sa-steve-household', 'acct-sa-apex', 'acct-sa-research',
  'acct-bt-steve', 'acct-bt-steve-liz', 'acct-bt-household', 'acct-bt-studio'];
const PERSONAS = [
  { id: 'steve', email: 'steve@example.com', groups: ['site-admin', 'stock-app-access', 'budget-app-access'], members: 4, grants: 0, status: 'active' },
  { id: 'ava', email: 'ava.chen@example.com', groups: ['stock-app-access', 'stock-app-admin', 'budget-app-access'], members: 3, grants: 1, status: 'active' },
  { id: 'noah', email: 'noah.patel@example.com', groups: ['stock-app-access', 'budget-app-access'], members: 2, grants: 0, status: 'active' },
  { id: 'mara', email: 'mara.silva@example.com', groups: ['budget-app-access', 'budget-app-admin'], members: 2, grants: 1, status: 'active' },
  { id: 'leo', email: 'leo.kim@example.com', groups: ['stock-app-access'], members: 1, grants: 0, status: 'disabled' },
  { id: 'priya', email: 'priya.nair@example.com', groups: ['stock-app-access'], members: 0, grants: 0, status: 'active' },
  { id: 'marcus', email: 'marcus.webb@example.com', groups: ['stock-app-access', 'stock-app-admin'], members: 0, grants: 1, status: 'active' },
  { id: 'jordan', email: 'jordan.diaz@example.com', groups: [], members: 0, grants: 0, status: 'active' },
];

const POOL = stackOutput('UserPoolId');
const CLIENT = stackOutput('LaunchpadAppClientId');
const fails = [];
const subByEmail = {};
for (const p of PERSONAS) {
  const u = listUserByEmail(p.email);
  if (!u) { fails.push(`${p.id}: Cognito user missing`); continue; }
  subByEmail[p.email] = u.Username;
}

// ---- V1 COUNT ----
let v1 = [];
const usersPresent = PERSONAS.filter((p) => subByEmail[p.email] && getItem(T.users, { userId: subByEmail[p.email] }));
v1.push(`users ${usersPresent.length}/8`);
const acctsPresent = ACCOUNT_IDS.filter((a) => getItem(T.accounts, { accountId: a }));
v1.push(`accounts ${acctsPresent.length}/8`);
let memberTotal = 0, grantTotal = 0;
for (const p of PERSONAS) {
  const sub = subByEmail[p.email]; if (!sub) continue;
  memberTotal += queryUserIndex(T.members, sub).length;
  grantTotal += queryUserIndex(T.grants, sub).length;
}
v1.push(`members ${memberTotal}/12`);
v1.push(`grants ${grantTotal}/3`);
const v1ok = usersPresent.length === 8 && acctsPresent.length === 8 && memberTotal === 12 && grantTotal === 3;
report('V1 COUNT', v1ok, v1.join('  '));

// ---- V2 GROUPS (exact) ----
const v2bad = [];
for (const p of PERSONAS) {
  const sub = subByEmail[p.email]; if (!sub) { v2bad.push(`${p.id}:no-user`); continue; }
  const got = listGroups(sub).sort();
  const want = [...p.groups].sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) v2bad.push(`${p.id}: got[${got}] want[${want}]`);
}
report('V2 GROUPS', v2bad.length === 0, v2bad.length ? v2bad.join(' | ') : 'all 8 exact');

// ---- V3 REFRESH (priya + marcus retain stock-app-access across 2 issuances) ----
const v3lines = [];
for (const id of ['priya', 'marcus']) {
  const p = PERSONAS.find((x) => x.id === id);
  const pw = secretValue(`/launchpad/dev/personas/${id}/password`);
  let r1;
  try { r1 = adminAuth(p.email, pw); } catch (e) { v3lines.push(`${id}: AUTH FAILED ${String(e).split('\n')[0]}`); fails.push(`V3 ${id} auth`); continue; }
  const apps1 = appsClaim(r1.AuthenticationResult.IdToken);
  const g1 = listGroups(subByEmail[p.email]).includes('stock-app-access');
  const r2 = refreshAuth(r1.AuthenticationResult.RefreshToken);
  const apps2 = appsClaim(r2.AuthenticationResult.IdToken);
  const g2 = listGroups(subByEmail[p.email]).includes('stock-app-access');
  const ok = g1 && g2 && apps1.includes('stock-analyser') && apps2.includes('stock-analyser');
  if (!ok) fails.push(`V3 ${id} stripped`);
  v3lines.push(`${id}: #1 apps=${JSON.stringify(apps1)} grp=${g1} | #2 apps=${JSON.stringify(apps2)} grp=${g2} => ${ok ? 'RETAINED' : 'STRIPPED'}`);
}
report('V3 REFRESH', !v3lines.some((l) => l.includes('STRIPPED') || l.includes('FAILED')), '\n    ' + v3lines.join('\n    '));

// ---- V4 BINDING (userId == sub) ----
const v4bad = [];
for (const id of ['steve', 'ava', 'priya']) {
  const p = PERSONAS.find((x) => x.id === id);
  const sub = subByEmail[p.email];
  const row = getItem(T.users, { userId: sub });
  if (!row || row.userId?.S !== sub) v4bad.push(`${id}: row.userId != sub`);
}
report('V4 BINDING', v4bad.length === 0, v4bad.length ? v4bad.join(' | ') : 'userId==sub for steve/ava/priya');

// ---- V5 SECRETS ----
const v5bad = [];
for (const p of PERSONAS) {
  const len = secretLen(`/launchpad/dev/personas/${p.id}/password`);
  if (!(len > 0)) v5bad.push(`${p.id}: len=${len}`);
}
report('V5 SECRETS', v5bad.length === 0, v5bad.length ? v5bad.join(' | ') : 'all 8 present, non-empty');

console.log('\n=== V1–V5 ' + (fails.length === 0 ? 'ALL PASS ✅' : `FAILURES: ${fails.join('; ')} ❌`) + ' ===');
process.exit(fails.length === 0 ? 0 : 1);

// ---------------------------------------------------------------------------
function report(name, ok, detail) {
  if (!ok) fails.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
}
function stackOutput(key) {
  const v = aws(['cloudformation', 'describe-stacks', '--region', REGION, '--stack-name', AUTH_STACK,
    '--query', `Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue`, '--output', 'text']).trim();
  if (!v || v === 'None') { console.error(`Missing ${key}`); process.exit(2); }
  return v;
}
function listUserByEmail(email) {
  const r = awsJson(['cognito-idp', 'list-users', '--region', REGION, '--user-pool-id', POOL, '--filter', `email = "${email}"`]);
  return (r.Users ?? [])[0];
}
function listGroups(sub) {
  const r = awsJson(['cognito-idp', 'admin-list-groups-for-user', '--region', REGION, '--user-pool-id', POOL, '--username', sub]);
  return (r.Groups ?? []).map((g) => g.GroupName);
}
function getItem(table, key) {
  const r = awsJson(['dynamodb', 'get-item', '--region', REGION, '--table-name', table, '--key', JSON.stringify(toKey(key))]);
  return r.Item;
}
function queryUserIndex(table, sub) {
  const r = awsJson(['dynamodb', 'query', '--region', REGION, '--table-name', table, '--index-name', 'userId-index',
    '--key-condition-expression', 'userId = :u', '--expression-attribute-values', JSON.stringify({ ':u': { S: sub } })]);
  return r.Items ?? [];
}
function adminAuth(email, pw) {
  return awsJson(['cognito-idp', 'admin-initiate-auth', '--region', REGION, '--user-pool-id', POOL, '--client-id', CLIENT,
    '--auth-flow', 'ADMIN_USER_PASSWORD_AUTH', '--auth-parameters', `USERNAME=${email},PASSWORD=${pw}`]);
}
function refreshAuth(token) {
  return awsJson(['cognito-idp', 'admin-initiate-auth', '--region', REGION, '--user-pool-id', POOL, '--client-id', CLIENT,
    '--auth-flow', 'REFRESH_TOKEN_AUTH', '--auth-parameters', `REFRESH_TOKEN=${token}`]);
}
function appsClaim(idToken) {
  const p = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const j = JSON.parse(Buffer.from(p, 'base64').toString());
  try { return JSON.parse(j.apps || '[]'); } catch { return []; }
}
function secretValue(name) {
  return aws(['secretsmanager', 'get-secret-value', '--region', REGION, '--secret-id', name, '--query', 'SecretString', '--output', 'text']).trim();
}
function secretLen(name) {
  try { return Number(aws(['secretsmanager', 'get-secret-value', '--region', REGION, '--secret-id', name, '--query', 'length(SecretString)', '--output', 'text']).trim()); }
  catch { return 0; }
}
function toKey(key) { return Object.fromEntries(Object.entries(key).map(([k, v]) => [k, { S: v }])); }
function aws(a) { return execFileSync('aws', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function awsJson(a) { const o = aws([...a, '--output', 'json']); return o ? JSON.parse(o) : {}; }
