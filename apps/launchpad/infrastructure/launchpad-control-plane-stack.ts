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
  launchpadAppClientId: string;
  stockAnalyserAppClientId: string;
  budgetTrackerAppClientId: string;
  usersTableName: string;
  accountsTableName: string;
  accountMembersTableName: string;
  invitationsTableName: string;
  rateLimitsTableName: string;
  appAdminGrantsTableName: string;
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
      launchpadAppClientId,
      stockAnalyserAppClientId,
      budgetTrackerAppClientId,
      usersTableName,
      accountsTableName,
      accountMembersTableName,
      invitationsTableName,
      rateLimitsTableName,
      appAdminGrantsTableName,
      appUrl,
    } = props;
    const registry = loadAppRegistry();
    const appSlugs = registry.apps.map(a => a.slug);
    const corsAllowOrigin = appUrl.replace(/\/*$/, '');

    // Stage-derived sender so dev and prod can NEVER be confused (owner
    // foolproofing): dev → noreply-dev@, prod → noreply@. Derived from the same
    // `stage` that gates everything else — there is no separate literal to drift.
    // Both forms are covered by the verified transformotion.com.au SES domain
    // identity (it covers every @transformotion.com.au address). Prod sends
    // through prod SES, which is its own setup at M17 (#454).
    const redemptionFromAddress = `noreply${stage === 'prod' ? '' : `-${stage}`}@transformotion.com.au`;
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
        FROM_EMAIL: redemptionFromAddress,
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
        // M11: ListAccountMembers surfaces an account's pending invitations (was a
        // Phase-8 empty stub) — read-only filtered Scan of the invitation store.
        INVITATIONS_TABLE: invitationsTableName,
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
    // M11: read-only grant so AccountsFn can Scan the invitation store for an
    // account's pending invitations (account-scoped, owner/manager/admin-gated).
    dynamodb.Table.fromTableName(this, 'AccountsInvitationsTable', invitationsTableName)
      .grantReadData(accountsFn);
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
        // M11: per-user pending-invitation COUNT badge — read-only Scan of the
        // invitation store (was a hardcoded 0 placeholder).
        INVITATIONS_TABLE: invitationsTableName,
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
    // M11: read-only grant so AccessSummaryFn can Scan the invitation store for
    // the per-user pending-invitation count.
    dynamodb.Table.fromTableName(this, 'AccessSummaryInvitationsTable', invitationsTableName)
      .grantReadData(accessSummaryFn);

    accessSummaryFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:ListUsersInGroup'],
      resources: [userPoolArn],
    }));

    // M11 Users & Access — site-admin supervisory user disable/enable
    // (PUT /api/admin/users/{userId}/status).
    const adminUsersFn = new lambdaNodejs.NodejsFunction(this, 'AdminUsersFn', {
      functionName: `launchpad-admin-users-${stage}`,
      entry: path.join(__dirname, '../functions/admin-users/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        USERS_TABLE: usersTable.tableName,
        USER_POOL_ID: userPoolId,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    usersTable.grantReadWriteData(adminUsersFn); // persist status
    // Live site-admin check (don't trust the stale claim) + disable/enable +
    // terminate existing sessions on disable. Scoped to the pool ARN.
    adminUsersFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminListGroupsForUser',
        'cognito-idp:AdminDisableUser',
        'cognito-idp:AdminEnableUser',
        'cognito-idp:AdminUserGlobalSignOut',
      ],
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
        // SERVER-SIDE boundary for the demo BYPASS (redeem-as / impersonation): the
        // deployed environment. The bypass is structurally refused unless STAGE !=
        // 'prod' — this is the real guard, NOT the client dev-tools flag.
        STAGE: stage,
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
    // disabled-status check (GET) + ensureUserRow upsert (#496 PutItem). The
    // redemption write is REQUIRED: an invitee may redeem before any app load,
    // so it cannot rely on account-provisioning's first-load bootstrap of this
    // row. Scoped to launchpad-users only (table + its indexes), matching the
    // readWrite userFn/accountProvisioningFn already hold for this table. (#567)
    usersTable.grantReadWriteData(invitationRedemptionFn);
    // Ensure the `{app}-app-access` group on redemption (membership ⟹ access; the
    // access-only app-grant). AdminListGroupsForUser + ListUsers serve the DEV-ONLY
    // redeem-as bypass (resolve + impersonate the invitee), which is refused in prod
    // server-side by the STAGE guard. Scoped to the pool ARN.
    invitationRedemptionFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminAddUserToGroup',
        'cognito-idp:AdminListGroupsForUser',
        'cognito-idp:ListUsers',
      ],
      resources: [userPoolArn],
    }));

    // M11 Chunk 3 — invitation-bundle CREATION (POST /api/invitations/bundles).
    const invitationBundlesFn = new lambdaNodejs.NodejsFunction(this, 'InvitationBundlesFn', {
      functionName: `launchpad-invitation-bundles-${stage}`,
      entry: path.join(__dirname, '../functions/invitation-bundles/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        INVITATIONS_TABLE: invitationsTable.tableName,
        ACCOUNTS_TABLE: accountsTable.tableName,
        // M11 cancel-grant: LIVE owner/manager check against the members table.
        ACCOUNT_MEMBERS_TABLE: accountMembersTable.tableName,
        // Redemption-email send seam (4b / #471): the invitee gets the grants
        // preview + /redeem?bundle=<id> bearer link on bundle creation.
        FROM_EMAIL: redemptionFromAddress,
        APP_URL: appUrl,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    invitationsTable.grantReadWriteData(invitationBundlesFn); // write the bundle (create + cancel-grant)
    accountsTable.grantReadData(invitationBundlesFn);          // account-invite: validate account/app
    accountMembersTable.grantReadData(invitationBundlesFn);    // M11 cancel-grant: LIVE owner/manager check
    // Send the redemption email (4b / #471). SES SendEmail can't be ARN-scoped to
    // a from-identity without conditions; mirror forgot-provider's grant.
    invitationBundlesFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'sesv2:SendEmail'],
      resources: ['*'],
    }));
    // No Cognito grant: sender authorization (site-admin / app-admin) reads the
    // token's cognito:groups — no AWS calls. Grants are CONFERRED at redemption (A5).

    // M11 Composer — invitee discovery (POST /api/invitations/invitee-search).
    const inviteeSearchFn = new lambdaNodejs.NodejsFunction(this, 'InviteeSearchFn', {
      functionName: `launchpad-invitee-search-${stage}`,
      entry: path.join(__dirname, '../functions/invitee-search/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        USERS_TABLE: usersTable.tableName,
        ACCOUNTS_TABLE: accountsTable.tableName,
        ACCOUNT_MEMBERS_TABLE: accountMembersTable.tableName,
        INVITATIONS_TABLE: invitationsTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    usersTable.grantReadData(inviteeSearchFn);          // directory
    accountsTable.grantReadData(inviteeSearchFn);       // account names/apps
    accountMembersTable.grantReadData(inviteeSearchFn); // scope + reasons (+ userId-index)
    invitationsTable.grantReadData(inviteeSearchFn);    // pending invitees

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
    const memberResource = membersResource.addResource('{userId}');
    memberResource.addMethod('DELETE', accountsIntegration, authOptions);
    // R6 — member role change (owner/manager; role-scoped).
    memberResource.addResource('role').addMethod('PUT', accountsIntegration, authOptions);

    accountResource
      .addResource('invitations')
      .addMethod('POST', new apigateway.LambdaIntegration(invitationsFn, { proxy: true }), authOptions);

    // M11 invitation routes under /api/invitations.
    const invitationsApiResource = apiResource.addResource('invitations');
    // Composer invitee discovery (POST /api/invitations/invitee-search).
    invitationsApiResource
      .addResource('invitee-search')
      .addMethod('POST', new apigateway.LambdaIntegration(inviteeSearchFn, { proxy: true }), authOptions);
    const bundlesResource = invitationsApiResource.addResource('bundles');
    // Chunk 3 — POST create (auth-only; per-grant sender authorization in-handler).
    const invitationBundlesIntegration = new apigateway.LambdaIntegration(invitationBundlesFn, { proxy: true });
    bundlesResource.addMethod('POST', invitationBundlesIntegration, authOptions);
    // GET list — Redemption Demo inbox / admin review (site-admin all; else own).
    bundlesResource.addMethod('GET', invitationBundlesIntegration, authOptions);
    const bundleResource = bundlesResource.addResource('{bundleId}');
    // A1 — GET {bundleId}: redemption link resolve (link-as-bearer; any authed
    // holder of the unguessable id). Served by the bundles fn (read-only).
    bundleResource.addMethod('GET', invitationBundlesIntegration, authOptions);
    // M11 cancel-grant — DELETE {bundleId}/grants/{grantId}: revoke one pending
    // grant (target-resolved authz: owner/manager of the grant's account OR
    // app-admin OR site-admin). #558.
    bundleResource
      .addResource('grants')
      .addResource('{grantId}')
      .addMethod('DELETE', invitationBundlesIntegration, authOptions);
    const redemptionIntegration = new apigateway.LambdaIntegration(invitationRedemptionFn, { proxy: true });
    // A5 — POST {bundleId}/redeem (auth-only; invitee-only enforced in-handler).
    bundleResource.addResource('redeem').addMethod('POST', redemptionIntegration, authOptions);
    // Chunk 3 — POST {bundleId}/redeem-as: the DEV-ONLY demo bypass (impersonation).
    // Refused in prod SERVER-SIDE by the handler's STAGE guard (the route exists in
    // both stages; the prod handler returns 404 so it is structurally unreachable).
    bundleResource.addResource('redeem-as').addMethod('POST', redemptionIntegration, authOptions);

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
    const adminUsersResource = adminResource.addResource('users');
    adminUsersResource
      .addResource('access')
      .addMethod('GET', new apigateway.LambdaIntegration(accessSummaryFn, { proxy: true }), authOptions);
    // M11 Users & Access — supervisory disable/enable.
    adminUsersResource
      .addResource('{userId}')
      .addResource('status')
      .addMethod('PUT', new apigateway.LambdaIntegration(adminUsersFn, { proxy: true }), authOptions);

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

    // B2 — Dev persona token-mint endpoint (POST /api/dev/persona-token).
    // GUARD 1 (stack-level): the Lambda + route are ONLY synthesized in dev, so
    // this auth-bypass primitive DOES NOT EXIST in the prod stack at all. The
    // handler adds GUARD 2 (runtime STAGE==='dev' → 404) and GUARD 3 (allow-list
    // of mintable personas; leo excluded). It mints a real persona session via
    // AdminInitiateAuth using the per-persona password from Secrets Manager (B1).
    if (stage === 'dev') {
      const devPersonaTokenFn = new lambdaNodejs.NodejsFunction(this, 'DevPersonaTokenFn', {
        functionName: `launchpad-dev-persona-token-${stage}`,
        entry: path.join(__dirname, '../functions/dev-persona-token/src/index.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        environment: {
          STAGE: stage,
          USER_POOL_ID: userPoolId,
          LAUNCHPAD_CLIENT_ID: launchpadAppClientId,
          // Cross-app persona (#479): mint a session per app-client so a switch
          // carries into Stock Analyser / Budget Tracker. AdminInitiateAuth is
          // already pool-scoped in the IAM grant below — covers all three clients.
          STOCK_CLIENT_ID: stockAnalyserAppClientId,
          BUDGET_CLIENT_ID: budgetTrackerAppClientId,
        },
        bundling: { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false, forceDockerBundling: false },
      });
      // AdminInitiateAuth has NO per-user resource ARN in Cognito, so this grant is
      // necessarily pool-scoped. Its safety is COMPOSITIONAL, not from this ARN alone:
      // the Lambda can only mint a token for a user whose password it can read, and
      // GetSecretValue below is scoped to /launchpad/${stage}/personas/* — so it can
      // obtain ONLY the seeded persona passwords. Combined with the handler's
      // allow-list (the fixed PERSONA_EMAIL set), there is no path to a non-persona
      // password and therefore no path to mint a non-persona token.
      // ⚠ Do NOT broaden the secret scope below, and do NOT place any non-persona
      // secret under /personas/, without re-evaluating this — either breaks the
      // compositional bound and turns this into a pool-wide mint primitive.
      devPersonaTokenFn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['cognito-idp:AdminInitiateAuth'],
        resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${userPoolId}`],
      }));
      devPersonaTokenFn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:/launchpad/${stage}/personas/*`],
      }));
      // No Cognito authorizer: this dev tool mints a session and must work without
      // one. GUARDS 1–3 (not synthesized in prod, runtime stage check, allow-list)
      // are the security model.
      apiResource
        .addResource('dev')
        .addResource('persona-token')
        .addMethod('POST', new apigateway.LambdaIntegration(devPersonaTokenFn, { proxy: true }));
    }

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
