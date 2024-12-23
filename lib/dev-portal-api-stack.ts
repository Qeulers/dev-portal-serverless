// lib/dev-portal-api-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as awsLambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as appsync from '@aws-cdk/aws-appsync-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Duration } from 'aws-cdk-lib';

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
      environment: commonEnvironment
    });

    const voyageHandler = new lambda.NodejsFunction(this, 'VoyageHandler', {
      entry: path.join(__dirname, '../lambda/voyage/handler.ts'),
      handler: 'handler',
      environment: commonEnvironment
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

    // Grant Lambda permissions to DynamoDB
    notificationsTable.grantReadWriteData(zoneAndPortNotificationsHandler);
    notificationsTable.grantReadWriteData(webhookNotificationsHandler);

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

    // Vessels in Zone or Port endpoint
    const vesselsInZoneOrPort = zoneAndPortInsights.addResource('vessels-in-zone-or-port');
    const vesselsInZoneOrPortId = vesselsInZoneOrPort.addResource('id');
    vesselsInZoneOrPortId.addResource('{id}')
      .addMethod('GET', new apigateway.LambdaIntegration(zoneAndPortHandler));

    // Zone & Port List endpoint
    const zones = zoneAndPortInsights.addResource('zones');
    zones.addMethod('GET', new apigateway.LambdaIntegration(zoneAndPortHandler));

    // Voyage Insights Routes
    const voyageInsights = api.root.addResource('voyage-insights');
    
    // Vessel Port Calls endpoint
    const vesselPortCalls = voyageInsights.addResource('vessel-port-calls');
    vesselPortCalls.addResource('{imo}')
      .addMethod('GET', new apigateway.LambdaIntegration(voyageHandler));

    // Vessel Zone and Port Events endpoint
    const vesselZoneAndPortEvents = voyageInsights.addResource('vessel-zone-and-port-events');
    vesselZoneAndPortEvents.addResource('{imo}')
      .addMethod('GET', new apigateway.LambdaIntegration(voyageHandler));

    // Vessel AIS Reporting Gaps endpoint
    const vesselAisReportingGaps = voyageInsights.addResource('vessel-ais-reporting-gaps');
    vesselAisReportingGaps.addResource('{imo}')
      .addMethod('GET', new apigateway.LambdaIntegration(voyageHandler));

    // Vessel Positional Discrepancies endpoint
    const vesselPositionalDiscrepancies = voyageInsights.addResource('vessel-positional-discrepancies');
    vesselPositionalDiscrepancies.addResource('{imo}')
      .addMethod('GET', new apigateway.LambdaIntegration(voyageHandler));

    // Vessel Port State Control endpoint
    const vesselPortStateControl = voyageInsights.addResource('vessel-port-state-control');
    vesselPortStateControl.addResource('{imo}')
      .addMethod('GET', new apigateway.LambdaIntegration(voyageHandler));

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
  }
}