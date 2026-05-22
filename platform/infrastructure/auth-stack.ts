import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { cognitoHostedUiCss } from './cognito-hosted-ui-css';

export interface AuthStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
}

/**
 * AuthStack — Cognito User Pool for Transformotion Apps.
 *
 * Three app clients (one per app):
 *   LaunchpadAppClient    — shell; /, /sign-in/, /launchpad/. Social IDPs enabled.
 *   StockAnalyserAppClient — /stock-signal/*. Cognito only.
 *   BudgetTrackerAppClient — /budget-tracker/*. Cognito only.
 *
 * All three authenticate against the same user pool. SSO via the shared
 * Hosted UI domain session cookie.
 *
 * Groups (control Launchpad rendering and Lambda authoriser):
 *   Target groups (7e-prep-1):
 *     site-admin        — platform administrators
 *     stock-app-access  — Stock Signal Analyser access
 *     budget-app-access — Budget Tracker access
 *   Legacy groups (removed at 7e-cleanup):
 *     admin          — platform administrators, access to all apps
 *     stock-app      — Stock Signal Analyser
 *     budget-app     — Budget Tracker
 *     transformotion — Transformotion Framework
 *     family         — family members (basic access, assigned per invitation)
 *
 * Custom attributes (stored on the Cognito user object):
 *   custom:active_account — DEPRECATED. Retained because Cognito does not permit
 *                           deleting existing schema attributes from a live user pool.
 *                           Will never be set. Active account is client-side UI state.
 *   custom:accounts       — JSON-stringified map of appSlug → [{accountId, role}]
 *
 * Social IDPs (Google, Facebook, Microsoft) are wired here with Secrets Manager
 * references. Secrets are created with generated placeholder values. Populate real
 * credentials via CLI (see docs/social-idp-setup.md), then redeploy this stack.
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly launchpadAppClient: cognito.UserPoolClient;
  public readonly stockAnalyserAppClient: cognito.UserPoolClient;
  public readonly budgetTrackerAppClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;

  private readonly stage: string;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { stage } = props;
    this.stage = stage;
    const isProd = stage === 'prod';

    // ── User Pool ──────────────────────────────────────────────────────────
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `transformotion-${stage}`,
      selfSignUpEnabled: false,

      // Sign-in via email address
      signInAliases: { email: true },
      autoVerify: { email: true },

      // Standard attributes
      standardAttributes: {
        email:      { required: true,  mutable: true },
        givenName:  { required: false, mutable: true },
        familyName: { required: false, mutable: true },
      },

      // Custom attributes for account-based multi-tenancy.
      // NOTE: active_account is deprecated (active account is now client-side UI state).
      // Cognito does not permit deleting existing schema attributes from a live user pool
      // ("Existing schema attributes cannot be modified or deleted."). Retained as a
      // no-op declaration; will never be set again.
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
      mfaSecondFactor: { sms: false, otp: true },

      // Email verification message
      userVerification: {
        emailSubject: 'Verify your Transformotion Apps account',
        emailBody:    'Your verification code is {####}',
        emailStyle:   cognito.VerificationEmailStyle.CODE,
      },

      // Prod: retain User Pool on stack deletion (user data is permanent)
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ── User Pool Domain ───────────────────────────────────────────────────
    // Provides the Cognito Hosted UI endpoint for OAuth2/PKCE + social IDP flows.
    this.userPoolDomain = this.userPool.addDomain('UserPoolDomain', {
      cognitoDomain: {
        domainPrefix: `transformotion-${this.account}-${stage}`,
      },
    });

    // ── Secrets Manager — Social IDP credentials (placeholder secrets) ─────
    // Secrets are created with a generated placeholder value so CloudFormation
    // dynamic references resolve on first deploy. After running the setup steps
    // in docs/social-idp-setup.md, redeploy this stack to apply real credentials.
    // Secrets are retained on stack deletion to protect live credentials.
    const secretCfgOf = (key: string, hint: string) => ({
      secretName:    `/${stage}/cognito/${key}`,
      description:   `Transformotion ${stage} — ${hint} (see docs/social-idp-setup.md)`,
      generateSecretString: {
        excludePunctuation: true,
        passwordLength:     40,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    } as const);

    new secretsmanager.Secret(this, 'SecretGoogleClientId',        secretCfgOf('google-client-id',        'Google OAuth 2.0 client ID (GCP Console)'));
    new secretsmanager.Secret(this, 'SecretGoogleClientSecret',    secretCfgOf('google-client-secret',    'Google OAuth 2.0 client secret (GCP Console)'));
    new secretsmanager.Secret(this, 'SecretFacebookAppId',         secretCfgOf('facebook-app-id',         'Facebook App ID (Meta Developer Portal)'));
    new secretsmanager.Secret(this, 'SecretFacebookAppSecret',     secretCfgOf('facebook-app-secret',     'Facebook App secret (Meta Developer Portal)'));
    new secretsmanager.Secret(this, 'SecretMicrosoftClientId',     secretCfgOf('microsoft-client-id',     'Microsoft OIDC client ID (Azure App Registrations)'));
    new secretsmanager.Secret(this, 'SecretMicrosoftClientSecret', secretCfgOf('microsoft-client-secret', 'Microsoft OIDC client secret (Azure App Registrations)'));
    new secretsmanager.Secret(this, 'SecretAppleTeamId',           secretCfgOf('apple-team-id',           'Apple Sign-In team ID (placeholder — not yet active)'));
    new secretsmanager.Secret(this, 'SecretAppleClientId',         secretCfgOf('apple-client-id',         'Apple Sign-In service ID / client ID (placeholder)'));
    new secretsmanager.Secret(this, 'SecretAppleKeyId',            secretCfgOf('apple-key-id',            'Apple Sign-In key ID (placeholder)'));
    new secretsmanager.Secret(this, 'SecretApplePrivateKey',       secretCfgOf('apple-private-key',       'Apple Sign-In private key PEM (placeholder)'));

    // ── Social Identity Providers ──────────────────────────────────────────
    // Google, Facebook and Microsoft IDPs were registered manually in the
    // Cognito console (the user had already configured them before CDK could
    // create them, so they are NOT managed by CloudFormation).
    // The Secrets Manager secrets above hold the credentials for reference.
    // The LaunchpadAppClient lists these providers so the Hosted UI shows
    // social sign-in buttons. Per-app clients are Cognito-only; social
    // sign-in sessions propagate via the shared Hosted UI domain cookie.

    // ── App Clients ────────────────────────────────────────────────────────

    // Launchpad — shell client; hosts sign-in and launchpad routes.
    // Social IDPs enabled so users can sign in with Google/Facebook/Microsoft.
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
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.GOOGLE,
        cognito.UserPoolClientIdentityProvider.FACEBOOK,
        cognito.UserPoolClientIdentityProvider.custom('Microsoft'),
      ],
    });

    // Stock Analyser — dedicated client; Cognito only.
    // Social sign-in sessions established at the launchpad propagate via SSO.
    this.stockAnalyserAppClient = this.createAppClient('StockAnalyserAppClient', {
      callbackUrls: isProd
        ? ['https://apps.transformotion.com.au/stock-signal/callback']
        : [
            'https://dev.apps.transformotion.com.au/stock-signal/callback',
            'http://localhost:3000/stock-signal/callback',
          ],
      logoutUrls: isProd
        ? ['https://apps.transformotion.com.au/signed-out/']
        : ['https://dev.apps.transformotion.com.au/signed-out/', 'http://localhost:3000/signed-out/'],
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    // Budget Tracker — dedicated client; Cognito only. Local dev port 3002.
    // Relocated from budget-tracker-tables-stack.ts for construct consistency.
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

    // ── Pre-token generation Lambda ────────────────────────────────────────
    // Injects `apps`, `site_admin`, `accounts` claims on every token issuance.
    // Enforces the app-access invariant by reconciling Cognito group membership
    // against account memberships in platform.account-members-{stage}.
    const accountMembersTable = dynamodb.Table.fromTableAttributes(
      this, 'PreTokenAccountMembersTable', {
        tableName:     `platform.account-members-${stage}`,
        globalIndexes: ['userId-index'],
      },
    );
    const accountsTable = dynamodb.Table.fromTableName(
      this, 'PreTokenAccountsTable', `platform.accounts-${stage}`,
    );

    const preTokenFn = new lambdaNodejs.NodejsFunction(this, 'PreTokenGenerationFn', {
      functionName: `transformotion-pre-token-generation-${stage}`,
      entry:        path.join(__dirname, '../functions/auth/pre-token-generation/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(10),
      memorySize:   256,
      environment: {
        ACCOUNT_MEMBERS_TABLE: accountMembersTable.tableName,
        ACCOUNTS_TABLE:        accountsTable.tableName,
        // USER_POOL_ID is NOT set here — it's read from event.userPoolId at runtime.
        // Setting it via this.userPool.userPoolId would create a Lambda→UserPool CDK
        // dependency that forms a cycle with the UserPool→Lambda trigger attachment.
      },
      bundling: { externalModules: ['@aws-sdk/*'], minify: true, sourceMap: false, forceDockerBundling: false },
    });

    accountMembersTable.grantReadData(preTokenFn);
    accountsTable.grantReadData(preTokenFn);
    preTokenFn.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['cognito-idp:AdminAddUserToGroup', 'cognito-idp:AdminRemoveUserFromGroup'],
      resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`],
    }));

    this.userPool.addTrigger(cognito.UserPoolOperation.PRE_TOKEN_GENERATION, preTokenFn);

    // ── Cognito Groups ─────────────────────────────────────────────────────
    const groups: Array<{ name: string; description: string; precedence: number }> = [
      // Target groups (7e-prep-1) — accepted by handlers after 7e-prep-2 dual-gate
      { name: 'site-admin',        description: 'Platform administrator',          precedence: 1  },
      { name: 'stock-app-access',  description: 'User has access to Stock Signal', precedence: 50 },
      { name: 'budget-app-access', description: 'User has access to Budget Tracker', precedence: 60 },
      // Legacy groups — removed at 7e-cleanup
      { name: 'admin',          description: 'Platform administrators — full access to all apps', precedence: 2  },
      { name: 'stock-app',      description: 'Stock Signal Analyser access',                       precedence: 10 },
      { name: 'budget-app',     description: 'Budget Tracker access',                              precedence: 20 },
      { name: 'transformotion', description: 'Transformotion Framework access',                    precedence: 30 },
      { name: 'family',         description: 'Family members — access granted per invitation',     precedence: 40 },
    ];

    for (const group of groups) {
      new cognito.CfnUserPoolGroup(this, `Group-${group.name}`, {
        userPoolId:  this.userPool.userPoolId,
        groupName:   group.name,
        description: group.description,
        precedence:  group.precedence,
      });
    }

    // ── Hosted UI Customisation ────────────────────────────────────────────
    // Applies the dark navy + teal theme to the Cognito Classic Hosted UI.
    // Applied to all app clients (clientId: 'ALL'). SA and BT clients don't
    // render social IDP buttons so those CSS rules are harmlessly unused for them.
    const hostedUiCustomisation = new cognito.CfnUserPoolUICustomizationAttachment(
      this, 'HostedUICustomisation', {
        userPoolId: this.userPool.userPoolId,
        clientId:   'ALL',
        css:        cognitoHostedUiCss,
      },
    );
    // Domain must exist before customisation can be applied.
    hostedUiCustomisation.node.addDependency(this.userPoolDomain);

    // ── Outputs ────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'UserPoolId', {
      value:       this.userPool.userPoolId,
      description: `Cognito User Pool ID for ${stage}`,
      exportName:  `Transformotion-${stage}-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'LaunchpadAppClientId', {
      value:       this.launchpadAppClient.userPoolClientId,
      description: 'Cognito app client ID for launchpad shell',
      exportName:  `Transformotion-${stage}-LaunchpadAppClientId`,
    });

    new cdk.CfnOutput(this, 'StockAnalyserAppClientId', {
      value:       this.stockAnalyserAppClient.userPoolClientId,
      description: 'Cognito app client ID for Stock Analyser',
      exportName:  `Transformotion-${stage}-StockAnalyserAppClientId`,
    });

    new cdk.CfnOutput(this, 'BudgetTrackerAppClientId', {
      value:       this.budgetTrackerAppClient.userPoolClientId,
      description: 'Cognito app client ID for Budget Tracker',
      exportName:  `Transformotion-${stage}-BudgetTrackerAppClientId`,
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value:       `${this.userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: `Cognito Hosted UI domain for ${stage}`,
      exportName:  `Transformotion-${stage}-UserPoolDomain`,
    });

    new cdk.CfnOutput(this, 'UserPoolArn', {
      value:      this.userPool.userPoolArn,
      exportName: `Transformotion-${stage}-UserPoolArn`,
    });
  }

  /**
   * Creates a public SPA app client (no secret, PKCE, authorization code flow).
   * All clients share token validity, attribute access, and auth flow settings.
   */
  private createAppClient(
    id: string,
    options: {
      callbackUrls:               string[];
      logoutUrls:                 string[];
      supportedIdentityProviders: cognito.UserPoolClientIdentityProvider[];
    },
  ): cognito.UserPoolClient {
    // Derive a human-readable client name: PascalCase id → kebab-case, prefixed.
    // e.g. 'StockAnalyserAppClient' → 'transformotion-stock-analyser-app-client-dev'
    const clientName = `transformotion-${
      id.replace(/([A-Z])/g, (m, letter, offset) =>
        offset === 0 ? letter.toLowerCase() : `-${letter.toLowerCase()}`
      )
    }-${this.stage}`;

    return this.userPool.addClient(id, {
      userPoolClientName:   clientName,
      generateSecret:       false,
      preventUserExistenceErrors: true,
      oAuth: {
        flows:        { authorizationCodeGrant: true },
        scopes:       [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: options.callbackUrls,
        logoutUrls:   options.logoutUrls,
      },
      supportedIdentityProviders: options.supportedIdentityProviders,
      // Required for #252 O17 CI smoke check; only callable via IAM (cognito-idp:AdminInitiateAuth on deploy role).
      authFlows:            { userSrp: true, adminUserPassword: true },
      accessTokenValidity:  cdk.Duration.hours(1),
      idTokenValidity:      cdk.Duration.hours(1),
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
