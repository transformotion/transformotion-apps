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
  fromEmail: string;
  appUrl: string;
}

/**
 * LaunchpadControlPlaneStack - Launchpad-owned control-plane API foundation.
 *
 * Cognito and shared account data remain platform-owned substrate. Launchpad
 * owns the product/control-plane API surface that will migrate here during #363.
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
      fromEmail,
      appUrl,
    } = props;
    const registry = loadAppRegistry();
    const appSlugs = registry.apps.map(a => a.slug);

    this.api = new apigateway.RestApi(this, 'LaunchpadControlPlaneApi', {
      restApiName: `launchpad-control-plane-${stage}`,
      description: `Launchpad ${stage} control-plane API`,
      deployOptions: { stageName: stage },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Account-Id'],
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
      `platform.rate-limits-${stage}`,
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
      `platform.accounts-${stage}`,
    );
    const accountMembersTable = dynamodb.Table.fromTableName(
      this,
      'AccountMembersTable',
      `platform.account-members-${stage}`,
    );

    const accountProvisioningFn = new lambdaNodejs.NodejsFunction(this, 'AccountProvisioningFn', {
      functionName: `launchpad-account-provisioning-${stage}`,
      entry: path.join(__dirname, '../functions/account-provisioning/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        ACCOUNTS_TABLE: accountsTable.tableName,
        ACCOUNT_MEMBERS_TABLE: accountMembersTable.tableName,
        USER_POOL_ID: userPoolId,
        APP_CLIENT_STOCK_ANALYSER: stockAnalyserAppClientId,
        APP_CLIENT_BUDGET_TRACKER: budgetTrackerAppClientId,
        APP_SLUGS: appSlugs.join(','),
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    accountsTable.grantReadWriteData(accountProvisioningFn);
    accountMembersTable.grantReadWriteData(accountProvisioningFn);
    accountProvisioningFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminUpdateUserAttributes'],
      resources: [userPoolArn],
    }));

    authResource
      .addResource('setup')
      .addMethod('POST', new apigateway.LambdaIntegration(accountProvisioningFn, { proxy: true }), authOptions);

    const usersTable = dynamodb.Table.fromTableName(
      this,
      'UsersTable',
      `platform.users-${stage}`,
    );

    const userFn = new lambdaNodejs.NodejsFunction(this, 'UserFn', {
      functionName: `launchpad-user-${stage}`,
      entry: path.join(__dirname, '../functions/user/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        USERS_TABLE: usersTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    usersTable.grantReadWriteData(userFn);

    const apiResource = this.api.root.addResource('api');
    const userResource = apiResource.addResource('user');
    userResource
      .addResource('profile')
      .addMethod('GET', new apigateway.LambdaIntegration(userFn, { proxy: true }), authOptions);
    userResource
      .addResource('preferences')
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
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    accountsTable.grantReadWriteData(accountsFn);
    accountMembersTable.grantReadWriteData(accountsFn);

    const invitationsTable = dynamodb.Table.fromTableName(
      this,
      'InvitationsTable',
      `platform.invitations-${stage}`,
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

    const accountsIntegration = new apigateway.LambdaIntegration(accountsFn, { proxy: true });
    const accountsResource = this.api.root.addResource('accounts');
    accountsResource.addMethod('POST', accountsIntegration, authOptions);

    const accountResource = accountsResource.addResource('{accountId}');
    accountResource.addMethod('GET', accountsIntegration, authOptions);
    accountResource.addMethod('PUT', accountsIntegration, authOptions);
    accountResource.addMethod('DELETE', accountsIntegration, authOptions);

    const membersResource = accountResource.addResource('members');
    membersResource.addMethod('GET', accountsIntegration, authOptions);
    membersResource
      .addResource('{userId}')
      .addMethod('DELETE', accountsIntegration, authOptions);

    accountResource
      .addResource('invitations')
      .addMethod('POST', new apigateway.LambdaIntegration(invitationsFn, { proxy: true }), authOptions);

    const corsHeaders = {
      'Access-Control-Allow-Origin': "'*'",
      'Access-Control-Allow-Headers': "'Content-Type,Authorization,X-Account-Id'",
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
  }
}
