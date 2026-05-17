/**
 * Budget Tracker — Categories & Data Integrity Fix
 *
 * Applies schema cleanup for issue #178:
 *   - Rebuilds categories tree from export.json (renames, soft-deletes, adds missing, sets excludeFromCashflow)
 *   - Writes budget amounts and frequencies from export.json
 *   - Repairs 39 orphaned _ignore transactions → Transfer subcategory
 *   - Repairs 9 broken transactions with null subcategoryId
 *
 * DRY_RUN=true by default.  Set DRY_RUN=false to write.
 * STAGE 12 CHECKPOINT: run with DRY_RUN=true first; await Steve's go-ahead before executing.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DRY_RUN          = process.env.DRY_RUN !== 'false';
const REGION           = 'ap-southeast-2';
const ACCOUNT_ID       = 'aed9dcdf-81b5-47a1-a0d5-5afbae940e93';
const BUDGET_DATA_TABLE = 'budget-tracker.budget-data-dev';
const TXN_TABLE        = 'budget-tracker.transactions-dev';
const EXPORT_FILE      = path.resolve(__dirname, '../../../migration-artifacts/budget-tracker/settings/exports/export.json');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

// ─── Types ────────────────────────────────────────────────────────────────────

interface Subcategory {
  subcategoryId: string;
  name: string;
  displayOrder: number;
  deleted?: boolean;
  excludeFromCashflow?: boolean;
}

interface Category {
  categoryId: string;
  name: string;
  type: 'regular' | 'capital';
  displayOrder: number;
  subcategories: Subcategory[];
  deleted?: boolean;
}

interface ExportShape {
  budgetOverrides: Record<string, number>;
  budgetFreqs: Record<string, string>;
  customCategories: Record<string, string[]>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findSubByName(categories: Category[], name: string): Subcategory | undefined {
  for (const cat of categories) {
    const found = cat.subcategories.find(s => s.name === name);
    if (found) return found;
  }
  return undefined;
}

function findCatByName(categories: Category[], name: string): Category | undefined {
  return categories.find(c => c.name === name);
}

function newUUID(): string {
  return crypto.randomUUID();
}

function log(msg: string) {
  console.log(msg);
}

function warn(msg: string) {
  console.warn(`  ⚠️  ${msg}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nBudget Tracker — Categories & Data Fix`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : '⚠️  EXECUTE (writes to DynamoDB)'}`);
  console.log(`Account: ${ACCOUNT_ID}\n`);

  // ── Step 0: Load inputs ──────────────────────────────────────────────────

  const exportData: ExportShape = JSON.parse(fs.readFileSync(EXPORT_FILE, 'utf-8'));
  log(`Loaded export.json: ${Object.keys(exportData.budgetOverrides).length} budget overrides, ${Object.keys(exportData.budgetFreqs).length} frequencies`);

  const catResp = await ddb.send(new GetCommand({
    TableName: BUDGET_DATA_TABLE,
    Key: { accountId: ACCOUNT_ID, concept: 'categories' },
  }));
  if (!catResp.Item) throw new Error('categories not found in budget-data-dev table');
  const categories: Category[] = catResp.Item.value as Category[];
  log(`Loaded ${categories.length} categories from DynamoDB`);

  const amtResp = await ddb.send(new GetCommand({
    TableName: BUDGET_DATA_TABLE,
    Key: { accountId: ACCOUNT_ID, concept: 'budgetAmounts' },
  }));
  const existingAmounts: Record<string, number> = (amtResp.Item?.value ?? {}) as Record<string, number>;
  log(`Loaded ${Object.keys(existingAmounts).length} existing budget amounts\n`);

  // ── Step 1: Reconcile categories tree ────────────────────────────────────

  const updatedCategories: Category[] = JSON.parse(JSON.stringify(categories));

  // 1a. Soft-delete specified subcategories
  const toSoftDelete = ['Paying off debt', 'School fees reimbursement', 'Mortgage / rent'];
  for (const name of toSoftDelete) {
    let found = false;
    for (const cat of updatedCategories) {
      const sub = cat.subcategories.find(s => s.name === name && !s.deleted);
      if (sub) {
        sub.deleted = true;
        found = true;
        log(`  [SOFT-DELETE] ${cat.name} › ${name} (${sub.subcategoryId.slice(0, 8)})`);
      }
    }
    if (!found) warn(`Could not find subcategory to soft-delete: "${name}"`);
  }

  // 1b. Rename Education → Education & Professional Memberships
  const educationSub = findSubByName(updatedCategories, 'Education');
  if (educationSub) {
    const oldName = educationSub.name;
    educationSub.name = 'Education & Professional Memberships';
    log(`  [RENAME] "${oldName}" → "Education & Professional Memberships" (${educationSub.subcategoryId.slice(0, 8)})`);
  } else {
    warn('Could not find "Education" subcategory to rename');
  }

  // 1c. Set excludeFromCashflow: true on Transfer
  const transferSub = findSubByName(updatedCategories, 'Transfer');
  if (transferSub) {
    if (!transferSub.excludeFromCashflow) {
      transferSub.excludeFromCashflow = true;
      log(`  [EXCLUDE] Transfer subcategory (${transferSub.subcategoryId.slice(0, 8)}) → excludeFromCashflow: true`);
    } else {
      log(`  [SKIP] Transfer already has excludeFromCashflow: true`);
    }
  } else {
    warn('Could not find "Transfer" subcategory');
  }

  // 1d. Add missing subcategories to Financial & Insurance
  const finCat = findCatByName(updatedCategories, 'Financial & Insurance');
  if (!finCat) throw new Error('Could not find "Financial & Insurance" category');

  const homeLoanUUID = newUUID();
  if (!finCat.subcategories.find(s => s.name === 'Home loan' && !s.deleted)) {
    finCat.subcategories.push({ subcategoryId: homeLoanUUID, name: 'Home loan', displayOrder: Date.now() });
    log(`  [ADD] Financial & Insurance › Home loan (${homeLoanUUID.slice(0, 8)})`);
  } else {
    warn('Home loan already exists in Financial & Insurance');
  }

  const bankFeesUUID = newUUID();
  if (!finCat.subcategories.find(s => s.name === 'Bank fees' && !s.deleted)) {
    finCat.subcategories.push({ subcategoryId: bankFeesUUID, name: 'Bank fees', displayOrder: Date.now() + 1 });
    log(`  [ADD] Financial & Insurance › Bank fees (${bankFeesUUID.slice(0, 8)})`);
  } else {
    warn('Bank fees already exists in Financial & Insurance');
  }

  const excludedTxnUUID = newUUID();
  if (!finCat.subcategories.find(s => s.name === 'Excluded Transactions' && !s.deleted)) {
    finCat.subcategories.push({
      subcategoryId: excludedTxnUUID,
      name: 'Excluded Transactions',
      displayOrder: Date.now() + 2,
      excludeFromCashflow: true,
    });
    log(`  [ADD] Financial & Insurance › Excluded Transactions (${excludedTxnUUID.slice(0, 8)}) excludeFromCashflow: true`);
  } else {
    warn('Excluded Transactions already exists');
  }

  // 1e. Add Health insurance reimbursement to Income
  const incomeCat = findCatByName(updatedCategories, 'Income');
  if (!incomeCat) throw new Error('Could not find "Income" category');

  const healthReiUUID = newUUID();
  if (!incomeCat.subcategories.find(s => s.name === 'Health insurance reimbursement' && !s.deleted)) {
    incomeCat.subcategories.push({
      subcategoryId: healthReiUUID,
      name: 'Health insurance reimbursement',
      displayOrder: Date.now() + 3,
    });
    log(`  [ADD] Income › Health insurance reimbursement (${healthReiUUID.slice(0, 8)})`);
  } else {
    warn('Health insurance reimbursement already exists in Income');
  }

  // ── Step 2: Build budget amounts from export.json ─────────────────────────

  // Re-read updated categories to build name → UUID map
  const nameToUUID: Record<string, string> = {};
  for (const cat of updatedCategories) {
    for (const sub of cat.subcategories) {
      if (!sub.deleted) nameToUUID[sub.name] = sub.subcategoryId;
    }
  }

  const newAmounts: Record<string, number> = { ...existingAmounts };
  let budgetWriteCount = 0;
  const missingSubcategories: string[] = [];

  for (const [subName, amount] of Object.entries(exportData.budgetOverrides)) {
    const uuid = nameToUUID[subName];
    if (!uuid) {
      missingSubcategories.push(subName);
      continue;
    }
    // Only write non-zero amounts (zero budget = no entry)
    if (amount > 0) {
      newAmounts[uuid] = amount;
      budgetWriteCount++;
      log(`  [BUDGET] ${subName} (${uuid.slice(0, 8)}) → ${amount}`);
    }
  }

  if (missingSubcategories.length > 0) {
    warn(`Could not find UUIDs for ${missingSubcategories.length} subcategories in export:`);
    missingSubcategories.forEach(n => warn(`  missing: "${n}"`));
  }

  // ── Step 3: Build budget frequencies from export.json ────────────────────

  const newFrequencies: Record<string, string> = {};
  let freqWriteCount = 0;

  for (const [subName, freq] of Object.entries(exportData.budgetFreqs)) {
    const uuid = nameToUUID[subName];
    if (!uuid) {
      warn(`No UUID for frequency entry: "${subName}"`);
      continue;
    }
    newFrequencies[uuid] = freq;
    freqWriteCount++;
    log(`  [FREQ] ${subName} (${uuid.slice(0, 8)}) → ${freq}`);
  }

  // ── Step 4: Find and repair transactions ─────────────────────────────────

  log('\nQuerying all transactions for account...');
  const allTransactions: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TXN_TABLE,
      KeyConditionExpression: 'accountId = :aid',
      ExpressionAttributeValues: { ':aid': ACCOUNT_ID },
      ExclusiveStartKey: lastKey,
    }));
    allTransactions.push(...(res.Items ?? []) as Record<string, unknown>[]);
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  log(`Loaded ${allTransactions.length} transactions\n`);

  // 4a. _ignore transactions → Transfer
  const transferFullUUID = transferSub?.subcategoryId;
  const finCatId = finCat.categoryId;

  const ignoreTransactions = allTransactions.filter(t => (t as Record<string, unknown>)['_ignore'] === true);
  log(`Found ${ignoreTransactions.length} transactions with _ignore: true → will reroute to Transfer subcategory`);
  if (transferFullUUID) {
    ignoreTransactions.slice(0, 5).forEach(t => {
      log(`  e.g. txnId=${String(t['transactionId']).slice(0, 8)} desc="${String(t['description']).slice(0, 50)}"`);
    });
    if (ignoreTransactions.length > 5) log(`  ... and ${ignoreTransactions.length - 5} more`);
  } else {
    warn('Transfer subcategory UUID not found — cannot repair _ignore transactions');
  }

  // 4b. Broken transactions with null subcategoryId (Home loan, Bank fees, Health insurance reimbursement)
  const nullSubTxns = allTransactions.filter(t => !t['subcategoryId'] && !t['_ignore']);

  const homeLoanPatterns = /home\s*loan|mortgage\s*repayment/i;
  const bankFeePatterns  = /bank\s*fee|account\s*fee|monthly\s*fee/i;
  const healthReiPatterns = /health\s*ins.*reimb|medibank.*reimb|bupa.*reimb/i;

  const brokenHomeLoan  = nullSubTxns.filter(t => homeLoanPatterns.test(String(t['description'] ?? '')));
  const brokenBankFees  = nullSubTxns.filter(t => bankFeePatterns.test(String(t['description'] ?? '')));
  const brokenHealthRei = nullSubTxns.filter(t => healthReiPatterns.test(String(t['description'] ?? '')));

  log(`\nBroken transactions with null subcategoryId (pattern-matched):`);
  log(`  Home loan pattern:                 ${brokenHomeLoan.length} txn(s)`);
  brokenHomeLoan.forEach(t => log(`    ${String(t['transactionId']).slice(0,8)} "${t['description']}"`));
  log(`  Bank fees pattern:                 ${brokenBankFees.length} txn(s)`);
  brokenBankFees.forEach(t => log(`    ${String(t['transactionId']).slice(0,8)} "${t['description']}"`));
  log(`  Health insurance reimbursement:    ${brokenHealthRei.length} txn(s)`);
  brokenHealthRei.forEach(t => log(`    ${String(t['transactionId']).slice(0,8)} "${t['description']}"`));

  const remainingNullSub = nullSubTxns.filter(t =>
    !homeLoanPatterns.test(String(t['description'] ?? '')) &&
    !bankFeePatterns.test(String(t['description'] ?? '')) &&
    !healthReiPatterns.test(String(t['description'] ?? ''))
  );
  log(`\nRemaining null-subcategoryId (uncategorised, no repair): ${remainingNullSub.length}`);

  // ── Step 5: Summary ───────────────────────────────────────────────────────

  console.log('\n' + '─'.repeat(60));
  console.log('DRY-RUN SUMMARY');
  console.log('─'.repeat(60));
  console.log(`Categories to update:    1 (rename 1, soft-delete 3, add 4, set excludeFromCashflow 2)`);
  console.log(`Budget amounts to write: ${budgetWriteCount} (from export) + ${Object.keys(existingAmounts).length} preserved`);
  console.log(`Budget freqs to write:   ${freqWriteCount}`);
  console.log(`_ignore txns to repair:  ${ignoreTransactions.length} → Transfer (${transferFullUUID?.slice(0,8) ?? 'MISSING'})`);
  console.log(`Broken txns to repair:   ${brokenHomeLoan.length + brokenBankFees.length + brokenHealthRei.length}`);
  console.log(`  Home loan:             ${brokenHomeLoan.length}`);
  console.log(`  Bank fees:             ${brokenBankFees.length}`);
  console.log(`  Health insurance rei.: ${brokenHealthRei.length}`);
  console.log('─'.repeat(60));

  if (DRY_RUN) {
    console.log('\nDRY RUN complete — no writes made.');
    console.log('Re-run with DRY_RUN=false to execute.\n');
    return;
  }

  // ── Step 6: Execute writes ────────────────────────────────────────────────

  console.log('\nExecuting writes...');

  // Write updated categories
  await ddb.send(new PutCommand({
    TableName: BUDGET_DATA_TABLE,
    Item: { accountId: ACCOUNT_ID, concept: 'categories', value: updatedCategories, updatedAt: new Date().toISOString() },
  }));
  log('  ✓ categories written');

  // Write budget amounts
  await ddb.send(new PutCommand({
    TableName: BUDGET_DATA_TABLE,
    Item: { accountId: ACCOUNT_ID, concept: 'budgetAmounts', value: newAmounts, updatedAt: new Date().toISOString() },
  }));
  log(`  ✓ budgetAmounts written (${Object.keys(newAmounts).length} entries)`);

  // Write budget frequencies
  await ddb.send(new PutCommand({
    TableName: BUDGET_DATA_TABLE,
    Item: { accountId: ACCOUNT_ID, concept: 'budgetFrequencies', value: newFrequencies, updatedAt: new Date().toISOString() },
  }));
  log(`  ✓ budgetFrequencies written (${Object.keys(newFrequencies).length} entries)`);

  // Repair _ignore transactions → Transfer
  if (transferFullUUID) {
    let repaired = 0;
    for (const tx of ignoreTransactions) {
      const txId = String(tx['transactionId']);
      await ddb.send(new UpdateCommand({
        TableName: TXN_TABLE,
        Key: { accountId: ACCOUNT_ID, transactionId: txId },
        UpdateExpression: 'SET categoryId = :catId, subcategoryId = :subId, dateIso = dateIso REMOVE #ig',
        ExpressionAttributeNames: { '#ig': '_ignore' },
        ExpressionAttributeValues: { ':catId': finCatId, ':subId': transferFullUUID },
      }));
      repaired++;
    }
    log(`  ✓ Repaired ${repaired} _ignore transactions → Transfer`);
  }

  // Repair broken Home loan transactions
  const homeLoanActualUUID = nameToUUID['Home loan'] ?? homeLoanUUID;
  for (const tx of brokenHomeLoan) {
    await ddb.send(new UpdateCommand({
      TableName: TXN_TABLE,
      Key: { accountId: ACCOUNT_ID, transactionId: String(tx['transactionId']) },
      UpdateExpression: 'SET categoryId = :catId, subcategoryId = :subId',
      ExpressionAttributeValues: { ':catId': finCatId, ':subId': homeLoanActualUUID },
    }));
  }
  if (brokenHomeLoan.length > 0) log(`  ✓ Repaired ${brokenHomeLoan.length} Home loan transactions`);

  // Repair broken Bank fees transactions
  const bankFeesActualUUID = nameToUUID['Bank fees'] ?? bankFeesUUID;
  for (const tx of brokenBankFees) {
    await ddb.send(new UpdateCommand({
      TableName: TXN_TABLE,
      Key: { accountId: ACCOUNT_ID, transactionId: String(tx['transactionId']) },
      UpdateExpression: 'SET categoryId = :catId, subcategoryId = :subId',
      ExpressionAttributeValues: { ':catId': finCatId, ':subId': bankFeesActualUUID },
    }));
  }
  if (brokenBankFees.length > 0) log(`  ✓ Repaired ${brokenBankFees.length} Bank fees transactions`);

  // Repair broken Health insurance reimbursement transactions
  const incCatId = incomeCat.categoryId;
  const healthReiActualUUID = nameToUUID['Health insurance reimbursement'] ?? healthReiUUID;
  for (const tx of brokenHealthRei) {
    await ddb.send(new UpdateCommand({
      TableName: TXN_TABLE,
      Key: { accountId: ACCOUNT_ID, transactionId: String(tx['transactionId']) },
      UpdateExpression: 'SET categoryId = :catId, subcategoryId = :subId',
      ExpressionAttributeValues: { ':catId': incCatId, ':subId': healthReiActualUUID },
    }));
  }
  if (brokenHealthRei.length > 0) log(`  ✓ Repaired ${brokenHealthRei.length} Health insurance reimbursement transactions`);

  console.log('\n✓ All writes complete.\n');
}

main().catch(err => {
  console.error('\nFATAL:', err.message ?? err);
  process.exit(1);
});
