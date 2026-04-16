import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
  /** Imported from AuthStack — used by the Cognito JWT authoriser and first-login Lambda. */
  userPool: cognito.IUserPool;
}

/**
 * ApiStack — main app REST API Gateway with Cognito JWT authoriser.
 *
 * Routes start as mock stubs and are replaced with Lambda integrations as each
 * Phase 2 session is completed. The stub comment is removed and the Lambda
 * wired in the same deploy.
 *
 *   POST  /auth/setup              → S2.8 ✅ first-login Lambda
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
    const auth = authMethodOptions(this.authoriser);

    // ── S2.8: /auth/setup — First-login Lambda ───────────────────────────────
    const accountsTable = dynamodb.Table.fromTableName(
      this, 'AccountsTable', `platform.accounts-${stage}`,
    );
    const accountMembersTable = dynamodb.Table.fromTableName(
      this, 'AccountMembersTable', `platform.account-members-${stage}`,
    );

    const firstLoginFn = new lambdaNodejs.NodejsFunction(this, 'FirstLoginFn', {
      functionName: `transformotion-first-login-${stage}`,
      entry:        path.join(__dirname, '../../functions/first-login/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment: {
        ACCOUNTS_TABLE:        accountsTable.tableName,
        ACCOUNT_MEMBERS_TABLE: accountMembersTable.tableName,
        USER_POOL_ID:          userPool.userPoolId,
      },
      bundling: { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false },
    });

    accountsTable.grantReadWriteData(firstLoginFn);
    accountMembersTable.grantReadWriteData(firstLoginFn);

    // Allow the Lambda to update Cognito user attributes (custom:active_account, custom:accounts)
    firstLoginFn.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['cognito-idp:AdminUpdateUserAttributes'],
      resources: [userPool.userPoolArn],
    }));

    const firstLoginIntegration = new apigateway.LambdaIntegration(firstLoginFn, { proxy: true });
    const authResource = this.api.root.addResource('auth');
    authResource.addResource('setup').addMethod('POST',  firstLoginIntegration, auth);
    authResource.addResource('switch').addMethod('POST', firstLoginIntegration, auth);

    // ── /health — public, no auth ─────────────────────────────────────────────
    this.api.root
      .addResource('health')
      .addMethod('GET', healthIntegration(), {
        methodResponses: [{ statusCode: '200' }],
      });

    // ── /api/user — User profile + preferences Lambda ────────────────────────
    const usersTable = dynamodb.Table.fromTableName(
      this, 'UsersTable', `platform.users-${stage}`,
    );

    const userFn = new lambdaNodejs.NodejsFunction(this, 'UserFn', {
      functionName: `transformotion-user-${stage}`,
      entry:        path.join(__dirname, '../../functions/user/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment:  { USERS_TABLE: usersTable.tableName },
      bundling:     { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false },
    });

    usersTable.grantReadWriteData(userFn);

    const userIntegration = new apigateway.LambdaIntegration(userFn, { proxy: true });
    const apiResource = this.api.root.addResource('api');
    const userResource = apiResource.addResource('user');
    userResource.addResource('profile').addMethod('GET', userIntegration, auth);
    userResource.addResource('preferences').addMethod('PUT', userIntegration, auth);

    // ── S2.3: /api/claude — Anthropic proxy Lambda ────────────────────────────
    const anthropicSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'AnthropicApiKey', `${stage}/anthropic/api-key`,
    );

    const claudeProxyFn = new lambdaNodejs.NodejsFunction(this, 'ClaudeProxyFn', {
      functionName: `transformotion-claude-proxy-${stage}`,
      entry:        path.join(__dirname, '../../functions/claude-proxy/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      // 600 s: supports 3 rate-limit retries (20 s + 45 s + 90 s waits) plus
      // the actual Anthropic API call time on each attempt.
      timeout:      cdk.Duration.seconds(600),
      memorySize:   512,
      environment: {
        ANTHROPIC_SECRET_NAME: anthropicSecret.secretName,
        // Populated after cacheTable is created (addEnvironment call below)
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    anthropicSecret.grantRead(claudeProxyFn);

    apiResource
      .addResource('claude')
      .addMethod('POST', new apigateway.LambdaIntegration(claudeProxyFn, { proxy: true }), auth);

    // ── S2.4: /portfolio — Portfolio Lambda ───────────────────────────────────
    const portfolioTable = dynamodb.Table.fromTableName(
      this, 'PortfolioTable', `stock-analyser.portfolio-${stage}-v2`,
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
      this, 'WatchlistTable', `stock-analyser.watchlist-${stage}-v2`,
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

    // Claude proxy needs direct DynamoDB access to write async job results,
    // and permission to invoke itself for the fire-and-forget job pattern.
    cacheTable.grantReadWriteData(claudeProxyFn);
    claudeProxyFn.addEnvironment('CACHE_TABLE', cacheTable.tableName);
    // Self-invoke permission for async job pattern.
    // Construct the ARN explicitly to avoid a circular CDK dependency
    // (Lambda ARN → role policy → Lambda role → Lambda ARN).
    claudeProxyFn.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['lambda:InvokeFunction'],
      resources: [
        `arn:aws:lambda:${this.region}:${this.account}:function:transformotion-claude-proxy-${stage}`,
      ],
    }));

    const cacheIntegration = new apigateway.LambdaIntegration(cacheFn, { proxy: true });
    const cacheKey = this.api.root
      .addResource('analysis-cache')
      .addResource('{key}');
    cacheKey.addMethod('GET',    cacheIntegration, auth);
    cacheKey.addMethod('PUT',    cacheIntegration, auth);
    cacheKey.addMethod('DELETE', cacheIntegration, auth);

    // ── S2.11 + S2.12: /accounts — Accounts Lambda ───────────────────────────
    // Handles: POST /accounts, GET/PUT/DELETE /accounts/{accountId},
    //          GET /accounts/{accountId}/members,
    //          DELETE /accounts/{accountId}/members/{userId}
    const accountsTable2 = dynamodb.Table.fromTableName(
      this, 'AccountsTable2', `platform.accounts-${stage}`,
    );
    const accountMembersTable2 = dynamodb.Table.fromTableName(
      this, 'AccountMembersTable2', `platform.account-members-${stage}`,
    );

    const accountsFn = new lambdaNodejs.NodejsFunction(this, 'AccountsFn', {
      functionName: `transformotion-accounts-${stage}`,
      entry:        path.join(__dirname, '../../functions/accounts/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment: {
        ACCOUNTS_TABLE:        accountsTable2.tableName,
        ACCOUNT_MEMBERS_TABLE: accountMembersTable2.tableName,
      },
      bundling: { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false },
    });

    accountsTable2.grantReadWriteData(accountsFn);
    accountMembersTable2.grantReadWriteData(accountsFn);

    const accountsIntegration = new apigateway.LambdaIntegration(accountsFn, { proxy: true });
    const accounts = this.api.root.addResource('accounts');
    accounts.addMethod('POST', accountsIntegration, auth);

    const account = accounts.addResource('{accountId}');
    account.addMethod('GET',    accountsIntegration, auth);
    account.addMethod('PUT',    accountsIntegration, auth);
    account.addMethod('DELETE', accountsIntegration, auth);

    const members = account.addResource('members');
    members.addMethod('GET', accountsIntegration, auth);
    members.addResource('{userId}').addMethod('DELETE', accountsIntegration, auth);

    // ── S2.12: /accounts/{accountId}/invitations — Invitations Lambda ─────────
    const invitationsTable = dynamodb.Table.fromTableName(
      this, 'InvitationsTable', `platform.invitations-${stage}`,
    );

    const invitationsFn = new lambdaNodejs.NodejsFunction(this, 'InvitationsFn', {
      functionName: `transformotion-invitations-${stage}`,
      entry:        path.join(__dirname, '../../functions/invitations/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment: {
        ACCOUNTS_TABLE:    accountsTable2.tableName,
        INVITATIONS_TABLE: invitationsTable.tableName,
      },
      bundling: { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false },
    });

    accountsTable2.grantReadData(invitationsFn);
    invitationsTable.grantReadWriteData(invitationsFn);

    account
      .addResource('invitations')
      .addMethod('POST', new apigateway.LambdaIntegration(invitationsFn, { proxy: true }), auth);

    // ── Gateway Responses — CORS headers on all error responses ──────────────
    // Without these, Cognito authorizer 401/403 responses have no CORS headers
    // and the browser throws "Failed to fetch" (treated as a CORS failure).
    const corsHeaders = {
      'Access-Control-Allow-Origin':  "'*'",
      'Access-Control-Allow-Headers': "'Content-Type,Authorization,X-Account-Id'",
    };
    [
      apigateway.ResponseType.UNAUTHORIZED,
      apigateway.ResponseType.ACCESS_DENIED,
      apigateway.ResponseType.DEFAULT_4XX,
      apigateway.ResponseType.DEFAULT_5XX,
    ].forEach((type, i) => {
      new apigateway.GatewayResponse(this, `GwResp${i}`, {
        restApi:         this.api,
        type,
        responseHeaders: corsHeaders,
      });
    });

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', {
      value:       this.api.url,
      description: `App API base URL for ${stage} — set VITE_API_URL in .env.local`,
      exportName:  `Transformotion-${stage}-ApiUrl`,
    });
  }
}

// ── Integration / method helpers ──────────────────────────────────────────────


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
