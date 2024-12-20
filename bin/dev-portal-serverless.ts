#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DevPortalApiStack } from '../lib/dev-portal-api-stack';

const app = new cdk.App();
new DevPortalApiStack(app, 'DevPortalApiStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
});