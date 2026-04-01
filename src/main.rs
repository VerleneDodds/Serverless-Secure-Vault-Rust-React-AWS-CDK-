use aws_config::meta::region::RegionProviderChain;
use aws_sdk_dynamodb::{types::AttributeValue, Client as DynamoDbClient};
use aws_sdk_s3::{presigning::PresigningConfig, Client as S3Client};
use chrono::Utc;
use lambda_http::{run, service_fn, Body, Error, Request, RequestExt, Response, http};
use serde::{Deserialize, Serialize};
use std::env;
use std::time::Duration;
use tracing::{info, instrument};
use uuid::Uuid;

/// Represents the incoming JSON payload for securing a file upload.
#[derive(Deserialize, Debug)]
struct UploadRequest {
    file_name: String,
    owner_id: String,
}

/// Represents the JSON payload returned to the client upon successful upload processing.
#[derive(Serialize)]
struct UploadResponse {
    upload_url: String,
    file_id: String,
    s3_key: String,
}

/// Represents the JSON payload returned for a download request.
#[derive(Serialize)]
struct DownloadResponse {
    download_url: String,
    file_name: String,
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .without_time()
        .init();

    info!("Initializing Secure Storage Service Rust API Handler...");

    let region_provider = RegionProviderChain::default_provider().or_else("us-east-1");
    let config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(region_provider)
        .load()
        .await;

    let s3_client = S3Client::new(&config);
    let dynamodb_client = DynamoDbClient::new(&config);

    run(service_fn(|req: Request| async {
        handle_request(req, &s3_client, &dynamodb_client).await
    }))
    .await
}

#[instrument(skip(s3_client, dynamodb_client))]
async fn handle_request(
    req: Request,
    s3_client: &S3Client,
    dynamodb_client: &DynamoDbClient,
) -> Result<Response<Body>, Error> {
    // Route based on HTTP Method
    match *req.method() {
        http::Method::POST => handle_upload(req, s3_client, dynamodb_client).await,
        http::Method::GET => handle_download(req, s3_client, dynamodb_client).await,
        _ => Ok(Response::builder()
            .status(405)
            .header("Access-Control-Allow-Origin", "*")
            .body(Body::from("Method Not Allowed"))?),
    }
}

/// Helper to create a response with CORS headers
fn cors_response() -> http::response::Builder {
    Response::builder()
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Headers", "Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token")
        .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
}

/// POST /uploads - Request a presigned URL for uploading a new file.
async fn handle_upload(
    req: Request,
    s3_client: &S3Client,
    dynamodb_client: &DynamoDbClient,
) -> Result<Response<Body>, Error> {
    let bucket_name = env::var("BUCKET_NAME").expect("BUCKET_NAME must be set");
    let table_name = env::var("TABLE_NAME").expect("TABLE_NAME must be set");

    let body = match req.body() {
        Body::Text(s) => s,
        Body::Binary(b) => std::str::from_utf8(b).unwrap_or(""),
        Body::Empty => "",
    };

    if body.is_empty() {
        return Ok(cors_response().status(400).body(Body::from("Empty body"))?);
    }

    let upload_req: UploadRequest = match serde_json::from_str(body) {
        Ok(r) => r,
        Err(_) => return Ok(cors_response().status(400).body(Body::from("Invalid JSON"))?),
    };

    let file_id = Uuid::new_v4().to_string();
    let s3_key = format!("{}/{}", upload_req.owner_id, file_id);
    let upload_date = Utc::now().to_rfc3339();

    // 1. Generate Presigned PUT URL (15 mins)
    let presigned_request = s3_client
        .put_object()
        .bucket(&bucket_name)
        .key(&s3_key)
        .presigned(PresigningConfig::expires_in(Duration::from_secs(900))?)
        .await?;

    // 2. Store metadata in DynamoDB
    let pk = format!("USER#{}", upload_req.owner_id);
    let sk = format!("FILE#{}", file_id);

    dynamodb_client
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
        .await?;

    let response_body = UploadResponse {
        upload_url: presigned_request.uri().to_string(),
        file_id,
        s3_key,
    };

    Ok(cors_response()
        .status(200)
        .header("Content-Type", "application/json")
        .body(Body::Text(serde_json::to_string(&response_body)?))?)
}

/// GET /uploads?file_id=...&owner_id=... - Request a presigned URL for downloading a file.
async fn handle_download(
    req: Request,
    s3_client: &S3Client,
    dynamodb_client: &DynamoDbClient,
) -> Result<Response<Body>, Error> {
    let bucket_name = env::var("BUCKET_NAME").expect("BUCKET_NAME must be set");
    let table_name = env::var("TABLE_NAME").expect("TABLE_NAME must be set");

    let params = req.query_string_parameters();
    let file_id = match params.first("file_id") {
        Some(id) => id,
        None => return Ok(cors_response().status(400).body(Body::from("file_id is required"))?),
    };
    let owner_id = match params.first("owner_id") {
        Some(id) => id,
        None => return Ok(cors_response().status(400).body(Body::from("owner_id is required"))?),
    };

    // 1. Fetch metadata from DynamoDB to get the S3Key and FileName
    let pk = format!("USER#{}", owner_id);
    let sk = format!("FILE#{}", file_id);

    let result = dynamodb_client
        .get_item()
        .table_name(&table_name)
        .key("PK", AttributeValue::S(pk))
        .key("SK", AttributeValue::S(sk))
        .send()
        .await?;

    let item = match result.item {
        Some(i) => i,
        None => return Ok(cors_response()
            .status(404)
            .body(Body::from("File not found"))?),
    };

    let s3_key = item.get("S3Key")
        .and_then(|v| v.as_s().ok())
        .expect("S3Key missing");
    let file_name = item.get("FileName")
        .and_then(|v| v.as_s().ok())
        .expect("FileName missing");

    // 2. Generate Presigned GET URL (15 mins)
    let presigned_request = s3_client
        .get_object()
        .bucket(&bucket_name)
        .key(s3_key)
        .response_content_disposition(format!("attachment; filename=\"{}\"", file_name))
        .presigned(PresigningConfig::expires_in(Duration::from_secs(900))?)
        .await?;

    let response_body = DownloadResponse {
        download_url: presigned_request.uri().to_string(),
        file_name: file_name.to_string(),
    };

    Ok(cors_response()
        .status(200)
        .header("Content-Type", "application/json")
        .body(Body::Text(serde_json::to_string(&response_body)?))?)
}
