import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface AuthApiStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
  userPoolId: string;
  /** Verified SES sender address — must be verified in SES before deploy. */
  fromEmail: string;
  /** App URL used in hint email CTA (e.g. https://dev.apps.transformotion.com.au). */
  appUrl: string;
}

/**
 * AuthApiStack — public HTTP endpoints for auth-adjacent features.
 *
 * POST /auth/lookup-provider
 *   Public endpoint (no JWT). Accepts an email, looks up the user's Cognito
 *   sign-in method, and sends a hint via SES. Rate-limited 5 req/IP/15 min.
 *   Always returns 200 to prevent user enumeration.
 *
 * Prerequisites (one-time):
 *   Verify the fromEmail address in SES:
 *     aws ses verify-email-identity --email-address noreply@transformotion.com.au
 *   For production access (to send to any email), request SES production access
 *   via the AWS Console: SES → Account dashboard → Request production access.
 */
export class AuthApiStack extends cdk.Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: AuthApiStackProps) {
    super(scope, id, props);

    const { stage, userPoolId, fromEmail, appUrl } = props;

    // ── DynamoDB — rate-limit table ─────────────────────────────────────────
    // PK: "lookup-provider#<ip>", TTL attribute "ttl" enables auto-expiry
    const rateLimitTable = new dynamodb.Table(this, 'RateLimits', {
      tableName:       `platform.rate-limits-${stage}`,
      partitionKey:    { name: 'pk', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'ttl',
      billingMode:     dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:   cdk.RemovalPolicy.DESTROY,
    });

    // ── Lambda — forgot-provider ─────────────────────────────────────────────
    const fn = new lambdaNodejs.NodejsFunction(this, 'ForgotProviderFn', {
      functionName: `transformotion-forgot-provider-${stage}`,
      entry: path.join(__dirname, '../functions/auth/forgot-provider/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        RATE_LIMIT_TABLE: rateLimitTable.tableName,
        USER_POOL_ID:     userPoolId,
        FROM_EMAIL:       fromEmail,
        APP_URL:          appUrl,
      },
      bundling: {
        // AWS SDK v3 is included in the Lambda 20.x runtime — no need to bundle
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    // ── IAM — grant Lambda access to DynamoDB, Cognito, SES ─────────────────
    rateLimitTable.grantReadWriteData(fn);

    fn.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['cognito-idp:AdminGetUser'],
      resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${userPoolId}`],
    }));

    fn.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['ses:SendEmail', 'sesv2:SendEmail'],
      resources: ['*'],
    }));

    // ── REST API Gateway ─────────────────────────────────────────────────────
    const api = new apigateway.RestApi(this, 'AuthApi', {
      restApiName:  `transformotion-auth-api-${stage}`,
      description:  `Transformotion ${stage} — public auth API`,
      deployOptions: { stageName: stage },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
        maxAge:       cdk.Duration.hours(1),
      },
    });

    const authResource     = api.root.addResource('auth');
    const lookupResource   = authResource.addResource('lookup-provider');
    lookupResource.addMethod('POST', new apigateway.LambdaIntegration(fn, { proxy: true }));

    this.apiUrl = api.url;

    // ── Outputs ──────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AuthApiUrl', {
      value:       api.url,
      description: `Auth API base URL for ${stage} — set as VITE_AUTH_API_URL in .env.local`,
      exportName:  `Transformotion-${stage}-AuthApiUrl`,
    });
  }
}
