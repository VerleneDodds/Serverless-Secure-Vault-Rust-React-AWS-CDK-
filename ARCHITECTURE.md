# Secure File Storage - Deep Architecture Documentation

This document explains the "Why" and "How" of crucial mechanisms inside the Secure Storage repository.

## 1. How S3 Presigned URLs Work

When clients need to upload massive files (e.g., 5GB videos) to AWS, piping those bytes directly through an API Gateway and Lambda function introduces strict constraints (API Gateway supports max 10MB payloads, Lambda max 6MB).

To bypass this safely, we decouple the process:
* **The Request**: The client requests permission via an API POST request (`UploadRequest`), providing a `file_name` and `owner_id`.
* **The Compute Evaluation**: Our Rust Lambda ensures the request logic is sound, generates a unique UUID, and commands the `aws-sdk-s3` client to sign a `PUT` token linked directly to that UUID string key inside the private S3 bucket.
* **The Delivery**: AWS signs this specific URI utilizing our Lambda's strict execution role. We restrict the URI’s expiration (`PresigningConfig::expires_in()`) to **exactly 15 minutes** (Principle of Least Privilege).
* **The Upload**: The Frontend utilizes this short-lived URL via an `HTTP PUT`. Since `secure-storage-stack.ts` provisions a broad CORS `allowedOrigins: ['*']`, the browser natively accepts the interaction, uploading the file payload directly into S3 while avoiding Lambda limits entirely.

## 2. Security at Rest (AWS KMS x DynamoDB)

Instead of relying on AWS Owned Keys, this infrastructure mandates **Customer Managed Keys (CMK)** via AWS KMS to secure DynamoDB schemas:
* **Rotation**: The `tableKey` instantiated inside `secure-storage-stack.ts` defines `enableKeyRotation: true`. AWS automatically swaps the underlying cryptographic material every year, fulfilling strict compliance requirements (PCI-DSS, SOC2).
* **The Lambda Grant**: By executing `tableKey.grantEncryptDecrypt(apiHandler)`, CDK dynamically binds `kms:Decrypt`, `kms:ReEncrypt*`, and `kms:GenerateDataKey*` permissions to our execution IAM Role. If an unauthorized workload attempts to invoke the database, they cannot read the ciphered bytes without that explicit KMS grant.

## 3. Storage Hardening (S3 Bucket Policies)

Public bucket exposures remain the leading cause of cloud breaches. The `SecureStorageBucket` construct mitigates this across three layers:
* `blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL`: Overrides any potentially flawed ACL integrations.
* `enforceSSL: true`: Automatically injects a resource-based policy that denies (`Deny`) requests globally (`*`) if the communication does not validate `aws:SecureTransport: "true"`. A malicious actor attempting plain HTTP interception is immediately blocked by AWS infrastructure before ever arriving at the packet inspection.
* `encryption: s3.BucketEncryption.S3_MANAGED`: AES-256 block ciphers are strictly evaluated on all objects.

## 4. Rust Lambda Optimizations
Using Rust via `Cargo Lambda` natively targets the `provided.al2023` OS. 
* **Static Typing & Concurrency**: We bind `tokio` asynchronous runtimes to parallelize AWS calls.
* **Cold Starts**: By utilizing Rust’s LLVM-compiled binary, initializing the process occurs in mere milliseconds (~30ms), neutralizing standard "Cold Start" lag experienced by Java or Node.js containers.
* **Client Caching**: We explicitly initialize `DynamoDbClient` and `S3Client` *outside* of the `handle_request()` scope logic to enforce connection-reuse across subsequent Warm Starts.

## 5. End-to-End Observability

* **X-Ray Tracing**: The `LambdaIntegration` and Lambda compute logic explicitly define `Tracing.ACTIVE`. As requests transition from API Gateway -> Rust Lambda -> DynamoDB/S3, AWS visualizes latency waterfall graphs mapping the exact duration inside the X-Ray console.
* **Tracing-Subscriber**: Inside Rust, `tracing::info!` formats highly-structured log outputs parsed natively by CloudWatch, enabling instantaneous Search and Log Insights across millions of invocations.
