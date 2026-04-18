import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export interface BudgetTrackerApiStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
  /** Shared API Gateway from PlatformApiStack. */
  api: apigateway.RestApi;
  /** Shared JWT authoriser from PlatformApiStack. */
  authoriser: apigateway.CognitoUserPoolsAuthorizer;
  /** /api resource from PlatformApiStack — budget routes mount under /api/budget/v1. */
  apiResource: apigateway.Resource;
}

/**
 * BudgetTrackerApiStack — Lambda functions and API routes for the Budget Tracker.
 *
 * Mounts under /api/budget/v1/:
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
 *   POST   /ai/categorise
 *   POST   /ai/review
 *   POST   /ai/csv-analysis
 *   GET    /business-export
 *   POST   /migrate-from-localstorage
 */
export class BudgetTrackerApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BudgetTrackerApiStackProps) {
    super(scope, id, props);

    const { stage, api, authoriser, apiResource } = props;
    const auth = authMethodOptions(authoriser);

    // Apply per-app tags to every resource in this stack
    cdk.Tags.of(this).add('app',         'budget-tracker');
    cdk.Tags.of(this).add('environment', stage);

    // ── Import shared tables by name ──────────────────────────────────────────
    const txTable       = dynamodb.Table.fromTableName(this, 'TxTable',       `budget-tracker.transactions-${stage}`);
    const rulesTable    = dynamodb.Table.fromTableName(this, 'RulesTable',    `budget-tracker.rules-${stage}`);
    const settingsTable = dynamodb.Table.fromTableName(this, 'SettingsTable', `budget-tracker.settings-${stage}`);

    const claudeProxyFnName = `transformotion-claude-proxy-${stage}`;

    const bundling: lambdaNodejs.BundlingOptions = {
      externalModules: ['@aws-sdk/*'],
      minify: true,
      sourceMap: false,
      forceDockerBundling: false,
    };

    const fnDir = path.join(__dirname, '../../../apps/budget-tracker/functions');

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

    // ── budget-ai-handler (categorise + review + csv-analysis) ───────────────
    const aiFn = new lambdaNodejs.NodejsFunction(this, 'AiFn', {
      functionName: `budget-ai-handler-${stage}`,
      entry:        path.join(fnDir, 'budget-ai/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(300),
      memorySize:   512,
      environment:  { CLAUDE_PROXY_FUNCTION_NAME: claudeProxyFnName },
      bundling,
    });
    aiFn.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['lambda:InvokeFunction'],
      resources: [`arn:aws:lambda:${this.region}:${this.account}:function:${claudeProxyFnName}`],
    }));

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

    // ── budget-migrate-handler ────────────────────────────────────────────────
    const migrateFn = new lambdaNodejs.NodejsFunction(this, 'MigrateFn', {
      functionName: `budget-migrate-handler-${stage}`,
      entry:        path.join(fnDir, 'budget-migrate/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(120),
      memorySize:   512,
      environment: {
        TRANSACTIONS_TABLE: txTable.tableName,
        RULES_TABLE:        rulesTable.tableName,
        SETTINGS_TABLE:     settingsTable.tableName,
      },
      bundling,
    });
    txTable.grantReadWriteData(migrateFn);
    rulesTable.grantReadWriteData(migrateFn);
    settingsTable.grantReadWriteData(migrateFn);

    // ── API routes ────────────────────────────────────────────────────────────
    // Mount at /api/budget/v1/
    const budget = apiResource.addResource('budget');
    const v1     = budget.addResource('v1');

    // /transactions
    const txRes     = v1.addResource('transactions');
    const txIdRes   = txRes.addResource('{id}');
    const txBulkRes = txRes.addResource('bulk');
    const txInt     = new apigateway.LambdaIntegration(txFn, { proxy: true });
    txRes.addMethod('GET', txInt, auth);
    txBulkRes.addMethod('POST', txInt, auth);
    txIdRes.addMethod('PATCH',  txInt, auth);
    txIdRes.addMethod('DELETE', txInt, auth);

    // /rules
    const rulesRes   = v1.addResource('rules');
    const ruleIdRes  = rulesRes.addResource('{id}');
    const rulesInt   = new apigateway.LambdaIntegration(rulesFn, { proxy: true });
    rulesRes.addMethod('GET',  rulesInt, auth);
    rulesRes.addMethod('POST', rulesInt, auth);
    ruleIdRes.addMethod('PATCH',  rulesInt, auth);
    ruleIdRes.addMethod('DELETE', rulesInt, auth);

    // /settings
    const settingsRes = v1.addResource('settings');
    const settingsInt = new apigateway.LambdaIntegration(settingsFn, { proxy: true });
    settingsRes.addMethod('GET',   settingsInt, auth);
    settingsRes.addMethod('PATCH', settingsInt, auth);

    // /ai
    const aiRes = v1.addResource('ai');
    const aiInt = new apigateway.LambdaIntegration(aiFn, { proxy: true });
    aiRes.addResource('categorise').addMethod('POST',    aiInt, auth);
    aiRes.addResource('review').addMethod('POST',        aiInt, auth);
    aiRes.addResource('csv-analysis').addMethod('POST',  aiInt, auth);

    // /business-export
    v1.addResource('business-export').addMethod(
      'GET', new apigateway.LambdaIntegration(exportFn, { proxy: true }), auth
    );

    // /migrate-from-localstorage
    v1.addResource('migrate-from-localstorage').addMethod(
      'POST', new apigateway.LambdaIntegration(migrateFn, { proxy: true }), auth
    );

    // ── Output: Budget Tracker API base ───────────────────────────────────────
    new cdk.CfnOutput(this, 'BudgetApiBase', {
      value:       `${api.url}api/budget/v1`,
      description: `Budget Tracker API base URL for ${stage}`,
      exportName:  `Transformotion-${stage}-BudgetApiBase`,
    });
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
