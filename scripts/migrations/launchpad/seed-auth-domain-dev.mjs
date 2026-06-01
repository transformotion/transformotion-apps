#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const args = parseArgs(process.argv.slice(2));
const stage = args.stage ?? 'dev';
const email = args.email;
const tempPassword = args['temp-password'];
const dryRun = args['dry-run'] === 'true';

if (!['dev', 'prod'].includes(stage)) {
  fail('--stage must be dev or prod');
}

if (!email) {
  fail('Missing required --email owner@example.com');
}

const stageCap = stage[0].toUpperCase() + stage.slice(1);
const authStack = `Transformotion${stageCap}-LaunchpadAuth`;

const source = {
  users: `platform.users-${stage}`,
  accounts: `platform.accounts-${stage}`,
  members: `platform.account-members-${stage}`,
};

const target = {
  users: `launchpad-users-${stage}`,
  accounts: `launchpad-accounts-${stage}`,
  members: `launchpad-account-members-${stage}`,
  invitations: `launchpad-invitations-${stage}`,
  rateLimits: `launchpad-rate-limits-${stage}`,
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});

async function main() {
  console.log(`Seeding Launchpad auth domain for ${stage}`);
  console.log(`Owner email: ${email}`);
  console.log(`Dry run: ${dryRun ? 'yes' : 'no'}`);

  const userPoolId = stackOutput(authStack, 'UserPoolId');
  console.log(`LaunchpadAuth UserPoolId: ${userPoolId}`);

  const user = ensureUser(userPoolId, email);
  const userId = user.Username;
  console.log(`LaunchpadAuth username/userId: ${userId}`);

  ensureGroups(userPoolId, userId, ['site-admin', 'stock-app-access', 'budget-app-access']);

  const memberships = scanItems(source.members)
    .map(fromDynamoItem)
    .filter(row => String(row.email ?? '').toLowerCase() === email.toLowerCase());

  if (memberships.length === 0) {
    fail(`No source memberships found in ${source.members} for email ${email}`);
  }

  const accountIds = [...new Set(memberships.map(row => row.accountId).filter(Boolean))];
  const accounts = scanItems(source.accounts)
    .map(fromDynamoItem)
    .filter(row => accountIds.includes(row.accountId));

  if (accounts.length === 0) {
    fail(`No source accounts found in ${source.accounts} for memberships: ${accountIds.join(', ')}`);
  }

  const now = new Date().toISOString();
  const sourceUser = scanItems(source.users)
    .map(fromDynamoItem)
    .find(row => row.email?.toLowerCase?.() === email.toLowerCase())
    ?? {};

  put(target.users, {
    ...sourceUser,
    userId,
    email,
    updatedAt: sourceUser.updatedAt ?? now,
    createdAt: sourceUser.createdAt ?? now,
  });

  for (const account of accounts) {
    put(target.accounts, account);
  }

  for (const membership of memberships) {
    put(target.members, {
      ...membership,
      userId,
      email,
      joinedAt: membership.joinedAt ?? now,
    });
  }

  console.log('');
  console.log('Seed complete.');
  console.log('Next validation: sign in against the staged LaunchpadAuth pool and inspect token claims.');
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = 'true';
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

function ensureUser(userPoolId, userEmail) {
  const users = awsJson([
    'cognito-idp',
    'list-users',
    '--user-pool-id',
    userPoolId,
    '--filter',
    `email = "${userEmail}"`,
  ]).Users ?? [];

  if (users[0]) {
    return users[0];
  }

  if (!tempPassword) {
    fail(`User ${userEmail} does not exist in ${userPoolId}. Re-run with --temp-password <temporary-password> to create it.`);
  }

  if (dryRun) {
    console.log(`[dry-run] would create user ${userEmail} in ${userPoolId}`);
    return { Username: `dry-run-${userEmail}` };
  }

  runAws([
    'cognito-idp',
    'admin-create-user',
    '--user-pool-id',
    userPoolId,
    '--username',
    userEmail,
    '--user-attributes',
    `Name=email,Value=${userEmail}`,
    'Name=email_verified,Value=true',
    '--temporary-password',
    tempPassword,
    '--message-action',
    'SUPPRESS',
  ]);

  return (awsJson([
    'cognito-idp',
    'list-users',
    '--user-pool-id',
    userPoolId,
    '--filter',
    `email = "${userEmail}"`,
  ]).Users ?? [])[0];
}

function ensureGroups(userPoolId, username, groupNames) {
  for (const groupName of groupNames) {
    console.log(`Ensuring Cognito group ${groupName}`);
    if (dryRun) continue;
    runAws([
      'cognito-idp',
      'admin-add-user-to-group',
      '--user-pool-id',
      userPoolId,
      '--username',
      username,
      '--group-name',
      groupName,
    ]);
  }
}

function stackOutput(stackName, outputKey) {
  const value = runAws([
    'cloudformation',
    'describe-stacks',
    '--stack-name',
    stackName,
    '--query',
    `Stacks[0].Outputs[?OutputKey=='${outputKey}'].OutputValue`,
    '--output',
    'text',
  ]).trim();

  if (!value || value === 'None') {
    fail(`Missing ${outputKey} output from ${stackName}`);
  }

  return value;
}

function scanItems(tableName) {
  return awsJson(['dynamodb', 'scan', '--table-name', tableName]).Items ?? [];
}

function put(tableName, item) {
  const dynamoItem = toDynamoItem(item);
  console.log(`Putting ${tableName}: ${JSON.stringify(item)}`);
  if (dryRun) return;
  runAws(['dynamodb', 'put-item', '--table-name', tableName, '--item', JSON.stringify(dynamoItem)]);
}

function runAws(argsForAws) {
  const fullArgs = ['aws', ...argsForAws];
  if (dryRun && !isReadOnly(argsForAws)) {
    console.log(`[dry-run] ${fullArgs.join(' ')}`);
    return '';
  }

  return execFileSync(fullArgs[0], fullArgs.slice(1), {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function awsJson(argsForAws) {
  const out = runAws([...argsForAws, '--output', 'json']);
  return out ? JSON.parse(out) : {};
}

function isReadOnly(argsForAws) {
  return ['cloudformation', 'dynamodb', 'cognito-idp'].includes(argsForAws[0])
    && ['describe-stacks', 'scan', 'list-users'].includes(argsForAws[1]);
}

function fromDynamoItem(item) {
  return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, fromAttr(value)]));
}

function fromAttr(value) {
  if ('S' in value) return value.S;
  if ('N' in value) return Number(value.N);
  if ('BOOL' in value) return value.BOOL;
  if ('NULL' in value) return null;
  if ('M' in value) return Object.fromEntries(Object.entries(value.M).map(([key, child]) => [key, fromAttr(child)]));
  if ('L' in value) return value.L.map(fromAttr);
  if ('SS' in value) return value.SS;
  if ('NS' in value) return value.NS.map(Number);
  return value;
}

function toDynamoItem(item) {
  return Object.fromEntries(
    Object.entries(item)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, toAttr(value)]),
  );
}

function toAttr(value) {
  if (value === null) return { NULL: true };
  if (typeof value === 'string') return { S: value };
  if (typeof value === 'number') return { N: String(value) };
  if (typeof value === 'boolean') return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map(toAttr) };
  if (typeof value === 'object') {
    return { M: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toAttr(child)])) };
  }
  return { S: String(value) };
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  console.error('');
  console.error('Usage: node scripts/migrations/launchpad/seed-auth-domain-dev.mjs --email owner@example.com [--stage dev] [--temp-password TempPassword123]');
  process.exit(1);
}
