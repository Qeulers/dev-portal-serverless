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

    // Create API routes - removed 'production' from path
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
  }
}