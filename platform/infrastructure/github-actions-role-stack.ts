import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * GithubActionsRoleStack - manages GitHub Actions deploy identities.
 *
 * The legacy GitHubActionsDeployRole was created out-of-band and remains
 * available as the rollback path while M9 introduces scoped deploy roles.
 *
 * Account-level - not stage-specific. Deployed once.
 */
export class GithubActionsRoleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // CfnRolePolicy maps to PutRolePolicy (upsert) - safe to apply against
    // the existing out-of-band policy; CloudFormation will replace the document.
    new iam.CfnRolePolicy(this, 'TransformotionDeployPolicy', {
      roleName:   'GitHubActionsDeployRole',
      policyName: 'TransformotionDevDeploy',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect:   'Allow',
            Action:   ['s3:ListBucket', 's3:GetObject', 's3:PutObject', 's3:DeleteObject'],
            Resource: '*',
          },
          {
            Effect:   'Allow',
            Action:   ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
            Resource: '*',
          },
          {
            Effect:   'Allow',
            Action:   'cloudformation:DescribeStacks',
            Resource: `arn:aws:cloudformation:${this.region}:${this.account}:stack/Transformotion*`,
          },
          {
            // Required for #252 O17 CI smoke check (admin-initiate-auth, ADMIN_USER_PASSWORD_AUTH flow).
            // Pool ARNs are hardcoded because GithubActionsRole deploys before AuthStack in
            // deploy-platform.yml, so Fn::ImportValue on AuthStack exports is unavailable at
            // first deploy. TODO(#263): migrate to cross-stack reference once deploy ordering allows.
            Effect:   'Allow',
            Action:   'cognito-idp:AdminInitiateAuth',
            Resource: [
              `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/ap-southeast-2_7QhxUvefw`,
              `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/ap-southeast-2_8hHCARUWq`,
            ],
          },
        ],
      },
    });

    const oidcProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GitHubOidcProvider',
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
    );

    const assumedByGitHub = new iam.OpenIdConnectPrincipal(oidcProvider).withConditions({
      StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
      },
      StringLike: {
        'token.actions.githubusercontent.com:sub': 'repo:transformotion/transformotion-apps:*',
      },
    });

    const stackArn = (pattern: string): string =>
      `arn:aws:cloudformation:${this.region}:${this.account}:stack/${pattern}/*`;

    const devUserPoolArn = `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/ap-southeast-2_7QhxUvefw`;
    const prodUserPoolArn = `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/ap-southeast-2_8hHCARUWq`;
    const webBucketArns = [
      'arn:aws:s3:::transformotion-web-dev-959516291617',
      'arn:aws:s3:::transformotion-prod-bucket',
    ];

    const createDeployRole = (roleName: string, stackPatterns: string[], objectArns: string[]) => {
      const role = new iam.Role(this, roleName, {
        roleName,
        assumedBy:          assumedByGitHub,
        maxSessionDuration: cdk.Duration.hours(1),
      });

      role.addToPolicy(new iam.PolicyStatement({
        sid:       'AssumeCdkBootstrapRoles',
        effect:    iam.Effect.ALLOW,
        actions:   ['sts:AssumeRole'],
        resources: [
          `arn:aws:iam::${this.account}:role/cdk-*-${this.account}-${this.region}`,
        ],
      }));

      role.addToPolicy(new iam.PolicyStatement({
        sid:    'DeployOwnedStacks',
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudformation:CreateChangeSet',
          'cloudformation:CreateStack',
          'cloudformation:DeleteChangeSet',
          'cloudformation:DeleteStack',
          'cloudformation:DescribeChangeSet',
          'cloudformation:DescribeStackEvents',
          'cloudformation:DescribeStackResource',
          'cloudformation:DescribeStackResources',
          'cloudformation:DescribeStacks',
          'cloudformation:ExecuteChangeSet',
          'cloudformation:GetTemplate',
          'cloudformation:GetTemplateSummary',
          'cloudformation:ListStackResources',
          'cloudformation:UpdateStack',
        ],
        resources: stackPatterns.map(stackArn),
      }));

      role.addToPolicy(new iam.PolicyStatement({
        sid:    'ReadTransformotionStacks',
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudformation:DescribeStacks',
          'cloudformation:DescribeStackEvents',
          'cloudformation:DescribeStackResources',
          'cloudformation:GetTemplate',
          'cloudformation:ListStackResources',
        ],
        resources: [stackArn('Transformotion*')],
      }));

      role.addToPolicy(new iam.PolicyStatement({
        sid:       'ValidateTemplates',
        effect:    iam.Effect.ALLOW,
        actions:   ['cloudformation:ValidateTemplate', 'cloudformation:ListStacks'],
        resources: ['*'],
      }));

      role.addToPolicy(new iam.PolicyStatement({
        sid:       'ReadCdkBootstrapVersion',
        effect:    iam.Effect.ALLOW,
        actions:   ['ssm:GetParameter'],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/*/version`],
      }));

      role.addToPolicy(new iam.PolicyStatement({
        sid:       'ReadWebBuckets',
        effect:    iam.Effect.ALLOW,
        actions:   ['s3:ListBucket', 's3:GetBucketLocation'],
        resources: webBucketArns,
      }));

      if (objectArns.length > 0) {
        role.addToPolicy(new iam.PolicyStatement({
          sid:    'DeployWebAssets',
          effect: iam.Effect.ALLOW,
          actions: [
            's3:DeleteObject',
            's3:GetObject',
            's3:PutObject',
          ],
          resources: objectArns,
        }));
      }

      role.addToPolicy(new iam.PolicyStatement({
        sid:       'InvalidateCloudFront',
        effect:    iam.Effect.ALLOW,
        actions:   ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
        resources: ['*'],
      }));

      role.addToPolicy(new iam.PolicyStatement({
        sid:       'VerifyCognitoLogin',
        effect:    iam.Effect.ALLOW,
        actions:   ['cognito-idp:AdminInitiateAuth'],
        resources: [devUserPoolArn, prodUserPoolArn],
      }));

      return role;
    };

    createDeployRole('TransformotionPlatformDeployRole', [
      'TransformotionDev-Storage',
      'TransformotionDev-Network',
      'TransformotionDev-Auth',
      'TransformotionDev-AuthApi',
      'TransformotionDev-PlatformTables',
      'TransformotionDev-PlatformWs',
      'TransformotionDev-Api',
      'TransformotionProd-Storage',
      'TransformotionProd-Network',
      'TransformotionProd-Auth',
      'TransformotionProd-AuthApi',
      'TransformotionProd-PlatformTables',
      'TransformotionProd-PlatformWs',
      'TransformotionProd-Api',
    ], []);

    createDeployRole('TransformotionLaunchpadDeployRole', [
      'TransformotionDev-Launchpad*',
      'TransformotionProd-Launchpad*',
    ], [
      'arn:aws:s3:::transformotion-web-dev-959516291617/*',
      'arn:aws:s3:::transformotion-prod-bucket/*',
    ]);

    createDeployRole('TransformotionStockAnalyserDeployRole', [
      'TransformotionDev-StockAnalyser*',
      'TransformotionProd-StockAnalyser*',
    ], [
      'arn:aws:s3:::transformotion-web-dev-959516291617/stock-analyser/*',
      'arn:aws:s3:::transformotion-prod-bucket/stock-analyser/*',
    ]);

    createDeployRole('TransformotionBudgetTrackerDeployRole', [
      'TransformotionDev-BudgetTracker*',
      'TransformotionProd-BudgetTracker*',
    ], [
      'arn:aws:s3:::transformotion-web-dev-959516291617/budget-tracker/*',
      'arn:aws:s3:::transformotion-prod-bucket/budget-tracker/*',
    ]);

    createDeployRole('TransformotionMigrationUtilitiesDeployRole', [
      'TransformotionDev-Migrations*',
      'TransformotionProd-Migrations*',
    ], []);
  }
}
