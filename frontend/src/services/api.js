/**
 * Secure Storage API Service
 * 
 * Communicates with the AWS API Gateway -> Rust Lambda backend.
 * Handles presigned URL generation and direct S3 uploads.
 * Supports multi-vault architecture scoped per-user.
 */

import { fetchAuthSession } from 'aws-amplify/auth';

const DEFAULT_API_URL = 'https://3qlauzvelj.execute-api.us-west-2.amazonaws.com/prod';

async function getAuthHeader() {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    return token ? { 'Authorization': token } : {};
  } catch (err) {
    console.error('Session error:', err);
    return {};
  }
}

export function getApiUrl() {
  return localStorage.getItem('secureVault_apiUrl') || DEFAULT_API_URL;
}

export function setApiUrl(url) {
  localStorage.setItem('secureVault_apiUrl', url);
}

// ==========================================
// Vault Operations
// ==========================================

export async function listVaults(ownerId) {
  const apiUrl = getApiUrl().replace(/\/$/, "");
  const authHeader = await getAuthHeader();
  const response = await fetch(`${apiUrl}/vaults?owner_id=${ownerId}`, {
    method: 'GET',
    headers: { ...authHeader }
  });
  if (!response.ok) throw new Error('Failed to list vaults');
  const data = await response.json();
  return data.items || [];
}

export async function createVault(ownerId, name) {
  const apiUrl = getApiUrl().replace(/\/$/, "");
  const authHeader = await getAuthHeader();
  const response = await fetch(`${apiUrl}/vaults`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({ name, owner_id: ownerId }),
  });
  if (!response.ok) throw new Error('Failed to create vault');
  return response.text();
}

export async function deleteVault(ownerId, vaultId) {
  const apiUrl = getApiUrl().replace(/\/$/, "");
  const authHeader = await getAuthHeader();
  const response = await fetch(`${apiUrl}/vaults?owner_id=${ownerId}&vault_id=${vaultId}`, {
    method: 'DELETE',
    headers: { ...authHeader }
  });
  if (!response.ok) throw new Error('Vault decommission failed');
  return response.text();
}

// ==========================================
// File/Folder Operations (Vault-Scoped)
// ==========================================

export async function requestUploadUrl(fileName, ownerId, vaultId, parentId = 'ROOT', fileSize = 0, contentType = 'application/octet-stream') {
  const apiUrl = getApiUrl().replace(/\/$/, "");
  const authHeader = await getAuthHeader();
  const response = await fetch(`${apiUrl}/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({
      file_name: fileName,
      owner_id: ownerId,
      vault_id: vaultId,
      file_size: fileSize,
      parent_id: parentId,
      content_type: contentType
    }),
  });

  if (!response.ok) throw new Error('Failed to get upload URL');
  return response.json();
}

export async function confirmUpload(fileId, vaultId) {
  const apiUrl = getApiUrl().replace(/\/$/, "");
  const authHeader = await getAuthHeader();
  const response = await fetch(`${apiUrl}/uploads`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({ file_id: fileId, vault_id: vaultId }),
  });
  if (!response.ok) throw new Error('Failed to confirm upload');
  return true;
}

export async function createFolder(name, ownerId, vaultId, parentId = 'ROOT') {
  const apiUrl = getApiUrl().replace(/\/$/, "");
  const authHeader = await getAuthHeader();
  const response = await fetch(`${apiUrl}/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({ name, owner_id: ownerId, vault_id: vaultId, parent_id: parentId }),
  });
  if (!response.ok) throw new Error('Failed to create folder');
  return response.text();
}

export async function listFolderItems(vaultId, parentId = 'ROOT') {
  const apiUrl = getApiUrl().replace(/\/$/, "");
  const authHeader = await getAuthHeader();
  const response = await fetch(`${apiUrl}/folders?vault_id=${vaultId}&parent_id=${parentId}`, {
    method: 'GET',
    headers: { ...authHeader }
  });
  if (!response.ok) throw new Error('Failed to list contents');
  const data = await response.json();
  return data.items || [];
}

export async function deleteFolder(folderId, vaultId) {
  const apiUrl = getApiUrl().replace(/\/$/, "");
  const authHeader = await getAuthHeader();
  const response = await fetch(`${apiUrl}/folders?folder_id=${folderId}&vault_id=${vaultId}`, {
    method: 'DELETE',
    headers: { ...authHeader }
  });
  if (!response.ok) throw new Error('Failed to delete folder');
  return true;
}

export async function getDownloadUrl(fileId, vaultId) {
  const apiUrl = getApiUrl().replace(/\/$/, "");
  const authHeader = await getAuthHeader();
  const response = await fetch(`${apiUrl}/uploads?file_id=${fileId}&vault_id=${vaultId}`, {
    method: 'GET',
    headers: { ...authHeader }
  });
  if (!response.ok) throw new Error('Download request failed');
  return response.json();
}

export async function deleteFile(fileId, vaultId) {
  const apiUrl = getApiUrl().replace(/\/$/, "");
  const authHeader = await getAuthHeader();
  const response = await fetch(`${apiUrl}/uploads?file_id=${fileId}&vault_id=${vaultId}`, {
    method: 'DELETE',
    headers: { ...authHeader }
  });
  if (!response.ok) throw new Error('Delete failed');
  return true;
}

export async function getUserStats(vaultId) {
  if (!vaultId) return { total_files: 0, total_folders: 0, total_size: 0 };
  const apiUrl = getApiUrl().replace(/\/$/, "");
  const authHeader = await getAuthHeader();
  try {
    const response = await fetch(`${apiUrl}/stats?vault_id=${vaultId}`, {
      headers: { ...authHeader }
    });
    if (!response.ok) throw new Error('Failed to fetch stats');
    const data = await response.json();
    return data;
  } catch (err) {
    console.warn('Stats fetch failed:', err);
    return { total_files: 0, total_folders: 0, total_size: 0 };
  }
}

// ==========================================
// Utilities
// ==========================================

export function uploadFileToS3(presignedUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({ status: xhr.status });
      else reject(new Error(`S3 Upload failed: ${xhr.status}`));
    });
    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getFileCategory(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const categories = {
    pdf: 'pdf', doc: 'doc', docx: 'doc', xls: 'doc', xlsx: 'doc', ppt: 'doc', pptx: 'doc',
    jpg: 'img', jpeg: 'img', png: 'img', gif: 'img', webp: 'img', svg: 'img', bmp: 'img',
    mp4: 'img', mov: 'img', avi: 'img', mkv: 'img',
  };
  return categories[ext] || 'default';
}
