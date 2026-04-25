import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { withAuth, parseBody, ok, requireAppAccess, requireAccountAccess } from '@transformotion/lambda-middleware';
import type { BudgetSettings } from '@transformotion/budget-domain';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.SETTINGS_TABLE!;

// DEFAULT_SETTINGS and SETTING_KEYS below must stay in sync with
// BudgetSettings in contracts/budget-tracker/data-models.md.
// Drift here causes GET/PATCH to silently drop fields.
// Phase 2 will replace this with Zod-validated schemas.
const SETTING_KEYS: Array<keyof Omit<BudgetSettings, 'accountId'>> = [
  'budgetOverrides', 'budgetFreqs', 'customCategories',
  'deletedSubs', 'projectBudgets', 'projectTasks',
  'customTopCategories', 'customProjectCategories',
  'deletedCategories', 'deletedProjectCategories',
  'disabledProjectCategories', 'csvFormatMappings',
];

const DEFAULT_SETTINGS: Omit<BudgetSettings, 'accountId'> = {
  budgetOverrides: {},
  budgetFreqs: {},
  customCategories: {},
  deletedSubs: [],
  projectBudgets: {},
  projectTasks: {},
  customTopCategories: [],
  customProjectCategories: [],
  deletedCategories: [],
  deletedProjectCategories: [],
  disabledProjectCategories: [],
  csvFormatMappings: {},
};

async function getSettings(accountId: string) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'accountId = :aid',
    ExpressionAttributeValues: { ':aid': accountId },
  }));

  const settings: BudgetSettings = { accountId, ...DEFAULT_SETTINGS };
  for (const item of res.Items ?? []) {
    const key = item['settingKey'] as keyof BudgetSettings;
    if (SETTING_KEYS.includes(key as keyof Omit<BudgetSettings, 'accountId'>)) {
      (settings as unknown as Record<string, unknown>)[key] = item['value'];
    }
  }
  return ok({ settings });
}

async function updateSettings(event: Parameters<typeof parseBody>[0], accountId: string) {
  const patch = parseBody<Partial<Omit<BudgetSettings, 'accountId'>>>(event);
  const now = new Date().toISOString();

  const writes = SETTING_KEYS
    .filter(key => key in patch && patch[key] !== undefined)
    .map(key => ddb.send(new PutCommand({
      TableName: TABLE,
      Item: { accountId, settingKey: key, value: patch[key], updatedAt: now },
    })));

  if (writes.length === 0) throw { statusCode: 400, message: 'No settings fields provided' };
  await Promise.all(writes);
  return getSettings(accountId);
}

export const handler = withAuth(async ({ auth, account, event }) => {
  requireAppAccess(auth, 'budget-tracker');
  requireAccountAccess(auth, 'budget-tracker', account.accountId);
  const { accountId } = account;
  if (event.httpMethod === 'GET')   return getSettings(accountId);
  if (event.httpMethod === 'PATCH') return updateSettings(event, accountId);
  throw { statusCode: 400, message: `Unrecognised route: ${event.httpMethod}` };
});
