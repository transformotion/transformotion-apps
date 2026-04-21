import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface BudgetTrackerTablesStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
  userPool: cognito.IUserPool;
}

/**
 * BudgetTrackerTablesStack — DynamoDB tables and Cognito app client for Budget Tracker.
 *
 * Tables (all prefixed budget-tracker.):
 *   budget-tracker.accounts      PK: accountId
 *   budget-tracker.transactions  PK: accountId  SK: transactionId
 *                                GSI: accountId-dateIso-index (PK: accountId, SK: dateIso)
 *   budget-tracker.rules         PK: accountId  SK: ruleId
 *   budget-tracker.settings      PK: accountId  SK: settingKey
 *
 * Tags: app=budget-tracker, environment=dev|prod applied at stack level.
 */
export class BudgetTrackerTablesStack extends cdk.Stack {
  public readonly transactionsTable: dynamodb.Table;
  public readonly rulesTable:        dynamodb.Table;
  public readonly settingsTable:     dynamodb.Table;
  public readonly accountsTable:     dynamodb.Table;
  public readonly appClient:         cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: BudgetTrackerTablesStackProps) {
    super(scope, id, props);

    const { stage, userPool } = props;
    const isProd   = stage === 'prod';
    const removal  = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // Apply per-app tags to every resource in this stack
    cdk.Tags.of(this).add('app',         'budget-tracker');
    cdk.Tags.of(this).add('environment', stage);

    // ── budget-tracker.accounts ───────────────────────────────────────────────
    this.accountsTable = new dynamodb.Table(this, 'AccountsTable', {
      tableName:     `budget-tracker.accounts-${stage}`,
      partitionKey:  { name: 'accountId', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });

    // ── budget-tracker.transactions ───────────────────────────────────────────
    this.transactionsTable = new dynamodb.Table(this, 'TransactionsTable', {
      tableName:     `budget-tracker.transactions-${stage}`,
      partitionKey:  { name: 'accountId',     type: dynamodb.AttributeType.STRING },
      sortKey:       { name: 'transactionId', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });

    this.transactionsTable.addGlobalSecondaryIndex({
      indexName:     'accountId-dateIso-index',
      partitionKey:  { name: 'accountId', type: dynamodb.AttributeType.STRING },
      sortKey:       { name: 'dateIso',   type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── budget-tracker.rules ──────────────────────────────────────────────────
    this.rulesTable = new dynamodb.Table(this, 'RulesTable', {
      tableName:     `budget-tracker.rules-${stage}`,
      partitionKey:  { name: 'accountId', type: dynamodb.AttributeType.STRING },
      sortKey:       { name: 'ruleId',    type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });

    // ── budget-tracker.settings ───────────────────────────────────────────────
    this.settingsTable = new dynamodb.Table(this, 'SettingsTable', {
      tableName:     `budget-tracker.settings-${stage}`,
      partitionKey:  { name: 'accountId',  type: dynamodb.AttributeType.STRING },
      sortKey:       { name: 'settingKey', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });

    // ── Cognito app client — budget-tracker-${stage} ──────────────────────────
    const callbackUrls = isProd
      ? [
          'https://apps.transformotion.com.au/budget',
          'https://apps.transformotion.com.au/budget/callback',
        ]
      : [
          'http://localhost:3002',
          'http://localhost:3002/callback',
          'https://dev.apps.transformotion.com.au/budget',
          'https://dev.apps.transformotion.com.au/budget/callback',
        ];

    this.appClient = userPool.addClient('BudgetTrackerClient', {
      userPoolClientName: `budget-tracker-${stage}`,
      generateSecret: false,
      oAuth: {
        flows:  { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls,
        logoutUrls: isProd
          ? ['https://apps.transformotion.com.au/budget']
          : ['http://localhost:3002', 'https://dev.apps.transformotion.com.au/budget'],
      },
      authFlows: { userSrp: true },
      accessTokenValidity:  cdk.Duration.hours(1),
      idTokenValidity:      cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true, emailVerified: true, givenName: true, familyName: true })
        .withCustomAttributes('active_account', 'accounts'),
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true, givenName: true, familyName: true })
        .withCustomAttributes('active_account', 'accounts'),
      preventUserExistenceErrors: true,
    });

    // ── Outputs ───────────────────────────────────────────────────────────────
    const out = (id: string, value: string, description: string) =>
      new cdk.CfnOutput(this, id, { value, description, exportName: `Transformotion-${stage}-${id}` });

    out('BTAccountsTableArn',     this.accountsTable.tableArn,     'budget-tracker.accounts table ARN');
    out('BTTransactionsTableArn', this.transactionsTable.tableArn, 'budget-tracker.transactions table ARN');
    out('BTRulesTableArn',        this.rulesTable.tableArn,        'budget-tracker.rules table ARN');
    out('BTSettingsTableArn',     this.settingsTable.tableArn,     'budget-tracker.settings table ARN');
    out('BTAppClientId',          this.appClient.userPoolClientId, 'Budget Tracker Cognito app client ID');
  }
}
