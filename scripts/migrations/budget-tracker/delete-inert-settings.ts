/**
 * Budget Tracker — Delete Inert Settings Rows
 *
 * After the budget-data restructure (PR #225), BudgetSettings was slimmed to
 * contain only csvFormatMappings. The other 11 settingKey rows in DynamoDB are
 * now orphaned — the Lambda ignores them (whitelist filter), but they clutter
 * the table and inflate read costs.
 *
 * This script deletes all rows where settingKey !== 'csvFormatMappings'.
 *
 * DRY_RUN=true by default. Set DRY_RUN=false to execute.
 * Expected final count: 1 row per account.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const DRY_RUN         = process.env.DRY_RUN !== 'false';
const REGION          = 'ap-southeast-2';
const SETTINGS_TABLE  = process.env.SETTINGS_TABLE ?? 'budget-tracker.settings-dev';
const LIVE_KEY        = 'csvFormatMappings';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function main() {
  console.log('\nBudget Tracker — Delete Inert Settings Rows');
  console.log(`Mode:  ${DRY_RUN ? 'DRY RUN (no deletes)' : '⚠️  EXECUTE (deletes from DynamoDB)'}`);
  console.log(`Table: ${SETTINGS_TABLE}\n`);

  // Scan all rows
  const allItems: Array<{ accountId: string; settingKey: string }> = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: SETTINGS_TABLE,
      ProjectionExpression: 'accountId, settingKey',
      ExclusiveStartKey: lastKey,
    }));
    for (const item of res.Items ?? []) {
      allItems.push({ accountId: item['accountId'] as string, settingKey: item['settingKey'] as string });
    }
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  console.log(`Total rows in table: ${allItems.length}`);

  const liveRows  = allItems.filter(r => r.settingKey === LIVE_KEY);
  const inertRows = allItems.filter(r => r.settingKey !== LIVE_KEY);

  console.log(`Live rows  (${LIVE_KEY}): ${liveRows.length}`);
  console.log(`Inert rows (to delete): ${inertRows.length}`);

  if (inertRows.length === 0) {
    console.log('\nNothing to delete — table is already clean.\n');
    return;
  }

  console.log('\nInert rows:');
  for (const row of inertRows) {
    console.log(`  accountId=${row.accountId}  settingKey=${row.settingKey}`);
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN complete — no deletes made.');
    console.log('Re-run with DRY_RUN=false to execute.\n');
    return;
  }

  console.log('\nDeleting...');
  let deleted = 0;
  for (const row of inertRows) {
    await ddb.send(new DeleteCommand({
      TableName: SETTINGS_TABLE,
      Key: { accountId: row.accountId, settingKey: row.settingKey },
    }));
    console.log(`  ✓ deleted  accountId=${row.accountId}  settingKey=${row.settingKey}`);
    deleted++;
  }

  // Verify
  const verifyRes = await ddb.send(new ScanCommand({
    TableName: SETTINGS_TABLE,
    Select: 'COUNT',
  }));
  const finalCount = verifyRes.Count ?? 0;
  console.log(`\nDeleted: ${deleted} rows`);
  console.log(`Final row count: ${finalCount} (expected: ${liveRows.length})`);

  if (finalCount !== liveRows.length) {
    console.error(`\nERROR: row count mismatch — expected ${liveRows.length}, got ${finalCount}`);
    process.exit(1);
  }

  console.log('\n✓ Cleanup complete.\n');
}

main().catch(err => {
  console.error('\nFATAL:', err.message ?? err);
  process.exit(1);
});
