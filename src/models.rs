use serde::{Deserialize, Serialize};

#[derive(Deserialize, Debug)]
pub struct VaultRequest {
    pub name: String,
    pub owner_id: String,
}

#[derive(Deserialize, Debug)]
pub struct UploadRequest {
    pub file_name: String,
    pub owner_id: String,
    pub vault_id: String,
    pub content_type: Option<String>,
    pub file_size: Option<u64>,
    pub parent_id: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct ConfirmRequest {
    pub file_id: String,
    pub vault_id: String,
}

#[derive(Deserialize, Debug)]
pub struct FolderRequest {
    pub name: String,
    pub owner_id: String,
    pub vault_id: String,
    pub parent_id: Option<String>,
}

#[derive(Serialize, Debug, Deserialize)]
pub struct MetadataItem {
    pub id: String,
    pub name: String,
    pub kind: String, // "FILE" or "FOLDER" or "VAULT"
    pub size: Option<u64>,
    pub upload_date: String,
    pub parent_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vault_id: Option<String>,
}

#[derive(Serialize)]
pub struct UploadResponse {
    pub upload_url: String,
    pub file_id: String,
    pub s3_key: String,
}

#[derive(Serialize)]
pub struct DownloadResponse {
    pub download_url: String,
    pub file_name: String,
}

#[derive(Serialize)]
pub struct ListResponse {
    pub items: Vec<MetadataItem>,
}

#[derive(Serialize)]
pub struct StatsResponse {
    pub total_files: u64,
    pub total_folders: u64,
    pub total_size: u64,
}
