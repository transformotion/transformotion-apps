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
 */
export class StockAnalyserTablesStack extends cdk.Stack {
  public readonly portfolioTableNew:  dynamodb.Table;
  public readonly watchlistTableNew:  dynamodb.Table;
  public readonly analysisCacheTable: dynamodb.Table;

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
  }
}
