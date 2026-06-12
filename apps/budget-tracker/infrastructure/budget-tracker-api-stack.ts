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

export interface BudgetTrackerApiStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
  userPoolId: string;
  /** budget-data table name — passed in to avoid cross-stack dependency issues. */
  budgetDataTableName: string;
  /** AI jobs table name from BudgetTrackerTablesStack. */
  aiJobsTableName: string;
  /** Budget Tracker WebSocket connections table name from BudgetTrackerWsStack. */
  wsConnectionsTableName: string;
  /** Budget Tracker WebSocket API ID from BudgetTrackerWsStack. */
  wsApiId: string;
}

/**
 * BudgetTrackerApiStack — Budget Tracker-owned REST API routes and Lambdas.
 *
 * After #367 this stack owns the Budget Tracker API Gateway and AI proxy
 * runtime. Platform REST/Claude runtime remains deployed only for rollback and
 * later #372 decommissioning.
 *
 * Routes under /api/budget/v1/:
 *   GET    /transactions
 *   POST   /transactions/bulk
 *   PATCH  /transactions/:id
 *   DELETE /transactions/:id
 *   GET    /rules
 *   POST   /rules
 *   PATCH  /rules/:id
 *   DELETE /rules/:id
 *   GET    /settings
 *   PATCH  /settings
 *   POST   /ai/review
 *   POST   /ai/csv-analysis
 *   GET    /business-export
 */
export class BudgetTrackerApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: BudgetTrackerApiStackProps) {
    super(scope, id, props);

    const { stage, userPoolId, budgetDataTableName, aiJobsTableName, wsConnectionsTableName, wsApiId } = props;

    const userPool = cognito.UserPool.fromUserPoolId(this, 'UserPool', userPoolId);

    this.api = new apigateway.RestApi(this, 'BudgetTrackerApi', {
      restApiName: `budget-tracker-api-${stage}`,
      description: `Budget Tracker ${stage} API`,
      deployOptions: { stageName: stage },
      defaultCorsPreflightOptions: corsPreflightOptions,
    });

    const authoriser = new apigateway.CognitoUserPoolsAuthorizer(this, 'JwtAuthoriser', {
      cognitoUserPools: [userPool],
      authorizerName: `budget-tracker-jwt-${stage}`,
      resultsCacheTtl: cdk.Duration.minutes(5),
    });
    const auth = authMethodOptions(authoriser);

    // /api/budget/v1 — mounted on the Budget Tracker-owned API Gateway.
    const apiResource = this.api.root
      .addResource('api')
      .addResource('budget')
      .addResource('v1');

    // Apply per-app tags to every resource in this stack
    cdk.Tags.of(this).add('app',         'budget-tracker');
    cdk.Tags.of(this).add('environment', stage);

    // ── Import shared tables by name ──────────────────────────────────────────
    const txTable           = dynamodb.Table.fromTableName(this, 'TxTable',           `budget-tracker.transactions-${stage}`);
    const rulesTable        = dynamodb.Table.fromTableName(this, 'RulesTable',        `budget-tracker.rules-${stage}`);
    const settingsTable     = dynamodb.Table.fromTableName(this, 'SettingsTable',     `budget-tracker.settings-${stage}`);
    const budgetDataTable   = dynamodb.Table.fromTableName(this, 'BudgetDataTable',   budgetDataTableName);
    const aiJobsTable       = dynamodb.Table.fromTableName(this, 'AiJobsTable',       aiJobsTableName);
    const wsConnectionsTable = dynamodb.Table.fromTableName(this, 'WsConnectionsTable', wsConnectionsTableName);

    // D8 write-path: account-data mutation Lambdas read the caller's membership
    // row from the launchpad-owned members table. Grant is dynamodb:GetItem ONLY
    // (no Query/index/writes) on this one table — minimal, auditable cross-domain read.
    const accountMembersTable = dynamodb.Table.fromTableName(
      this, 'AccountMembersTable', `launchpad-account-members-${stage}`,
    );
    const grantMembershipRead = (fn: lambdaNodejs.NodejsFunction) => {
      fn.addEnvironment('ACCOUNT_MEMBERS_TABLE', accountMembersTable.tableName);
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['dynamodb:GetItem'],
        resources: [accountMembersTable.tableArn],
      }));
    };

    const bundling: lambdaNodejs.BundlingOptions = {
      externalModules: ['@aws-sdk/*'],
      minify: true,
      sourceMap: false,
      forceDockerBundling: false,
    };

    const fnDir = path.join(__dirname, '../functions');

    const anthropicSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'AnthropicApiKey', `${stage}/anthropic/api-key`,
    );
    const openaiSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'OpenAIApiKey', `${stage}/openai/api-key`,
    );
    const aiRuntimeConfigTable = dynamodb.Table.fromTableName(
      this,
      'AiRuntimeConfigTable',
      `launchpad-ai-runtime-config-${stage}`,
    );

    const aiProxyFnName = `budget-tracker-ai-proxy-${stage}`;
    const aiProxyFn = new lambdaNodejs.NodejsFunction(this, 'AiProxyFn', {
      functionName: aiProxyFnName,
      entry:        path.join(fnDir, 'ai-proxy/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(600),
      memorySize:   512,
      environment:  {
        ANTHROPIC_SECRET_NAME: anthropicSecret.secretName,
        OPENAI_SECRET_NAME:    openaiSecret.secretName,
        AI_CONFIG_TABLE:       aiRuntimeConfigTable.tableName,
        APP_AI_CONFIG_TABLE:   settingsTable.tableName,
        AI_FALLBACK_PROVIDER:  'claude',
        AI_FALLBACK_MODEL:     'claude-sonnet-4-6',
      },
      bundling,
    });
    anthropicSecret.grantRead(aiProxyFn);
    openaiSecret.grantRead(aiProxyFn);
    aiRuntimeConfigTable.grantReadData(aiProxyFn);
    settingsTable.grantReadData(aiProxyFn);

    // ── budget-transactions-handler ──────────────────────────────────────────
    const txFn = new lambdaNodejs.NodejsFunction(this, 'TransactionsFn', {
      functionName: `budget-transactions-handler-${stage}`,
      entry:        path.join(fnDir, 'budget-transactions/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(30),
      memorySize:   512,
      environment:  { TRANSACTIONS_TABLE: txTable.tableName },
      bundling,
    });
    txTable.grantReadWriteData(txFn);
    grantMembershipRead(txFn);

    // ── budget-rules-handler ─────────────────────────────────────────────────
    const rulesFn = new lambdaNodejs.NodejsFunction(this, 'RulesFn', {
      functionName: `budget-rules-handler-${stage}`,
      entry:        path.join(fnDir, 'budget-rules/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment:  { RULES_TABLE: rulesTable.tableName },
      bundling,
    });
    rulesTable.grantReadWriteData(rulesFn);
    grantMembershipRead(rulesFn);

    // ── budget-settings-handler ──────────────────────────────────────────────
    const settingsFn = new lambdaNodejs.NodejsFunction(this, 'SettingsFn', {
      functionName: `budget-settings-handler-${stage}`,
      entry:        path.join(fnDir, 'budget-settings/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment:  { SETTINGS_TABLE: settingsTable.tableName },
      bundling,
    });
    settingsTable.grantReadWriteData(settingsFn);
    grantMembershipRead(settingsFn);

    // ── budget-ai-config-handler ─────────────────────────────────────────────
    const aiConfigFn = new lambdaNodejs.NodejsFunction(this, 'AiConfigFn', {
      functionName: `budget-ai-config-handler-${stage}`,
      entry:        path.join(fnDir, 'budget-ai-config/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(15),
      memorySize:   256,
      environment:  {
        SETTINGS_TABLE:          settingsTable.tableName,
        PLATFORM_CONFIG_TABLE:   aiRuntimeConfigTable.tableName,
      },
      bundling,
    });
    settingsTable.grantReadWriteData(aiConfigFn);
    aiRuntimeConfigTable.grantReadData(aiConfigFn);

    // ── budget-ai-handler (review-start + review-worker + csv-analysis) ───────────────
    const aiFnName = `budget-ai-handler-${stage}`;
    const aiFn = new lambdaNodejs.NodejsFunction(this, 'AiFn', {
      functionName: aiFnName,
      entry:        path.join(fnDir, 'budget-ai/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(300),
      memorySize:   512,
      environment:  {
        CLAUDE_PROXY_FUNCTION_NAME: aiProxyFnName,
        AI_JOBS_TABLE:              aiJobsTableName,
        WS_CONNECTIONS_TABLE:       wsConnectionsTableName,
        WS_API_ID:                  wsApiId,
        WS_STAGE:                   stage,
        AWS_REGION_NAME:            this.region,
      },
      bundling,
    });
    aiFn.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['lambda:InvokeFunction'],
      resources: [
        `arn:aws:lambda:${this.region}:${this.account}:function:${aiProxyFnName}`,
        `arn:aws:lambda:${this.region}:${this.account}:function:${aiFnName}`,
      ],
    }));
    aiFn.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${wsApiId}/${stage}/*`],
    }));
    aiJobsTable.grantReadWriteData(aiFn);
    wsConnectionsTable.grantReadData(aiFn);
    grantMembershipRead(aiFn); // D9 member-tier (ruling #1) — live membership-row check
    // grantReadData on a Table imported via fromTableName covers the base table ARN but not GSI ARNs,
    // because CDK has no schema knowledge of imported tables. Explicit grant for the userId-index GSI
    // used by the connectionId lookup (budget-ai-handler queries by userId to find the caller's WSS connectionId).
    aiFn.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['dynamodb:Query'],
      resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${wsConnectionsTableName}/index/*`],
    }));

    // ── budget-data-handler ───────────────────────────────────────────────────
    const budgetDataFn = new lambdaNodejs.NodejsFunction(this, 'BudgetDataFn', {
      functionName: `budget-data-handler-${stage}`,
      entry:        path.join(fnDir, 'budget-data/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(30),
      memorySize:   256,
      environment:  { BUDGET_DATA_TABLE: budgetDataTable.tableName },
      bundling,
    });
    budgetDataTable.grantReadWriteData(budgetDataFn);
    grantMembershipRead(budgetDataFn);

    // ── budget-export-handler ─────────────────────────────────────────────────
    const exportFn = new lambdaNodejs.NodejsFunction(this, 'ExportFn', {
      functionName: `budget-export-handler-${stage}`,
      entry:        path.join(fnDir, 'budget-export/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(30),
      memorySize:   256,
      environment:  { TRANSACTIONS_TABLE: txTable.tableName },
      bundling,
    });
    txTable.grantReadData(exportFn);

    // ── API routes ────────────────────────────────────────────────────────────
    // /transactions
    const txRes     = apiResource.addResource('transactions');
    const txIdRes   = txRes.addResource('{id}');
    const txBulkRes = txRes.addResource('bulk');
    const txInt     = new apigateway.LambdaIntegration(txFn, { proxy: true });
    txRes.addMethod('GET', txInt, auth);
    txBulkRes.addMethod('POST', txInt, auth);
    txIdRes.addMethod('PATCH',  txInt, auth);
    txIdRes.addMethod('DELETE', txInt, auth);

    // /rules
    const rulesRes   = apiResource.addResource('rules');
    const ruleIdRes  = rulesRes.addResource('{id}');
    const rulesInt   = new apigateway.LambdaIntegration(rulesFn, { proxy: true });
    rulesRes.addMethod('GET',  rulesInt, auth);
    rulesRes.addMethod('POST', rulesInt, auth);
    ruleIdRes.addMethod('PATCH',  rulesInt, auth);
    ruleIdRes.addMethod('DELETE', rulesInt, auth);

    // /settings
    const settingsRes = apiResource.addResource('settings');
    const settingsInt = new apigateway.LambdaIntegration(settingsFn, { proxy: true });
    settingsRes.addMethod('GET',   settingsInt, auth);
    settingsRes.addMethod('PATCH', settingsInt, auth);

    // /ai
    const aiRes = apiResource.addResource('ai');
    const aiInt = new apigateway.LambdaIntegration(aiFn, { proxy: true });
    aiRes.addResource('review').addMethod('POST',        aiInt, auth);
    aiRes.addResource('csv-analysis').addMethod('POST',  aiInt, auth);

    // /ai-config
    const aiConfigRes = apiResource.addResource('ai-config');
    const aiConfigOverrideRes = aiConfigRes.addResource('override');
    const aiConfigInt = new apigateway.LambdaIntegration(aiConfigFn, { proxy: true });
    aiConfigRes.addMethod('GET', aiConfigInt, auth);
    aiConfigOverrideRes.addMethod('PUT', aiConfigInt, auth);
    aiConfigOverrideRes.addMethod('DELETE', aiConfigInt, auth);

    // /budget-data
    const budgetDataRes = apiResource.addResource('budget-data');
    const budgetDataInt = new apigateway.LambdaIntegration(budgetDataFn, { proxy: true });
    budgetDataRes.addMethod('GET',   budgetDataInt, auth);
    budgetDataRes.addMethod('PATCH', budgetDataInt, auth);

    // /business-export
    apiResource.addResource('business-export').addMethod(
      'GET', new apigateway.LambdaIntegration(exportFn, { proxy: true }), auth
    );

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'Budget Tracker REST API URL',
      exportName: `BudgetTrackerApi-${stage}-Url`,
    });
  }
}

const corsPreflightOptions: apigateway.CorsOptions = {
  allowOrigins: apigateway.Cors.ALL_ORIGINS,
  allowMethods: apigateway.Cors.ALL_METHODS,
  allowHeaders: ['Content-Type', 'Authorization', 'X-Account-Id'],
  maxAge: cdk.Duration.hours(1),
};

function authMethodOptions(authoriser: apigateway.IAuthorizer): apigateway.MethodOptions {
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
