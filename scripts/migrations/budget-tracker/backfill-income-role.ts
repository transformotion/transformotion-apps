/**
 * Budget Tracker — M21 income-role backfill
 *
 * Sets `role: 'income'` on every category historically named "Income" (the
 * deprecated name-match that PR-2 removed from domain code). Idempotent: a
 * category that already carries `role: 'income'` is left untouched, and a row
 * with no matching category is not rewritten.
 *
 * Scope: iterates the `categories` concept rows in the budget-data table. Pass
 * ACCOUNT_ID to restrict to a single account; otherwise every account's
 * categories row is scanned.
 *
 * DRY_RUN=true by default. Set DRY_RUN=false to write.
 * Run DRY_RUN=true first and await owner go-ahead before executing (see the
 * PR body's "Backfill: script vs lazy" proposal — this script is the
 * script-based option pending owner acknowledgement).
 *
 *   STAGE=dev DRY_RUN=true  pnpm tsx scripts/migrations/budget-tracker/backfill-income-role.ts
 *   STAGE=dev DRY_RUN=false pnpm tsx scripts/migrations/budget-tracker/backfill-income-role.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const DRY_RUN = process.env.DRY_RUN !== 'false';
const REGION = process.env.AWS_REGION || 'ap-southeast-2';
const STAGE = process.env.STAGE || 'dev';
const BUDGET_DATA_TABLE = process.env.BUDGET_DATA_TABLE || `budget-tracker.budget-data-${STAGE}`;
const ACCOUNT_ID = process.env.ACCOUNT_ID || null;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

interface Subcategory {
  subcategoryId: string;
  name: string;
  role?: 'income' | 'savings';
  [k: string]: unknown;
}
interface Category {
  categoryId: string;
  name: string;
  role?: 'income' | 'savings';
  subcategories: Subcategory[];
  [k: string]: unknown;
}
interface CategoriesRow {
  accountId: string;
  concept: 'categories';
  value: Category[];
  updatedAt?: string;
}

/** Apply the backfill to one categories array. Returns [updated, changed]. */
function backfillCategories(categories: Category[]): [Category[], boolean] {
  let changed = false;
  const updated = categories.map((cat) => {
    if (cat.name?.trim().toLowerCase() === 'income' && cat.role !== 'income') {
      changed = true;
      return { ...cat, role: 'income' as const };
    }
    return cat;
  });
  return [updated, changed];
}

async function loadRows(): Promise<CategoriesRow[]> {
  if (ACCOUNT_ID) {
    const resp = await ddb.send(
      new GetCommand({ TableName: BUDGET_DATA_TABLE, Key: { accountId: ACCOUNT_ID, concept: 'categories' } }),
    );
    return resp.Item ? [resp.Item as CategoriesRow] : [];
  }
  const rows: CategoriesRow[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const resp = await ddb.send(
      new ScanCommand({
        TableName: BUDGET_DATA_TABLE,
        FilterExpression: 'concept = :c',
        ExpressionAttributeValues: { ':c': 'categories' },
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of resp.Items ?? []) rows.push(item as CategoriesRow);
    lastKey = resp.LastEvaluatedKey;
  } while (lastKey);
  return rows;
}

async function main() {
  console.log(`[backfill-income-role] table=${BUDGET_DATA_TABLE} region=${REGION} dryRun=${DRY_RUN} account=${ACCOUNT_ID ?? 'ALL'}`);
  const rows = await loadRows();
  console.log(`[backfill-income-role] scanned ${rows.length} categories row(s)`);

  let rowsChanged = 0;
  let categoriesTagged = 0;
  for (const row of rows) {
    const cats = Array.isArray(row.value) ? row.value : [];
    const [updated, changed] = backfillCategories(cats);
    if (!changed) continue;
    rowsChanged++;
    categoriesTagged += updated.filter((c, i) => c.role === 'income' && cats[i]?.role !== 'income').length;
    console.log(`  account ${row.accountId}: tagging Income categor(y/ies) → role:'income'`);
    if (!DRY_RUN) {
      await ddb.send(
        new PutCommand({
          TableName: BUDGET_DATA_TABLE,
          Item: { ...row, value: updated, updatedAt: new Date().toISOString() },
        }),
      );
    }
  }

  console.log(
    `[backfill-income-role] ${DRY_RUN ? 'DRY RUN — no writes. ' : ''}rows changed=${rowsChanged}, categories tagged=${categoriesTagged}`,
  );
  if (DRY_RUN) console.log('[backfill-income-role] set DRY_RUN=false to apply.');
}

main().catch((err) => {
  console.error('[backfill-income-role] failed:', err);
  process.exit(1);
});
