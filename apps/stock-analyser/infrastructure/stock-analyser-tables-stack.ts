import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface StockAnalyserTablesStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
}

/**
 * StockAnalyserTablesStack — DynamoDB tables owned by the Stock Analyser app.
 *
 * Tables:
 *   stock-analyser.portfolio       PK: accountId  SK: ticker
 *   stock-analyser.watchlist       PK: accountId  SK: ticker
 *   stock-analyser.analysis-cache  PK: accountId  SK: cacheKey  TTL: expiresAt
 *   stock-analyser.job-results     PK: accountId  SK: cacheKey  TTL: expiresAt
 *   stock-analyser.settings        PK: pk         SK: sk
 *   stock-analyser.notification-state PK: accountId SK: sk
 */
export class StockAnalyserTablesStack extends cdk.Stack {
  public readonly portfolioTableNew:  dynamodb.Table;
  public readonly watchlistTableNew:  dynamodb.Table;
  public readonly analysisCacheTable: dynamodb.Table;
  public readonly jobResultsTable:    dynamodb.Table;
  public readonly settingsTable:      dynamodb.Table;
  public readonly notificationStateTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: StockAnalyserTablesStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const isProd = stage === 'prod';
    const removal = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // ── stock-analyser.portfolio ──────────────────────────────────────────
    this.portfolioTableNew = new dynamodb.Table(this, 'PortfolioTableNew', {
      tableName:     `stock-analyser.portfolio-${stage}`,
      partitionKey:  { name: 'accountId', type: dynamodb.AttributeType.STRING },
      sortKey:       { name: 'ticker',    type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── stock-analyser.watchlist ──────────────────────────────────────────
    this.watchlistTableNew = new dynamodb.Table(this, 'WatchlistTableNew', {
      tableName:     `stock-analyser.watchlist-${stage}`,
      partitionKey:  { name: 'accountId', type: dynamodb.AttributeType.STRING },
      sortKey:       { name: 'ticker',    type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── stock-analyser.analysis-cache ────────────────────────────────────
    // Cache of Claude-generated analysis results, keyed by account + cache key.
    // PK: accountId  SK: cacheKey  TTL: expiresAt (epoch seconds)
    this.analysisCacheTable = new dynamodb.Table(this, 'AnalysisCacheTable', {
      tableName:           `stock-analyser.analysis-cache-${stage}`,
      partitionKey:        { name: 'accountId', type: dynamodb.AttributeType.STRING },
      sortKey:             { name: 'cacheKey',  type: dynamodb.AttributeType.STRING },
      billingMode:         dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy:       removal,
    });

    // ── stock-analyser.job-results ─────────────────────────────────────────
    // Short-lived async Claude job state owned by Stock Analyser after #366.
    // PK: accountId  SK: cacheKey (`job-{jobId}`)  TTL: expiresAt
    this.jobResultsTable = new dynamodb.Table(this, 'JobResultsTable', {
      tableName:           `stock-analyser.job-results-${stage}`,
      partitionKey:        { name: 'accountId', type: dynamodb.AttributeType.STRING },
      sortKey:             { name: 'cacheKey',  type: dynamodb.AttributeType.STRING },
      billingMode:         dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy:       removal,
    });

    // ── stock-analyser.settings ─────────────────────────────────────────────
    // General app settings table. Stores account/app-level AI override,
    // app-wide cache freshness policy, and user-level preferences without
    // overloading portfolio/watchlist/cache/WSS.
    // Key model:
    //   PK: ACCOUNT#{accountId}
    //   SK: APP#AI_RUNTIME | USER#{userId}#PREFERENCES
    //   PK: SETTINGS
    //   SK: CACHE_FRESHNESS#stock-analyser
    this.settingsTable = new dynamodb.Table(this, 'SettingsTable', {
      tableName:     `stock-analyser.settings-${stage}`,
      partitionKey:  { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey:       { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });

    // â”€â”€ stock-analyser.notification-state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Durable transition state for M19 background notification processing.
    // No TTL: last verdict and last notified/process markers must survive
    // across runs so standing BUY/SELL states do not keep firing.
    this.notificationStateTable = new dynamodb.Table(this, 'NotificationStateTable', {
      tableName:     `stock-analyser.notification-state-${stage}`,
      partitionKey:  { name: 'accountId', type: dynamodb.AttributeType.STRING },
      sortKey:       { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });

    // ── Outputs ───────────────────────────────────────────────────────────
    const out = (id: string, table: dynamodb.Table, hint: string) => {
      new cdk.CfnOutput(this, id, {
        value:       table.tableArn,
        description: hint,
        exportName:  `Transformotion-${stage}-${id}`,
      });
    };

    out('SAPortfolioNewTableArn',  this.portfolioTableNew,  'stock-analyser.portfolio table ARN');
    out('SAWatchlistNewTableArn',  this.watchlistTableNew,  'stock-analyser.watchlist table ARN');
    out('SAAnalysisCacheTableArn', this.analysisCacheTable, 'stock-analyser.analysis-cache table ARN');
    out('SAJobResultsTableArn',    this.jobResultsTable,    'stock-analyser.job-results table ARN');
    out('SASettingsTableArn',      this.settingsTable,      'stock-analyser.settings table ARN');
    out('SANotificationStateTableArn', this.notificationStateTable, 'stock-analyser.notification-state table ARN');
  }
}
