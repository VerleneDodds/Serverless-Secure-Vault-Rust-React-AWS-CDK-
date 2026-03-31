import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as kms from 'aws-cdk-lib/aws-kms';

/**
 * SecureStorageStack defines the CloudFormation infrastructure for a secure, 
 * resilient, and observable file storage solution.
 * 
 * Architecture Components:
 * - Security Layer: AWS KMS Customer Managed Key for data at rest encryption.
 * - Storage Layer: Amazon S3 bucket with versioning, AES-256 encryption, and SSL enforcement.
 * - Metadata Layer: Amazon DynamoDB table encrypted with KMS.
 * - Compute Layer: Rust Lambda function (provided.al2023) for high performance.
 * - API Layer: Amazon API Gateway routing REST API calls to the Rust Lambda.
 * - Observability: CloudWatch Logs and AWS X-Ray enabled across the entire stack.
 */
export class SecureStorageStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ==========================================
    // 1. Security Layer: KMS Customer Managed Key
    // ==========================================
    // This key is used to encrypt metadata in DynamoDB. We enable rotation for compliance.
    const tableKey = new kms.Key(this, 'MetadataTableKey', {
      enableKeyRotation: true,
      description: 'KMS Key for Secure File Storage Metadata Table',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Use RETAIN for production workloads
    });

    // ==========================================
    // 2. Storage Layer: S3 Bucket
    // ==========================================
    // Stores the actual uploaded files. Employs S3 Managed Encryption (AES-256),
    // versioning to protect against accidental overwrites/deletes, and enforces SSL.
    const storageBucket = new s3.Bucket(this, 'SecureStorageBucket', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED, // Default AES-256 Encryption
      enforceSSL: true, // Least Privilege: Deny non-HTTPS requests via Bucket Policy
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Use RETAIN for production
      autoDeleteObjects: true, // Facilitates clean teardowns in Dev/Testing environments
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Ensure no public bucket access
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.POST, s3.HttpMethods.GET],
          allowedOrigins: ['*'], // In production, restrict this to the frontend domain
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    // ==========================================
    // 3. Metadata Layer: DynamoDB Table
    // ==========================================
    // Stores file metadata (FileID, FileName, OwnerID, UploadDate, S3Key)
    // Uses the KMS key defined above for Customer Managed encryption at rest.
    const metadataTable = new dynamodb.Table(this, 'FileMetadataTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // Cost-effective for unpredictable workloads
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: tableKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Use RETAIN for production workloads
    });

    // ==========================================
    // 4. Compute Layer: Rust Lambda Function
    // ==========================================
    // Fast, memory-efficient API handler written in Rust.
    // Built using Cargo Lambda and deployed from the target directory.
    const apiHandler = new lambda.Function(this, 'ApiHandler', {
      runtime: lambda.Runtime.PROVIDED_AL2023,
      architecture: lambda.Architecture.X86_64,
      handler: 'bootstrap', // Default handler name for rust custom runtimes
      code: lambda.Code.fromAsset('target/lambda/secure-storage-solution'), // Path to compiled rust binary
      environment: {
        BUCKET_NAME: storageBucket.bucketName,
        TABLE_NAME: metadataTable.tableName,
        RUST_LOG: 'info', // Setup structured logging
      },
      tracing: lambda.Tracing.ACTIVE, // Observability: X-Ray Tracing enabled
    });

    // Grant essential permissions following the Principle of Least Privilege
    storageBucket.grantReadWrite(apiHandler);
    metadataTable.grantReadWriteData(apiHandler);
    tableKey.grantEncryptDecrypt(apiHandler); // Lambda needs access to Decrypt KMS for DynamoDB

    // ==========================================
    // 5. API Layer: API Gateway (REST API)
    // ==========================================
    // Exposes a secure endpoint to the internet to trigger the Rust Lambda.
    const api = new apigateway.RestApi(this, 'SecureStorageApi', {
      restApiName: 'Secure Storage API',
      description: 'Handles secure file upload requests via presigned URLs.',
      deployOptions: {
        tracingEnabled: true, // Observability: X-Ray Tracing for API Gateway
        loggingLevel: apigateway.MethodLoggingLevel.INFO, // CloudWatch Logs for API Gateway
        dataTraceEnabled: true,
      },
      // CORS Preflight handles OPTIONS requests for the browser
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS, // In production, restrict to frontend domain
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Amz-User-Agent']
      }
    });

    const uploads = api.root.addResource('uploads');
    const uploadIntegration = new apigateway.LambdaIntegration(apiHandler);
    uploads.addMethod('POST', uploadIntegration); // Generate Presigned URL Endpoint
  }
}
