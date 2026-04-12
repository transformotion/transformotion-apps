import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
}

/**
 * AuthStack — Cognito User Pool for Transformotion Apps.
 *
 * Groups (control Launchpad rendering and Lambda authoriser):
 *   admin          — platform administrators, access to all apps
 *   stock-app      — Stock Signal Analyser
 *   budget-app     — Budget Tracker
 *   transformotion — Transformotion Framework
 *   family         — family members (basic access, assigned per invitation)
 *
 * Custom attributes (stored on the Cognito user object):
 *   custom:active_account — UUID of the user's currently active account
 *   custom:accounts       — comma-separated UUIDs of all accounts the user belongs to
 *
 * The User Pool Domain enables the Cognito Hosted UI for OAuth2/PKCE flows
 * (Sign Up, Sign In, Forgot Password). Custom auth UI is wired up in S1.3.
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const isProd = stage === 'prod';

    // ── User Pool ──────────────────────────────────────────────────────────
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `transformotion-${stage}`,
      selfSignUpEnabled: true,

      // Sign-in via email address
      signInAliases: { email: true },
      autoVerify: { email: true },

      // Standard attributes
      standardAttributes: {
        email: { required: true, mutable: true },
        givenName: { required: false, mutable: true },
        familyName: { required: false, mutable: true },
      },

      // Custom attributes for account-based multi-tenancy (Section 9)
      customAttributes: {
        active_account: new cognito.StringAttribute({ mutable: true, maxLen: 36 }),
        accounts:       new cognito.StringAttribute({ mutable: true, maxLen: 2048 }),
      },

      // Password policy
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: cdk.Duration.days(7),
      },

      // Account recovery via email
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,

      // MFA — optional for v1 (users can enrol TOTP if they wish)
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },

      // Email verification message
      userVerification: {
        emailSubject: 'Verify your Transformotion Apps account',
        emailBody: 'Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },

      // Prod: retain User Pool on stack deletion (user data is permanent)
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ── User Pool Domain ───────────────────────────────────────────────────
    // Provides the Cognito Hosted UI endpoint for OAuth2/PKCE login flows.
    // Domain: transformotion-{account}-{stage}.auth.ap-southeast-2.amazoncognito.com
    this.userPoolDomain = this.userPool.addDomain('UserPoolDomain', {
      cognitoDomain: {
        domainPrefix: `transformotion-${this.account}-${stage}`,
      },
    });

    // ── Web App Client ─────────────────────────────────────────────────────
    // Public SPA client — no client secret (PKCE only).
    const callbackUrls = isProd
      ? ['https://apps.transformotion.com.au', 'https://apps.transformotion.com.au/auth/callback']
      : ['http://localhost:3001', 'http://localhost:3001/auth/callback'];

    const logoutUrls = isProd
      ? ['https://apps.transformotion.com.au']
      : ['http://localhost:3001'];

    this.userPoolClient = this.userPool.addClient('WebAppClient', {
      userPoolClientName: `transformotion-web-${stage}`,
      generateSecret: false,

      // OAuth2 with PKCE — authorization code flow only
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls,
        logoutUrls,
      },

      // Auth flows for Amplify/custom auth UI (S1.3)
      authFlows: {
        userSrp: true,
        userPassword: false, // plain password flow disabled for security
      },

      // Token validity
      accessTokenValidity:  cdk.Duration.hours(1),
      idTokenValidity:      cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),

      // Read/write attributes for the web client
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true, emailVerified: true, givenName: true, familyName: true })
        .withCustomAttributes('active_account', 'accounts'),

      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true, givenName: true, familyName: true })
        .withCustomAttributes('active_account', 'accounts'),

      preventUserExistenceErrors: true,
    });

    // ── Cognito Groups ─────────────────────────────────────────────────────
    // Groups are added to the JWT as cognito:groups claim.
    // Lambda authoriser and Launchpad both use this to gate access.
    const groups: Array<{ name: string; description: string; precedence: number }> = [
      { name: 'admin',          description: 'Platform administrators — full access to all apps', precedence: 1 },
      { name: 'stock-app',      description: 'Stock Signal Analyser access',                       precedence: 10 },
      { name: 'budget-app',     description: 'Budget Tracker access',                              precedence: 20 },
      { name: 'transformotion', description: 'Transformotion Framework access',                    precedence: 30 },
      { name: 'family',         description: 'Family members — access granted per invitation',     precedence: 40 },
    ];

    for (const group of groups) {
      new cognito.CfnUserPoolGroup(this, `Group-${group.name}`, {
        userPoolId: this.userPool.userPoolId,
        groupName: group.name,
        description: group.description,
        precedence: group.precedence,
      });
    }

    // ── Outputs ────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: `Cognito User Pool ID for ${stage}`,
      exportName: `Transformotion-${stage}-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: `Cognito Web App Client ID for ${stage}`,
      exportName: `Transformotion-${stage}-UserPoolClientId`,
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: `${this.userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: `Cognito Hosted UI domain for ${stage}`,
      exportName: `Transformotion-${stage}-UserPoolDomain`,
    });

    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      exportName: `Transformotion-${stage}-UserPoolArn`,
    });
  }
}
