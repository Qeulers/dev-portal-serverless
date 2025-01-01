// lib/dev-portal-api-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Duration } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as awsLambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as appsync from '@aws-cdk/aws-appsync-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class DevPortalApiStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create DynamoDB table for notifications
    const notificationsTable = new dynamodb.Table(this, 'NotificationsTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - change for production
      timeToLiveAttribute: 'ttl', // Enable TTL for automatic cleanup
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // Add GSI for subscription_id queries
    notificationsTable.addGlobalSecondaryIndex({
      indexName: 'subscription-index',
      partitionKey: { name: 'subscription_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
    });

    // Create AppSync API
    const appSyncApi = new appsync.GraphqlApi(this, 'NotificationsApi', {
      name: 'NotificationsApi',
      schema: appsync.SchemaFile.fromAsset(path.join(__dirname, 'schema.graphql')),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            expires: cdk.Expiration.after(cdk.Duration.days(365))
          }
        },
      },
      xrayEnabled: true,
    });

    // Create DynamoDB Data Source
    const notificationsDS = appSyncApi.addDynamoDbDataSource(
      'NotificationsDataSource',
      notificationsTable
    );

    // Create Lambda function to process DynamoDB Streams
    const streamHandler = new lambda.NodejsFunction(this, 'StreamHandler', {
      entry: path.join(__dirname, '../lambda/streamHandler.ts'),
      handler: 'handler',
      runtime: awsLambda.Runtime.NODEJS_18_X,
      environment: {
        APPSYNC_API_ENDPOINT: appSyncApi.graphqlUrl,
        APPSYNC_API_KEY: appSyncApi.apiKey!,
      },
    });

    // Grant the Lambda function permissions to read from DynamoDB Streams
    notificationsTable.grantStreamRead(streamHandler);

    // Grant the Lambda function permissions to publish to AppSync
    streamHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['appsync:GraphQL'],
        resources: [`${appSyncApi.arn}/types/Mutation/*`],
      })
    );

    // Create DynamoDB Stream Event Source
    new awsLambda.EventSourceMapping(this, 'StreamEventSource', {
      target: streamHandler,
      batchSize: 100,
      startingPosition: awsLambda.StartingPosition.LATEST,
      eventSourceArn: notificationsTable.tableStreamArn!,
    });

    // Create S3 bucket for zone data
    const zoneDataBucket = new s3.Bucket(this, 'ZoneDataBucket', {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // Create API Gateway
    const api = new apigateway.RestApi(this, 'DevPortalApi', {
      defaultCorsPreflightOptions: {
        allowOrigins: process.env.ALLOWED_ORIGINS 
          ? process.env.ALLOWED_ORIGINS.split(',')
          : ['http://localhost:5173'],
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'Access-Token',
          'Refresh-Token',
          'access-token',
          'refresh-token'
        ],
        exposeHeaders: ['Access-Token', 'Refresh-Token', 'access-token', 'refresh-token'],
        allowCredentials: true,
        maxAge: Duration.seconds(3600)
      }
    });

    // Common environment variables for all Lambda functions
    const commonEnvironment = {
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'http://localhost:5173,*'
    };

    // Create Lambda functions
    const authHandler = new lambda.NodejsFunction(this, 'AuthHandler', {
      entry: path.join(__dirname, '../lambda/auth/handler.ts'),
      handler: 'handler',
      environment: commonEnvironment
    });

    const vesselHandler = new lambda.NodejsFunction(this, 'VesselHandler', {
      entry: path.join(__dirname, '../lambda/vessel/handler.ts'),
      handler: 'handler',
      environment: commonEnvironment
    });

    const zoneAndPortHandler = new lambda.NodejsFunction(this, 'ZoneAndPortHandler', {
      entry: path.join(__dirname, '../lambda/zone-and-port/handler.ts'),
      handler: 'handler',
      runtime: awsLambda.Runtime.NODEJS_18_X,
      memorySize: 512,  // Use 512MB for better free tier usage
      timeout: Duration.seconds(120),  // Keep Lambda timeout at 120 seconds for processing
      environment: {
        BUCKET_NAME: zoneDataBucket.bucketName,
        MAX_RECORDS_LIMIT: process.env.MAX_RECORDS_LIMIT || '5000',
        ...commonEnvironment
      }
    });

    const voyageHandler = new lambda.NodejsFunction(this, 'VoyageHandler', {
      entry: path.join(__dirname, '../lambda/voyage/handler.ts'),
      handler: 'handler',
      runtime: awsLambda.Runtime.NODEJS_18_X,
      timeout: Duration.seconds(120),  // Set timeout to 120 seconds for processing large datasets
      environment: {
        MAX_RECORDS_LIMIT: process.env.MAX_RECORDS_LIMIT || '5000',
        ...commonEnvironment
      }
    });

    const zoneAndPortNotificationsHandler = new lambda.NodejsFunction(this, 'ZoneAndPortNotificationsHandler', {
      entry: path.join(__dirname, '../lambda/zone-and-port-notifications/handler.ts'),
      handler: 'handler',
      environment: {
        ...commonEnvironment,
        NOTIFICATIONS_TABLE: notificationsTable.tableName,
      }
    });

    const webhookNotificationsHandler = new lambda.NodejsFunction(this, 'WebhookNotificationsHandler', {
      entry: path.join(__dirname, '../lambda/webhook-notifications/handler.ts'),
      handler: 'handler',
      environment: {
        ...commonEnvironment,
        NOTIFICATIONS_TABLE: notificationsTable.tableName,
        PTE_USERNAME: process.env.PTE_USERNAME || '',
        PTE_API_KEY: process.env.PTE_API_KEY || ''
      }
    });

    const zoneAndPortGetHandler = new awsLambda.Function(this, 'ZoneAndPortGetHandler', {
      runtime: awsLambda.Runtime.NODEJS_18_X,
      handler: 'getHandler.handler',
      code: awsLambda.Code.fromAsset(path.join(__dirname, '../lambda/zone-and-port')),
      environment: {
        BUCKET_NAME: zoneDataBucket.bucketName,
      },
      timeout: Duration.seconds(30),
      memorySize: 512,
    });

    const zoneAndPortSearchHandler = new awsLambda.Function(this, 'ZoneAndPortSearchHandler', {
      runtime: awsLambda.Runtime.NODEJS_18_X,
      handler: 'searchHandler.handler',
      code: awsLambda.Code.fromAsset(path.join(__dirname, '../lambda/zone-and-port')),
      environment: {
        BUCKET_NAME: zoneDataBucket.bucketName,
      },
      timeout: Duration.seconds(30),
      memorySize: 512,
    });

    // Create a secret for Polestar API credentials
    const polestarApiSecret = new secretsmanager.Secret(this, 'PolestarApiSecret', {
      description: 'Polestar API credentials for vessel search',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'PLACEHOLDER',
          api_key: 'PLACEHOLDER'
        }),
        generateStringKey: 'dummy' // This key won't be used but is required
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const searchHandler = new awsLambda.Function(this, 'SearchHandler', {
      runtime: awsLambda.Runtime.NODEJS_18_X,
      handler: 'searchHandler.handler',
      code: awsLambda.Code.fromAsset(path.join(__dirname, '../lambda/search')),
      environment: {
        BUCKET_NAME: zoneDataBucket.bucketName,
        POLESTAR_SECRET_ARN: polestarApiSecret.secretArn,
      },
      timeout: Duration.seconds(30),
    });

    // Grant the Lambda function permission to read the secret
    polestarApiSecret.grantRead(searchHandler);

    // Grant Lambda permissions to DynamoDB
    notificationsTable.grantReadWriteData(zoneAndPortNotificationsHandler);
    notificationsTable.grantReadWriteData(webhookNotificationsHandler);

    // Grant the Lambda function read access to the S3 bucket
    zoneDataBucket.grantRead(zoneAndPortHandler);
    zoneDataBucket.grantRead(zoneAndPortGetHandler);
    zoneDataBucket.grantRead(zoneAndPortSearchHandler);
    zoneDataBucket.grantRead(searchHandler);

    // Create API routes
    const auth = api.root.addResource('account');
    
    // Signin endpoint
    auth.addResource('signin')
      .addMethod('POST', new apigateway.LambdaIntegration(authHandler));
    
    // Refresh token endpoint
    auth.addResource('refresh-token')
      .addMethod('PUT', new apigateway.LambdaIntegration(authHandler));

    // Vessel characteristics endpoint
    const vesselInsights = api.root.addResource('vessel-insights');
    const vesselCharacteristics = vesselInsights.addResource('vessel-characteristics');
    vesselCharacteristics.addResource('{imo}')
      .addMethod('GET', new apigateway.LambdaIntegration(vesselHandler));

    // Zone and Port endpoints
    const zoneAndPortInsights = api.root.addResource('zone-and-port-insights');
    
    // Zone & Port Traffic endpoint
    const zoneAndPortTraffic = zoneAndPortInsights.addResource('zone-and-port-traffic');
    const zoneAndPortTrafficId = zoneAndPortTraffic.addResource('id');
    zoneAndPortTrafficId.addResource('{id}')
      .addMethod('GET', new apigateway.LambdaIntegration(zoneAndPortHandler));

    // Add new zones endpoint for CSV data
    const zonesResource = api.root.addResource('zones');
    zonesResource.addResource('{id}')
      .addMethod('GET', new apigateway.LambdaIntegration(zoneAndPortHandler));

    // Vessels in Zone or Port endpoint
    const vesselsInZoneOrPort = zoneAndPortInsights.addResource('vessels-in-zone-or-port');
    const vesselsInZoneOrPortId = vesselsInZoneOrPort.addResource('id');
    const vesselsInZoneOrPortIdWithId = vesselsInZoneOrPortId.addResource('{id}');
    vesselsInZoneOrPortIdWithId.addMethod('GET', new apigateway.LambdaIntegration(zoneAndPortHandler, {
      timeout: Duration.millis(29000)  // Set to API Gateway maximum timeout
    }));

    // Zone & Port List endpoint
    const zones = zoneAndPortInsights.addResource('zones');
    zones.addMethod('GET', new apigateway.LambdaIntegration(zoneAndPortHandler));

    // Search endpoint
    const search = api.root.addResource('search');
    search.addMethod('GET', new apigateway.LambdaIntegration(searchHandler));

    // Voyage Insights Routes
    const voyageInsights = api.root.addResource('voyage-insights');
    
    // Vessel Port Calls endpoint
    const vesselPortCalls = voyageInsights.addResource('vessel-port-calls');
    vesselPortCalls.addResource('{imo}')
      .addMethod('GET', new apigateway.LambdaIntegration(voyageHandler, {
        timeout: Duration.millis(29000)  // Set to API Gateway maximum timeout
      }));

    // Vessel Zone and Port Events endpoint
    const vesselZoneAndPortEvents = voyageInsights.addResource('vessel-zone-and-port-events');
    vesselZoneAndPortEvents.addResource('{imo}')
      .addMethod('GET', new apigateway.LambdaIntegration(voyageHandler, {
        timeout: Duration.millis(29000)  // Set to API Gateway maximum timeout
      }));

    // Vessel AIS Reporting Gaps endpoint
    const vesselAisReportingGaps = voyageInsights.addResource('vessel-ais-reporting-gaps');
    vesselAisReportingGaps.addResource('{imo}')
      .addMethod('GET', new apigateway.LambdaIntegration(voyageHandler, {
        timeout: Duration.millis(29000)  // Set to API Gateway maximum timeout
      }));

    // Vessel Positional Discrepancies endpoint
    const vesselPositionalDiscrepancies = voyageInsights.addResource('vessel-positional-discrepancies');
    vesselPositionalDiscrepancies.addResource('{imo}')
      .addMethod('GET', new apigateway.LambdaIntegration(voyageHandler, {
        timeout: Duration.millis(29000)  // Set to API Gateway maximum timeout
      }));

    // Vessel Port State Control endpoint
    const vesselPortStateControl = voyageInsights.addResource('vessel-port-state-control');
    vesselPortStateControl.addResource('{imo}')
      .addMethod('GET', new apigateway.LambdaIntegration(voyageHandler, {
        timeout: Duration.millis(29000)  // Set to API Gateway maximum timeout
      }));

    // Zone and Port Notification endpoints
    const notifications = api.root.addResource('notifications');
    const zoneAndPortNotifications = notifications.addResource('zones-and-ports');
    
    // Create subscription
    zoneAndPortNotifications
      .addMethod('POST', new apigateway.LambdaIntegration(zoneAndPortNotificationsHandler));
    
    // Get all subscriptions
    zoneAndPortNotifications
      .addMethod('GET', new apigateway.LambdaIntegration(zoneAndPortNotificationsHandler));
    
    // Single subscription operations
    const zoneAndPortNotificationId = zoneAndPortNotifications.addResource('{id}');
    zoneAndPortNotificationId
      .addMethod('GET', new apigateway.LambdaIntegration(zoneAndPortNotificationsHandler));
    zoneAndPortNotificationId
      .addMethod('PUT', new apigateway.LambdaIntegration(zoneAndPortNotificationsHandler));
    zoneAndPortNotificationId
      .addMethod('DELETE', new apigateway.LambdaIntegration(zoneAndPortNotificationsHandler));
    
    // Get notifications for a subscription
    zoneAndPortNotificationId.addResource('notifications')
      .addMethod('GET', new apigateway.LambdaIntegration(zoneAndPortNotificationsHandler));

    // Add webhook notifications routes
    const webhookNotifications = api.root.addResource('webhook-notifications');
    webhookNotifications.addMethod('POST', new apigateway.LambdaIntegration(webhookNotificationsHandler));
    webhookNotifications.addMethod('GET', new apigateway.LambdaIntegration(webhookNotificationsHandler));
    
    const cleanup = webhookNotifications.addResource('cleanup');
    cleanup.addMethod('DELETE', new apigateway.LambdaIntegration(webhookNotificationsHandler));

    // Add necessary outputs
    new cdk.CfnOutput(this, 'GraphQLApiUrl', {
      value: appSyncApi.graphqlUrl
    });

    new cdk.CfnOutput(this, 'GraphQLApiKey', {
      value: appSyncApi.apiKey!
    });

    new cdk.CfnOutput(this, 'ZoneDataBucketName', {
      value: zoneDataBucket.bucketName,
      description: 'Name of the S3 bucket containing zone data'
    });
  }
}