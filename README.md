# Secure Cloud Storage API (AWS CDK + Rust)

A highly robust, secure, and observable serverless file storage architecture. This portfolio project demonstrates "Well-Architected" cloud principles using **AWS CDK (TypeScript)** for automated infrastructure provisioning and a blazing-fast **Rust Lambda** for core computing.

## Features & Architecture

- **AWS KMS (Customer Managed Keys)**: Automatically rotates and encrypts file upload metadata natively in DynamoDB.
- **Amazon S3**: Enforces SSL-only data-in-transit, leverages S3 Managed Encryption (AES-256), implements versioning, and strictly blocks all public access.
- **Amazon API Gateway**: Resolves CORS preflight queries dynamically to serve web applications.
- **Rust Compute Engine**: Executes via the Amazon Linux 2023 custom routing environment (`provided.al2023`) to maximize memory efficiency and eliminate cold starts.
- **Secure Presigned URLs**: Decouples heavy upload networking from Compute by allowing direct and secure uploads to S3 valid temporarily for **15 minutes**.
- **Observability**: Traces end-to-end processing across X-Ray and propagates structured logic to CloudWatch.
- **GitHub Actions (CI)**: Synthesizes CDK templates and builds Cargo binaries on all pushes/PRs automatically.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [AWS CLI](https://aws.amazon.com/cli/) (authenticated locally via IAM user/roles)
- [Rust Toolchain](https://rustup.rs/) (stable)
- [Cargo Lambda](https://www.cargo-lambda.info/guide/installation.html) (crucial for building AWS-ready binaries)

## Setup & Deployment Instructions

### 1. Build the Rust Compute Engine
Before synthesizing your CloudFormation template, compile the Rust backend code.
```bash
cargo lambda build --release
```
This generates the optimized `bootstrap` binary inside `target/lambda/secure-storage-solution`, which your CDK relies on.

### 2. Install Infrastructure Dependencies
Fetch the necessary TypeScript packages for AWS CDK.
```bash
npm install
```

### 3. Verify CDK CloudFormation Synthesis
Ensure that your CDK properly recognizes the Rust package and verifies the constructs.
```bash
npx cdk synth
```

### 4. Deploy to AWS
Ship the infrastructure directly to your active AWS environment.
```bash
npx cdk deploy
```

---

*See `ARCHITECTURE.md` for deep-dives into how the security layers, Rust traits, and S3 Presigned routing integrations function under the hood.*
