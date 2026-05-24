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
}

/**
 * MigrationsApiStack — API namespace for migration utilities.
 *
 * Imports the shared platform API Gateway and JWT authoriser from CloudFormation
 * exports produced by PlatformApiStack. This allows bin/migration-utilities.ts to
 * synthesise only MU stacks without instantiating platform stacks.
 *
 * Establishes /api/migrations on the shared platform API Gateway.
 * Routes (owned by this stack's CF template):
 *   POST /api/migrations/budget-tracker/transactions/import
 *   POST /api/migrations/budget-tracker/budget-data/run
 */
export class MigrationsApiStack extends cdk.Stack {
  /**
   * The /api/migrations resource — downstream stacks mount app-specific routes here.
   * Typed as IResource (not Resource) because it is constructed via fromResourceAttributes,
   * which returns the interface; widening to the concrete class would require a different
   * cross-stack import pattern.
   */
  public readonly migrationsResource: apigateway.IResource;

  constructor(scope: Construct, id: string, props: MigrationsApiStackProps) {
    super(scope, id, props);

    const { stage } = props;

    // Import shared platform API Gateway, /api resource, and JWT authoriser from CF exports.
    const api = apigateway.RestApi.fromRestApiAttributes(this, 'PlatformApi', {
      restApiId:      cdk.Fn.importValue(`Transformotion-${stage}-RestApiId`),
      rootResourceId: cdk.Fn.importValue(`Transformotion-${stage}-RestApiRootResourceId`),
    });

    const platformApiResource = apigateway.Resource.fromResourceAttributes(this, 'PlatformApiResource', {
      restApi:    api,
      resourceId: cdk.Fn.importValue(`Transformotion-${stage}-ApiResourceId`),
      path:       '/api',
    });

    const auth = authMethodOptions({
      authorizerId:      cdk.Fn.importValue(`Transformotion-${stage}-AuthorizerId`),
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    this.migrationsResource = platformApiResource.addResource('migrations');

    cdk.Tags.of(this).add('app', 'migration-utilities');
    cdk.Tags.of(this).add('environment', stage);

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
    const rulesTable = dynamodb.Table.fromTableName(
      this, 'BudgetTrackerRulesTable', `budget-tracker.rules-${stage}`,
    );
    const settingsTable = dynamodb.Table.fromTableName(
      this, 'BudgetTrackerSettingsTable', `budget-tracker.settings-${stage}`,
    );
    const budgetDataTable = dynamodb.Table.fromTableName(
      this, 'BudgetTrackerBudgetDataTable', `budget-tracker.budget-data-${stage}`,
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

    // ── migration-budget-tracker-budget-data Lambda ───────────────────────────
    const budgetDataMigrateFn = new lambdaNodejs.NodejsFunction(this, 'BudgetTrackerBudgetDataMigrateFn', {
      functionName: `migration-budget-tracker-budget-data-${stage}`,
      entry:        path.join(fnDir, 'budget-data/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.minutes(15),
      memorySize:   512,
      environment: {
        TRANSACTIONS_TABLE: txTable.tableName,
        RULES_TABLE:        rulesTable.tableName,
        SETTINGS_TABLE:     settingsTable.tableName,
        BUDGET_DATA_TABLE:  budgetDataTable.tableName,
      },
      bundling,
    });

    txTable.grantReadWriteData(budgetDataMigrateFn);
    rulesTable.grantReadWriteData(budgetDataMigrateFn);
    settingsTable.grantReadWriteData(budgetDataMigrateFn);
    budgetDataTable.grantReadWriteData(budgetDataMigrateFn);

    // ── POST /api/migrations/budget-tracker/transactions/import ───────────────
    const budgetTrackerMigrations = this.migrationsResource.addResource('budget-tracker');
    const transactionsMigrations  = budgetTrackerMigrations.addResource('transactions');
    transactionsMigrations.addResource('import').addMethod(
      'POST',
      new apigateway.LambdaIntegration(transactionsMigrateFn, { proxy: true }),
      auth,
    );

    // ── POST /api/migrations/budget-tracker/budget-data/run ──────────────────
    budgetTrackerMigrations
      .addResource('budget-data')
      .addResource('run')
      .addMethod('POST', new apigateway.LambdaIntegration(budgetDataMigrateFn, { proxy: true }), auth);
  }
}

function authMethodOptions(authoriser: apigateway.IAuthorizer): apigateway.MethodOptions {
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
