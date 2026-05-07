import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const BUCKET             = 'transformotion-migration-uploads-959516291617';
const API_BASE           = 'https://yqtrjzrnp3.execute-api.ap-southeast-2.amazonaws.com/dev';
const ENDPOINT           = `${API_BASE}/api/migrations/budget-tracker/transactions/import`;
const ACCOUNT_ID         = 'aed9dcdf-81b5-47a1-a0d5-5afbae940e93';
const TRANSACTIONS_TABLE = 'budget-tracker.transactions-dev';
const EXPORT_FILE        = path.resolve(__dirname, '../../../migration-artifacts/budget-tracker/transactions/exports/export.json');

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

async function main() {
  console.log('Budget Tracker — Initial Transactions Migration');
  console.log('================================================\n');

  if (!fs.existsSync(EXPORT_FILE)) {
    console.error(`Export file not found: ${EXPORT_FILE}`);
    process.exit(1);
  }
  const fileContent = fs.readFileSync(EXPORT_FILE, 'utf-8');
  const transactions = JSON.parse(fileContent) as unknown[];
  if (!Array.isArray(transactions)) {
    console.error('Export file is not a JSON array');
    process.exit(1);
  }
  console.log(`Loaded ${transactions.length} transactions from export file`);

  console.log('\nTo get your Cognito ID token:');
  console.log('  1. Sign in to https://dev.apps.transformotion.com.au/budget-tracker/');
  console.log('  2. Open DevTools → Application → Local Storage');
  console.log('  3. Find the entry ending in `.idToken` and copy its value\n');
  const idToken = await prompt('Paste Cognito ID token: ');
  if (!idToken || !idToken.startsWith('eyJ')) {
    console.error('Invalid token. Expected JWT starting with `eyJ`.');
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -1);
  const s3Key = `budget-tracker/transactions/${timestamp}/export.json`;
  console.log(`\nS3 key: ${s3Key}`);

  console.log('Uploading to S3...');
  const s3 = new S3Client({});
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         s3Key,
    Body:        fileContent,
    ContentType: 'application/json',
  }));
  console.log(`Uploaded to s3://${BUCKET}/${s3Key}`);

  console.log('\nTriggering migration Lambda...');
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type':  'application/json',
      'X-Account-Id':  ACCOUNT_ID,
    },
    body: JSON.stringify({ s3Key }),
  });
  const responseBody = await response.text();

  if (!response.ok) {
    console.error(`Migration failed (HTTP ${response.status}):`);
    console.error(responseBody);
    process.exit(1);
  }

  let result: unknown;
  try {
    result = JSON.parse(responseBody);
  } catch {
    console.error('Migration response was not JSON:', responseBody);
    process.exit(1);
  }
  console.log('\nMigration response:');
  console.log(JSON.stringify(result, null, 2));

  console.log('\nVerifying via DynamoDB scan...');
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const countRes = await ddb.send(new ScanCommand({
    TableName: TRANSACTIONS_TABLE,
    Select:    'COUNT',
  }));
  console.log(`Total rows in ${TRANSACTIONS_TABLE}: ${countRes.Count}`);
  if (countRes.Count !== transactions.length) {
    console.warn(`WARNING: Expected ${transactions.length} rows, found ${countRes.Count}.`);
    console.warn('May indicate dedup activity on re-run, or partial failure.');
  } else {
    console.log(`Match: ${countRes.Count} rows == ${transactions.length} from export.`);
  }

  const ignoreRes = await ddb.send(new ScanCommand({
    TableName:                 TRANSACTIONS_TABLE,
    FilterExpression:          '#i = :true',
    ExpressionAttributeNames:  { '#i': '_ignore' },
    ExpressionAttributeValues: { ':true': true },
    Select:                    'COUNT',
  }));
  console.log(`Rows with _ignore: true: ${ignoreRes.Count}`);
  console.log('  (Expected: 39 = 33 pre-existing transfers + 6 Hawkins payments)');

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nMigration script failed:', err);
  process.exit(1);
});
