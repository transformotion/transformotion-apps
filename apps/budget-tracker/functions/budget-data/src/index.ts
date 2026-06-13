import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { withAuth, parseBody, ok, requireAccountData } from '@transformotion/lambda-middleware';
import { dynamoMembershipLoader } from '@transformotion/fn-account-membership';
import type { BudgetData, Category } from '@transformotion/budget-domain';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.BUDGET_DATA_TABLE!;
// D8 write-path membership loader (scoped GetItem on launchpad-account-members).
const membershipLoader = dynamoMembershipLoader(ddb, process.env.ACCOUNT_MEMBERS_TABLE!);

const CONCEPTS = ['categories', 'budgetAmounts', 'budgetFrequencies'] as const;
type Concept = typeof CONCEPTS[number];

const DEFAULT_BUDGET_DATA: BudgetData = {
  categories: [],
  budgetAmounts: {},
  budgetFrequencies: {},
};

async function getBudgetData(accountId: string) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'accountId = :aid',
    ExpressionAttributeValues: { ':aid': accountId },
  }));

  const budgetData: BudgetData = { ...DEFAULT_BUDGET_DATA };
  for (const item of res.Items ?? []) {
    const concept = item['concept'] as Concept;
    if (CONCEPTS.includes(concept)) {
      (budgetData as unknown as Record<string, unknown>)[concept] = item['value'];
    }
  }
  return ok({ budgetData });
}

function validateCategories(categories: Category[]): string | null {
  for (const cat of categories) {
    const activeSubs = cat.subcategories.filter(s => !s.deleted);
    if (activeSubs.length === 0 && !cat.deleted) {
      return `Category "${cat.name}" must have at least one non-deleted subcategory`;
    }
  }
  return null;
}

function validateSubcategoryRefs(
  categories: Category[],
  map: Record<string, unknown>,
  concept: string,
): string | null {
  const allSubIds = new Set(
    categories.flatMap(c => c.subcategories.map(s => s.subcategoryId)),
  );
  for (const id of Object.keys(map)) {
    if (!allSubIds.has(id)) {
      return `${concept}: subcategoryId "${id}" not found in categories tree`;
    }
  }
  return null;
}

async function patchBudgetData(event: Parameters<typeof parseBody>[0], accountId: string) {
  const patch = parseBody<Partial<BudgetData>>(event);

  // If categories are being written, validate them
  if (patch.categories !== undefined) {
    const catErr = validateCategories(patch.categories);
    if (catErr) throw { statusCode: 400, message: catErr };
  }

  // If amounts/frequencies are being written, validate subcategoryId refs
  // (against patched categories if provided, else read existing)
  if (patch.budgetAmounts !== undefined || patch.budgetFrequencies !== undefined) {
    let categories: Category[];
    if (patch.categories !== undefined) {
      categories = patch.categories;
    } else {
      const existing = await getBudgetData(accountId);
      const body = JSON.parse((existing as { body: string }).body);
      categories = body.budgetData.categories as Category[];
    }

    if (patch.budgetAmounts) {
      const err = validateSubcategoryRefs(categories, patch.budgetAmounts, 'budgetAmounts');
      if (err) throw { statusCode: 400, message: err };
    }
    if (patch.budgetFrequencies) {
      const err = validateSubcategoryRefs(categories, patch.budgetFrequencies, 'budgetFrequencies');
      if (err) throw { statusCode: 400, message: err };
    }
  }

  const now = new Date().toISOString();
  const writes = CONCEPTS
    .filter(c => c in patch && patch[c] !== undefined)
    .map(concept =>
      ddb.send(new PutCommand({
        TableName: TABLE,
        Item: { accountId, concept, value: patch[concept as keyof BudgetData], updatedAt: now },
      })),
    );

  if (writes.length === 0) throw { statusCode: 400, message: 'No budget-data fields provided' };
  await Promise.all(writes);
  return getBudgetData(accountId);
}

const btData = requireAccountData('budget-tracker');

export const handler = withAuth(async ({ auth, account, event }) => {
  const { accountId } = account;

  if (event.httpMethod === 'GET') {
    btData.read(auth, accountId);
    return getBudgetData(accountId);
  }
  if (event.httpMethod === 'PATCH') {
    // Account-shared budget config (PK=accountId, SK=concept) → D9 write tier.
    await btData.write(auth, accountId, membershipLoader);
    return patchBudgetData(event, accountId);
  }
  throw { statusCode: 400, message: `Unrecognised route: ${event.httpMethod}` };
});
