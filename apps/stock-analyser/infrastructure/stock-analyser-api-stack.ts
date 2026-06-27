import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface StockAnalyserApiStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
  userPoolId: string;
  portfolioTable: dynamodb.ITable;
  watchlistTable: dynamodb.ITable;
  analysisCacheTable: dynamodb.ITable;
  jobResultsTable: dynamodb.ITable;
  settingsTable: dynamodb.ITable;
  notificationStateTable: dynamodb.ITable;
  notificationSendLogTable: dynamodb.ITable;
  wsApiEndpoint: string;
  wsApiId: string;
}

/**
 * StockAnalyserApiStack - Stock Analyser-owned REST API routes and Lambdas.
 *
 * After #366 this stack owns the Stock Analyser API Gateway and AI proxy
 * runtime. Platform REST/Claude runtime remains deployed only for rollback and
 * later #372 decommissioning.
 *
 * Routes:
 *   GET/PUT           /portfolio
 *   GET/PUT           /watchlist
 *   GET/PUT/DELETE    /analysis-cache/{key}
 *   GET/PUT           /cache-freshness
 *   GET               /cycle/ohlcv
 *   GET               /price/ohlcv
 *   POST              /api/claude
 */
export class StockAnalyserApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: StockAnalyserApiStackProps) {
    super(scope, id, props);

    const {
      stage,
      userPoolId,
      portfolioTable,
      watchlistTable,
      analysisCacheTable,
      jobResultsTable,
      settingsTable,
      notificationStateTable,
      notificationSendLogTable,
      wsApiEndpoint,
      wsApiId,
    } = props;

    const userPool = cognito.UserPool.fromUserPoolId(this, 'UserPool', userPoolId);

    this.api = new apigateway.RestApi(this, 'StockAnalyserApi', {
      restApiName: `stock-analyser-api-${stage}`,
      description: `Stock Analyser ${stage} API`,
      deployOptions: { stageName: stage },
      defaultCorsPreflightOptions: corsPreflightOptions,
    });

    const authoriser = new apigateway.CognitoUserPoolsAuthorizer(this, 'JwtAuthoriser', {
      cognitoUserPools: [userPool],
      authorizerName: `stock-analyser-jwt-${stage}`,
      resultsCacheTtl: cdk.Duration.minutes(5),
    });
    const auth = authMethodOptions(authoriser);

    // D8 write-path: account-data mutation Lambdas read the caller's membership
    // row from the launchpad-owned members table. The grant is dynamodb:GetItem
    // ONLY (no Query/index/writes) on this one table — a minimal, auditable
    // cross-domain read; any scope creep shows up as an IAM diff.
    const accountMembersTable = dynamodb.Table.fromTableAttributes(
      this,
      'AccountMembersTable',
      {
        tableName: `launchpad-account-members-${stage}`,
        globalIndexes: ['appSlug-index'],
      },
    );
    const grantMembershipRead = (fn: lambdaNodejs.NodejsFunction) => {
      fn.addEnvironment('ACCOUNT_MEMBERS_TABLE', accountMembersTable.tableName);
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['dynamodb:GetItem'],
        resources: [accountMembersTable.tableArn],
      }));
    };

    // #572: the notification engine reads account display names for the send-log
    // (best-effort, read-time). GetItem-only on the launchpad-owned accounts
    // table — same minimal cross-domain read pattern as the members table above.
    const accountsTable = dynamodb.Table.fromTableName(this, 'LaunchpadAccountsTable', `launchpad-accounts-${stage}`);

    const bundling: lambdaNodejs.BundlingOptions = {
      externalModules: ['@aws-sdk/*'],
      minify: true,
      sourceMap: false,
      forceDockerBundling: false,
    };

    const portfolioFn = new lambdaNodejs.NodejsFunction(this, 'PortfolioFn', {
      functionName: `transformotion-portfolio-${stage}`,
      entry: path.join(__dirname, '../functions/portfolio/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: { PORTFOLIO_TABLE: portfolioTable.tableName },
      bundling,
    });
    portfolioTable.grantReadWriteData(portfolioFn);
    grantMembershipRead(portfolioFn);

    const portfolioIntegration = new apigateway.LambdaIntegration(portfolioFn, { proxy: true });
    const portfolio = this.api.root.addResource('portfolio');
    portfolio.addMethod('GET', portfolioIntegration, auth);
    portfolio.addMethod('PUT', portfolioIntegration, auth);

    const watchlistFn = new lambdaNodejs.NodejsFunction(this, 'WatchlistFn', {
      functionName: `transformotion-watchlist-${stage}`,
      entry: path.join(__dirname, '../functions/watchlist/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: { WATCHLIST_TABLE: watchlistTable.tableName },
      bundling,
    });
    watchlistTable.grantReadWriteData(watchlistFn);
    grantMembershipRead(watchlistFn);

    const watchlistIntegration = new apigateway.LambdaIntegration(watchlistFn, { proxy: true });
    const watchlist = this.api.root.addResource('watchlist');
    watchlist.addMethod('GET', watchlistIntegration, auth);
    watchlist.addMethod('PUT', watchlistIntegration, auth);

    const cacheFn = new lambdaNodejs.NodejsFunction(this, 'CacheFn', {
      functionName: `transformotion-analysis-cache-${stage}`,
      entry: path.join(__dirname, '../functions/analysis-cache/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        CACHE_TABLE: analysisCacheTable.tableName,
        JOB_RESULTS_TABLE: jobResultsTable.tableName,
      },
      bundling,
    });
    analysisCacheTable.grantReadWriteData(cacheFn);
    jobResultsTable.grantReadData(cacheFn);
    grantMembershipRead(cacheFn); // D9 write tier on PUT/DELETE — live membership-row check

    const cacheIntegration = new apigateway.LambdaIntegration(cacheFn, { proxy: true });
    const cacheKey = this.api.root
      .addResource('analysis-cache')
      .addResource('{key}');
    cacheKey.addMethod('GET', cacheIntegration, auth);
    cacheKey.addMethod('PUT', cacheIntegration, auth);
    cacheKey.addMethod('DELETE', cacheIntegration, auth);

    const cycleDataFn = new lambdaNodejs.NodejsFunction(this, 'CycleDataFn', {
      functionName: `transformotion-cycle-data-${stage}`,
      entry: path.join(__dirname, '../functions/cycle-data/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 512,
      environment: { ANALYSIS_CACHE_TABLE: analysisCacheTable.tableName },
      bundling,
    });
    analysisCacheTable.grantReadWriteData(cycleDataFn);

    const cycleDataIntegration = new apigateway.LambdaIntegration(cycleDataFn, { proxy: true });
    const cycle = this.api.root.addResource('cycle');
    const cycleOhlcv = cycle.addResource('ohlcv');
    cycleOhlcv.addMethod('GET', cycleDataIntegration, auth);

    const marketDataFn = new lambdaNodejs.NodejsFunction(this, 'MarketDataFn', {
      functionName: `transformotion-market-data-${stage}`,
      entry: path.join(__dirname, '../functions/market-data/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: { ANALYSIS_CACHE_TABLE: analysisCacheTable.tableName },
      bundling,
    });
    analysisCacheTable.grantReadWriteData(marketDataFn);

    const marketDataIntegration = new apigateway.LambdaIntegration(marketDataFn, { proxy: true });
    const price = this.api.root.addResource('price');
    const priceOhlcv = price.addResource('ohlcv');
    priceOhlcv.addMethod('GET', marketDataIntegration, auth);

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

    const notificationEngineRole = new iam.Role(this, 'NotificationEngineRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Dedicated Stock Analyser M19 background notification engine execution role',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    const notificationEngineFn = new lambdaNodejs.NodejsFunction(this, 'NotificationEngineFn', {
      functionName: `stock-analyser-notification-engine-${stage}`,
      entry: path.join(__dirname, '../functions/notification-engine/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      role: notificationEngineRole,
      environment: {
        STAGE: stage,
        PORTFOLIO_TABLE: portfolioTable.tableName,
        WATCHLIST_TABLE: watchlistTable.tableName,
        SETTINGS_TABLE: settingsTable.tableName,
        NOTIFICATION_STATE_TABLE: notificationStateTable.tableName,
        SEND_LOG_TABLE: notificationSendLogTable.tableName,
        ACCOUNTS_TABLE: accountsTable.tableName,
        ANALYSIS_CACHE_TABLE: analysisCacheTable.tableName,
        ACCOUNT_MEMBERS_TABLE: accountMembersTable.tableName,
        ANALYSIS_CACHE_FUNCTION_NAME: cacheFn.functionName,
        ANTHROPIC_SECRET_NAME: anthropicSecret.secretName,
        OPENAI_SECRET_NAME: openaiSecret.secretName,
        AI_CONFIG_TABLE: aiRuntimeConfigTable.tableName,
        APP_AI_CONFIG_TABLE: settingsTable.tableName,
        AI_FALLBACK_PROVIDER: 'claude',
        AI_FALLBACK_MODEL: 'claude-sonnet-4-6',
        FROM_EMAIL: `noreply${stage === 'prod' ? '' : `-${stage}`}@transformotion.com.au`,
        APP_URL: `https://${stage === 'prod' ? 'apps' : 'dev.apps'}.transformotion.com.au`,
      },
      bundling,
    });
    portfolioTable.grantReadData(notificationEngineFn);
    watchlistTable.grantReadData(notificationEngineFn);
    settingsTable.grantReadData(notificationEngineFn);
    notificationStateTable.grantReadWriteData(notificationEngineFn);
    // #572: write-only on the send-log (the engine only appends run records;
    // reads belong to #573). Best-effort GetItem on launchpad-accounts for names.
    notificationSendLogTable.grantWriteData(notificationEngineFn);
    notificationEngineFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:GetItem'],
      resources: [accountsTable.tableArn],
    }));
    accountMembersTable.grantReadData(notificationEngineFn);
    notificationEngineFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:GetItem'],
      resources: [analysisCacheTable.tableArn],
      conditions: {
        'ForAllValues:StringEquals': {
          'dynamodb:LeadingKeys': ['SHARED'],
        },
      },
    }));
    anthropicSecret.grantRead(notificationEngineFn);
    openaiSecret.grantRead(notificationEngineFn);
    aiRuntimeConfigTable.grantReadData(notificationEngineFn);
    cacheFn.grantInvoke(notificationEngineFn);
    notificationEngineFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'sesv2:SendEmail'],
      resources: ['*'],
    }));

    new events.Rule(this, 'NotificationEngineDailySchedule', {
      ruleName: `stock-analyser-notification-engine-daily-${stage}`,
      description: 'Daily Stock Analyser M19 background notification processing',
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
      targets: [new targets.LambdaFunction(notificationEngineFn)],
    });

    const aiProxyFn = new lambdaNodejs.NodejsFunction(this, 'AiProxyFn', {
      functionName: `stock-analyser-ai-proxy-${stage}`,
      entry: path.join(__dirname, '../functions/ai-proxy/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(600),
      memorySize: 512,
      environment: {
        ANTHROPIC_SECRET_NAME: anthropicSecret.secretName,
        OPENAI_SECRET_NAME: openaiSecret.secretName,
        AI_CONFIG_TABLE: aiRuntimeConfigTable.tableName,
        APP_AI_CONFIG_TABLE: settingsTable.tableName,
        AI_FALLBACK_PROVIDER: 'claude',
        AI_FALLBACK_MODEL: 'claude-sonnet-4-6',
        JOB_RESULTS_TABLE: jobResultsTable.tableName,
        WS_API_ENDPOINT: wsApiEndpoint,
      },
      bundling,
    });
    anthropicSecret.grantRead(aiProxyFn);
    openaiSecret.grantRead(aiProxyFn);
    aiRuntimeConfigTable.grantReadData(aiProxyFn);
    settingsTable.grantReadData(aiProxyFn);
    jobResultsTable.grantReadWriteData(aiProxyFn);
    aiProxyFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [
        `arn:aws:lambda:${this.region}:${this.account}:function:stock-analyser-ai-proxy-${stage}`,
      ],
    }));
    aiProxyFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${wsApiId}/${stage}/*`],
    }));

    const apiResource = this.api.root.addResource('api');
    apiResource
      .addResource('claude')
      .addMethod('POST', new apigateway.LambdaIntegration(aiProxyFn, { proxy: true }), auth);

    const settingsFn = new lambdaNodejs.NodejsFunction(this, 'SettingsFn', {
      functionName: `stock-analyser-settings-${stage}`,
      entry: path.join(__dirname, '../functions/settings/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        SETTINGS_TABLE: settingsTable.tableName,
        PLATFORM_CONFIG_TABLE: aiRuntimeConfigTable.tableName,
      },
      bundling,
    });
    settingsTable.grantReadWriteData(settingsFn);
    aiRuntimeConfigTable.grantReadData(settingsFn);
    // M19 #534: notification-config writes are D8 control-plane (owner/manager) —
    // the handler reads the live membership row to authorize. GetItem-only grant.
    grantMembershipRead(settingsFn);

    const settingsIntegration = new apigateway.LambdaIntegration(settingsFn, { proxy: true });
    const settings = this.api.root.addResource('settings');
    settings.addMethod('GET', settingsIntegration, auth);
    settings.addMethod('PATCH', settingsIntegration, auth);

    const aiConfig = this.api.root.addResource('ai-config');
    const aiConfigOverride = aiConfig.addResource('override');
    aiConfig.addMethod('GET', settingsIntegration, auth);
    aiConfigOverride.addMethod('PUT', settingsIntegration, auth);
    aiConfigOverride.addMethod('DELETE', settingsIntegration, auth);

    const cacheFreshness = this.api.root.addResource('cache-freshness');
    cacheFreshness.addMethod('GET', settingsIntegration, auth);
    cacheFreshness.addMethod('PUT', settingsIntegration, auth);

    // M19 #534 notification preferences.
    const notificationConfig = this.api.root.addResource('notification-config');
    notificationConfig.addMethod('GET', settingsIntegration, auth);
    notificationConfig.addMethod('PUT', settingsIntegration, auth);
    const notificationConsent = this.api.root.addResource('notification-consent');
    notificationConsent.addMethod('GET', settingsIntegration, auth);
    notificationConsent.addMethod('PUT', settingsIntegration, auth);
    // M19 #571 engine kill-switch (app-wide): GET any member; PUT site/app-admin.
    const notificationEngineConfig = this.api.root.addResource('notification-engine-config');
    notificationEngineConfig.addMethod('GET', settingsIntegration, auth);
    notificationEngineConfig.addMethod('PUT', settingsIntegration, auth);

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'Stock Analyser REST API URL',
      exportName: `StockAnalyserApi-${stage}-Url`,
    });

    new cdk.CfnOutput(this, 'AiApiUrl', {
      value: `${this.api.url}api/claude`,
      description: 'Stock Analyser AI proxy URL',
      exportName: `StockAnalyserApi-${stage}-AiApiUrl`,
    });

    new cdk.CfnOutput(this, 'ClaudeApiUrl', {
      value: `${this.api.url}api/claude`,
      description: 'Compatibility output for the Stock Analyser AI proxy URL',
      exportName: `StockAnalyserApi-${stage}-ClaudeApiUrl`,
    });

    new cdk.CfnOutput(this, 'AnalysisCacheUrl', {
      value: `${this.api.url}analysis-cache`,
      description: 'Stock Analyser analysis-cache URL',
      exportName: `StockAnalyserApi-${stage}-AnalysisCacheUrl`,
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
    authorizer: authoriser,
    authorizationType: apigateway.AuthorizationType.COGNITO,
    methodResponses: [
      {
        statusCode: '200',
        responseParameters: {
          'method.response.header.Access-Control-Allow-Origin': true,
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
