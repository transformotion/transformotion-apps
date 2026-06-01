import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { loadAppRegistry } from '../../../infrastructure/lib/app-registry';
import { cognitoHostedUiCss } from './cognito-hosted-ui-css';

export interface LaunchpadAuthStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
}

/**
 * LaunchpadAuthStack - staged Launchpad-owned Cognito/auth-domain foundation.
 *
 * This stack is intentionally side-by-side with the legacy Platform AuthStack
 * during #386. Live Launchpad/SA/BT traffic is not cut over by this foundation
 * PR; later #386 work will attach triggers, move data ownership, and switch
 * frontend/runtime configuration after validation.
 */
export class LaunchpadAuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly launchpadAppClient: cognito.UserPoolClient;
  public readonly stockAnalyserAppClient: cognito.UserPoolClient;
  public readonly budgetTrackerAppClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;

  private readonly stage: 'dev' | 'prod';

  constructor(scope: Construct, id: string, props: LaunchpadAuthStackProps) {
    super(scope, id, props);

    const { stage } = props;
    this.stage = stage;
    const isProd = stage === 'prod';
    const registry = loadAppRegistry();

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
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
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

    new secretsmanager.Secret(this, 'SecretGoogleClientId', secretCfgOf('google-client-id', 'Google OAuth 2.0 client ID'));
    new secretsmanager.Secret(this, 'SecretGoogleClientSecret', secretCfgOf('google-client-secret', 'Google OAuth 2.0 client secret'));
    new secretsmanager.Secret(this, 'SecretFacebookAppId', secretCfgOf('facebook-app-id', 'Facebook App ID'));
    new secretsmanager.Secret(this, 'SecretFacebookAppSecret', secretCfgOf('facebook-app-secret', 'Facebook App secret'));
    new secretsmanager.Secret(this, 'SecretMicrosoftClientId', secretCfgOf('microsoft-client-id', 'Microsoft OIDC client ID'));
    new secretsmanager.Secret(this, 'SecretMicrosoftClientSecret', secretCfgOf('microsoft-client-secret', 'Microsoft OIDC client secret'));
    new secretsmanager.Secret(this, 'SecretAppleTeamId', secretCfgOf('apple-team-id', 'Apple Sign-In team ID placeholder'));
    new secretsmanager.Secret(this, 'SecretAppleClientId', secretCfgOf('apple-client-id', 'Apple Sign-In client ID placeholder'));
    new secretsmanager.Secret(this, 'SecretAppleKeyId', secretCfgOf('apple-key-id', 'Apple Sign-In key ID placeholder'));
    new secretsmanager.Secret(this, 'SecretApplePrivateKey', secretCfgOf('apple-private-key', 'Apple Sign-In private key placeholder'));

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
}
