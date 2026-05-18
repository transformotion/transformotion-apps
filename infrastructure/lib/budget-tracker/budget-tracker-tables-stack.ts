import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface BudgetTrackerTablesStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
}

/**
 * BudgetTrackerTablesStack — DynamoDB tables for Budget Tracker.
 *
 * Tables (all prefixed budget-tracker.):
 *   budget-tracker.transactions  PK: accountId  SK: transactionId
 *                                GSI: accountId-dateIso-index (PK: accountId, SK: dateIso)
 *   budget-tracker.rules         PK: accountId  SK: ruleId
 *   budget-tracker.settings      PK: accountId  SK: settingKey
 *
 * The Cognito app client (BudgetTrackerAppClient) lives in AuthStack, not here.
 *
 * Tags: app=budget-tracker, environment=dev|prod applied at stack level.
 */
export class BudgetTrackerTablesStack extends cdk.Stack {
  public readonly transactionsTable: dynamodb.Table;
  public readonly rulesTable:        dynamodb.Table;
  public readonly settingsTable:     dynamodb.Table;
  public readonly budgetDataTable:   dynamodb.Table;
  public readonly aiJobsTable:       dynamodb.Table;

  constructor(scope: Construct, id: string, props: BudgetTrackerTablesStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const isProd  = stage === 'prod';
    const removal = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // Apply per-app tags to every resource in this stack
    cdk.Tags.of(this).add('app',         'budget-tracker');
    cdk.Tags.of(this).add('environment', stage);

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

    // ── budget-tracker.budget-data ────────────────────────────────────────────
    // Stores per-account: categories tree, budgetAmounts, budgetFrequencies.
    // PK: accountId  SK: concept (e.g. 'categories', 'budgetAmounts', 'budgetFrequencies')
    this.budgetDataTable = new dynamodb.Table(this, 'BudgetDataTable', {
      tableName:            `budget-tracker.budget-data-${stage}`,
      partitionKey:         { name: 'accountId', type: dynamodb.AttributeType.STRING },
      sortKey:              { name: 'concept',   type: dynamodb.AttributeType.STRING },
      billingMode:          dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery:  true,
      removalPolicy:        cdk.RemovalPolicy.RETAIN,
    });

    // ── budget-tracker.ai-jobs ────────────────────────────────────────────────
    // Tracks async AI review jobs. PK: jobId. GSI: userId-index for user queries.
    // TTL: expiresAt (24h after creation) for automatic cleanup.
    this.aiJobsTable = new dynamodb.Table(this, 'AiJobsTable', {
      tableName:           `budget-tracker.ai-jobs-${stage}`,
      partitionKey:        { name: 'jobId', type: dynamodb.AttributeType.STRING },
      billingMode:         dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy:       removal,
    });

    this.aiJobsTable.addGlobalSecondaryIndex({
      indexName:    'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── Outputs ───────────────────────────────────────────────────────────────
    const out = (id: string, value: string, description: string) =>
      new cdk.CfnOutput(this, id, { value, description, exportName: `Transformotion-${stage}-${id}` });

    out('BTTransactionsTableArn', this.transactionsTable.tableArn, 'budget-tracker.transactions table ARN');
    out('BTRulesTableArn',        this.rulesTable.tableArn,        'budget-tracker.rules table ARN');
    out('BTSettingsTableArn',     this.settingsTable.tableArn,     'budget-tracker.settings table ARN');
    out('BTBudgetDataTableArn',   this.budgetDataTable.tableArn,   'budget-tracker.budget-data table ARN');
    out('BTAiJobsTableArn',       this.aiJobsTable.tableArn,       'budget-tracker.ai-jobs table ARN');
  }
}
