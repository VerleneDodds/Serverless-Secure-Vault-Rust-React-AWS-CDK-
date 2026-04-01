use aws_sdk_dynamodb::{types::AttributeValue, Client as DynamoDbClient};
use aws_sdk_s3::{presigning::PresigningConfig, Client as S3Client};
use chrono::Utc;
use lambda_http::{Body, Request, RequestExt, Response, http};
use std::env;
use std::time::Duration;
use tracing::{info, instrument, error, warn};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::{
    ConfirmRequest, DownloadResponse, FolderRequest, ListResponse, MetadataItem,
    StatsResponse, UploadRequest, UploadResponse, VaultRequest,
};

// ==========================================
// Main Request Handler
// ==========================================

#[instrument(skip(s3_client, dynamodb_client))]
pub async fn handle_request(
    req: Request,
    s3_client: &S3Client,
    dynamodb_client: &DynamoDbClient,
) -> Result<Response<Body>, lambda_http::Error> {
    if req.method() == http::Method::OPTIONS {
        return Ok(cors_response().status(200).body(Body::Empty)?);
    }

    let path = req.uri().path();
    info!(method = %req.method(), path = %path, "Request received");

    let result = match (req.method(), path) {
        (&http::Method::GET, p) if p.ends_with("/vaults") => handle_list_vaults(req, dynamodb_client).await,
        (&http::Method::POST, p) if p.ends_with("/vaults") => handle_create_vault(req, dynamodb_client).await,
        (&http::Method::DELETE, p) if p.ends_with("/vaults") => handle_delete_vault(req, dynamodb_client).await,
        (&http::Method::POST, p) if p.ends_with("/uploads") => handle_upload(req, s3_client, dynamodb_client).await,
        (&http::Method::PATCH, p) if p.ends_with("/uploads") => handle_confirm_upload(req, dynamodb_client).await,
        (&http::Method::GET, p) if p.ends_with("/uploads") => handle_download(req, s3_client, dynamodb_client).await,
        (&http::Method::DELETE, p) if p.ends_with("/uploads") => handle_delete(req, s3_client, dynamodb_client).await,
        (&http::Method::POST, p) if p.ends_with("/folders") => handle_create_folder(req, dynamodb_client).await,
        (&http::Method::GET, p) if p.ends_with("/folders") => handle_list_items(req, dynamodb_client).await,
        (&http::Method::DELETE, p) if p.ends_with("/folders") => handle_delete_folder(req, s3_client, dynamodb_client).await,
        (&http::Method::GET, p) if p.ends_with("/stats") => handle_stats(req, dynamodb_client).await,
        (&http::Method::POST, p) if p.ends_with("/cleanup") => handle_cleanup(req, s3_client, dynamodb_client).await,
        _ => Err(AppError::NotFound(format!("No route for {} {}", req.method(), path))),
    };

    match result {
        Ok(resp) => Ok(resp),
        Err(err) => {
            error!("{}", err);
            err.to_response()
        }
    }
}

fn cors_response() -> http::response::Builder {
    Response::builder()
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Headers", "Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token, X-Amz-User-Agent, *")
        .header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS, PUT")
}

// ==========================================
// Handlers
// ==========================================

async fn handle_upload(
    req: Request,
    s3_client: &S3Client,
    dynamodb_client: &DynamoDbClient,
) -> Result<Response<Body>, AppError> {
    let bucket_name = env::var("BUCKET_NAME").map_err(|_| AppError::Internal("BUCKET_NAME not set".to_string()))?;
    let table_name = env::var("TABLE_NAME").map_err(|_| AppError::Internal("TABLE_NAME not set".to_string()))?;

    let body = match req.body() {
        Body::Text(s) => s,
        Body::Binary(b) => std::str::from_utf8(b).unwrap_or(""),
        _ => "",
    };

    let upload_req: UploadRequest = serde_json::from_str(body).map_err(|e| AppError::InvalidBody(format!("Invalid JSON: {}", e)))?;
    
    let file_id = Uuid::new_v4().to_string();
    let s3_key = format!("{}/{}", upload_req.owner_id, file_id);
    let upload_date = Utc::now().to_rfc3339();
    let content_type = upload_req.content_type.clone().unwrap_or_else(|| "application/octet-stream".to_string());

    info!(file_id = %file_id, "Signing upload URL for type: {}", content_type);

    let presigned_request = s3_client
        .put_object()
        .bucket(&bucket_name)
        .key(&s3_key)
        .content_type(content_type)
        .presigned(PresigningConfig::expires_in(Duration::from_secs(900)).map_err(|e| AppError::Internal(e.to_string()))?)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let pk = format!("VAULT#{}", upload_req.vault_id);
    let sk = format!("FILE#{}", file_id);

    // Using DynamoDB update logic for consistency
    dynamodb_client
        .put_item()
        .table_name(&table_name)
        .item("PK", AttributeValue::S(pk))
        .item("SK", AttributeValue::S(sk))
        .item("ID", AttributeValue::S(file_id.clone()))
        .item("FileName", AttributeValue::S(upload_req.file_name))
        .item("OwnerID", AttributeValue::S(upload_req.owner_id))
        .item("VaultID", AttributeValue::S(upload_req.vault_id.clone()))
        .item("UploadDate", AttributeValue::S(upload_date))
        .item("S3Key", AttributeValue::S(s3_key.clone()))
        .item("ParentID", AttributeValue::S(upload_req.parent_id.unwrap_or_else(|| "ROOT".to_string())))
        .item("Kind", AttributeValue::S("FILE".to_string()))
        .item("Status", AttributeValue::S("PENDING_UPLOAD".to_string()))
        .item("FileSize", AttributeValue::N(upload_req.file_size.unwrap_or(0).to_string()))
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("DB Save Failed: {}", e)))?;

    let response_body = UploadResponse {
        upload_url: presigned_request.uri().to_string(),
        file_id,
        s3_key,
    };

    Ok(cors_response()
        .status(200)
        .header("Content-Type", "application/json")
        .body(Body::Text(serde_json::to_string(&response_body).unwrap_or_default()))?)
}

async fn handle_confirm_upload(req: Request, dynamodb_client: &DynamoDbClient) -> Result<Response<Body>, AppError> {
    let table_name = env::var("TABLE_NAME").map_err(|_| AppError::Internal("TABLE_NAME not set".to_string()))?;
    let body = match req.body() { Body::Text(s) => s, Body::Binary(b) => std::str::from_utf8(b).unwrap_or(""), _ => "" };
    let confirm_req: ConfirmRequest = serde_json::from_str(body).map_err(|e| AppError::InvalidBody(e.to_string()))?;

    dynamodb_client.update_item().table_name(&table_name)
        .key("PK", AttributeValue::S(format!("VAULT#{}", confirm_req.vault_id)))
        .key("SK", AttributeValue::S(format!("FILE#{}", confirm_req.file_id)))
        .update_expression("SET #status = :active")
        .expression_attribute_names("#status", "Status".to_string())
        .expression_attribute_values(":active", AttributeValue::S("ACTIVE".to_string()))
        .send().await.map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(cors_response().status(200).body(Body::from("Confirmed"))?)
}

async fn handle_stats(req: Request, dynamodb_client: &DynamoDbClient) -> Result<Response<Body>, AppError> {
    let table_name = env::var("TABLE_NAME").expect("TABLE_NAME not set");
    let params = req.query_string_parameters();
    let vault_id = params.first("vault_id").ok_or_else(|| AppError::ValidationError("vault_id required".to_string()))?;
    
    let result = dynamodb_client.query().table_name(&table_name)
        .key_condition_expression("PK = :pk")
        .expression_attribute_values(":pk", AttributeValue::S(format!("VAULT#{}", vault_id)))
        .send().await.map_err(|e| AppError::Internal(e.to_string()))?;

    let mut stats = (0, 0, 0); // files, folders, size
    if let Some(items) = result.items {
        info!("Stats query found {} items for vault {}", items.len(), vault_id);
        for item in items {
            let sk = item.get("SK").and_then(|v| v.as_s().ok()).map(|s| s.as_str()).unwrap_or("");
            let kind = item.get("Kind").and_then(|v| v.as_s().ok()).map(|s| s.as_str());
            let status = item.get("Status").and_then(|v| v.as_s().ok()).map(|s| s.as_str());
            
            let is_file = kind == Some("FILE") || sk.starts_with("FILE#");
            let is_folder = kind == Some("FOLDER") || sk.starts_with("FOLDER#");
            let is_active = status == Some("ACTIVE");

            if is_file && is_active {
                stats.0 += 1;
                stats.2 += item.get("FileSize").and_then(|v| v.as_n().ok()).and_then(|n| n.parse::<u64>().ok()).unwrap_or(0);
            } else if is_folder {
                stats.1 += 1;
            }
        }
    }

    let resp = StatsResponse { total_files: stats.0, total_folders: stats.1, total_size: stats.2 };
    Ok(cors_response().status(200).header("Content-Type", "application/json").body(Body::from(serde_json::to_string(&resp).unwrap()))?)
}

/// POST /cleanup - Scans for orphan records and pending uploads to clear them up.
async fn handle_cleanup(req: Request, s3_client: &S3Client, dynamodb_client: &DynamoDbClient) -> Result<Response<Body>, AppError> {
    let table_name = env::var("TABLE_NAME").unwrap();
    let bucket_name = env::var("BUCKET_NAME").unwrap();
    let params = req.query_string_parameters();
    let vault_id = params.first("vault_id").expect("vault_id required");

    let result = dynamodb_client.query().table_name(&table_name)
        .key_condition_expression("PK = :pk")
        .expression_attribute_values(":pk", AttributeValue::S(format!("VAULT#{}", vault_id)))
        .send().await.map_err(|e| AppError::Internal(e.to_string()))?;

    let mut deleted_count = 0;
    if let Some(items) = result.items {
        for item in items {
            let sk = item.get("SK").and_then(|v| v.as_s().ok()).unwrap();
            let kind = item.get("Kind").and_then(|v| v.as_s().ok()).map(|s| s.as_str());
            let status = item.get("Status").and_then(|v| v.as_s().ok()).map(|s| s.as_str());
            let parent_id = item.get("ParentID").and_then(|v| v.as_s().ok()).map(|s| s.as_str());

            let mut should_delete = false;

            // 1. Delete untracked/pending uploads more than 1 hour old
            if status == Some("PENDING_UPLOAD") || status.is_none() && kind == Some("FILE") {
                should_delete = true;
            }

            // 2. Check for orphans (Parent Folder doesn't exist)
            if let Some(p_id) = parent_id {
                if p_id != "ROOT" {
                    let folder_check = dynamodb_client.get_item().table_name(&table_name)
                        .key("PK", AttributeValue::S(format!("VAULT#{}", vault_id)))
                        .key("SK", AttributeValue::S(format!("FOLDER#{}", p_id)))
                        .send().await;
                    
                    if let Ok(resp) = folder_check {
                        if resp.item.is_none() {
                            should_delete = true;
                        }
                    }
                }
            }

            if should_delete {
                if let Some(s3_key) = item.get("S3Key").and_then(|v| v.as_s().ok()) {
                    let _ = s3_client.delete_object().bucket(&bucket_name).key(s3_key).send().await;
                }
                let _ = dynamodb_client.delete_item().table_name(&table_name)
                    .key("PK", AttributeValue::S(format!("VAULT#{}", vault_id)))
                    .key("SK", AttributeValue::S(sk.to_string()))
                    .send().await;
                deleted_count += 1;
            }
        }
    }

    Ok(cors_response().status(200).body(Body::from(format!("Cleaned up {} records from vault {}", deleted_count, vault_id)))?)
}

async fn handle_download(req: Request, s3_client: &S3Client, dynamodb_client: &DynamoDbClient) -> Result<Response<Body>, AppError> {
    let bucket_name = env::var("BUCKET_NAME").map_err(|_| AppError::Internal("Bucket not set".to_string()))?;
    let table_name = env::var("TABLE_NAME").map_err(|_| AppError::Internal("Table not set".to_string()))?;
    let params = req.query_string_parameters();
    let file_id = params.first("file_id").ok_or_else(|| AppError::ValidationError("file_id missing".to_string()))?;
    let vault_id = params.first("vault_id").ok_or_else(|| AppError::ValidationError("vault_id missing".to_string()))?;

    let result = dynamodb_client.get_item().table_name(&table_name)
        .key("PK", AttributeValue::S(format!("VAULT#{}", vault_id)))
        .key("SK", AttributeValue::S(format!("FILE#{}", file_id)))
        .send().await.map_err(|e| AppError::Internal(e.to_string()))?;

    let item = result.item.ok_or_else(|| AppError::NotFound("File not found".to_string()))?;
    if item.get("Status").and_then(|v| v.as_s().ok()).map(|s| s.as_str()) != Some("ACTIVE") {
        return Err(AppError::ValidationError("File is not yet active/uploaded".to_string()));
    }

    let s3_key = item.get("S3Key").and_then(|v| v.as_s().ok()).unwrap();
    let file_name = item.get("FileName").and_then(|v| v.as_s().ok()).unwrap();

    let url = s3_client.get_object().bucket(bucket_name).key(s3_key)
        .response_content_disposition(format!("attachment; filename=\"{}\"", file_name))
        .presigned(PresigningConfig::expires_in(Duration::from_secs(900)).unwrap())
        .await.map_err(|e| AppError::Internal(e.to_string()))?;

    let resp = DownloadResponse { download_url: url.uri().to_string(), file_name: file_name.to_string() };
    Ok(cors_response().status(200).body(Body::from(serde_json::to_string(&resp).unwrap()))?)
}

async fn handle_list_items(req: Request, dynamodb_client: &DynamoDbClient) -> Result<Response<Body>, AppError> {
    let table_name = env::var("TABLE_NAME").expect("Table not set");
    let params = req.query_string_parameters();
    let vault_id = params.first("vault_id").ok_or_else(|| AppError::ValidationError("vault_id missing".to_string()))?;
    let parent_id = params.first("parent_id").unwrap_or("ROOT");

    let result = dynamodb_client.query().table_name(&table_name).index_name("FolderIndexV2")
        .key_condition_expression("PK = :v_id AND ParentID = :p_id")
        .expression_attribute_values(":v_id", AttributeValue::S(format!("VAULT#{}", vault_id)))
        .expression_attribute_values(":p_id", AttributeValue::S(parent_id.to_string()))
        .send().await.map_err(|e| AppError::Internal(e.to_string()))?;

    let items = result.items.unwrap_or_default().into_iter().filter_map(|item| {
        let sk = item.get("SK").and_then(|v| v.as_s().ok()).map(|s| s.as_str()).unwrap_or("");
        let kind = item.get("Kind").and_then(|v| v.as_s().ok()).map(|s| s.as_str());
        let status = item.get("Status").and_then(|v| v.as_s().ok()).map(|s| s.as_str());

        let is_file = kind == Some("FILE") || sk.starts_with("FILE#");
        let is_folder = kind == Some("FOLDER") || sk.starts_with("FOLDER#");
        let is_active = status == Some("ACTIVE");

        if is_folder || (is_file && is_active) {
            Some(MetadataItem {
                id: item.get("ID").and_then(|v| v.as_s().ok()).cloned().unwrap_or_default(),
                name: item.get("FileName").and_then(|v| v.as_s().ok()).cloned().unwrap_or_default(),
                kind: if is_folder { "FOLDER".to_string() } else { "FILE".to_string() },
                size: item.get("FileSize").and_then(|v| v.as_n().ok()).and_then(|n| n.parse().ok()),
                upload_date: item.get("UploadDate").and_then(|v| v.as_s().ok()).cloned().unwrap_or_default(),
                parent_id: item.get("ParentID").and_then(|v| v.as_s().ok()).cloned().unwrap_or_default(),
                status: status.unwrap_or("ACTIVE").to_string(),
                vault_id: Some(vault_id.to_string()),
            })
        } else { None }
    }).collect();

    Ok(cors_response().status(200).body(Body::from(serde_json::to_string(&ListResponse { items }).unwrap()))?)
}

async fn handle_create_folder(req: Request, dynamodb_client: &DynamoDbClient) -> Result<Response<Body>, AppError> {
    let table_name = env::var("TABLE_NAME").expect("Table not set");
    let body = match req.body() { Body::Text(s) => s, Body::Binary(b) => std::str::from_utf8(b).unwrap_or(""), _ => "" };
    let fr: FolderRequest = serde_json::from_str(body).map_err(|e| AppError::InvalidBody(e.to_string()))?;
    let id = Uuid::new_v4().to_string();
    let date = Utc::now().to_rfc3339();

    dynamodb_client.put_item().table_name(&table_name)
        .item("PK", AttributeValue::S(format!("VAULT#{}", fr.vault_id)))
        .item("SK", AttributeValue::S(format!("FOLDER#{}", id)))
        .item("ID", AttributeValue::S(id.clone()))
        .item("FileName", AttributeValue::S(fr.name))
        .item("OwnerID", AttributeValue::S(fr.owner_id))
        .item("VaultID", AttributeValue::S(fr.vault_id))
        .item("UploadDate", AttributeValue::S(date))
        .item("ParentID", AttributeValue::S(fr.parent_id.unwrap_or_else(|| "ROOT".to_string())))
        .item("Kind", AttributeValue::S("FOLDER".to_string()))
        .send().await.map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(cors_response().status(200).body(Body::from(id))?)
}

async fn handle_delete(req: Request, s3_client: &S3Client, dynamodb_client: &DynamoDbClient) -> Result<Response<Body>, AppError> {
    let table_name = env::var("TABLE_NAME").map_err(|_| AppError::Internal("Table name not set".to_string()))?;
    let bucket_name = env::var("BUCKET_NAME").map_err(|_| AppError::Internal("Bucket name not set".to_string()))?;
    let params = req.query_string_parameters();
    let file_id = params.first("file_id").ok_or_else(|| AppError::ValidationError("file_id required".to_string()))?;
    let vault_id = params.first("vault_id").ok_or_else(|| AppError::ValidationError("vault_id required".to_string()))?;

    let pk = format!("VAULT#{}", vault_id);
    let sk = format!("FILE#{}", file_id);

    info!(file_id = %file_id, "Attempting deletion of file and S3 object from vault {}", vault_id);

    // 1. Fetch metadata to get S3 Key
    let result = dynamodb_client.get_item().table_name(&table_name)
        .key("PK", AttributeValue::S(pk.clone()))
        .key("SK", AttributeValue::S(sk.clone()))
        .send().await.map_err(|e| AppError::Internal(format!("DB Query Failed: {}", e)))?;

    if let Some(item) = result.item {
        if let Some(s3_key) = item.get("S3Key").and_then(|v| v.as_s().ok()) {
            info!(s3_key = %s3_key, "Deleting from S3 bucket: {}", bucket_name);
            s3_client.delete_object().bucket(&bucket_name).key(s3_key).send().await
                .map_err(|e| AppError::Internal(format!("S3 Delete Failed: {}", e)))?;
        }
        
        // 2. Delete metadata record AFTER S3 deletion
        dynamodb_client.delete_item().table_name(&table_name)
            .key("PK", AttributeValue::S(pk))
            .key("SK", AttributeValue::S(sk))
            .send().await.map_err(|e| AppError::Internal(format!("DB Delete Failed: {}", e)))?;
        
        Ok(cors_response().status(200).body(Body::from("File deleted from S3 and Database"))?)
    } else {
        Err(AppError::NotFound("File not found".to_string()))
    }
}

async fn handle_delete_folder(req: Request, s3_client: &S3Client, dynamodb_client: &DynamoDbClient) -> Result<Response<Body>, AppError> {
    let table_name = env::var("TABLE_NAME").map_err(|_| AppError::Internal("Table name not set".to_string()))?;
    let bucket_name = env::var("BUCKET_NAME").map_err(|_| AppError::Internal("Bucket name not set".to_string()))?;
    let params = req.query_string_parameters();
    let folder_id = params.first("folder_id").ok_or_else(|| AppError::ValidationError("folder_id required".to_string()))?;
    let vault_id = params.first("vault_id").ok_or_else(|| AppError::ValidationError("vault_id required".to_string()))?;

    info!(folder_id = %folder_id, "Starting deep recursive deletion of folder tree in vault {}", vault_id);

    // Perform recursive deletion
    perform_recursive_delete(vault_id, folder_id, &table_name, &bucket_name, s3_client, dynamodb_client).await?;

    // Finally delete the folder record itself
    let pk = format!("VAULT#{}", vault_id);
    let sk = format!("FOLDER#{}", folder_id);
    dynamodb_client.delete_item().table_name(&table_name).key("PK", AttributeValue::S(pk)).key("SK", AttributeValue::S(sk)).send().await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(cors_response().status(200).body(Body::from("Folder tree deleted successfully"))?)
}

#[async_recursion::async_recursion]
async fn perform_recursive_delete(
    vault_id: &str,
    parent_id: &str,
    table_name: &str,
    bucket_name: &str,
    s3_client: &S3Client,
    dynamodb_client: &DynamoDbClient,
) -> Result<(), AppError> {
    // Query FolderIndex to find all children in this vault
    let result = dynamodb_client.query().table_name(table_name).index_name("FolderIndexV2")
        .key_condition_expression("PK = :v_id AND ParentID = :p_id")
        .expression_attribute_values(":v_id", AttributeValue::S(format!("VAULT#{}", vault_id)))
        .expression_attribute_values(":p_id", AttributeValue::S(parent_id.to_string()))
        .send().await.map_err(|e| AppError::Internal(e.to_string()))?;

    if let Some(items) = result.items {
        for item in items {
            let id = item.get("ID").and_then(|v| v.as_s().ok()).unwrap();
            let kind = item.get("Kind").and_then(|v| v.as_s().ok()).map(|s| s.as_str()).unwrap_or("FILE");
            let sk = item.get("SK").and_then(|v| v.as_s().ok()).unwrap();

            if kind == "FILE" {
                if let Some(key) = item.get("S3Key").and_then(|v| v.as_s().ok()) {
                    let _ = s3_client.delete_object().bucket(bucket_name).key(key).send().await;
                }
                let _ = dynamodb_client.delete_item().table_name(table_name)
                    .key("PK", AttributeValue::S(format!("VAULT#{}", vault_id)))
                    .key("SK", AttributeValue::S(sk.to_string()))
                    .send().await;
            } else if kind == "FOLDER" {
                // Recursively delete sub-contents
                perform_recursive_delete(vault_id, id, table_name, bucket_name, s3_client, dynamodb_client).await?;
                // Delete sub-folder itself
                let _ = dynamodb_client.delete_item().table_name(table_name)
                    .key("PK", AttributeValue::S(format!("VAULT#{}", vault_id)))
                    .key("SK", AttributeValue::S(sk.to_string()))
                    .send().await;
            }
        }
    }
    Ok(())
}

async fn handle_list_vaults(req: Request, dynamodb_client: &DynamoDbClient) -> Result<Response<Body>, AppError> {
    let table_name = env::var("TABLE_NAME").expect("Table set");
    let params = req.query_string_parameters();
    let owner_id = params.first("owner_id").expect("owner_id req");

    let result = dynamodb_client.query().table_name(&table_name)
        .key_condition_expression("PK = :pk AND begins_with(SK, :vault)")
        .expression_attribute_values(":pk", AttributeValue::S(format!("USER#{}", owner_id)))
        .expression_attribute_values(":vault", AttributeValue::S("VAULT#".to_string()))
        .send().await.map_err(|e| AppError::Internal(e.to_string()))?;

    let items = result.items.unwrap_or_default().into_iter().map(|item| {
        MetadataItem {
            id: item.get("ID").and_then(|v| v.as_s().ok()).cloned().unwrap_or_default(),
            name: item.get("Name").and_then(|v| v.as_s().ok()).cloned().unwrap_or_default(),
            kind: "VAULT".to_string(),
            size: None,
            upload_date: item.get("CreatedAt").and_then(|v| v.as_s().ok()).cloned().unwrap_or_default(),
            parent_id: "ROOT".to_string(),
            status: "ACTIVE".to_string(),
            vault_id: None,
        }
    }).collect::<Vec<_>>();

    Ok(cors_response().status(200).body(Body::from(serde_json::to_string(&ListResponse { items }).unwrap()))?)
}

async fn handle_create_vault(req: Request, dynamodb_client: &DynamoDbClient) -> Result<Response<Body>, AppError> {
    let table_name = env::var("TABLE_NAME").expect("Table set");
    let body = match req.body() { Body::Text(s) => s, Body::Binary(b) => std::str::from_utf8(b).unwrap_or(""), _ => "" };
    let vr: VaultRequest = serde_json::from_str(body).map_err(|e| AppError::InvalidBody(e.to_string()))?;
    let vault_id = Uuid::new_v4().to_string();
    let date = Utc::now().to_rfc3339();

    dynamodb_client.put_item().table_name(&table_name)
        .item("PK", AttributeValue::S(format!("USER#{}", vr.owner_id)))
        .item("SK", AttributeValue::S(format!("VAULT#{}", vault_id)))
        .item("ID", AttributeValue::S(vault_id.clone()))
        .item("Name", AttributeValue::S(vr.name))
        .item("OwnerID", AttributeValue::S(vr.owner_id))
        .item("CreatedAt", AttributeValue::S(date))
        .item("Kind", AttributeValue::S("VAULT".to_string()))
        .send().await.map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(cors_response().status(200).body(Body::from(vault_id))?)
}

async fn handle_delete_vault(req: Request, dynamodb_client: &DynamoDbClient) -> Result<Response<Body>, AppError> {
    let table_name = env::var("TABLE_NAME").expect("Table set");
    let params = req.query_string_parameters();
    let owner_id = params.first("owner_id").ok_or_else(|| AppError::ValidationError("owner_id required".to_string()))?;
    let vault_id = params.first("vault_id").ok_or_else(|| AppError::ValidationError("vault_id required".to_string()))?;

    // Delete the vault record from USER# partition
    dynamodb_client.delete_item().table_name(&table_name)
        .key("PK", AttributeValue::S(format!("USER#{}", owner_id)))
        .key("SK", AttributeValue::S(format!("VAULT#{}", vault_id)))
        .send().await.map_err(|e| AppError::Internal(e.to_string()))?;

    // Note: We don't automatically delete all VAULT# partitioned items here for safety
    // Users should use 'cleanup' or delete items first.
    
    Ok(cors_response().status(200).body(Body::from("Vault decommissioned"))?)
}
