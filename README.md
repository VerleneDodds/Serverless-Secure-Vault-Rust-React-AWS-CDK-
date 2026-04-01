# Secure Cloud Storage Platform (AWS CDK + Rust + React)

A highly robust, multi-vault secure storage architecture designed for absolute data isolation and high-performance file management. This platform demonstrates "Well-Architected" cloud principles using **AWS CDK (TypeScript)** for infrastructure, a blazing-fast **Rust Lambda** for core computing, and a premium **React** frontend with glassmorphic aesthetics.

## Table of Contents
- [Key Features & Architecture](#key-features--architecture)
- [Tech Stack](#tech-stack)
  - [Backend (Rust & AWS)](#backend-rust--aws)
  - [Frontend (React & Vite)](#frontend-react--vite)
- [Setup & Deployment](#setup--deployment)
- [Usage & Design Philosophy](#usage--design-philosophy)

---

## Key Features & Architecture

-   **Multi-Vault Partitioning**: Enables users to create and manage multiple isolated secure environments (Vaults) under a single account, ensuring zero data leakage between contexts.
-   **Proxy+ API Integration**: Utilizes a catch-all API Gateway `{proxy+}` resource, delegating 100% of routing and CORS logic to the Rust backend for a perfectly fluid handshake.
-   **Verified Two-Stage Handshake**: Eliminates "ghost" records by marking files as `PENDING` until S3 confirms receipt and the frontend verifies the upload via a secondary `PATCH` request.
-   **Recursive Folder Cleanup**: Deep tree-walking ensures that deleting a folder also wipes its contents from both S3 and DynamoDB.
-   **Security at Rest (AWS KMS)**: Mandates Customer Managed Keys (CMK) via AWS KMS to secure DynamoDB metadata with automatic rotation and strict IAM grants.
-   **Storage Hardening (S3)**: Enforces SSL-only data-in-transit, leverages S3 Managed Encryption (AES-256), and strictly blocks all public access.

## Tech Stack

### Backend (Rust & AWS)
-   **Compute**: Rust Lambda with Custom Runtime (`provided.al2023`) to maximize memory efficiency and speed.
-   **Infrastructure**: AWS CDK (TypeScript) for reproducible, versioned infrastructure-as-code.
-   **Database**: Amazon DynamoDB with a Composite Partition Key strategy for multi-vault scaling.
-   **Storage**: Amazon S3 (Server-Side Encryption enabled).
-   **Observability**: X-Ray Tracing and CloudWatch Structured Logging (`tracing::info!`).

### Frontend (React & Vite)
-   **Framework**: React 18+ powered by Vite for instant HMR.
-   **Animations**: `framer-motion` for fluid, organic UI transitions.
-   **Iconography**: `lucide-react` for a modern, consistent look.
-   **Networking**: Native Fetch API with custom upload progress tracking and speed calculation.
-   **Styling**: Modern Vanilla CSS utilizing Flexbox, CSS Grid, and high-vibrancy glassmorphic effects.

## Setup & Deployment

### 1. Build the Rust Compute Engine
Before synthesizing your CloudFormation template, compile the Rust backend code.
```bash
cargo lambda build --release
```

### 2. Deploy Infrastructure
Ship the infrastructure directly to your active AWS environment.
```bash
# Ensure you are authenticated with AWS CLI
npx cdk deploy
```

### 3. Launch Frontend
Launch your secure portal locally to begin managing your assets.
```bash
cd frontend
npm install
npm run dev
```

## Usage & Design Philosophy

The SecureVault platform is designed to feel alive and responsive. We use high-vibrancy gradients and subtle micro-animations to provide a premium feel, making a standard "cloud engineer portfolio" project stand out as a production-grade SaaS application.

**Direct-to-S3 Uploads**:
By utilizing AWS Presigned URLs, we achieve maximum upload throughput without taxing the backend Lambda compute or hitting API Gateway payload limitations. This ensures that even massive file transfers are handled with ease.

---

*See `ARCHITECTURE.md` for deep-dives into how the security layers, Rust partitioning, and S3 Presigned routing integrations function under the hood.*
