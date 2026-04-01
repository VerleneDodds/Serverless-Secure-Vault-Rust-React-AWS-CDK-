use aws_config::meta::region::RegionProviderChain;
use aws_sdk_dynamodb::{types::AttributeValue, Client as DynamoDbClient};
use aws_sdk_s3::{presigning::PresigningConfig, Client as S3Client};
use chrono::Utc;
use lambda_http::{run, service_fn, Body, Error, Request, RequestExt, Response};
use serde::{Deserialize, Serialize};
use std::env;
use std::time::Duration;
use tracing::{error, info, instrument};
use uuid::Uuid;

/// Represents the incoming JSON payload for securing a file upload.
///
/// Expected structure:
/// {
///     "file_name": "example.pdf",
///     "owner_id": "user-12345"
/// }
#[derive(Deserialize, Debug)]
struct UploadRequest {
    /// The original name of the file
    file_name: String,
    /// The unique identifier of the user uploading the file
    owner_id: String,
}

/// Represents the JSON payload returned to the client upon successful processing.
#[derive(Serialize)]
struct UploadResponse {
    /// The generated S3 Presigned URL for the actual file upload (PUT request).
    upload_url: String,
    /// A unique identifier generated for this specific file.
    file_id: String,
    /// The object key where the file will be stored in S3.
    s3_key: String,
}

/// Entry point for the AWS Lambda function.
/// Initializes the logging subscriber for CloudWatch & X-Ray, setups AWS SDK clients,
/// and starts the lambda_http runtime server.
#[tokio::main]
async fn main() -> Result<(), Error> {
    // Initialize tracing for CloudWatch / AWS X-Ray integration
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .without_time() // Rely on CloudWatch's own timestamps
        .init();

    info!("Initializing Secure Storage Service Rust API Handler...");

    // Setup AWS Configuration and clients.
    // The region provider chain will automatically pick up the Lambda environment's region.
    let region_provider = RegionProviderChain::default_provider().or_else("us-east-1");
    let config = aws_config::from_env().region(region_provider).load().await;

    // Instantiate clients once during cold start to improve performance on subsequent invocations.
    let s3_client = S3Client::new(&config);
    let dynamodb_client = DynamoDbClient::new(&config);

    // Run the HTTP service
    run(service_fn(|req: Request| async {
        handle_request(req, &s3_client, &dynamodb_client).await
    }))
    .await
}

/// Core business logic for handling the /uploads endpoint.
///
/// 1. Extracts environment variables (Bucket and Table names).
/// 2. Parses the incoming JSON payload into an `UploadRequest`.
/// 3. Generates tracking metadata (UUID and timestamp).
/// 4. Requests a Presigned URL from S3 (Valid for 15 minutes).
/// 5. Saves the file metadata into the DynamoDB Table, which uses a Customer Managed KMS Key.
/// 6. Returns the PreSigned URL back to the client.
#[instrument(skip(s3_client, dynamodb_client))]
async fn handle_request(
    req: Request,
    s3_client: &S3Client,
    dynamodb_client: &DynamoDbClient,
) -> Result<Response<Body>, Error> {
    // Fetch infrastructure topology from Environment Variables set by AWS CDK
    let bucket_name = env::var("BUCKET_NAME").expect("BUCKET_NAME env var must be set");
    let table_name = env::var("TABLE_NAME").expect("TABLE_NAME env var must be set");

    // Robust body parsing handling Text, Binary, or Empty bodies passed by API Gateway
    let body = match req.body() {
        Body::Text(body_str) => body_str,
        Body::Binary(body_bytes) => std::str::from_utf8(body_bytes).unwrap_or(""),
        Body::Empty => "",
    };

    if body.is_empty() {
        return Ok(Response::builder()
            .status(400)
            .body(Body::from("Invalid request: Empty body"))?);
    }

    // JSON Deserialization
    let upload_req: UploadRequest = match serde_json::from_str(body) {
        Ok(req) => req,
        Err(_) => {
            error!("Failed to parse JSON body");
            return Ok(Response::builder()
                .status(400)
                .body(Body::from("Invalid JSON payload"))?);
        }
    };

    // Generate unique metadata for the file upload
    let file_id = Uuid::new_v4().to_string();
    let s3_key = format!("{}/{}", upload_req.owner_id, file_id);
    let upload_date = Utc::now().to_rfc3339();

    // ==========================================
    // 1. Generate Presigned URL for S3 Object Put
    // ==========================================
    let expires_in = Duration::from_secs(900); // URL expires in 15 mins (Principle of Least Privilege time window)

    let presigned_request = match s3_client
        .put_object()
        .bucket(&bucket_name)
        .key(&s3_key)
        .presigned(PresigningConfig::expires_in(expires_in)?)
        .await
    {
        Ok(req) => req,
        Err(e) => {
            error!("Failed to generate S3 presigned URL: {:?}", e);
            return Ok(Response::builder().status(500).body(Body::from(
                "Internal Server Error generating upload credential",
            ))?);
        }
    };

    // ==========================================
    // 2. Save Metadata to DynamoDB
    // ==========================================
    // Designing the partition key and sort key structure (Single Table Design approach)
    let pk = format!("USER#{}", upload_req.owner_id);
    let sk = format!("FILE#{}", file_id);

    match dynamodb_client
        .put_item()
        .table_name(&table_name)
        .item("PK", AttributeValue::S(pk))
        .item("SK", AttributeValue::S(sk))
        .item("FileID", AttributeValue::S(file_id.clone()))
        .item("FileName", AttributeValue::S(upload_req.file_name))
        .item("OwnerID", AttributeValue::S(upload_req.owner_id))
        .item("UploadDate", AttributeValue::S(upload_date))
        .item("S3Key", AttributeValue::S(s3_key.clone()))
        .send()
        .await
    {
        Ok(_) => info!("Successfully saved metadata for file {}", file_id),
        Err(e) => {
            error!("Failed to save metadata to DynamoDB: {:?}", e);
            return Ok(Response::builder()
                .status(500)
                .body(Body::from("Internal Server Error saving metadata"))?);
        }
    }

    // Assemble the success response payload
    let response_body = UploadResponse {
        upload_url: presigned_request.uri().to_string(),
        file_id,
        s3_key,
    };

    // Return 200 OK with CORS headers to support web browsers
    Ok(Response::builder()
        .status(200)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", "*") // Allows cross-origin requests from the browser
        .body(Body::Text(serde_json::to_string(&response_body)?))?)
}
