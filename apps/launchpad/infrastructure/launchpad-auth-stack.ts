import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as path from 'path';
import { Construct } from 'constructs';
import { loadAppRegistry } from '../../../infrastructure/lib/app-registry';
import { cognitoHostedUiCss } from './cognito-hosted-ui-css';

export interface LaunchpadAuthStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
}

/**
 * LaunchpadAuthStack - Launchpad-owned Cognito/auth-domain foundation.
 *
 * This stack is the active auth domain for Launchpad, Stock Analyser, and
 * Budget Tracker.
 */
export class LaunchpadAuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly launchpadAppClient: cognito.UserPoolClient;
  public readonly stockAnalyserAppClient: cognito.UserPoolClient;
  public readonly budgetTrackerAppClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;
  public readonly usersTable: dynamodb.Table;
  public readonly accountsTable: dynamodb.Table;
  public readonly accountMembersTable: dynamodb.Table;
  public readonly invitationsTable: dynamodb.Table;
  public readonly rateLimitsTable: dynamodb.Table;
  /** M16 D5 — app-admin grants (PK appSlug, SK userId, GSI userId-index). */
  public readonly appAdminGrantsTable: dynamodb.Table;

  private readonly stage: 'dev' | 'prod';

  constructor(scope: Construct, id: string, props: LaunchpadAuthStackProps) {
    super(scope, id, props);

    const { stage } = props;
    this.stage = stage;
    const isProd = stage === 'prod';
    const registry = loadAppRegistry();
    const appRegistryJson = JSON.stringify(registry);
    const removal = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `launchpad-auth-${stage}`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        givenName: { required: false, mutable: true },
        familyName: { required: false, mutable: true },
      },
      customAttributes: {
        active_account: new cognito.StringAttribute({ mutable: true, maxLen: 36 }),
        accounts: new cognito.StringAttribute({ mutable: true, maxLen: 2048 }),
      },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      userVerification: {
        emailSubject: 'Verify your Transformotion Apps account',
        emailBody: 'Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      removalPolicy: removal,
    });

    this.userPoolDomain = this.userPool.addDomain('UserPoolDomain', {
      cognitoDomain: {
        domainPrefix: `transformotion-launchpad-${this.account}-${stage}`,
      },
    });

    const secretCfgOf = (key: string, hint: string) => ({
      secretName: `/launchpad/${stage}/cognito/${key}`,
      description: `Launchpad auth ${stage} - ${hint} (see docs/social-idp-setup.md)`,
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 40,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    } as const);

    const socialSecrets = [
      {
        id: 'GoogleClientIdSecretName',
        secret: new secretsmanager.Secret(this, 'SecretGoogleClientId', secretCfgOf('google-client-id', 'Google OAuth 2.0 client ID')),
      },
      {
        id: 'GoogleClientSecretSecretName',
        secret: new secretsmanager.Secret(this, 'SecretGoogleClientSecret', secretCfgOf('google-client-secret', 'Google OAuth 2.0 client secret')),
      },
      {
        id: 'FacebookAppIdSecretName',
        secret: new secretsmanager.Secret(this, 'SecretFacebookAppId', secretCfgOf('facebook-app-id', 'Facebook App ID')),
      },
      {
        id: 'FacebookAppSecretSecretName',
        secret: new secretsmanager.Secret(this, 'SecretFacebookAppSecret', secretCfgOf('facebook-app-secret', 'Facebook App secret')),
      },
      {
        id: 'MicrosoftClientIdSecretName',
        secret: new secretsmanager.Secret(this, 'SecretMicrosoftClientId', secretCfgOf('microsoft-client-id', 'Microsoft OIDC client ID')),
      },
      {
        id: 'MicrosoftClientSecretSecretName',
        secret: new secretsmanager.Secret(this, 'SecretMicrosoftClientSecret', secretCfgOf('microsoft-client-secret', 'Microsoft OIDC client secret')),
      },
      {
        id: 'AppleTeamIdSecretName',
        secret: new secretsmanager.Secret(this, 'SecretAppleTeamId', secretCfgOf('apple-team-id', 'Apple Sign-In team ID placeholder')),
      },
      {
        id: 'AppleClientIdSecretName',
        secret: new secretsmanager.Secret(this, 'SecretAppleClientId', secretCfgOf('apple-client-id', 'Apple Sign-In client ID placeholder')),
      },
      {
        id: 'AppleKeyIdSecretName',
        secret: new secretsmanager.Secret(this, 'SecretAppleKeyId', secretCfgOf('apple-key-id', 'Apple Sign-In key ID placeholder')),
      },
      {
        id: 'ApplePrivateKeySecretName',
        secret: new secretsmanager.Secret(this, 'SecretApplePrivateKey', secretCfgOf('apple-private-key', 'Apple Sign-In private key placeholder')),
      },
    ];

    // Social provider secrets are staged in this foundation stack, but the
    // providers themselves are configured in a later #386 cutover PR.
    this.launchpadAppClient = this.createAppClient('LaunchpadAppClient', {
      callbackUrls: isProd
        ? [
            'https://apps.transformotion.com.au/sign-in/callback',
            'https://apps.transformotion.com.au/launchpad/callback',
          ]
        : [
            'https://dev.apps.transformotion.com.au/sign-in/callback',
            'https://dev.apps.transformotion.com.au/launchpad/callback',
            'http://localhost:3001/sign-in/callback',
            'http://localhost:3001/launchpad/callback',
          ],
      logoutUrls: isProd
        ? ['https://apps.transformotion.com.au/signed-out/']
        : ['https://dev.apps.transformotion.com.au/signed-out/', 'http://localhost:3001/signed-out/'],
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    this.stockAnalyserAppClient = this.createAppClient('StockAnalyserAppClient', {
      callbackUrls: isProd
        ? ['https://apps.transformotion.com.au/stock-analyser/callback']
        : [
            'https://dev.apps.transformotion.com.au/stock-analyser/callback',
            'http://localhost:3000/stock-analyser/callback',
          ],
      logoutUrls: isProd
        ? ['https://apps.transformotion.com.au/signed-out/']
        : ['https://dev.apps.transformotion.com.au/signed-out/', 'http://localhost:3000/signed-out/'],
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    this.budgetTrackerAppClient = this.createAppClient('BudgetTrackerAppClient', {
      callbackUrls: isProd
        ? ['https://apps.transformotion.com.au/budget-tracker/callback']
        : [
            'https://dev.apps.transformotion.com.au/budget-tracker/callback',
            'http://localhost:3002/budget-tracker/callback',
          ],
      logoutUrls: isProd
        ? ['https://apps.transformotion.com.au/signed-out/']
        : ['https://dev.apps.transformotion.com.au/signed-out/', 'http://localhost:3002/signed-out/'],
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    const groups: Array<{ name: string; description: string; precedence: number }> = [
      { name: 'site-admin', description: 'Platform administrator', precedence: 1 },
      ...registry.apps.map((app, idx) => ({
        name: app.cognitoGroup,
        description: app.groupDescription,
        precedence: 50 + idx * 10,
      })),
      { name: 'admin', description: 'Legacy platform administrators - full access to all apps', precedence: 2 },
      { name: 'stock-app', description: 'Legacy Stock Signal Analyser access', precedence: 10 },
      { name: 'budget-app', description: 'Legacy Budget Tracker access', precedence: 20 },
      { name: 'transformotion', description: 'Legacy Transformotion Framework access', precedence: 30 },
      { name: 'family', description: 'Legacy family access', precedence: 40 },
    ];

    for (const group of groups) {
      new cognito.CfnUserPoolGroup(this, `Group-${group.name}`, {
        userPoolId: this.userPool.userPoolId,
        groupName: group.name,
        description: group.description,
        precedence: group.precedence,
      });
    }

    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: `launchpad-users-${stage}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });

    // M16 D4 — exact-email lookup for redemption identity matching and duplicate detection.
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: { name: 'emailLower', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.accountsTable = new dynamodb.Table(this, 'AccountsTable', {
      tableName: `launchpad-accounts-${stage}`,
      partitionKey: { name: 'accountId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });

    this.accountMembersTable = new dynamodb.Table(this, 'AccountMembersTable', {
      tableName: `launchpad-account-members-${stage}`,
      partitionKey: { name: 'accountId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });

    this.accountMembersTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // M16 D3 — app-scoped member discovery ("users with membership in any account of app X").
    this.accountMembersTable.addGlobalSecondaryIndex({
      indexName: 'appSlug-index',
      partitionKey: { name: 'appSlug', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.invitationsTable = new dynamodb.Table(this, 'InvitationsTable', {
      tableName: `launchpad-invitations-${stage}`,
      partitionKey: { name: 'invitationId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: removal,
    });

    this.invitationsTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.rateLimitsTable = new dynamodb.Table(this, 'RateLimitsTable', {
      tableName: `launchpad-rate-limits-${stage}`,
      partitionKey: { name: 'key', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: removal,
    });

    // M16 D5 — app-admin grants: policy primitive for app-scoped administrative authority.
    // Kept separate from membership table so isAppAdmin(userId, appSlug) is unambiguous and
    // cannot be confused with account membership.
    this.appAdminGrantsTable = new dynamodb.Table(this, 'AppAdminGrantsTable', {
      tableName: `launchpad-app-admin-grants-${stage}`,
      partitionKey: { name: 'appSlug', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });

    this.appAdminGrantsTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const preTokenFn = new lambdaNodejs.NodejsFunction(this, 'PreTokenGenerationFn', {
      functionName: `launchpad-pre-token-generation-${stage}`,
      entry: path.join(__dirname, '../functions/pre-token-generation/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        ACCOUNT_MEMBERS_TABLE: this.accountMembersTable.tableName,
        ACCOUNTS_TABLE: this.accountsTable.tableName,
        APP_ADMIN_GRANTS_TABLE: this.appAdminGrantsTable.tableName,
        APP_REGISTRY: appRegistryJson,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
        forceDockerBundling: false,
      },
    });

    this.accountMembersTable.grantReadData(preTokenFn);
    this.accountsTable.grantReadData(preTokenFn);
    this.appAdminGrantsTable.grantReadData(preTokenFn);

    this.userPool.addTrigger(cognito.UserPoolOperation.PRE_TOKEN_GENERATION, preTokenFn);

    const hostedUiCustomisation = new cognito.CfnUserPoolUICustomizationAttachment(
      this,
      'HostedUICustomisation',
      {
        userPoolId: this.userPool.userPoolId,
        clientId: 'ALL',
        css: cognitoHostedUiCss,
      },
    );
    hostedUiCustomisation.node.addDependency(this.userPoolDomain);

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: `Transformotion-${stage}-LaunchpadAuth-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      exportName: `Transformotion-${stage}-LaunchpadAuth-UserPoolArn`,
    });

    new cdk.CfnOutput(this, 'LaunchpadAppClientId', {
      value: this.launchpadAppClient.userPoolClientId,
      exportName: `Transformotion-${stage}-LaunchpadAuth-LaunchpadAppClientId`,
    });

    new cdk.CfnOutput(this, 'StockAnalyserAppClientId', {
      value: this.stockAnalyserAppClient.userPoolClientId,
      exportName: `Transformotion-${stage}-LaunchpadAuth-StockAnalyserAppClientId`,
    });

    new cdk.CfnOutput(this, 'BudgetTrackerAppClientId', {
      value: this.budgetTrackerAppClient.userPoolClientId,
      exportName: `Transformotion-${stage}-LaunchpadAuth-BudgetTrackerAppClientId`,
    });

    const domain = `${this.userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`;

    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: domain,
      exportName: `Transformotion-${stage}-LaunchpadAuth-CognitoDomain`,
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: domain,
      exportName: `Transformotion-${stage}-LaunchpadAuth-UserPoolDomain`,
    });

    this.outputTable('UsersTableName', this.usersTable, 'Launchpad auth users table name');
    this.outputTable('AccountsTableName', this.accountsTable, 'Launchpad auth accounts table name');
    this.outputTable('AccountMembersTableName', this.accountMembersTable, 'Launchpad auth account-members table name');
    this.outputTable('InvitationsTableName', this.invitationsTable, 'Launchpad auth invitations table name');
    this.outputTable('RateLimitsTableName', this.rateLimitsTable, 'Launchpad auth rate-limits table name');
    this.outputTable('AppAdminGrantsTableName', this.appAdminGrantsTable, 'Launchpad auth app-admin grants table name');

    for (const { id, secret } of socialSecrets) {
      new cdk.CfnOutput(this, id, {
        value: secret.secretName,
        description: `Launchpad auth ${stage} staged secret name`,
        exportName: `Transformotion-${stage}-LaunchpadAuth-${id}`,
      });
    }
  }

  private createAppClient(
    id: string,
    options: {
      callbackUrls: string[];
      logoutUrls: string[];
      supportedIdentityProviders: cognito.UserPoolClientIdentityProvider[];
    },
  ): cognito.UserPoolClient {
    const clientName = `launchpad-${
      id.replace(/([A-Z])/g, (m, letter, offset) =>
        offset === 0 ? letter.toLowerCase() : `-${letter.toLowerCase()}`)
    }-${this.stage}`;

    return this.userPool.addClient(id, {
      userPoolClientName: clientName,
      generateSecret: false,
      preventUserExistenceErrors: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: options.callbackUrls,
        logoutUrls: options.logoutUrls,
      },
      supportedIdentityProviders: options.supportedIdentityProviders,
      authFlows: { userSrp: true, adminUserPassword: true },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true, emailVerified: true, givenName: true, familyName: true })
        .withCustomAttributes('accounts'),
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true, givenName: true, familyName: true })
        .withCustomAttributes('accounts'),
    });
  }

  private outputTable(id: string, table: dynamodb.Table, description: string): void {
    new cdk.CfnOutput(this, id, {
      value: table.tableName,
      description,
      exportName: `Transformotion-${this.stage}-LaunchpadAuth-${id}`,
    });

    new cdk.CfnOutput(this, id.replace('Name', 'Arn'), {
      value: table.tableArn,
      description: description.replace('name', 'ARN'),
      exportName: `Transformotion-${this.stage}-LaunchpadAuth-${id.replace('Name', 'Arn')}`,
    });
  }
}
