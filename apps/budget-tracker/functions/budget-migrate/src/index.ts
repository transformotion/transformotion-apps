import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchWriteCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { withAuth, parseBody, ok, requireGroup } from '@transformotion/lambda-middleware';
import { randomUUID } from 'crypto';
import type { Transaction, CustomRule, BudgetSettings } from '@transformotion/budget-domain';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE!;
const RULES_TABLE        = process.env.RULES_TABLE!;
const SETTINGS_TABLE     = process.env.SETTINGS_TABLE!;

const SETTING_KEYS: Array<keyof Omit<BudgetSettings, 'accountId'>> = [
  'budgetOverrides', 'budgetFreqs', 'customCategories', 'deletedSubs',
  'projectBudgets', 'projectTasks', 'csvFormatMappings',
  'customTopCategories', 'customProjectCategories',
  'deletedCategories', 'deletedProjectCategories', 'disabledProjectCategories',
];

function toIso(ddmmyyyy: string): string {
  const p = ddmmyyyy.split('/');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : ddmmyyyy;
}

function txNaturalKey(t: Pick<Transaction, 'date' | 'amount' | 'description' | 'file'>): string {
  return `${t.date}|${t.amount}|${t.description}|${t.file}`;
}

function ruleNaturalKey(r: Pick<CustomRule, 'match' | 'category' | 'subcategory'>): string {
  return `${r.match}|${r.category}|${r.subcategory}`;
}

// ── Transformation 1: _ignore → Financial & Insurance / Transfer ──────────────
// Hawkins E A payments received into the ANZ account are inter-account transfers.
function transformTransaction(tx: Omit<Transaction, 'accountId'>): Omit<Transaction, 'accountId'> {
  if (tx.category === '_ignore') {
    return { ...tx, category: 'Financial & Insurance', subcategory: 'Transfer', _manual: true };
  }
  return tx;
}

// ── Transformation 2: projectBudgets key rename ───────────────────────────────
// "Financial & Insurance" project budget was a model error; rename to "New Car".
function transformSettings(settings: Partial<BudgetSettings>): Partial<BudgetSettings> {
  if (!settings.projectBudgets) return settings;
  const pb = { ...settings.projectBudgets };
  if ('Financial & Insurance' in pb) {
    pb['New Car'] = pb['Financial & Insurance'];
    delete pb['Financial & Insurance'];
  }
  return { ...settings, projectBudgets: pb };
}

async function batchWrite(table: string, items: Record<string, unknown>[]) {
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    await ddb.send(new BatchWriteCommand({
      RequestItems: {
        [table]: chunk.map(Item => ({ PutRequest: { Item } })),
      },
    }));
  }
}

// POST /api/budget/v1/migrate-from-localstorage
export const handler = withAuth(async ({ auth, account, event }) => {
  requireGroup(auth, 'budget-app', 'admin');
  const { accountId } = account;

  const { transactions, rules, settings } = parseBody<{
    transactions: Omit<Transaction, 'accountId'>[];
    rules: Omit<CustomRule, 'accountId'>[];
    settings: Partial<BudgetSettings>;
  }>(event);

  // ── Load existing data for deduplication ──────────────────────────────────
  const [existingTxRes, existingRulesRes] = await Promise.all([
    ddb.send(new QueryCommand({
      TableName: TRANSACTIONS_TABLE,
      KeyConditionExpression: 'accountId = :aid',
      ExpressionAttributeValues: { ':aid': accountId },
      ProjectionExpression: 'transactionId, #d, amount, description, #f',
      ExpressionAttributeNames: { '#d': 'date', '#f': 'file' },
    })),
    ddb.send(new QueryCommand({
      TableName: RULES_TABLE,
      KeyConditionExpression: 'accountId = :aid',
      ExpressionAttributeValues: { ':aid': accountId },
      ProjectionExpression: '#m, category, subcategory',
      ExpressionAttributeNames: { '#m': 'match' },
    })),
  ]);

  const existingTxKeys  = new Set((existingTxRes.Items ?? []).map(t => txNaturalKey(t as Transaction)));
  const existingRuleKeys = new Set((existingRulesRes.Items ?? []).map(r => ruleNaturalKey(r as CustomRule)));

  // ── Migrate transactions ───────────────────────────────────────────────────
  let txMigrated = 0; let txAlreadyPresent = 0;
  const txItems: Record<string, unknown>[] = [];

  for (const tx of transactions ?? []) {
    const transformed = transformTransaction(tx);
    const key = txNaturalKey(transformed);
    if (existingTxKeys.has(key)) { txAlreadyPresent++; continue; }
    // Destructure out the legacy integer _id — DynamoDB uses transactionId (UUID) as the key.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id: _legacyId, ...txFields } = transformed as typeof transformed & { _id?: unknown };
    txItems.push({
      ...txFields,
      accountId,
      transactionId: randomUUID(),
      dateIso:       toIso(transformed.date),
      _manual:       transformed._manual ?? false,
      _business:     transformed._business ?? false,
    });
    txMigrated++;
  }
  await batchWrite(TRANSACTIONS_TABLE, txItems);

  // ── Migrate rules ─────────────────────────────────────────────────────────
  let rulesMigrated = 0; let rulesAlreadyPresent = 0;
  const ruleItems: Record<string, unknown>[] = [];

  for (const rule of rules ?? []) {
    const key = ruleNaturalKey(rule);
    if (existingRuleKeys.has(key)) { rulesAlreadyPresent++; continue; }
    ruleItems.push({
      ...rule,
      accountId,
      ruleId:    randomUUID(),
      createdAt: new Date().toISOString(),
      learned:   rule.learned ?? false,
    });
    rulesMigrated++;
  }
  await batchWrite(RULES_TABLE, ruleItems);

  // ── Migrate settings ──────────────────────────────────────────────────────
  const transformedSettings = transformSettings(settings ?? {});
  const now = new Date().toISOString();
  const migratedSettingKeys: string[] = [];

  for (const key of SETTING_KEYS) {
    if (key in transformedSettings && transformedSettings[key] !== undefined) {
      await ddb.send(new PutCommand({
        TableName: SETTINGS_TABLE,
        Item: { accountId, settingKey: key, value: transformedSettings[key], updatedAt: now },
      }));
      migratedSettingKeys.push(key);
    }
  }

  return ok({
    migrated: {
      transactions: txMigrated,
      rules:        rulesMigrated,
      settings:     migratedSettingKeys,
    },
    alreadyPresent: {
      transactions: txAlreadyPresent,
      rules:        rulesAlreadyPresent,
    },
  });
});
