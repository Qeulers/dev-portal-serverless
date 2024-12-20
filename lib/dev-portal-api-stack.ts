// lib/dev-portal-api-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

export class DevPortalApiStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create API Gateway
    const api = new apigateway.RestApi(this, 'DevPortalApi', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'Access-Token', 'Refresh-Token'],
        exposeHeaders: ['Access-Token', 'Refresh-Token']
      }
    });

    // Create Lambda functions
    const authHandler = new lambda.NodejsFunction(this, 'AuthHandler', {
      entry: path.join(__dirname, '../lambda/auth/handler.ts'),
      handler: 'handler'
    });

    const vesselHandler = new lambda.NodejsFunction(this, 'VesselHandler', {
      entry: path.join(__dirname, '../lambda/vessel/handler.ts'),
      handler: 'handler'
    });

    const zoneAndPortHandler = new lambda.NodejsFunction(this, 'ZoneAndPortHandler', {
      entry: path.join(__dirname, '../lambda/zone-and-port/handler.ts'),
      handler: 'handler'
    });

    const voyageHandler = new lambda.NodejsFunction(this, 'VoyageHandler', {
      entry: path.join(__dirname, '../lambda/voyage/handler.ts'),
      handler: 'handler'
    });

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
  }
}