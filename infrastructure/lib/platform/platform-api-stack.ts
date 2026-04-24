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

export interface PlatformApiStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
  /** Imported from AuthStack */
  userPool: cognito.IUserPool;
}

/**
 * PlatformApiStack — shared REST API Gateway with Cognito JWT authoriser.
 *
 * All apps share this single API Gateway. Per-app routes are added by
 * their respective app stacks (e.g. StockAnalyserApiStack).
 *
 * Platform routes:
 *   GET    /health                   — public liveness check
 *   POST   /auth/setup               — first-login Lambda (creates account on signup)
 *   POST   /auth/switch              — switch active account
 *   GET    /api/user/profile         — user profile
 *   PUT    /api/user/preferences     — user preferences
 *   POST   /api/claude               — shared Anthropic proxy (all apps)
 *   POST   /accounts                 — create account
 *   GET    /accounts/{id}            — get account
 *   PUT    /accounts/{id}            — update account
 *   DELETE /accounts/{id}            — delete account
 *   GET    /accounts/{id}/members    — list members
 *   DELETE /accounts/{id}/members/{userId} — remove member
 *   POST   /accounts/{id}/invitations — invite member
 */
export class PlatformApiStack extends cdk.Stack {
  /** The shared REST API — passed to per-app stacks to add their routes. */
  public readonly api: apigateway.RestApi;
  public readonly authoriser: apigateway.CognitoUserPoolsAuthorizer;
  /** Pre-built /api resource — shared with app stacks to mount sub-resources. */
  public readonly apiResource: apigateway.Resource;

  constructor(scope: Construct, id: string, props: PlatformApiStackProps) {
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

    const auth = authMethodOptions(this.authoriser);

    // ── /health — public liveness check ──────────────────────────────────────
    this.api.root
      .addResource('health')
      .addMethod('GET', healthIntegration(), {
        methodResponses: [{ statusCode: '200' }],
      });

    // ── /auth/setup + /auth/switch — First-login Lambda ──────────────────────
    const accountsTable = dynamodb.Table.fromTableName(
      this, 'AccountsTable', `platform.accounts-${stage}`,
    );
    const accountMembersTable = dynamodb.Table.fromTableName(
      this, 'AccountMembersTable', `platform.account-members-${stage}`,
    );

    const firstLoginFn = new lambdaNodejs.NodejsFunction(this, 'AccountProvisioningFn', {
      functionName: `transformotion-account-provisioning-${stage}`,
      entry:        path.join(__dirname, '../../../functions/auth/account-provisioning/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment: {
        ACCOUNTS_TABLE:        accountsTable.tableName,
        ACCOUNT_MEMBERS_TABLE: accountMembersTable.tableName,
        USER_POOL_ID:          userPool.userPoolId,
      },
      bundling: { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false, forceDockerBundling: false },
    });

    accountsTable.grantReadWriteData(firstLoginFn);
    accountMembersTable.grantReadWriteData(firstLoginFn);
    firstLoginFn.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['cognito-idp:AdminUpdateUserAttributes'],
      resources: [userPool.userPoolArn],
    }));

    const authResource = this.api.root.addResource('auth');
    authResource.addResource('setup').addMethod('POST',  new apigateway.LambdaIntegration(firstLoginFn, { proxy: true }), auth);
    authResource.addResource('switch').addMethod('POST', new apigateway.LambdaIntegration(firstLoginFn, { proxy: true }), auth);

    // ── /api — parent resource shared with app stacks ─────────────────────────
    this.apiResource = this.api.root.addResource('api');

    // ── /api/user — User profile + preferences Lambda ────────────────────────
    const usersTable = dynamodb.Table.fromTableName(
      this, 'UsersTable', `platform.users-${stage}`,
    );

    const userFn = new lambdaNodejs.NodejsFunction(this, 'UserFn', {
      functionName: `transformotion-user-${stage}`,
      entry:        path.join(__dirname, '../../../functions/user/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment:  { USERS_TABLE: usersTable.tableName },
      bundling:     { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false },
    });

    usersTable.grantReadWriteData(userFn);

    const userResource = this.apiResource.addResource('user');
    userResource.addResource('profile').addMethod('GET', new apigateway.LambdaIntegration(userFn, { proxy: true }), auth);
    userResource.addResource('preferences').addMethod('PUT', new apigateway.LambdaIntegration(userFn, { proxy: true }), auth);

    // ── /api/claude — Shared Anthropic proxy (used by all apps) ──────────────
    const anthropicSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'AnthropicApiKey', `${stage}/anthropic/api-key`,
    );

    // UNBLOCK-WORKAROUND: look up analysis-cache by name instead of receiving
    // it as a cross-stack construct prop. This breaks the Fn::ImportValue chain
    // that was blocking PlatformTables from dropping its old analysis-cache
    // export (StockAnalyserTables is stuck in REVIEW_IN_PROGRESS and cannot be
    // deployed as a CDK dependency). Revert to a prop when StockAnalyserTables
    // is healthy (account bootstrap phase).
    const analysisCacheTable = dynamodb.Table.fromTableName(
      this, 'AnalysisCacheTable', `stock-analyser.analysis-cache-${stage}`,
    );

    const claudeProxyFn = new lambdaNodejs.NodejsFunction(this, 'ClaudeProxyFn', {
      functionName: `transformotion-claude-proxy-${stage}`,
      entry:        path.join(__dirname, '../../../functions/claude-proxy/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(600),
      memorySize:   512,
      environment: {
        ANTHROPIC_SECRET_NAME: anthropicSecret.secretName,
        CACHE_TABLE:           analysisCacheTable.tableName,
      },
      bundling: { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false, forceDockerBundling: false },
    });

    anthropicSecret.grantRead(claudeProxyFn);
    analysisCacheTable.grantReadWriteData(claudeProxyFn);
    claudeProxyFn.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['lambda:InvokeFunction'],
      resources: [
        `arn:aws:lambda:${this.region}:${this.account}:function:transformotion-claude-proxy-${stage}`,
      ],
    }));

    this.apiResource
      .addResource('claude')
      .addMethod('POST', new apigateway.LambdaIntegration(claudeProxyFn, { proxy: true }), auth);

    // ── /accounts — Accounts Lambda ──────────────────────────────────────────
    const accountsTable2 = dynamodb.Table.fromTableName(
      this, 'AccountsTable2', `platform.accounts-${stage}`,
    );
    const accountMembersTable2 = dynamodb.Table.fromTableName(
      this, 'AccountMembersTable2', `platform.account-members-${stage}`,
    );

    const accountsFn = new lambdaNodejs.NodejsFunction(this, 'AccountsFn', {
      functionName: `transformotion-accounts-${stage}`,
      entry:        path.join(__dirname, '../../../functions/accounts/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment: {
        ACCOUNTS_TABLE:        accountsTable2.tableName,
        ACCOUNT_MEMBERS_TABLE: accountMembersTable2.tableName,
      },
      bundling: { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false, forceDockerBundling: false },
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

    // ── /accounts/{accountId}/invitations — Invitations Lambda ───────────────
    const invitationsTable = dynamodb.Table.fromTableName(
      this, 'InvitationsTable', `platform.invitations-${stage}`,
    );

    const invitationsFn = new lambdaNodejs.NodejsFunction(this, 'InvitationsFn', {
      functionName: `transformotion-invitations-${stage}`,
      entry:        path.join(__dirname, '../../../functions/auth/invitations/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment: {
        ACCOUNTS_TABLE:    accountsTable2.tableName,
        INVITATIONS_TABLE: invitationsTable.tableName,
      },
      bundling: { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false, forceDockerBundling: false },
    });

    accountsTable2.grantReadData(invitationsFn);
    invitationsTable.grantReadWriteData(invitationsFn);

    account
      .addResource('invitations')
      .addMethod('POST', new apigateway.LambdaIntegration(invitationsFn, { proxy: true }), auth);

    // ── Gateway Responses — CORS headers on all error responses ──────────────
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
      description: `App API base URL for ${stage}`,
      exportName:  `Transformotion-${stage}-ApiUrl`,
    });
  }
}

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
