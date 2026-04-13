import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
  /** Imported from AuthStack — used by the Cognito JWT authoriser. */
  userPool: cognito.IUserPool;
}

/**
 * ApiStack — main app REST API Gateway with Cognito JWT authoriser.
 *
 * Routes start as mock stubs and are replaced with Lambda integrations as each
 * Phase 2 session is completed. The stub comment is removed and the Lambda
 * wired in the same deploy.
 *
 *   POST  /api/claude             → S2.3 ✅ claude-proxy Lambda
 *   GET   /portfolio              → S2.4 ✅ portfolio Lambda
 *   PUT   /portfolio
 *   GET   /watchlist              → S2.5 ✅ watchlist Lambda
 *   PUT   /watchlist
 *   GET   /analysis-cache/{key}   → S2.6 ✅ analysis-cache Lambda
 *   PUT   /analysis-cache/{key}
 *   DELETE /analysis-cache/{key}
 *   POST  /accounts               → S2.11 Stub
 *   GET   /accounts/{id}
 *   PUT   /accounts/{id}
 *   DELETE /accounts/{id}
 *   GET   /accounts/{id}/members  → S2.12 Stub
 *   DELETE /accounts/{id}/members/{userId}
 *   POST  /accounts/{id}/invitations → S2.12 Stub
 */
export class ApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly authoriser: apigateway.CognitoUserPoolsAuthorizer;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { stage, userPool } = props;

    // ── REST API ─────────────────────────────────────────────────────────────
    this.api = new apigateway.RestApi(this, 'Api', {
      restApiName:  `transformotion-api-${stage}`,
      description:  `Transformotion ${stage} — main application API`,
      deployOptions: { stageName: stage },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Account-Id'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // ── Cognito JWT authoriser ────────────────────────────────────────────────
    this.authoriser = new apigateway.CognitoUserPoolsAuthorizer(this, 'JwtAuthoriser', {
      cognitoUserPools: [userPool],
      authorizerName:   `transformotion-jwt-${stage}`,
      resultsCacheTtl:  cdk.Duration.minutes(5),
    });

    // ── Helpers ───────────────────────────────────────────────────────────────
    const stub = stubIntegration();
    const auth = authMethodOptions(this.authoriser);

    // ── /health — public, no auth ─────────────────────────────────────────────
    this.api.root
      .addResource('health')
      .addMethod('GET', healthIntegration(), {
        methodResponses: [{ statusCode: '200' }],
      });

    // ── S2.3: /api/claude — Anthropic proxy Lambda ────────────────────────────
    const anthropicSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'AnthropicApiKey', `${stage}/anthropic/api-key`,
    );

    const claudeProxyFn = new lambdaNodejs.NodejsFunction(this, 'ClaudeProxyFn', {
      functionName: `transformotion-claude-proxy-${stage}`,
      entry:        path.join(__dirname, '../../functions/claude-proxy/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(60),   // web_search can be slow
      memorySize:   512,
      environment: {
        ANTHROPIC_SECRET_NAME: anthropicSecret.secretName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    anthropicSecret.grantRead(claudeProxyFn);

    this.api.root
      .addResource('api')
      .addResource('claude')
      .addMethod('POST', new apigateway.LambdaIntegration(claudeProxyFn, { proxy: true }), auth);

    // ── S2.4: /portfolio — Portfolio Lambda ───────────────────────────────────
    const portfolioTable = dynamodb.Table.fromTableName(
      this, 'PortfolioTable', `stock-analyser.portfolio-${stage}`,
    );

    const portfolioFn = new lambdaNodejs.NodejsFunction(this, 'PortfolioFn', {
      functionName: `transformotion-portfolio-${stage}`,
      entry:        path.join(__dirname, '../../functions/portfolio/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment:  { PORTFOLIO_TABLE: portfolioTable.tableName },
      bundling:     { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false },
    });

    portfolioTable.grantReadWriteData(portfolioFn);

    const portfolioIntegration = new apigateway.LambdaIntegration(portfolioFn, { proxy: true });
    const portfolio = this.api.root.addResource('portfolio');
    portfolio.addMethod('GET', portfolioIntegration, auth);
    portfolio.addMethod('PUT', portfolioIntegration, auth);

    // ── S2.5: /watchlist — Watchlist Lambda ───────────────────────────────────
    const watchlistTable = dynamodb.Table.fromTableName(
      this, 'WatchlistTable', `stock-analyser.watchlist-${stage}`,
    );

    const watchlistFn = new lambdaNodejs.NodejsFunction(this, 'WatchlistFn', {
      functionName: `transformotion-watchlist-${stage}`,
      entry:        path.join(__dirname, '../../functions/watchlist/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment:  { WATCHLIST_TABLE: watchlistTable.tableName },
      bundling:     { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false },
    });

    watchlistTable.grantReadWriteData(watchlistFn);

    const watchlistIntegration = new apigateway.LambdaIntegration(watchlistFn, { proxy: true });
    const watchlist = this.api.root.addResource('watchlist');
    watchlist.addMethod('GET', watchlistIntegration, auth);
    watchlist.addMethod('PUT', watchlistIntegration, auth);

    // ── S2.6: /analysis-cache/{key} — Analysis Cache Lambda ──────────────────
    const cacheTable = dynamodb.Table.fromTableName(
      this, 'CacheTable', `stock-analyser.cache-${stage}`,
    );

    const cacheFn = new lambdaNodejs.NodejsFunction(this, 'CacheFn', {
      functionName: `transformotion-analysis-cache-${stage}`,
      entry:        path.join(__dirname, '../../functions/analysis-cache/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment:  { CACHE_TABLE: cacheTable.tableName },
      bundling:     { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false },
    });

    cacheTable.grantReadWriteData(cacheFn);

    const cacheIntegration = new apigateway.LambdaIntegration(cacheFn, { proxy: true });
    const cacheKey = this.api.root
      .addResource('analysis-cache')
      .addResource('{key}');
    cacheKey.addMethod('GET',    cacheIntegration, auth);
    cacheKey.addMethod('PUT',    cacheIntegration, auth);
    cacheKey.addMethod('DELETE', cacheIntegration, auth);

    // ── /accounts (S2.11) ────────────────────────────────────────────────────
    const accounts = this.api.root.addResource('accounts');
    accounts.addMethod('POST', stub, auth);

    const account = accounts.addResource('{accountId}');
    account.addMethod('GET',    stub, auth);
    account.addMethod('PUT',    stub, auth);
    account.addMethod('DELETE', stub, auth);

    // ── /accounts/{accountId}/members (S2.12) ────────────────────────────────
    const members = account.addResource('members');
    members.addMethod('GET', stub, auth);

    members.addResource('{userId}').addMethod('DELETE', stub, auth);

    // ── /accounts/{accountId}/invitations (S2.12) ────────────────────────────
    account.addResource('invitations').addMethod('POST', stub, auth);

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', {
      value:       this.api.url,
      description: `App API base URL for ${stage} — set VITE_API_URL in .env.local`,
      exportName:  `Transformotion-${stage}-ApiUrl`,
    });
  }
}

// ── Integration / method helpers ──────────────────────────────────────────────

/** Mock integration returning a 200 stub while the Lambda is not yet wired. */
function stubIntegration(): apigateway.MockIntegration {
  return new apigateway.MockIntegration({
    passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
    requestTemplates: { 'application/json': '{"statusCode":200}' },
    integrationResponses: [{
      statusCode: '200',
      responseParameters: {
        'method.response.header.Access-Control-Allow-Origin':  "'*'",
        'method.response.header.Access-Control-Allow-Headers': "'Content-Type,Authorization,X-Account-Id'",
      },
      responseTemplates: {
        'application/json': '{"status":"not_implemented","message":"Lambda not yet wired — Phase 2 in progress"}',
      },
    }],
  });
}

/** Public /health mock — no CORS headers needed. */
function healthIntegration(): apigateway.MockIntegration {
  return new apigateway.MockIntegration({
    passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
    requestTemplates: { 'application/json': '{"statusCode":200}' },
    integrationResponses: [{
      statusCode: '200',
      responseTemplates: { 'application/json': '{"status":"ok"}' },
    }],
  });
}

/** Method options for a Cognito-protected route with CORS response headers. */
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
