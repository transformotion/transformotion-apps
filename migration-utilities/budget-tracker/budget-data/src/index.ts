/**
 * Budget Data Migration Lambda
 *
 * One-shot migration for Steve's account (aed9dcdf-81b5-47a1-a0d5-5afbae940e93).
 * Idempotent — safe to re-run. Resumes incomplete runs.
 *
 * What it does:
 * 1. Builds a categories tree from the live settings export (customCategories) merged with defaults
 * 2. Applies Capital Purchases promotion (F&I subcategory → top-level capital category)
 * 3. Mints stable UUIDs for all categories and subcategories
 * 4. Writes categories, budgetAmounts, budgetFrequencies to budget-data table
 * 5. Writes csvFormatMappings to slimmed settings table
 * 6. Backfills categoryId/subcategoryId on all 732 transactions
 * 7. Backfills categoryId/subcategoryId on all 73 matching rules
 *
 * POST /api/migrations/budget-tracker/budget-data/run
 * Body: { accountId: string }
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import { withAuth, parseBody, ok, requireAccountData } from '@transformotion/lambda-middleware';
import { dynamoMembershipLoader } from '@transformotion/fn-account-membership';
import { randomUUID } from 'crypto';
import type { Category, Subcategory } from '@transformotion/budget-domain';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE!;
const RULES_TABLE        = process.env.RULES_TABLE!;
// D9: this import writes account data → write tier (live membership row; viewer/
// disabled/removed → 403). No site-admin bypass — a migration is a data write
// and requires account membership like any other write.
const btData = requireAccountData('budget-tracker');
const membershipLoader = dynamoMembershipLoader(ddb, process.env.ACCOUNT_MEMBERS_TABLE!);
const SETTINGS_TABLE     = process.env.SETTINGS_TABLE!;
const BUDGET_DATA_TABLE  = process.env.BUDGET_DATA_TABLE!;

// ── Default category templates (v0 prototype defaults + user's customizations) ─

type CategoriesToSubcategories = Record<string, string[]>;

// These are the baseline BUDGET_CATEGORIES from the v0 prototype.
// The migration merges these with the user's customCategories from DynamoDB settings.
const BASE_CATEGORIES: CategoriesToSubcategories = {
  'Income': [
    "Your take-home pay", "Your partner's take-home pay", "Bonuses / overtime",
    "Income from savings and investments", "Child support received",
    "School fees reimbursement", "Rent (investment property)", "Other income",
  ],
  'Home & utilities': [
    "Mortgage / rent", "Water", "Gas", "Electricity", "Mobile", "Internet",
    "Streaming Services", "Home improvements & Maintenance", "Furniture & appliances",
    "Council rates", "Body corporate fees", "Kierans Mobile", "Ellas Mobile",
  ],
  'Financial & Insurance': [
    "Savings", "Investments & super contributions", "Charity donations",
    "Paying off debt", "Credit card interest", "Other loans", "Car loan",
    "Home & contents insurance", "Health insurance", "Car insurance",
    "Personal & life insurance", "Transfer", "Capital purchases",
  ],
  'Groceries': [
    "Supermarket", "Deli & bakery", "Fruit & veg market",
    "Cleaning products", "Toiletries", "Pet food",
  ],
  'Medical, personal & education': [
    "Doctors & medical", "Medicines & pharmacy", "Glasses & eye care", "Dental",
    "Education", "Computers & gadgets", "Sports & gym", "Clothing & shoes",
    "Cosmetics", "Hair & beauty", "Shopping", "Hobbies", "Pet care / vet / pet insurance",
  ],
  'Eating-out & Entertainment': [
    "Coffee & tea", "Lunches bought", "Take-away & snacks", "Drinks & alcohol",
    "Restaurants", "Bars & clubs", "Movies shows & music", "Books newspapers & magazines",
    "Celebrations & gifts", "Holidays",
  ],
  'Car & Transport': [
    "Petrol", "Road tolls & parking", "Repairs & maintenance", "Rego & licence",
    "Uber & taxi", "Public Transport", "Airfares",
  ],
  'Children': [
    "Children Clothing", "Childcare", "Babysitting", "School fees", "School uniforms",
    "Excursions", "Other school needs", "Children Sports & activities", "Toys",
    "Child support payment",
  ],
  'Renovations': [
    "Planning & design", "Building & labour", "Materials & supplies",
    "Fixtures & fittings", "Appliances", "Landscaping & outdoor", "Other renovation costs",
  ],
};

// Label drift mappings — old labels in transactions/rules that differ from current canonical labels
// Maps old label → canonical label in the merged category tree
const LABEL_ALIASES: Record<string, string> = {
  "Movies, shows & music":             "Movies shows & music",
  "Books, newspapers & magazines":     "Books newspapers & magazines",
  "Mortgage / rent":                   "Mortgage / rent",
  "Education & Professional Memberships": "Education",
};

type CategoryType = 'regular' | 'capital';

const CATEGORY_TYPES: Record<string, CategoryType> = {
  'Renovations':        'capital',
  'Capital Purchases':  'capital',
};

// ── Build merged category tree ─────────────────────────────────────────────────

function buildMergedCategories(
  customCategories: Record<string, string[]>,
): CategoriesToSubcategories {
  const merged: CategoriesToSubcategories = {};

  for (const [cat, defaultSubs] of Object.entries(BASE_CATEGORIES)) {
    // If user has a customCategories override for this category, use it; else use defaults
    if (customCategories[cat]) {
      merged[cat] = customCategories[cat];
    } else {
      merged[cat] = [...defaultSubs];
    }
  }

  // Add any customCategories keys not in BASE_CATEGORIES (fully user-created top-level categories)
  for (const [cat, subs] of Object.entries(customCategories)) {
    if (!(cat in merged)) {
      merged[cat] = subs;
    }
  }

  return merged;
}

// ── Mint UUIDs and build label lookup map ──────────────────────────────────────

interface CategoryTreeResult {
  categoryTree: Category[];
  // Maps 'category:<name>' → categoryId
  // Maps 'subcategory:<catName>:<subName>' → subcategoryId
  labelToUuid: Map<string, string>;
}

function buildCategoryTree(
  mergedCategories: CategoriesToSubcategories,
): CategoryTreeResult {
  const labelToUuid = new Map<string, string>();
  const categoryTree: Category[] = [];
  let categoryOrder = 1;

  for (const [categoryName, subcategoryNames] of Object.entries(mergedCategories)) {
    // Skip Financial & Insurance > Capital purchases — it becomes a top-level category
    const filteredSubs = subcategoryNames.filter(s => {
      if (categoryName === 'Financial & Insurance' && s === 'Capital purchases') return false;
      return true;
    });

    const categoryId = randomUUID();
    labelToUuid.set(`category:${categoryName}`, categoryId);

    const subcategories: Subcategory[] = [];
    let subOrder = 1;
    for (const subName of filteredSubs) {
      const subcategoryId = randomUUID();
      labelToUuid.set(`subcategory:${categoryName}:${subName}`, subcategoryId);
      // Also register alias labels for label-drift support
      for (const [alias, canonical] of Object.entries(LABEL_ALIASES)) {
        if (canonical === subName) {
          labelToUuid.set(`subcategory:${categoryName}:${alias}`, subcategoryId);
        }
      }
      subcategories.push({ subcategoryId, name: subName, displayOrder: subOrder++ });
    }

    // If all subs were filtered out, add a default
    if (subcategories.length === 0) {
      const subcategoryId = randomUUID();
      labelToUuid.set(`subcategory:${categoryName}:${categoryName} subcategory`, subcategoryId);
      subcategories.push({ subcategoryId, name: `${categoryName} subcategory`, displayOrder: 1 });
    }

    categoryTree.push({
      categoryId,
      name: categoryName,
      type: CATEGORY_TYPES[categoryName] ?? 'regular',
      displayOrder: categoryOrder++,
      subcategories,
    });
  }

  // Add Capital Purchases as a new top-level capital category
  const capitalPurchasesCategoryId = randomUUID();
  const newCarSubcategoryId = randomUUID();
  labelToUuid.set('category:Capital Purchases', capitalPurchasesCategoryId);
  labelToUuid.set('subcategory:Capital Purchases:New Car', newCarSubcategoryId);
  // Old transactions tagged as Financial & Insurance > Capital purchases → Capital Purchases > New Car
  labelToUuid.set('subcategory:Financial & Insurance:Capital purchases', newCarSubcategoryId);
  labelToUuid.set('__capitalPurchasesCategoryId__', capitalPurchasesCategoryId);

  categoryTree.push({
    categoryId: capitalPurchasesCategoryId,
    name: 'Capital Purchases',
    type: 'capital',
    displayOrder: categoryOrder,
    subcategories: [{ subcategoryId: newCarSubcategoryId, name: 'New Car', displayOrder: 1 }],
  });

  return { categoryTree, labelToUuid };
}

// ── DynamoDB helpers ──────────────────────────────────────────────────────────

async function writeBudgetDataItem(
  accountId: string,
  concept: string,
  value: unknown,
): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: BUDGET_DATA_TABLE,
    Item: { accountId, concept, value, migratedAt: new Date().toISOString() },
  }));
}

async function budgetDataItemExists(accountId: string, concept: string): Promise<boolean> {
  const res = await ddb.send(new GetCommand({
    TableName: BUDGET_DATA_TABLE,
    Key: { accountId, concept },
  }));
  return !!res.Item;
}

async function scanAll<T>(table: string, accountId: string): Promise<T[]> {
  const items: T[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: table,
      KeyConditionExpression: 'accountId = :aid',
      ExpressionAttributeValues: { ':aid': accountId },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(res.Items ?? []) as T[]);
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return items;
}

// ── Read customCategories from settings table ──────────────────────────────────

async function readCustomCategories(accountId: string): Promise<Record<string, string[]>> {
  const res = await ddb.send(new QueryCommand({
    TableName: SETTINGS_TABLE,
    KeyConditionExpression: 'accountId = :aid AND settingKey = :key',
    ExpressionAttributeValues: { ':aid': accountId, ':key': 'customCategories' },
  }));
  return (res.Items?.[0]?.['value'] as Record<string, string[]>) ?? {};
}

async function readBudgetOverrides(accountId: string): Promise<Record<string, number>> {
  const res = await ddb.send(new QueryCommand({
    TableName: SETTINGS_TABLE,
    KeyConditionExpression: 'accountId = :aid AND settingKey = :key',
    ExpressionAttributeValues: { ':aid': accountId, ':key': 'budgetOverrides' },
  }));
  return (res.Items?.[0]?.['value'] as Record<string, number>) ?? {};
}

async function readBudgetFreqs(accountId: string): Promise<Record<string, string>> {
  const res = await ddb.send(new QueryCommand({
    TableName: SETTINGS_TABLE,
    KeyConditionExpression: 'accountId = :aid AND settingKey = :key',
    ExpressionAttributeValues: { ':aid': accountId, ':key': 'budgetFreqs' },
  }));
  return (res.Items?.[0]?.['value'] as Record<string, string>) ?? {};
}

async function readCsvFormatMappings(accountId: string): Promise<Record<string, unknown>> {
  const res = await ddb.send(new QueryCommand({
    TableName: SETTINGS_TABLE,
    KeyConditionExpression: 'accountId = :aid AND settingKey = :key',
    ExpressionAttributeValues: { ':aid': accountId, ':key': 'csvFormatMappings' },
  }));
  return (res.Items?.[0]?.['value'] as Record<string, unknown>) ?? {};
}

// ── Resolve subcategoryId for a label in any category ─────────────────────────

function resolveSubcategoryId(
  labelToUuid: Map<string, string>,
  categoryLabel: string,
  subcategoryLabel: string,
): { categoryId: string | null; subcategoryId: string | null } {
  // Handle canonical alias normalisation
  const normSubLabel = LABEL_ALIASES[subcategoryLabel] ?? subcategoryLabel;
  const normCatLabel = LABEL_ALIASES[categoryLabel]    ?? categoryLabel;

  // Special case: F&I > Capital purchases → Capital Purchases > New Car
  if (normCatLabel === 'Financial & Insurance' && normSubLabel === 'Capital purchases') {
    const capitalCatId = labelToUuid.get('__capitalPurchasesCategoryId__') ?? null;
    const newCarSubId  = labelToUuid.get('subcategory:Financial & Insurance:Capital purchases') ?? null;
    return { categoryId: capitalCatId, subcategoryId: newCarSubId };
  }

  const categoryId = labelToUuid.get(`category:${normCatLabel}`) ?? null;
  const subcategoryId = labelToUuid.get(`subcategory:${normCatLabel}:${normSubLabel}`)
    ?? labelToUuid.get(`subcategory:${normCatLabel}:${subcategoryLabel}`)
    ?? null;

  return { categoryId, subcategoryId };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = withAuth(async ({ auth, account, event }) => {
  await btData.write(auth, account.accountId, membershipLoader);
  const { accountId } = account;

  const body = parseBody<{ dryRun?: boolean }>(event);
  const dryRun = body.dryRun === true;

  // ── Step 1: Read customCategories and budget data from settings ──────────────
  const [customCategories, budgetOverrides, budgetFreqs, csvFormatMappings] = await Promise.all([
    readCustomCategories(accountId),
    readBudgetOverrides(accountId),
    readBudgetFreqs(accountId),
    readCsvFormatMappings(accountId),
  ]);

  // ── Step 2: Build merged category tree and mint UUIDs ─────────────────────
  const merged = buildMergedCategories(customCategories);
  const { categoryTree, labelToUuid } = buildCategoryTree(merged);

  // ── Step 3: Write categories to budget-data (idempotent: skip if exists) ──
  const categoriesAlreadyMigrated = await budgetDataItemExists(accountId, 'categories');
  if (!categoriesAlreadyMigrated && !dryRun) {
    await writeBudgetDataItem(accountId, 'categories', categoryTree);
  }

  // ── Step 4: Build and write budgetAmounts ─────────────────────────────────
  const budgetAmounts: Record<string, number> = {};

  for (const [subcategoryLabel, amount] of Object.entries(budgetOverrides)) {
    if (amount === -1) continue; // tombstoned

    // Find which category this subcategory belongs to by scanning all categories
    let resolved: { categoryId: string | null; subcategoryId: string | null } | null = null;
    for (const catName of Object.keys(merged)) {
      const candidate = resolveSubcategoryId(labelToUuid, catName, subcategoryLabel);
      if (candidate.subcategoryId) { resolved = candidate; break; }
    }

    if (resolved?.subcategoryId) {
      budgetAmounts[resolved.subcategoryId] = amount;
    } else {
      console.warn(`budgetOverrides: could not resolve subcategoryId for "${subcategoryLabel}"`);
    }
  }

  // Hardcoded known values
  const renovationsPlanningId = labelToUuid.get('subcategory:Renovations:Planning & design');
  if (renovationsPlanningId) budgetAmounts[renovationsPlanningId] = 50000;

  const newCarId = labelToUuid.get('subcategory:Financial & Insurance:Capital purchases');
  if (newCarId) budgetAmounts[newCarId] = 150000;

  const budgetAmountsAlreadyMigrated = await budgetDataItemExists(accountId, 'budgetAmounts');
  if (!budgetAmountsAlreadyMigrated && !dryRun) {
    await writeBudgetDataItem(accountId, 'budgetAmounts', budgetAmounts);
  }

  // ── Step 5: Build and write budgetFrequencies ─────────────────────────────
  const budgetFrequencies: Record<string, string> = {};

  for (const [subcategoryLabel, freq] of Object.entries(budgetFreqs)) {
    for (const catName of Object.keys(merged)) {
      const candidate = resolveSubcategoryId(labelToUuid, catName, subcategoryLabel);
      if (candidate.subcategoryId) {
        budgetFrequencies[candidate.subcategoryId] = freq;
        break;
      }
    }
  }

  const budgetFreqsAlreadyMigrated = await budgetDataItemExists(accountId, 'budgetFrequencies');
  if (!budgetFreqsAlreadyMigrated && !dryRun) {
    await writeBudgetDataItem(accountId, 'budgetFrequencies', budgetFrequencies);
  }

  // ── Step 6: Write csvFormatMappings to slimmed settings table ─────────────
  if (!dryRun) {
    await ddb.send(new PutCommand({
      TableName: SETTINGS_TABLE,
      Item: {
        accountId,
        settingKey: 'csvFormatMappings',
        value: csvFormatMappings,
        updatedAt: new Date().toISOString(),
      },
    }));
  }

  // ── Step 7: Backfill transactions ─────────────────────────────────────────
  type TxRecord = {
    transactionId: string;
    categoryId?: string | null;
    subcategoryId?: string | null;
    category?: string;
    subcategory?: string;
  };
  const transactions = await scanAll<TxRecord>(TRANSACTIONS_TABLE, accountId);

  let txMigrated = 0;
  let txAlreadyDone = 0;
  let txUnresolved = 0;

  for (const tx of transactions) {
    // Idempotent: skip if already has categoryId set
    if (tx.categoryId !== undefined && tx.categoryId !== null) {
      txAlreadyDone++;
      continue;
    }

    const categoryLabel   = tx.category   ?? '';
    const subcategoryLabel = tx.subcategory ?? '';

    if (!categoryLabel && !subcategoryLabel) {
      // Already uncategorised — write null IDs explicitly
      if (!dryRun) {
        await ddb.send(new UpdateCommand({
          TableName: TRANSACTIONS_TABLE,
          Key: { accountId, transactionId: tx.transactionId },
          UpdateExpression: 'SET categoryId = :null, subcategoryId = :null',
          ExpressionAttributeValues: { ':null': null },
        }));
      }
      txMigrated++;
      continue;
    }

    const resolved = resolveSubcategoryId(labelToUuid, categoryLabel, subcategoryLabel);

    if (!resolved.categoryId && !resolved.subcategoryId && (categoryLabel || subcategoryLabel)) {
      console.warn(`TX ${tx.transactionId}: unresolved labels category="${categoryLabel}" subcategory="${subcategoryLabel}"`);
      txUnresolved++;
    }

    if (!dryRun) {
      await ddb.send(new UpdateCommand({
        TableName: TRANSACTIONS_TABLE,
        Key: { accountId, transactionId: tx.transactionId },
        UpdateExpression: 'SET categoryId = :catId, subcategoryId = :subId',
        ExpressionAttributeValues: {
          ':catId': resolved.categoryId,
          ':subId': resolved.subcategoryId,
        },
      }));
    }
    txMigrated++;
  }

  // ── Step 8: Backfill matching rules ───────────────────────────────────────
  type RuleRecord = {
    ruleId: string;
    categoryId?: string | null;
    subcategoryId?: string | null;
    category?: string;
    subcategory?: string;
  };
  const rules = await scanAll<RuleRecord>(RULES_TABLE, accountId);

  let rulesMigrated = 0;
  let rulesAlreadyDone = 0;
  let rulesUnresolved = 0;

  for (const rule of rules) {
    if (rule.categoryId !== undefined && rule.categoryId !== null) {
      rulesAlreadyDone++;
      continue;
    }

    const categoryLabel    = rule.category    ?? '';
    const subcategoryLabel = rule.subcategory ?? '';

    const resolved = resolveSubcategoryId(labelToUuid, categoryLabel, subcategoryLabel);

    if (!resolved.categoryId && (categoryLabel || subcategoryLabel)) {
      console.warn(`Rule ${rule.ruleId}: unresolved labels category="${categoryLabel}" subcategory="${subcategoryLabel}"`);
      rulesUnresolved++;
    }

    if (!dryRun) {
      await ddb.send(new UpdateCommand({
        TableName: RULES_TABLE,
        Key: { accountId, ruleId: rule.ruleId },
        UpdateExpression: 'SET categoryId = :catId, subcategoryId = :subId',
        ExpressionAttributeValues: {
          ':catId': resolved.categoryId,
          ':subId': resolved.subcategoryId,
        },
      }));
    }
    rulesMigrated++;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary = {
    dryRun,
    categoriesAlreadyMigrated,
    categoryCount: categoryTree.length,
    budgetAmountsCount: Object.keys(budgetAmounts).length,
    budgetFrequenciesCount: Object.keys(budgetFrequencies).length,
    transactions: { migrated: txMigrated, alreadyDone: txAlreadyDone, unresolved: txUnresolved },
    rules: { migrated: rulesMigrated, alreadyDone: rulesAlreadyDone, unresolved: rulesUnresolved },
  };

  if (process.env.NODE_ENV !== 'test') {
    console.log('Migration summary:', JSON.stringify(summary, null, 2));
    if (txUnresolved > 0 || rulesUnresolved > 0) {
      console.warn('UNRESOLVED LABELS — check CloudWatch logs for details');
    }
  }

  return ok({ migrated: true, summary });
});
