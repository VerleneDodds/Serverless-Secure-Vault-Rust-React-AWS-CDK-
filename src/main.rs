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
    file_size: Option<i64>,
    parent_id: Option<String>,
}

/// Represents a request to create a new folder.
#[derive(Deserialize, Debug)]
struct FolderRequest {
    name: String,
    owner_id: String,
    parent_id: Option<String>,
}

/// Generic item representation for listing (Files & Folders).
#[derive(Serialize, Debug)]
struct MetadataItem {
    id: String,
    name: String,
    kind: String, // "FILE" or "FOLDER"
    size: Option<i64>,
    upload_date: String,
    parent_id: String,
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

/// Payload for listing folder contents.
#[derive(Serialize)]
struct ListResponse {
    items: Vec<MetadataItem>,
}

#[derive(Serialize)]
struct StatsResponse {
    total_files: i64,
    total_folders: i64,
    total_size: i64,
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
    // Handle CORS Preflight
    if req.method() == http::Method::OPTIONS {
        return Ok(cors_response().status(200).body(Body::Empty)?);
    }

    let path = req.uri().path();

    // Routing Logic
    match (req.method(), path) {
        (&http::Method::POST, p) if p.ends_with("/uploads") => handle_upload(req, s3_client, dynamodb_client).await,
        (&http::Method::GET, p) if p.ends_with("/uploads") => handle_download(req, s3_client, dynamodb_client).await,
        (&http::Method::DELETE, p) if p.ends_with("/uploads") => handle_delete(req, s3_client, dynamodb_client).await,
        (&http::Method::POST, p) if p.ends_with("/folders") => handle_create_folder(req, dynamodb_client).await,
        (&http::Method::GET, p) if p.ends_with("/folders") => handle_list_items(req, dynamodb_client).await,
        (&http::Method::DELETE, p) if p.ends_with("/folders") => handle_delete_folder(req, s3_client, dynamodb_client).await,
        (&http::Method::GET, p) if p.ends_with("/stats") => handle_stats(req, dynamodb_client).await,
        _ => Ok(cors_response()
            .status(405)
            .body(Body::from(format!("Method Not Allowed: {} {}", req.method(), path)))?),
    }
}

/// Helper to create a response with CORS headers
fn cors_response() -> http::response::Builder {
    Response::builder()
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Headers", "Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token")
        .header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
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

    let upload_req: UploadRequest = serde_json::from_str(body)?;
    let parent_id = upload_req.parent_id.unwrap_or_else(|| "ROOT".to_string());

    let file_id = Uuid::new_v4().to_string();
    let s3_key = format!("{}/{}", upload_req.owner_id, file_id);
    let upload_date = Utc::now().to_rfc3339();

    // 1. Generate Presigned PUT URL
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
        .item("ID", AttributeValue::S(file_id.clone()))
        .item("FileName", AttributeValue::S(upload_req.file_name))
        .item("OwnerID", AttributeValue::S(upload_req.owner_id))
        .item("UploadDate", AttributeValue::S(upload_date))
        .item("S3Key", AttributeValue::S(s3_key.clone()))
        .item("ParentID", AttributeValue::S(parent_id))
        .item("Kind", AttributeValue::S("FILE".to_string()))
        .item("FileSize", AttributeValue::N(upload_req.file_size.unwrap_or(0).to_string()))
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
    let file_id = params.first("file_id").expect("file_id required");
    let owner_id = params.first("owner_id").expect("owner_id required");

    let pk = format!("USER#{}", owner_id);
    let sk = format!("FILE#{}", file_id);

    let result = dynamodb_client
        .get_item()
        .table_name(&table_name)
        .key("PK", AttributeValue::S(pk))
        .key("SK", AttributeValue::S(sk))
        .send()
        .await?;

    let item = result.item.expect("File not found");

    let s3_key = item.get("S3Key").and_then(|v| v.as_s().ok()).expect("S3Key missing");
    let file_name = item.get("FileName").and_then(|v| v.as_s().ok()).expect("FileName missing");

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

/// DELETE /uploads?file_id=...&owner_id=... - Delete a file.
async fn handle_delete(
    req: Request,
    s3_client: &S3Client,
    dynamodb_client: &DynamoDbClient,
) -> Result<Response<Body>, Error> {
    let bucket_name = env::var("BUCKET_NAME").expect("BUCKET_NAME must be set");
    let table_name = env::var("TABLE_NAME").expect("TABLE_NAME must be set");

    let params = req.query_string_parameters();
    let file_id = params.first("file_id").expect("file_id required");
    let owner_id = params.first("owner_id").expect("owner_id required");

    let pk = format!("USER#{}", owner_id);
    let sk = format!("FILE#{}", file_id);

    let result = dynamodb_client
        .get_item()
        .table_name(&table_name)
        .key("PK", AttributeValue::S(pk.clone()))
        .key("SK", AttributeValue::S(sk.clone()))
        .send()
        .await?;

    if let Some(item) = result.item {
        let s3_key = item.get("S3Key").and_then(|v| v.as_s().ok()).unwrap();
        s3_client.delete_object().bucket(&bucket_name).key(s3_key).send().await?;
        dynamodb_client.delete_item().table_name(&table_name).key("PK", AttributeValue::S(pk)).key("SK", AttributeValue::S(sk)).send().await?;
    }

    Ok(cors_response().status(200).body(Body::from("Deleted"))?)
}

/// POST /folders - Create a new folder.
async fn handle_create_folder(
    req: Request,
    dynamodb_client: &DynamoDbClient,
) -> Result<Response<Body>, Error> {
    let table_name = env::var("TABLE_NAME").expect("TABLE_NAME must be set");

    let body = match req.body() {
        Body::Text(s) => s,
        Body::Binary(b) => std::str::from_utf8(b).unwrap_or(""),
        Body::Empty => "",
    };

    let folder_req: FolderRequest = serde_json::from_str(body)?;
    let folder_id = Uuid::new_v4().to_string();
    let parent_id = folder_req.parent_id.unwrap_or_else(|| "ROOT".to_string());
    let create_date = Utc::now().to_rfc3339();

    let pk = format!("USER#{}", folder_req.owner_id);
    let sk = format!("FOLDER#{}", folder_id);

    dynamodb_client
        .put_item()
        .table_name(&table_name)
        .item("PK", AttributeValue::S(pk))
        .item("SK", AttributeValue::S(sk))
        .item("ID", AttributeValue::S(folder_id.clone()))
        .item("FileName", AttributeValue::S(folder_req.name)) // Use same field for sorting/display
        .item("OwnerID", AttributeValue::S(folder_req.owner_id))
        .item("UploadDate", AttributeValue::S(create_date))
        .item("ParentID", AttributeValue::S(parent_id))
        .item("Kind", AttributeValue::S("FOLDER".to_string()))
        .send()
        .await?;

    Ok(cors_response().status(200).body(Body::from(folder_id))?)
}

/// GET /folders?owner_id=...&parent_id=... - List items in a folder.
async fn handle_list_items(
    req: Request,
    dynamodb_client: &DynamoDbClient,
) -> Result<Response<Body>, Error> {
    let table_name = env::var("TABLE_NAME").expect("TABLE_NAME must be set");
    let params = req.query_string_parameters();
    let owner_id = params.first("owner_id").expect("owner_id required");
    let parent_id = params.first("parent_id").unwrap_or("ROOT");

    let result = dynamodb_client
        .query()
        .table_name(&table_name)
        .index_name("FolderIndex")
        .key_condition_expression("OwnerID = :owner AND ParentID = :parent")
        .expression_attribute_values(":owner", AttributeValue::S(owner_id.to_string()))
        .expression_attribute_values(":parent", AttributeValue::S(parent_id.to_string()))
        .send()
        .await?;

    let items = result.items.unwrap_or_default().into_iter().map(|item| {
        MetadataItem {
            id: item.get("ID").and_then(|v| v.as_s().ok()).cloned().unwrap_or_default(),
            name: item.get("FileName").and_then(|v| v.as_s().ok()).cloned().unwrap_or_default(),
            kind: item.get("Kind").and_then(|v| v.as_s().ok()).cloned().unwrap_or_default(),
            size: item.get("FileSize").and_then(|v| v.as_n().ok()).and_then(|n| n.parse().ok()),
            upload_date: item.get("UploadDate").and_then(|v| v.as_s().ok()).cloned().unwrap_or_default(),
            parent_id: item.get("ParentID").and_then(|v| v.as_s().ok()).cloned().unwrap_or_default(),
        }
    }).collect();

    let response = ListResponse { items };

    Ok(cors_response()
        .status(200)
        .header("Content-Type", "application/json")
        .body(Body::Text(serde_json::to_string(&response)?))?)
}

/// DELETE /folders?folder_id=...&owner_id=... - Delete a folder.
async fn handle_delete_folder(
    req: Request,
    s3_client: &S3Client,
    dynamodb_client: &DynamoDbClient,
) -> Result<Response<Body>, Error> {
    let table_name = env::var("TABLE_NAME").expect("TABLE_NAME must be set");
    let params = req.query_string_parameters();
    let folder_id = params.first("folder_id").expect("folder_id required");
    let owner_id = params.first("owner_id").expect("owner_id required");

    let pk = format!("USER#{}", owner_id);
    let sk = format!("FOLDER#{}", folder_id);

    // 1. Recursively find and delete all items belonging to this folder tree
    // Note: For simplicity and to avoid excessive Lambda execution time, 
    // we use a batch-oriented approach for the immediate children.
    delete_folder_contents(owner_id, folder_id, &table_name, s3_client, dynamodb_client).await?;

    // 2. Delete the folder metadata itself
    let pk = format!("USER#{}", owner_id);
    let sk = format!("FOLDER#{}", folder_id);

    dynamodb_client
        .delete_item()
        .table_name(&table_name)
        .key("PK", AttributeValue::S(pk))
        .key("SK", AttributeValue::S(sk))
        .send()
        .await?;

    Ok(cors_response().status(200).body(Body::from("Folder and all nested contents deleted successfully"))?)
}

/// Helper function to recursively delete contents of a folder
#[async_recursion::async_recursion]
async fn delete_folder_contents(
    owner_id: &str,
    folder_id: &str,
    table_name: &str,
    s3_client: &S3Client,
    dynamodb_client: &DynamoDbClient,
) -> Result<(), Error> {
    info!("Querying children of folder: {}", folder_id);

    // Query FolderIndex to find all children where ParentID = folder_id
    let result = dynamodb_client
        .query()
        .table_name(table_name)
        .index_name("FolderIndex")
        .key_condition_expression("OwnerID = :owner AND ParentID = :parent")
        .expression_attribute_values(":owner", AttributeValue::S(owner_id.to_string()))
        .expression_attribute_values(":parent", AttributeValue::S(folder_id.to_string()))
        .send()
        .await?;

    if let Some(items) = result.items {
        for item in items {
            let child_id = item.get("ID").and_then(|v| v.as_s().ok()).map(|s| s.as_str()).unwrap_or("");
            let kind = item.get("Kind").and_then(|v| v.as_s().ok()).map(|s| s.as_str());
            let sk = item.get("SK").and_then(|v| v.as_s().ok()).map(|s| s.as_str()).unwrap_or("");
            
            if kind == Some("FILE") || sk.starts_with("FILE#") {
                // Delete File from S3
                if let Some(s3_key) = item.get("S3Key").and_then(|v| v.as_s().ok()) {
                    let bucket_name = env::var("BUCKET_NAME")?;
                    info!("Deleting S3 object: {}", s3_key);
                    s3_client
                        .delete_object()
                        .bucket(bucket_name)
                        .key(s3_key)
                        .send()
                        .await?;
                }

                // Delete File Metadata from DynamoDB
                dynamodb_client
                    .delete_item()
                    .table_name(table_name)
                    .key("PK", AttributeValue::S(format!("USER#{}", owner_id)))
                    .key("SK", AttributeValue::S(sk.to_string()))
                    .send()
                    .await?;

            } else if kind == Some("FOLDER") || sk.starts_with("FOLDER#") {
                // Recursively delete subfolder contents
                delete_folder_contents(owner_id, child_id, table_name, s3_client, dynamodb_client).await?;
                
                // Delete Subfolder Metadata from DynamoDB
                dynamodb_client
                    .delete_item()
                    .table_name(table_name)
                    .key("PK", AttributeValue::S(format!("USER#{}", owner_id)))
                    .key("SK", AttributeValue::S(sk.to_string()))
                    .send()
                    .await?;
            }
        }
    }
    Ok(())
}

/// GET /stats?owner_id=... - Get global vault statistics.
async fn handle_stats(
    req: Request,
    dynamodb_client: &DynamoDbClient,
) -> Result<Response<Body>, Error> {
    let table_name = env::var("TABLE_NAME").expect("TABLE_NAME must be set");
    let params = req.query_string_parameters();
    let owner_id = params.first("owner_id").expect("owner_id required");

    info!("Generating stats for owner: {}", owner_id);

    let pk = format!("USER#{}", owner_id);

    let result = dynamodb_client
        .query()
        .table_name(&table_name)
        .key_condition_expression("PK = :pk")
        .expression_attribute_values(":pk", AttributeValue::S(pk))
        .send()
        .await?;

    let mut total_files = 0;
    let mut total_folders = 0;
    let mut total_size = 0;

    if let Some(items) = result.items {
        info!("Found {} raw items in partition", items.len());
        for item in items {
            let sk = item.get("SK").and_then(|v| v.as_s().ok()).map(|s| s.as_str()).unwrap_or("");
            let kind = item.get("Kind").and_then(|v| v.as_s().ok()).map(|s| s.as_str());
            
            // Comprehensive detection (support legacy and new schema)
            if kind == Some("FILE") || sk.to_uppercase().starts_with("FILE#") {
                total_files += 1;
                let size = item.get("FileSize")
                    .and_then(|v| v.as_n().ok())
                    .and_then(|n| n.parse::<i64>().ok())
                    .unwrap_or(0);
                total_size += size;
            } else if kind == Some("FOLDER") || sk.to_uppercase().starts_with("FOLDER#") {
                total_folders += 1;
            }
        }
    }

    info!("Final Stats: files={}, folders={}, size={}B", total_files, total_folders, total_size);

    let response = StatsResponse {
        total_files,
        total_folders,
        total_size,
    };

    Ok(cors_response()
        .status(200)
        .header("Content-Type", "application/json")
        .body(Body::Text(serde_json::to_string(&response)?))?)
}
