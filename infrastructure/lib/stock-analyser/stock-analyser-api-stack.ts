import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export interface StockAnalyserApiStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
  /** Shared API Gateway from PlatformApiStack — SA routes are added here. */
  api: apigateway.RestApi;
  /** Shared JWT authoriser from PlatformApiStack. */
  authoriser: apigateway.CognitoUserPoolsAuthorizer;
}

/**
 * StockAnalyserApiStack — Stock Analyser API routes and Lambdas.
 *
 * Mounts onto the shared platform API Gateway:
 *   GET  /portfolio          — portfolio Lambda
 *   PUT  /portfolio
 *   GET  /watchlist          — watchlist Lambda
 *   PUT  /watchlist
 *   GET  /analysis-cache/{key}   — analysis-cache Lambda
 *   PUT  /analysis-cache/{key}
 *   DELETE /analysis-cache/{key}
 *
 * Lambda source: apps/stock-analyser/functions/
 */
export class StockAnalyserApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StockAnalyserApiStackProps) {
    super(scope, id, props);

    const { stage, api, authoriser } = props;
    const auth = authMethodOptions(authoriser);

    // ── /portfolio — Portfolio Lambda ─────────────────────────────────────
    const portfolioTable = dynamodb.Table.fromTableName(
      this, 'PortfolioTable', `stock-analyser.portfolio-${stage}-v2`,
    );

    const portfolioFn = new lambdaNodejs.NodejsFunction(this, 'PortfolioFn', {
      functionName: `transformotion-portfolio-${stage}`,
      entry:        path.join(__dirname, '../../../apps/stock-analyser/functions/portfolio/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment:  { PORTFOLIO_TABLE: portfolioTable.tableName },
      bundling:     { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false, forceDockerBundling: false },
    });

    portfolioTable.grantReadWriteData(portfolioFn);

    const portfolioIntegration = new apigateway.LambdaIntegration(portfolioFn, { proxy: true });
    const portfolio = api.root.addResource('portfolio');
    portfolio.addMethod('GET', portfolioIntegration, auth);
    portfolio.addMethod('PUT', portfolioIntegration, auth);

    // ── /watchlist — Watchlist Lambda ─────────────────────────────────────
    const watchlistTable = dynamodb.Table.fromTableName(
      this, 'WatchlistTable', `stock-analyser.watchlist-${stage}-v2`,
    );

    const watchlistFn = new lambdaNodejs.NodejsFunction(this, 'WatchlistFn', {
      functionName: `transformotion-watchlist-${stage}`,
      entry:        path.join(__dirname, '../../../apps/stock-analyser/functions/watchlist/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment:  { WATCHLIST_TABLE: watchlistTable.tableName },
      bundling:     { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false, forceDockerBundling: false },
    });

    watchlistTable.grantReadWriteData(watchlistFn);

    const watchlistIntegration = new apigateway.LambdaIntegration(watchlistFn, { proxy: true });
    const watchlist = api.root.addResource('watchlist');
    watchlist.addMethod('GET', watchlistIntegration, auth);
    watchlist.addMethod('PUT', watchlistIntegration, auth);

    // ── /analysis-cache/{key} — Analysis Cache Lambda ─────────────────────
    const cacheFn = new lambdaNodejs.NodejsFunction(this, 'CacheFn', {
      functionName: `transformotion-analysis-cache-${stage}`,
      entry:        path.join(__dirname, '../../../apps/stock-analyser/functions/analysis-cache/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment:  { CACHE_TABLE: `platform.analysis-cache-${stage}` },
      bundling:     { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false, forceDockerBundling: false },
    });

    // Grant cache Lambda access to the platform analysis-cache table
    const analysisCacheTable = dynamodb.Table.fromTableName(
      this, 'AnalysisCacheTable', `platform.analysis-cache-${stage}`,
    );
    analysisCacheTable.grantReadWriteData(cacheFn);

    const cacheIntegration = new apigateway.LambdaIntegration(cacheFn, { proxy: true });
    const cacheKey = api.root
      .addResource('analysis-cache')
      .addResource('{key}');
    cacheKey.addMethod('GET',    cacheIntegration, auth);
    cacheKey.addMethod('PUT',    cacheIntegration, auth);
    cacheKey.addMethod('DELETE', cacheIntegration, auth);
  }
}

function authMethodOptions(
  authoriser: apigateway.CognitoUserPoolsAuthorizer,
): apigateway.MethodOptions {
  return {
    authorizer:        authoriser,
    authorizationType: apigateway.AuthorizationType.COGNITO,
    methodResponses: [
      {
        statusCode: '200',
        responseParameters: {
          'method.response.header.Access-Control-Allow-Origin':  true,
          'method.response.header.Access-Control-Allow-Headers': true,
        },
      },
      { statusCode: '400' },
      { statusCode: '401' },
      { statusCode: '403' },
      { statusCode: '429' },
      { statusCode: '500' },
      { statusCode: '502' },
    ],
  };
}
