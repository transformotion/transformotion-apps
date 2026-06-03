#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const args = parseArgs(process.argv.slice(2));
const stage = args.stage ?? 'dev';
const email = args.email;
const expectCutover = args['expect-cutover'];

if (!['dev', 'prod'].includes(stage)) {
  fail('--stage must be dev or prod');
}

const stageCap = stage[0].toUpperCase() + stage.slice(1);
const authStack = `Transformotion${stageCap}-LaunchpadAuth`;

const expectedGroups = ['site-admin', 'stock-app-access', 'budget-app-access'];
const expectedTableOutputs = [
  'UsersTableName',
  'AccountsTableName',
  'AccountMembersTableName',
  'InvitationsTableName',
  'RateLimitsTableName',
];
const expectedSecretOutputs = [
  'GoogleClientIdSecretName',
  'GoogleClientSecretSecretName',
  'FacebookAppIdSecretName',
  'FacebookAppSecretSecretName',
  'MicrosoftClientIdSecretName',
  'MicrosoftClientSecretSecretName',
  'AppleTeamIdSecretName',
  'AppleClientIdSecretName',
  'AppleKeyIdSecretName',
  'ApplePrivateKeySecretName',
];

main();

function main() {
  console.log(`Validating Launchpad auth readiness for ${stage}`);

  const outputs = stackOutputs(authStack);
  requireOutputs(outputs, [
    'UserPoolId',
    'LaunchpadAppClientId',
    'StockAnalyserAppClientId',
    'BudgetTrackerAppClientId',
    'CognitoDomain',
    ...expectedTableOutputs,
    ...expectedSecretOutputs,
  ]);

  const userPoolId = outputs.UserPoolId;
  console.log(`UserPoolId: ${userPoolId}`);

  const userPool = awsJson(['cognito-idp', 'describe-user-pool', '--user-pool-id', userPoolId]).UserPool;
  if (!userPool) fail(`Unable to describe ${userPoolId}`);

  const triggerArn = userPool.LambdaConfig?.PreTokenGeneration;
  if (!triggerArn || !triggerArn.includes(`launchpad-pre-token-generation-${stage}`)) {
    fail(`Pre-token trigger is not attached to launchpad-pre-token-generation-${stage}`);
  }
  console.log(`Pre-token trigger: ${triggerArn}`);

  assertGroups(userPoolId);
  assertAppClient(userPoolId, 'Launchpad', outputs.LaunchpadAppClientId, expectedLaunchpadUrls(stage));
  assertAppClient(userPoolId, 'Stock Analyser', outputs.StockAnalyserAppClientId, expectedStockAnalyserUrls(stage));
  assertAppClient(userPoolId, 'Budget Tracker', outputs.BudgetTrackerAppClientId, expectedBudgetTrackerUrls(stage));
  assertTables(outputs);
  assertSecrets(outputs);

  if (email) {
    assertSeededOwner(userPoolId, outputs, email);
  } else {
    console.log('Owner seed validation skipped; pass --email owner@example.com after seeding to validate user/table rows.');
  }

  if (expectCutover) {
    assertCutoverWiring(expectCutover, outputs);
  }

  console.log('');
  console.log('Launchpad auth readiness validation passed.');
}

function assertCutoverWiring(mode, launchpadOutputs) {
  if (mode !== 'enabled') {
    fail('--expect-cutover must be enabled; Platform auth fallback mode has been removed');
  }

  const expected = launchpadOutputs;

  const expectedUserPoolArn = expected.UserPoolArn;
  const expectedUserPoolId = expected.UserPoolId;
  const expectedTables = {
    users: launchpadOutputs.UsersTableName,
    accounts: launchpadOutputs.AccountsTableName,
    accountMembers: launchpadOutputs.AccountMembersTableName,
    invitations: launchpadOutputs.InvitationsTableName,
    rateLimits: launchpadOutputs.RateLimitsTableName,
  };

  assertRestAuthorizer('LaunchpadControlPlane', controlPlaneRestApiId(stage), expectedUserPoolArn);
  assertRestAuthorizer('StockAnalyserApi', restApiIdFromStackUrl(`Transformotion${stageCap}-StockAnalyserApi`, 'ApiUrl'), expectedUserPoolArn);
  assertRestAuthorizer('BudgetTrackerApi', restApiIdFromStackUrl(`Transformotion${stageCap}-BudgetTrackerApi`, 'ApiUrl'), expectedUserPoolArn);

  assertLambdaEnv(`stock-analyser-ws-authorizer-${stage}`, { COGNITO_USER_POOL_ID: expectedUserPoolId });
  assertLambdaEnv(`budget-tracker-ws-authorizer-${stage}`, { COGNITO_USER_POOL_ID: expectedUserPoolId });

  assertLambdaEnv(`launchpad-forgot-provider-${stage}`, {
    USER_POOL_ID: expectedUserPoolId,
    RATE_LIMIT_TABLE: expectedTables.rateLimits,
  });
  assertLambdaEnv(`launchpad-account-provisioning-${stage}`, {
    USER_POOL_ID: expectedUserPoolId,
    ACCOUNTS_TABLE: expectedTables.accounts,
    ACCOUNT_MEMBERS_TABLE: expectedTables.accountMembers,
  });
  assertLambdaEnv(`launchpad-user-${stage}`, {
    USERS_TABLE: expectedTables.users,
  });
  assertLambdaEnv(`launchpad-accounts-${stage}`, {
    ACCOUNTS_TABLE: expectedTables.accounts,
    ACCOUNT_MEMBERS_TABLE: expectedTables.accountMembers,
  });
  assertLambdaEnv(`launchpad-invitations-${stage}`, {
    ACCOUNTS_TABLE: expectedTables.accounts,
    INVITATIONS_TABLE: expectedTables.invitations,
  });

  console.log(`Cutover wiring validation passed for mode: ${mode}`);
}

function controlPlaneRestApiId() {
  return stackOutputs(`Transformotion${stageCap}-LaunchpadControlPlane`).ControlPlaneRestApiId;
}

function restApiIdFromStackUrl(stackName, outputKey) {
  const url = stackOutputs(stackName)[outputKey];
  if (!url) fail(`Missing ${outputKey} output from ${stackName}`);
  const match = /^https:\/\/([^.]+)\.execute-api\./.exec(url);
  if (!match) fail(`Could not parse REST API ID from ${stackName} ${outputKey}: ${url}`);
  return match[1];
}

function assertRestAuthorizer(label, restApiId, expectedUserPoolArn) {
  const authorizers = awsJson(['apigateway', 'get-authorizers', '--rest-api-id', restApiId]).items ?? [];
  const providerArns = authorizers.flatMap(authorizer => authorizer.providerARNs ?? []);
  if (!providerArns.includes(expectedUserPoolArn)) {
    fail(`${label} authorizer on ${restApiId} does not use ${expectedUserPoolArn}; found ${providerArns.join(', ') || '<none>'}`);
  }
  console.log(`${label} REST authorizer uses expected User Pool`);
}

function assertLambdaEnv(functionName, expectedEnv) {
  const configuration = awsJson(['lambda', 'get-function-configuration', '--function-name', functionName]);
  const actual = configuration.Environment?.Variables ?? {};
  const mismatches = Object.entries(expectedEnv).filter(([key, value]) => actual[key] !== value);
  if (mismatches.length > 0) {
    fail(`${functionName} env mismatch: ${mismatches.map(([key, value]) => `${key} expected ${value} got ${actual[key] ?? '<missing>'}`).join('; ')}`);
  }
  console.log(`${functionName} env matches expected auth-domain wiring`);
}

function stackOutputs(stackName) {
  const stack = awsJson(['cloudformation', 'describe-stacks', '--stack-name', stackName]).Stacks?.[0];
  if (!stack) fail(`Missing CloudFormation stack ${stackName}`);

  return Object.fromEntries((stack.Outputs ?? []).map(output => [output.OutputKey, output.OutputValue]));
}

function requireOutputs(outputs, keys) {
  const missing = keys.filter(key => !outputs[key]);
  if (missing.length > 0) {
    fail(`Missing ${authStack} outputs: ${missing.join(', ')}`);
  }
  console.log(`Stack outputs present: ${keys.length}`);
}

function assertGroups(userPoolId) {
  const groups = awsJson(['cognito-idp', 'list-groups', '--user-pool-id', userPoolId]).Groups ?? [];
  const names = new Set(groups.map(group => group.GroupName));
  const missing = expectedGroups.filter(group => !names.has(group));
  if (missing.length > 0) {
    fail(`Missing Cognito groups: ${missing.join(', ')}`);
  }
  console.log(`Required groups present: ${expectedGroups.join(', ')}`);
}

function assertAppClient(userPoolId, label, clientId, expected) {
  const client = awsJson([
    'cognito-idp',
    'describe-user-pool-client',
    '--user-pool-id',
    userPoolId,
    '--client-id',
    clientId,
  ]).UserPoolClient;

  if (!client) fail(`Missing ${label} app client ${clientId}`);

  assertContains(`${label} callback URLs`, client.CallbackURLs ?? [], expected.callbackUrls);
  assertContains(`${label} logout URLs`, client.LogoutURLs ?? [], expected.logoutUrls);
  assertContains(`${label} OAuth flows`, client.AllowedOAuthFlows ?? [], ['code']);
  assertContains(`${label} OAuth scopes`, client.AllowedOAuthScopes ?? [], ['openid', 'email', 'profile']);
  console.log(`${label} app client URLs and OAuth settings are staged`);
}

function assertContains(label, actual, expected) {
  const missing = expected.filter(value => !actual.includes(value));
  if (missing.length > 0) {
    fail(`${label} missing: ${missing.join(', ')}`);
  }
}

function assertTables(outputs) {
  for (const outputKey of expectedTableOutputs) {
    const tableName = outputs[outputKey];
    awsJson(['dynamodb', 'describe-table', '--table-name', tableName]);
    console.log(`Table exists: ${tableName}`);
  }
}

function assertSecrets(outputs) {
  for (const outputKey of expectedSecretOutputs) {
    const secretName = outputs[outputKey];
    awsJson(['secretsmanager', 'describe-secret', '--secret-id', secretName]);
    console.log(`Staged secret exists: ${secretName}`);
  }
}

function assertSeededOwner(userPoolId, outputs, userEmail) {
  const users = awsJson([
    'cognito-idp',
    'list-users',
    '--user-pool-id',
    userPoolId,
    '--filter',
    `email = "${userEmail}"`,
  ]).Users ?? [];
  const user = users[0];
  if (!user) fail(`Missing staged owner user ${userEmail}`);

  const username = user.Username;
  const userGroups = awsJson([
    'cognito-idp',
    'admin-list-groups-for-user',
    '--user-pool-id',
    userPoolId,
    '--username',
    username,
  ]).Groups ?? [];
  assertContains('Owner Cognito groups', userGroups.map(group => group.GroupName), expectedGroups);

  const userRows = scan(outputs.UsersTableName).filter(row =>
    row.userId === username
    || String(row.email ?? '').toLowerCase() === userEmail.toLowerCase()
  );
  if (userRows.length === 0) fail(`Missing ${outputs.UsersTableName} row for ${userEmail}`);

  const memberships = scan(outputs.AccountMembersTableName).filter(row => row.userId === username);
  if (memberships.length === 0) fail(`Missing ${outputs.AccountMembersTableName} rows for ${username}`);

  const accountIds = new Set(memberships.map(row => row.accountId));
  const accounts = scan(outputs.AccountsTableName).filter(row => accountIds.has(row.accountId));
  const appSlugs = new Set(accounts.map(row => row.appSlug));
  assertContains('Seeded app accounts', [...appSlugs], ['stock-analyser', 'budget-tracker']);

  console.log(`Seeded owner data validated for ${userEmail}`);
}

function scan(tableName) {
  return (awsJson(['dynamodb', 'scan', '--table-name', tableName]).Items ?? []).map(fromDynamoItem);
}

function expectedLaunchpadUrls(currentStage) {
  return currentStage === 'prod'
    ? {
        callbackUrls: [
          'https://apps.transformotion.com.au/sign-in/callback',
          'https://apps.transformotion.com.au/launchpad/callback',
        ],
        logoutUrls: ['https://apps.transformotion.com.au/signed-out/'],
      }
    : {
        callbackUrls: [
          'https://dev.apps.transformotion.com.au/sign-in/callback',
          'https://dev.apps.transformotion.com.au/launchpad/callback',
          'http://localhost:3001/sign-in/callback',
          'http://localhost:3001/launchpad/callback',
        ],
        logoutUrls: ['https://dev.apps.transformotion.com.au/signed-out/', 'http://localhost:3001/signed-out/'],
      };
}

function expectedStockAnalyserUrls(currentStage) {
  return currentStage === 'prod'
    ? {
        callbackUrls: ['https://apps.transformotion.com.au/stock-analyser/callback'],
        logoutUrls: ['https://apps.transformotion.com.au/signed-out/'],
      }
    : {
        callbackUrls: [
          'https://dev.apps.transformotion.com.au/stock-analyser/callback',
          'http://localhost:3000/stock-analyser/callback',
        ],
        logoutUrls: ['https://dev.apps.transformotion.com.au/signed-out/', 'http://localhost:3000/signed-out/'],
      };
}

function expectedBudgetTrackerUrls(currentStage) {
  return currentStage === 'prod'
    ? {
        callbackUrls: ['https://apps.transformotion.com.au/budget-tracker/callback'],
        logoutUrls: ['https://apps.transformotion.com.au/signed-out/'],
      }
    : {
        callbackUrls: [
          'https://dev.apps.transformotion.com.au/budget-tracker/callback',
          'http://localhost:3002/budget-tracker/callback',
        ],
        logoutUrls: ['https://dev.apps.transformotion.com.au/signed-out/', 'http://localhost:3002/signed-out/'],
      };
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

function runAws(argsForAws) {
  return execFileSync('aws', argsForAws, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function awsJson(argsForAws) {
  const out = runAws([...argsForAws, '--output', 'json']);
  return out ? JSON.parse(out) : {};
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

function fail(message) {
  console.error(`ERROR: ${message}`);
  console.error('');
  console.error('Usage: node scripts/migrations/launchpad/validate-auth-domain-readiness.mjs [--stage dev] [--email owner@example.com] [--expect-cutover enabled|disabled]');
  process.exit(1);
}
