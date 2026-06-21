#!/usr/bin/env node
/**
 * One-off backfill for #496 — create launchpad-users rows for users who JOINED via
 * redemption before the user-row creation path was wired, and are therefore invisible
 * in the admin Users & Access list (which scans launchpad-users as its universe).
 *
 * These three users have account memberships + Cognito groups but NO launchpad-users
 * row, confirmed against dev. They will NOT self-heal (B's first-auth bootstrap only
 * fires going forward; they'd need to sign in again), so they are backfilled here.
 *
 * The written row is the CANONICAL bootstrap shape — IDENTICAL to what
 * account-provisioning (/auth/setup) and invitation-redemption write — MINUS
 * displayName (resolved from the token at read time, or set explicitly later; #494).
 *
 * SAFETY:
 *   • DRY-RUN by default — prints exactly what it would write. Pass --execute to write.
 *   • Each write is conditional (attribute_not_exists(userId)) — an existing row is a
 *     no-op, never an overwrite.
 *   • Uses the AWS CLI (no SDK dependency); honours your current AWS credentials/region.
 *
 * Usage:
 *   node scripts/ops/backfill-user-rows-496.mjs                 # dry-run (preview)
 *   node scripts/ops/backfill-user-rows-496.mjs --execute       # write the rows
 *   node scripts/ops/backfill-user-rows-496.mjs --table X --region Y --execute
 */

import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const table = argValue('--table') ?? 'launchpad-users-dev';
const region = argValue('--region') ?? 'ap-southeast-2';

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

/** The three confirmed orphans (memberships/groups exist, launchpad-users row absent). */
const ORPHANS = [
  { userId: 'a98e7408-8091-70b5-f5d1-1ff97322a911', email: 'stevemoodie70@gmail.com' },          // Google
  { userId: '293ed468-4091-7006-b2e3-1f88cdc9df73', email: 'stevemoodie@hotmail.com' },           // Microsoft
  { userId: '093e0458-6051-70c5-39d3-40a8d49d7b7f', email: 'smoke-bt-viewer@transformotion.com.au' }, // native (CI)
];

/** Canonical bootstrap row (minus displayName) as a DynamoDB attribute-value map. */
function bootstrapItem({ userId, email }) {
  const now = new Date().toISOString();
  return {
    userId: { S: userId },
    email: { S: email },
    emailLower: { S: email.toLowerCase() },
    status: { S: 'active' },
    preferences: { M: { notificationsEnabled: { BOOL: false } } },
    profileComplete: { BOOL: false },
    activeAccounts: { M: {} },
    createdAt: { S: now },
    updatedAt: { S: now },
  };
}

console.log(`#496 backfill — table=${table} region=${region} mode=${execute ? 'EXECUTE' : 'DRY-RUN'}`);
console.log(`Rows to ensure (conditional on attribute_not_exists(userId)):\n`);

let written = 0;
let skipped = 0;

for (const orphan of ORPHANS) {
  const item = bootstrapItem(orphan);
  console.log(`• ${orphan.email}  (${orphan.userId})`);
  console.log(`    ${JSON.stringify(item)}`);

  if (!execute) continue;

  try {
    execFileSync(
      'aws',
      [
        'dynamodb', 'put-item',
        '--table-name', table,
        '--region', region,
        '--item', JSON.stringify(item),
        '--condition-expression', 'attribute_not_exists(userId)',
      ],
      { stdio: 'pipe' },
    );
    written++;
    console.log('    → written');
  } catch (err) {
    const msg = String(err.stderr ?? err.message ?? err);
    if (msg.includes('ConditionalCheckFailedException')) {
      skipped++;
      console.log('    → already exists, skipped (no-op)');
    } else {
      console.error('    → FAILED:', msg);
      process.exitCode = 1;
    }
  }
}

console.log(
  execute
    ? `\nDone. written=${written} skipped(existing)=${skipped} of ${ORPHANS.length}.`
    : `\nDRY-RUN only — nothing written. Re-run with --execute to apply.`,
);
