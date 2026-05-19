/**
 * Budget Tracker — Normalise Rule Priorities
 *
 * Fixes two populations of rules with broken priority values:
 *
 *   Population A — 73 rules at priority=100 (the original migration batch).
 *     All landed at the Lambda default because the client didn't send a
 *     priority field at import time. They sort correctly relative to each
 *     other, but all share the same value so drag-and-drop can't reorder
 *     them, and any rule created after PR #234 (priority=Date.now())
 *     silently loses to all 73.
 *
 *   Population B — rules at priority > 1_000_000_000 (Date.now() values,
 *     ~1.78 × 10¹²). Created by acceptResult / saveAndLearn / addNewRule
 *     before the fix in this PR. They sort to the very end — lowest
 *     precedence — which is the opposite of the "recently learned"
 *     intent.
 *
 * Fix: sort both populations together alphabetically by match.toLowerCase(),
 * then assign priority = (index + 1) * 1000. Step of 1000 gives ~10
 * drag-and-drop halvings between any adjacent pair before sub-integer
 * values appear.
 *
 * Idempotency: rules with any other priority (not 100 and not > 10⁹) are
 * considered already-migrated or user-reordered and are skipped. Running
 * twice is a no-op for migrated rules.
 *
 * DRY_RUN=true by default.  Set DRY_RUN=false to write.
 *
 * Usage:
 *   # Dry run (default — no writes)
 *   pnpm tsx scripts/migrations/budget-tracker/normalise-rule-priorities.ts
 *
 *   # Execute
 *   DRY_RUN=false pnpm tsx scripts/migrations/budget-tracker/normalise-rule-priorities.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';

// ── Configuration ─────────────────────────────────────────────────────────────

const DRY_RUN    = process.env.DRY_RUN !== 'false';
const REGION     = 'ap-southeast-2';
const ACCOUNT_ID = 'aed9dcdf-81b5-47a1-a0d5-5afbae940e93';
const TABLE      = 'budget-tracker.rules-dev';

// Thresholds for identifying which rules need migration
const PRIORITY_BATCH_DEFAULT  = 100;         // original Lambda default — Population A
const PRIORITY_DATE_NOW_FLOOR = 1_000_000_000; // anything > 1 billion is a Date.now() — Population B

// Step between consecutive normalised priorities
const PRIORITY_STEP = 1000;

// ── DynamoDB ──────────────────────────────────────────────────────────────────

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

// ── Types ─────────────────────────────────────────────────────────────────────

interface RuleItem {
  accountId: string;
  ruleId: string;
  name: string;
  match: string;
  matchType: string;
  categoryId: string;
  subcategoryId: string;
  enabled: boolean;
  priority: number;
  isBusiness: boolean;
  learned: boolean;
  createdAt: string;
  [key: string]: unknown; // preserve any extra attributes
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadAllRules(): Promise<RuleItem[]> {
  const rules: RuleItem[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const resp = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'accountId = :aid',
      ExpressionAttributeValues: { ':aid': ACCOUNT_ID },
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    }));
    for (const item of resp.Items ?? []) {
      rules.push(item as RuleItem);
    }
    lastKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return rules;
}

function needsMigration(rule: RuleItem): boolean {
  return rule.priority === PRIORITY_BATCH_DEFAULT || rule.priority > PRIORITY_DATE_NOW_FLOOR;
}

// BatchWriteCommand supports max 25 items per call
async function batchPut(items: RuleItem[]): Promise<void> {
  const chunks: RuleItem[][] = [];
  for (let i = 0; i < items.length; i += 25) {
    chunks.push(items.slice(i, i + 25));
  }
  for (const chunk of chunks) {
    await ddb.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE]: chunk.map(item => ({
          PutRequest: { Item: item },
        })),
      },
    }));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nBudget Tracker — Normalise Rule Priorities');
  console.log(`Mode:    ${DRY_RUN ? 'DRY RUN (no writes)' : '⚠️  EXECUTE (writes to DynamoDB)'}`);
  console.log(`Account: ${ACCOUNT_ID}`);
  console.log(`Table:   ${TABLE}\n`);

  // ── Load all rules ──────────────────────────────────────────────────────────

  console.log('Loading rules from DynamoDB...');
  const allRules = await loadAllRules();
  console.log(`  Loaded ${allRules.length} total rules\n`);

  // ── Classify ────────────────────────────────────────────────────────────────

  const toMigrate = allRules.filter(needsMigration);
  const skipped   = allRules.filter(r => !needsMigration(r));

  const popA = toMigrate.filter(r => r.priority === PRIORITY_BATCH_DEFAULT);
  const popB = toMigrate.filter(r => r.priority > PRIORITY_DATE_NOW_FLOOR);

  console.log(`Classification:`);
  console.log(`  Population A (priority=${PRIORITY_BATCH_DEFAULT}):  ${popA.length} rules`);
  console.log(`  Population B (priority>10⁹):  ${popB.length} rules  (Date.now() values)`);
  console.log(`  Skipped (already migrated or user-reordered): ${skipped.length} rules`);
  console.log(`  Total to migrate: ${toMigrate.length}\n`);

  if (skipped.length > 0) {
    console.log('Skipped rules (keeping existing priority):');
    for (const r of skipped) {
      console.log(`  [${r.priority}] "${r.match}" (${r.ruleId.slice(0, 8)}...)`);
    }
    console.log('');
  }

  if (toMigrate.length === 0) {
    console.log('Nothing to migrate — all rules already have normalised priorities.');
    return;
  }

  // ── Sort alphabetically by match ────────────────────────────────────────────

  const sorted = [...toMigrate].sort((a, b) =>
    a.match.toLowerCase().localeCompare(b.match.toLowerCase())
  );

  // ── Compute new priorities ──────────────────────────────────────────────────

  console.log('Planned changes (match → old priority → new priority):');
  console.log(`${'#'.padEnd(4)} ${'Match'.padEnd(40)} ${'Old'.padStart(18)} ${'New'.padStart(8)} Learned`);
  console.log('-'.repeat(80));

  const updated: RuleItem[] = sorted.map((rule, idx) => {
    const newPriority = (idx + 1) * PRIORITY_STEP;
    const match = rule.match.length > 38 ? rule.match.slice(0, 37) + '…' : rule.match;
    console.log(
      `${String(idx + 1).padEnd(4)} ${match.padEnd(40)} ${String(rule.priority).padStart(18)} ${String(newPriority).padStart(8)} ${rule.learned ? 'learned' : ''}`
    );
    return { ...rule, priority: newPriority };
  });

  console.log('');
  console.log(`Priority range after migration: ${PRIORITY_STEP} – ${sorted.length * PRIORITY_STEP}`);
  console.log(`Step size: ${PRIORITY_STEP} (supports ~10 drag-and-drop halvings between adjacent rules)\n`);

  // ── Write ───────────────────────────────────────────────────────────────────

  if (DRY_RUN) {
    console.log('DRY RUN — no writes performed.');
    console.log('To execute: DRY_RUN=false pnpm tsx scripts/migrations/budget-tracker/normalise-rule-priorities.ts');
    return;
  }

  console.log(`Writing ${updated.length} updated rules to DynamoDB...`);
  await batchPut(updated);
  console.log('  Done.\n');

  // ── Verify ──────────────────────────────────────────────────────────────────

  console.log('Verifying...');
  const afterRules = await loadAllRules();
  const stillBroken = afterRules.filter(needsMigration);
  if (stillBroken.length > 0) {
    console.error(`  ⚠️  ${stillBroken.length} rules still have broken priorities after migration!`);
    for (const r of stillBroken) {
      console.error(`    [${r.priority}] "${r.match}"`);
    }
    process.exit(1);
  }

  const priorities = afterRules.map(r => r.priority).sort((a, b) => a - b);
  const allDistinct = new Set(priorities).size === priorities.length;
  console.log(`  Total rules: ${afterRules.length}`);
  console.log(`  All distinct priorities: ${allDistinct ? 'yes ✓' : 'NO — duplicates found!'}`);
  console.log(`  Priority range: ${priorities[0]} – ${priorities[priorities.length - 1]}`);
  console.log('\n✓ Migration complete.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
