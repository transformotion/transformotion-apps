import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import { Construct } from 'constructs';
import { loadAppRegistry } from '../../../infrastructure/lib/app-registry';

export interface LaunchpadControlPlaneStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
  userPoolId: string;
  userPoolArn: string;
  stockAnalyserAppClientId: string;
  budgetTrackerAppClientId: string;
  usersTableName: string;
  accountsTableName: string;
  accountMembersTableName: string;
  invitationsTableName: string;
  rateLimitsTableName: string;
  appAdminGrantsTableName: string;
  fromEmail: string;
  appUrl: string;
}

/**
 * LaunchpadControlPlaneStack - Launchpad-owned control-plane API foundation.
 *
 * LaunchpadAuth owns Cognito and auth-domain data. This stack owns the
 * Launchpad product/control-plane API surface that consumes that auth domain.
 */
export class LaunchpadControlPlaneStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: LaunchpadControlPlaneStackProps) {
    super(scope, id, props);

    const {
      stage,
      userPoolId,
      userPoolArn,
      stockAnalyserAppClientId,
      budgetTrackerAppClientId,
      usersTableName,
      accountsTableName,
      accountMembersTableName,
      invitationsTableName,
      rateLimitsTableName,
      appAdminGrantsTableName,
      fromEmail,
      appUrl,
    } = props;
    const registry = loadAppRegistry();
    const appSlugs = registry.apps.map(a => a.slug);
    const corsAllowOrigin = appUrl.replace(/\/*$/, '');
    const corsAllowHeaders = ['Content-Type', 'Authorization', 'X-Account-Id'];
    const corsAllowMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];

    this.api = new apigateway.RestApi(this, 'LaunchpadControlPlaneApi', {
      restApiName: `launchpad-control-plane-${stage}`,
      description: `Launchpad ${stage} control-plane API`,
      deployOptions: { stageName: stage },
      defaultCorsPreflightOptions: {
        allowOrigins: [corsAllowOrigin],
        allowMethods: corsAllowMethods,
        allowHeaders: corsAllowHeaders,
      },
    });

    const userPool = cognito.UserPool.fromUserPoolId(this, 'UserPool', userPoolId);
    const authoriser = new apigateway.CognitoUserPoolsAuthorizer(this, 'JwtAuthoriser', {
      cognitoUserPools: [userPool],
      authorizerName: `launchpad-control-plane-jwt-${stage}`,
      resultsCacheTtl: cdk.Duration.minutes(5),
    });
    const authOptions: apigateway.MethodOptions = {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer: authoriser,
    };

    this.api.root.addResource('health').addMethod(
      'GET',
      new apigateway.MockIntegration({
        integrationResponses: [{ statusCode: '200' }],
        passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
        requestTemplates: { 'application/json': '{"statusCode": 200}' },
      }),
      {
        methodResponses: [{ statusCode: '200' }],
      },
    );

    const rateLimitTable = dynamodb.Table.fromTableName(
      this,
      'LookupProviderRateLimitTable',
      rateLimitsTableName,
    );

    const aiRuntimeConfigTable = new dynamodb.Table(this, 'AiRuntimeConfigTable', {
      tableName: `launchpad-ai-runtime-config-${stage}`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });
    const budgetTrackerSettingsTable = dynamodb.Table.fromTableName(
      this,
      'BudgetTrackerSettingsTable',
      `budget-tracker.settings-${stage}`,
    );
    const stockAnalyserSettingsTable = dynamodb.Table.fromTableName(
      this,
      'StockAnalyserSettingsTable',
      `stock-analyser.settings-${stage}`,
    );

    const forgotProviderFn = new lambdaNodejs.NodejsFunction(this, 'ForgotProviderFn', {
      functionName: `launchpad-forgot-provider-${stage}`,
      entry: path.join(__dirname, '../functions/forgot-provider/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        RATE_LIMIT_TABLE: rateLimitTable.tableName,
        USER_POOL_ID: userPoolId,
        FROM_EMAIL: fromEmail,
        APP_URL: appUrl,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    rateLimitTable.grantReadWriteData(forgotProviderFn);

    forgotProviderFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${userPoolId}`],
    }));

    forgotProviderFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'sesv2:SendEmail'],
      resources: ['*'],
    }));

    const authResource = this.api.root.addResource('auth');
    authResource
      .addResource('lookup-provider')
      .addMethod('POST', new apigateway.LambdaIntegration(forgotProviderFn, { proxy: true }));

    const accountsTable = dynamodb.Table.fromTableName(
      this,
      'AccountsTable',
      accountsTableName,
    );
    const accountMembersTable = dynamodb.Table.fromTableAttributes(
      this,
      'AccountMembersTable',
      {
        tableName: accountMembersTableName,
        globalIndexes: ['userId-index', 'appSlug-index'],
      },
    );

    const appAdminGrantsTable = dynamodb.Table.fromTableAttributes(
      this,
      'AppAdminGrantsTable',
      {
        tableName: appAdminGrantsTableName,
        globalIndexes: ['userId-index'],
      },
    );

    const usersTable = dynamodb.Table.fromTableName(
      this,
      'UsersTable',
      usersTableName,
    );

    const accountProvisioningFn = new lambdaNodejs.NodejsFunction(this, 'AccountProvisioningFn', {
      functionName: `launchpad-account-provisioning-${stage}`,
      entry: path.join(__dirname, '../functions/account-provisioning/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        USERS_TABLE: usersTable.tableName,
        ACCOUNT_MEMBERS_TABLE: accountMembersTable.tableName,
        USER_POOL_ID: userPoolId,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    usersTable.grantReadWriteData(accountProvisioningFn);
    accountMembersTable.grantReadData(accountProvisioningFn);
    // M16 D11: AdminGetUser to resolve displayName from Cognito given/family name on first login.
    accountProvisioningFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPoolArn],
    }));

    authResource
      .addResource('setup')
      .addMethod('POST', new apigateway.LambdaIntegration(accountProvisioningFn, { proxy: true }), authOptions);

    const userFn = new lambdaNodejs.NodejsFunction(this, 'UserFn', {
      functionName: `launchpad-user-${stage}`,
      entry: path.join(__dirname, '../functions/user/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        USERS_TABLE: usersTable.tableName,
        ACCOUNTS_TABLE: accountsTable.tableName,
        ACCOUNT_MEMBERS_TABLE: accountMembersTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    usersTable.grantReadWriteData(userFn);
    accountsTable.grantReadData(userFn);
    accountMembersTable.grantReadData(userFn);

    const apiResource = this.api.root.addResource('api');
    const userResource = apiResource.addResource('user');
    userResource
      .addResource('profile')
      .addMethod('GET', new apigateway.LambdaIntegration(userFn, { proxy: true }), authOptions);
    userResource
      .addResource('preferences')
      .addMethod('PUT', new apigateway.LambdaIntegration(userFn, { proxy: true }), authOptions);

    const activeAccountsResource = userResource.addResource('active-accounts');
    activeAccountsResource.addMethod('GET', new apigateway.LambdaIntegration(userFn, { proxy: true }), authOptions);
    activeAccountsResource
      .addResource('{appSlug}')
      .addMethod('PUT', new apigateway.LambdaIntegration(userFn, { proxy: true }), authOptions);

    const accountsFn = new lambdaNodejs.NodejsFunction(this, 'AccountsFn', {
      functionName: `launchpad-accounts-${stage}`,
      entry: path.join(__dirname, '../functions/accounts/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        ACCOUNTS_TABLE: accountsTable.tableName,
        ACCOUNT_MEMBERS_TABLE: accountMembersTable.tableName,
        APP_CLIENT_STOCK_ANALYSER: stockAnalyserAppClientId,
        APP_CLIENT_BUDGET_TRACKER: budgetTrackerAppClientId,
        APP_SLUGS: appSlugs.join(','),
        USER_POOL_ID: userPoolId,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    accountsTable.grantReadWriteData(accountsFn);
    accountMembersTable.grantReadWriteData(accountsFn);
    // M16 Phase 6 (PR-6B): member removal / account deletion terminate the target's
    // session (AdminUserGlobalSignOut, D8) and verify supervisory site-admin LIVE
    // (AdminListGroupsForUser, D-3).
    // M11 A4: POST /accounts ensures the creator's `{app}-app-access` group
    // (AdminAddUserToGroup) — the runtime `ensureAppAccessGroup`. Scoped to the pool.
    accountsFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminUserGlobalSignOut',
        'cognito-idp:AdminListGroupsForUser',
        'cognito-idp:AdminAddUserToGroup',
      ],
      resources: [userPoolArn],
    }));

    // M16 Phase 2 — access summary (site-admin directory of all users with app/account access)
    const accessSummaryFn = new lambdaNodejs.NodejsFunction(this, 'AccessSummaryFn', {
      functionName: `launchpad-access-summary-${stage}`,
      entry: path.join(__dirname, '../functions/access-summary/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        USERS_TABLE: usersTable.tableName,
        ACCOUNTS_TABLE: accountsTable.tableName,
        ACCOUNT_MEMBERS_TABLE: accountMembersTable.tableName,
        APP_ADMIN_GRANTS_TABLE: appAdminGrantsTable.tableName,
        USER_POOL_ID: userPoolId,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    usersTable.grantReadData(accessSummaryFn);
    accountsTable.grantReadData(accessSummaryFn);
    accountMembersTable.grantReadData(accessSummaryFn);
    appAdminGrantsTable.grantReadData(accessSummaryFn);

    accessSummaryFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:ListUsersInGroup'],
      resources: [userPoolArn],
    }));

    const invitationsTable = dynamodb.Table.fromTableName(
      this,
      'InvitationsTable',
      invitationsTableName,
    );

    const invitationsFn = new lambdaNodejs.NodejsFunction(this, 'InvitationsFn', {
      functionName: `launchpad-invitations-${stage}`,
      entry: path.join(__dirname, '../functions/invitations/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        ACCOUNTS_TABLE: accountsTable.tableName,
        INVITATIONS_TABLE: invitationsTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    accountsTable.grantReadData(invitationsFn);
    invitationsTable.grantReadWriteData(invitationsFn);

    // M11 A5 — invitation-bundle redemption (POST /api/invitations/bundles/{bundleId}/redeem).
    const invitationRedemptionFn = new lambdaNodejs.NodejsFunction(this, 'InvitationRedemptionFn', {
      functionName: `launchpad-invitation-redemption-${stage}`,
      entry: path.join(__dirname, '../functions/invitation-redemption/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        INVITATIONS_TABLE: invitationsTable.tableName,
        ACCOUNTS_TABLE: accountsTable.tableName,
        ACCOUNT_MEMBERS_TABLE: accountMembersTable.tableName,
        USERS_TABLE: usersTable.tableName,
        USER_POOL_ID: userPoolId,
        APP_REGISTRY: JSON.stringify(registry),
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    invitationsTable.grantReadWriteData(invitationRedemptionFn); // read bundle + mark accepted
    accountsTable.grantReadData(invitationRedemptionFn);          // account-invite: resolve account/appSlug
    accountMembersTable.grantReadWriteData(invitationRedemptionFn); // duplicate check + add membership
    usersTable.grantReadData(invitationRedemptionFn);             // disabled-status check
    // Ensure the `{app}-app-access` group on redemption (membership ⟹ access; the
    // access-only app-grant). The runtime `ensureAppAccessGroup`. Scoped to the pool.
    invitationRedemptionFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminAddUserToGroup'],
      resources: [userPoolArn],
    }));

    const accountsIntegration = new apigateway.LambdaIntegration(accountsFn, { proxy: true });
    const accountsResource = this.api.root.addResource('accounts');
    accountsResource.addMethod('POST', accountsIntegration, authOptions);

    const accountResource = accountsResource.addResource('{accountId}');
    accountResource.addMethod('GET', accountsIntegration, authOptions);
    accountResource.addMethod('PUT', accountsIntegration, authOptions);
    accountResource.addMethod('DELETE', accountsIntegration, authOptions);

    const membersResource = accountResource.addResource('members');
    membersResource.addMethod('GET', accountsIntegration, authOptions);
    // M16 Phase 6 (R2): full member detail (ListAccountMembersResponse).
    membersResource
      .addResource('detail')
      .addMethod('GET', accountsIntegration, authOptions);
    membersResource
      .addResource('{userId}')
      .addMethod('DELETE', accountsIntegration, authOptions);

    accountResource
      .addResource('invitations')
      .addMethod('POST', new apigateway.LambdaIntegration(invitationsFn, { proxy: true }), authOptions);

    // M11 A5 — POST /api/invitations/bundles/{bundleId}/redeem (auth-only; invitee-only enforced in-handler).
    apiResource
      .addResource('invitations')
      .addResource('bundles')
      .addResource('{bundleId}')
      .addResource('redeem')
      .addMethod('POST', new apigateway.LambdaIntegration(invitationRedemptionFn, { proxy: true }), authOptions);

    const aiRuntimeConfigFn = new lambdaNodejs.NodejsFunction(this, 'AiRuntimeConfigFn', {
      functionName: `launchpad-ai-runtime-config-${stage}`,
      entry: path.join(__dirname, '../functions/ai-runtime-config/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        AI_CONFIG_TABLE: aiRuntimeConfigTable.tableName,
        BUDGET_TRACKER_SETTINGS_TABLE: budgetTrackerSettingsTable.tableName,
        STOCK_ANALYSER_SETTINGS_TABLE: stockAnalyserSettingsTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    aiRuntimeConfigTable.grantReadWriteData(aiRuntimeConfigFn);
    aiRuntimeConfigFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:GetItem', 'dynamodb:DescribeTable'],
      resources: [
        budgetTrackerSettingsTable.tableArn,
        stockAnalyserSettingsTable.tableArn,
      ],
    }));

    // M16 Phase 2 — admin user access directory
    const adminResource = apiResource.addResource('admin');
    adminResource
      .addResource('users')
      .addResource('access')
      .addMethod('GET', new apigateway.LambdaIntegration(accessSummaryFn, { proxy: true }), authOptions);

    const aiRuntimeConfigResource = adminResource.addResource('ai-runtime-config');
    const aiRuntimeConfigIntegration = new apigateway.LambdaIntegration(aiRuntimeConfigFn, { proxy: true });
    aiRuntimeConfigResource.addMethod('GET', aiRuntimeConfigIntegration, authOptions);
    aiRuntimeConfigResource
      .addResource('platform-default')
      .addMethod('PUT', aiRuntimeConfigIntegration, authOptions);
    aiRuntimeConfigResource
      .addResource('apps')
      .addResource('{appSlug}')
      .addResource('override')
      .addMethod('PUT', aiRuntimeConfigIntegration, authOptions);
    aiRuntimeConfigResource
      .getResource('apps')!
      .getResource('{appSlug}')!
      .getResource('override')!
      .addMethod('DELETE', aiRuntimeConfigIntegration, authOptions);

    const corsHeaders = {
      'Access-Control-Allow-Origin': `'${corsAllowOrigin}'`,
      'Access-Control-Allow-Headers': `'${corsAllowHeaders.join(',')}'`,
      'Access-Control-Allow-Methods': `'${corsAllowMethods.join(',')}'`,
    };
    [
      apigateway.ResponseType.UNAUTHORIZED,
      apigateway.ResponseType.ACCESS_DENIED,
      apigateway.ResponseType.DEFAULT_4XX,
      apigateway.ResponseType.DEFAULT_5XX,
    ].forEach((type, i) => {
      new apigateway.GatewayResponse(this, `GwResp${i}`, {
        restApi: this.api,
        type,
        responseHeaders: corsHeaders,
      });
    });

    new cdk.CfnOutput(this, 'ControlPlaneApiUrl', {
      value: this.api.url,
      exportName: `Transformotion-${stage}-LaunchpadControlPlaneApiUrl`,
    });

    new cdk.CfnOutput(this, 'ControlPlaneRestApiId', {
      value: this.api.restApiId,
      exportName: `Transformotion-${stage}-LaunchpadControlPlaneRestApiId`,
    });

    new cdk.CfnOutput(this, 'AiRuntimeConfigTableName', {
      value: aiRuntimeConfigTable.tableName,
      exportName: `Transformotion-${stage}-LaunchpadAiRuntimeConfigTableName`,
    });
  }
}
