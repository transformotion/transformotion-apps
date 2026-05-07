import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface MigrationsApiStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
  api: apigateway.RestApi;
  authoriser: apigateway.CognitoUserPoolsAuthorizer;
  /** Pre-built /api resource from PlatformApiStack — migrations mount under /api/migrations/... */
  apiResource: apigateway.Resource;
}

/**
 * MigrationsApiStack — skeleton API namespace for migration utilities.
 *
 * Establishes /api/migrations on the shared platform API Gateway.
 * Routes (e.g. /api/migrations/budget-tracker/transactions/import) are
 * mounted by downstream issues that consume this namespace.
 *
 * Per CONTRIBUTING.md Section 6.4, this stack is a permanent peer to
 * platform infrastructure — not subject to the M7 platform restructuring.
 *
 * First consumer: M6 #176 (budget-migrate Lambda relocation).
 */
export class MigrationsApiStack extends cdk.Stack {
  /** The /api/migrations resource — downstream stacks mount app-specific routes here. */
  public readonly migrationsResource: apigateway.Resource;

  constructor(scope: Construct, id: string, props: MigrationsApiStackProps) {
    super(scope, id, props);

    const { stage, apiResource, authoriser } = props;

    // Consistent with StockAnalyserApiStack and BudgetTrackerApiStack:
    // addResource() scopes the construct to the parent resource (a
    // PlatformApiStack construct), so the AWS::ApiGateway::Resource
    // for /api/migrations lives in PlatformApiStack's CFN template.
    // Using new apigateway.Resource(this, ...) instead would scope it
    // to MigrationsApiStack, causing a CDK dependency cycle between
    // PlatformApiStack's Deployment and this stack.
    this.migrationsResource = apiResource.addResource('migrations');

    cdk.Tags.of(this).add('app', 'migration-utilities');
    cdk.Tags.of(this).add('environment', stage);

    const auth = authMethodOptions(authoriser);

    const bundling: lambdaNodejs.BundlingOptions = {
      externalModules: ['@aws-sdk/*'],
      minify: true,
      sourceMap: false,
      forceDockerBundling: false,
    };

    // ── Migration uploads bucket ──────────────────────────────────────────────
    const uploadsBucket = new s3.Bucket(this, 'MigrationUploadsBucket', {
      bucketName: `transformotion-migration-uploads-${this.account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{
        expiration: cdk.Duration.days(90),
        noncurrentVersionExpiration: cdk.Duration.days(30),
      }],
    });

    // ── budget-tracker tables (imported by name) ──────────────────────────────
    const txTable = dynamodb.Table.fromTableName(
      this, 'BudgetTrackerTxTable', `budget-tracker.transactions-${stage}`,
    );

    // ── migration-budget-tracker-transactions Lambda ───────────────────────────
    const fnDir = path.join(__dirname, '..', '..', 'budget-tracker');

    const transactionsMigrateFn = new lambdaNodejs.NodejsFunction(this, 'BudgetTrackerTransactionsMigrateFn', {
      functionName: `migration-budget-tracker-transactions-${stage}`,
      entry:        path.join(fnDir, 'transactions/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(120),
      memorySize:   512,
      environment: {
        TRANSACTIONS_TABLE:       txTable.tableName,
        MIGRATION_UPLOADS_BUCKET: uploadsBucket.bucketName,
      },
      bundling,
    });

    txTable.grantReadWriteData(transactionsMigrateFn);
    uploadsBucket.grantRead(transactionsMigrateFn);

    // ── POST /api/migrations/budget-tracker/transactions/import ───────────────
    const budgetTrackerMigrations = this.migrationsResource.addResource('budget-tracker');
    const transactionsMigrations  = budgetTrackerMigrations.addResource('transactions');
    transactionsMigrations.addResource('import').addMethod(
      'POST',
      new apigateway.LambdaIntegration(transactionsMigrateFn, { proxy: true }),
      auth,
    );
  }
}

function authMethodOptions(
  authoriser: apigateway.CognitoUserPoolsAuthorizer,
): apigateway.MethodOptions {
  return {
    authorizer:        authoriser,
    authorizationType: apigateway.AuthorizationType.COGNITO,
    methodResponses: [
      {
        statusCode: '200',
        responseParameters: {
          'method.response.header.Access-Control-Allow-Origin':  true,
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
