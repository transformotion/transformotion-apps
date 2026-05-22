import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export interface BudgetTrackerWsStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
  stage: 'dev' | 'prod';
}

/**
 * BudgetTrackerWsStack — WebSocket API Gateway for the async AI Review service.
 *
 * Routes:
 *   $connect    — custom Lambda authoriser validates Cognito ID token from query string
 *   $disconnect — cleans up connection state
 *   $default    — receives client-sent messages (PR 4 will use for cancellation)
 *
 * DynamoDB table:
 *   budget-tracker.ai-connections-{stage}
 *   PK: connectionId
 *   GSI: userId-index (for cleanup queries)
 *   TTL: expiresAt (stale connection cleanup)
 *
 * Output:
 *   WssUrl — wss:// URL for the deployed stage (consumed by CI to build frontend)
 */
export class BudgetTrackerWsStack extends cdk.Stack {
  public readonly webSocketApi: apigatewayv2.WebSocketApi;
  public readonly webSocketStage: apigatewayv2.WebSocketStage;
  public readonly connectionsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: BudgetTrackerWsStackProps) {
    super(scope, id, props);

    const { stage, userPool } = props;

    cdk.Tags.of(this).add('app',         'budget-tracker');
    cdk.Tags.of(this).add('environment', stage);

    // ── Connection state table ────────────────────────────────────────────────

    this.connectionsTable = new dynamodb.Table(this, 'AiConnectionsTable', {
      tableName:     `budget-tracker.ai-connections-${stage}`,
      partitionKey:  { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.connectionsTable.addGlobalSecondaryIndex({
      indexName:    'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── Bundling options shared across all WS Lambdas ─────────────────────────

    const bundling: lambdaNodejs.BundlingOptions = {
      externalModules: ['@aws-sdk/*'],
      minify: true,
      sourceMap: false,
      forceDockerBundling: false,
    };

    const fnDir = path.join(__dirname, '../functions');

    // ── Custom authoriser — validates Cognito ID token from query string ──────
    //
    // API Gateway v2 WebSocket does not support CognitoUserPoolsAuthorizer.
    // A custom Lambda authoriser reads ?token= and ?accountId= from the
    // $connect query string, verifies the JWT against Cognito JWKS, and
    // returns an IAM policy.

    const authorizerFn = new lambdaNodejs.NodejsFunction(this, 'AuthorizerFn', {
      functionName: `budget-ai-ws-authorizer-${stage}`,
      entry:        path.join(fnDir, 'ai-ws-authorizer/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(10),
      memorySize:   256,
      environment: {
        COGNITO_USER_POOL_ID: userPool.userPoolId,
      },
      bundling: {
        ...bundling,
        // jose must be bundled — it is not available in the Lambda runtime
        externalModules: ['@aws-sdk/*'],
      },
    });

    const wsAuthorizer = new authorizers.WebSocketLambdaAuthorizer('WsAuthorizer', authorizerFn, {
      identitySource: ['route.request.querystring.token'],
    });

    // ── $connect Lambda ───────────────────────────────────────────────────────

    const connectFn = new lambdaNodejs.NodejsFunction(this, 'ConnectFn', {
      functionName: `budget-ai-ws-connect-${stage}`,
      entry:        path.join(fnDir, 'ai-ws-connect/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(10),
      memorySize:   256,
      environment:  { CONNECTIONS_TABLE: this.connectionsTable.tableName },
      bundling,
    });
    this.connectionsTable.grantReadWriteData(connectFn);

    // ── $disconnect Lambda ────────────────────────────────────────────────────

    const disconnectFn = new lambdaNodejs.NodejsFunction(this, 'DisconnectFn', {
      functionName: `budget-ai-ws-disconnect-${stage}`,
      entry:        path.join(fnDir, 'ai-ws-disconnect/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(10),
      memorySize:   256,
      environment:  { CONNECTIONS_TABLE: this.connectionsTable.tableName },
      bundling,
    });
    this.connectionsTable.grantReadWriteData(disconnectFn);

    // ── $default Lambda ───────────────────────────────────────────────────────

    const defaultFn = new lambdaNodejs.NodejsFunction(this, 'DefaultFn', {
      functionName: `budget-ai-ws-default-${stage}`,
      entry:        path.join(fnDir, 'ai-ws-default/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(10),
      memorySize:   256,
      bundling,
    });

    // ── WebSocket API + routes ────────────────────────────────────────────────

    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'AiWebSocketApi', {
      apiName: `budget-tracker-ai-ws-${stage}`,
      connectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('ConnectInt', connectFn),
        authorizer:  wsAuthorizer,
      },
      disconnectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('DisconnectInt', disconnectFn),
      },
      defaultRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('DefaultInt', defaultFn),
      },
    });

    this.webSocketStage = new apigatewayv2.WebSocketStage(this, 'AiWebSocketStage', {
      webSocketApi: this.webSocketApi,
      stageName:    stage,
      autoDeploy:   true,
    });

    // Allow $default to push messages back to connected clients (e.g. 'connected' reply to init ping)
    defaultFn.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${stage}/*`],
    }));

    // ── Stack outputs ─────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'WssUrl', {
      value:       this.webSocketStage.url,
      description: 'WebSocket URL for the AI Review service (used by frontend)',
      exportName:  `BudgetTrackerWss-${stage}-Url`,
    });

    new cdk.CfnOutput(this, 'ConnectionsTableName', {
      value:       this.connectionsTable.tableName,
      description: 'DynamoDB table for WebSocket connection state',
      exportName:  `BudgetTrackerWss-${stage}-ConnectionsTableName`,
    });
  }
}
