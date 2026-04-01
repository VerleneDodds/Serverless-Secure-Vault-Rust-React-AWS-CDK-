#!/usr/bin/env node
/**
 * AWS CDK Application Entrypoint
 * 
 * This file acts as the main executable for synthesizing the CloudFormation
 * template and deploying the Secure File Storage infrastructure.
 * 
 * To deploy, AWS credentials must be configured within the local shell environment
 * (e.g., via AWS CLI or SSO profiles). The stack explicitly relies on the 
 * CDK_DEFAULT_ACCOUNT and CDK_DEFAULT_REGION environmental variables to map
 * the infrastructure deployments directly to your active AWS CLI profile.
 */
import 'source-map-support/register'; // Translates compiled JS stack traces back to readable TS mappings
import * as cdk from 'aws-cdk-lib';
import { SecureStorageStack } from '../lib/secure-storage-stack';
import { FrontendHostingStack } from '../lib/frontend-hosting-stack';

const app = new cdk.App();

const environment = { 
  account: process.env.CDK_DEFAULT_ACCOUNT, 
  region: process.env.CDK_DEFAULT_REGION 
};

new SecureStorageStack(app, 'SecureStorageStack', {
  env: environment,
});

new FrontendHostingStack(app, 'FrontendHostingStack', {
  env: environment,
});
