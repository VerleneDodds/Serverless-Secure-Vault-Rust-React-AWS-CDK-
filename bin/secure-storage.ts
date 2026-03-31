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

// Instantiate the core CDK Application context container.
const app = new cdk.App();

// Bootstraps our heavily-secured storage environment logic into the application construct tree.
new SecureStorageStack(app, 'SecureStorageStack', {
  /**
   * Environment Scope Binding
   * Dynamic assignment matching whatever AWS profile invoked the CLI (`npx cdk synth` or `npx cdk deploy`).
   * This logic allows seamless cross-region / multi-account deployments without manually hardcoding specific IDs.
   */
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
});
