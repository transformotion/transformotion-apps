import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { withAuth, parseBody, ok, requireAppAccess, requireAccountAccess, requireAccountWrite } from '@transformotion/lambda-middleware';
import { dynamoMembershipLoader } from '@transformotion/fn-account-membership';
import type { BudgetSettings } from '@transformotion/budget-domain';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.SETTINGS_TABLE!;
// D8 write-path membership loader (scoped GetItem on launchpad-account-members).
const membershipLoader = dynamoMembershipLoader(ddb, process.env.ACCOUNT_MEMBERS_TABLE!);

const SETTING_KEYS: Array<keyof BudgetSettings> = [
  'csvFormatMappings',
  'aiReviewBatchSize',
  'aiReviewParallelLimit',
  'aiReviewConfidenceThreshold',
];

const DEFAULT_SETTINGS: BudgetSettings = {
  csvFormatMappings: {},
  aiReviewBatchSize: 5,
  aiReviewParallelLimit: 4,
  aiReviewConfidenceThreshold: 'low',
};

async function getSettings(accountId: string) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'accountId = :aid',
    ExpressionAttributeValues: { ':aid': accountId },
  }));

  const settings: BudgetSettings = { ...DEFAULT_SETTINGS };
  for (const item of res.Items ?? []) {
    const key = item['settingKey'] as keyof BudgetSettings;
    if (SETTING_KEYS.includes(key)) {
      (settings as unknown as Record<string, unknown>)[key] = item['value'];
    }
  }
  return ok({ settings });
}

async function updateSettings(event: Parameters<typeof parseBody>[0], accountId: string) {
  const patch = parseBody<Partial<BudgetSettings>>(event);
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
  if (event.httpMethod === 'PATCH') {
    // Account-SHARED settings (PK=accountId, SK=settingKey, no userId) → D8 write check.
    await requireAccountWrite(auth, 'budget-tracker', accountId, membershipLoader);
    return updateSettings(event, accountId);
  }
  throw { statusCode: 400, message: `Unrecognised route: ${event.httpMethod}` };
});
