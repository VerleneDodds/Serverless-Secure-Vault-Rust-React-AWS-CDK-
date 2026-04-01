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

const isDemo = () => getApiUrl() === 'DEMO_MODE';

// ==========================================
// Demo Data Management (sessionStorage)
// ==========================================

const INITIAL_DEMO_ITEMS = [
  { id: 'd-1', name: 'Cloud Engineering Projects', kind: 'FOLDER', size: 0, upload_date: new Date(Date.now() - 86400000).toISOString(), parent_id: 'ROOT', vault_id: 'v-demo-1', status: 'ACTIVE', isVolatile: false },
  { id: 'd-2', name: 'Infrastructure Specs', kind: 'FOLDER', size: 0, upload_date: new Date(Date.now() - 43200000).toISOString(), parent_id: 'ROOT', vault_id: 'v-demo-1', status: 'ACTIVE', isVolatile: false },
  { id: 'f-1', name: 'Q3_Financial_Summary.pdf', kind: 'FILE', size: 2450000, upload_date: new Date(Date.now() - 86400000).toISOString(), parent_id: 'ROOT', vault_id: 'v-demo-1', status: 'ACTIVE', isVolatile: false },
  { id: 'f-2', name: 'architecture_diagram.png', kind: 'FILE', size: 850000, upload_date: new Date(Date.now() - 172800000).toISOString(), parent_id: 'ROOT', vault_id: 'v-demo-1', status: 'ACTIVE', isVolatile: false },
  { id: 'f-3', name: 'rust_lambda_config.yaml', kind: 'FILE', size: 12000, upload_date: new Date(Date.now() - 3600000).toISOString(), parent_id: 'ROOT', vault_id: 'v-demo-1', status: 'ACTIVE', isVolatile: false },
  { id: 'f-sub', name: 'Sub-project_Draft.docx', kind: 'FILE', size: 450000, upload_date: new Date(Date.now() - 1200000).toISOString(), parent_id: 'd-1', vault_id: 'v-demo-1', status: 'ACTIVE', isVolatile: false }
];

function getDemoItems() {
  const stored = sessionStorage.getItem('secureVault_demoItems');
  if (!stored) {
    sessionStorage.setItem('secureVault_demoItems', JSON.stringify(INITIAL_DEMO_ITEMS));
    return INITIAL_DEMO_ITEMS;
  }
  return JSON.parse(stored);
}

function saveDemoItems(items) {
  sessionStorage.setItem('secureVault_demoItems', JSON.stringify(items));
}

// ==========================================
// Vault Operations
// ==========================================

export async function listVaults(ownerId) {
  if (isDemo()) {
    return [
      { id: 'v-demo-1', name: 'Primary Vault (Demo)', created_at: Date.now() },
      { id: 'v-demo-2', name: 'Secure Archive (Demo)', created_at: Date.now() }
    ];
  }
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
  if (isDemo()) return "SUCCESS";
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
  if (isDemo()) return "SUCCESS";
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
  if (isDemo()) {
    const fileId = 'f-' + Math.random().toString(36).substr(2, 9);
    // Add to volatile storage immediately as PENDING
    const items = getDemoItems();
    items.push({
      id: fileId,
      name: fileName,
      kind: 'FILE',
      size: fileSize,
      upload_date: new Date().toISOString(),
      parent_id: parentId,
      vault_id: vaultId,
      status: 'PENDING',
      isVolatile: true
    });
    saveDemoItems(items);

    return { 
      upload_url: 'DEMO_URL', 
      file_id: fileId
    };
  }
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
  if (isDemo()) {
    const items = getDemoItems();
    const item = items.find(i => i.id === fileId);
    if (item) item.status = 'ACTIVE';
    saveDemoItems(items);
    return true;
  }
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
  if (isDemo()) {
    const folderId = 'd-' + Math.random().toString(36).substr(2, 9);
    const items = getDemoItems();
    items.push({
      id: folderId,
      name,
      kind: 'FOLDER',
      size: 0,
      upload_date: new Date().toISOString(),
      parent_id: parentId,
      vault_id: vaultId,
      status: 'ACTIVE',
      isVolatile: true
    });
    saveDemoItems(items);
    return "SUCCESS";
  }
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
  if (isDemo()) {
    const items = getDemoItems();
    return items.filter(i => i.vault_id === vaultId && i.parent_id === parentId && i.status !== 'PENDING');
  }
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
  if (isDemo()) {
    const items = getDemoItems().filter(i => i.id !== folderId);
    saveDemoItems(items);
    return true;
  }
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
  if (isDemo()) return { download_url: '#' };
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
  if (isDemo()) {
    const items = getDemoItems().filter(i => i.id !== fileId);
    saveDemoItems(items);
    return true;
  }
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
  if (isDemo()) {
    const items = getDemoItems().filter(i => i.vault_id === vaultId);
    const files = items.filter(i => i.kind === 'FILE');
    return { 
      total_files: files.length, 
      total_folders: items.length - files.length, 
      total_size: files.reduce((acc, f) => acc + (f.size || 0), 0) 
    };
  }
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

export async function performCleanup(vaultId) {
  if (isDemo()) {
    return "Optimized demo storage. Database state successfully refreshed.";
  }
  const apiUrl = getApiUrl().replace(/\/$/, "");
  const authHeader = await getAuthHeader();
  const response = await fetch(`${apiUrl}/cleanup?vault_id=${vaultId}`, { 
    method: 'POST',
    headers: { ...authHeader }
  });
  if (!response.ok) throw new Error('Cleanup operation failed');
  return response.text();
}

// ==========================================
// Utilities
// ==========================================

export function uploadFileToS3(presignedUrl, file, onProgress) {
  if (isDemo()) {
    return new Promise((resolve) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 15) + 5;
        if (progress >= 100) {
          progress = 100;
          onProgress(100);
          clearInterval(interval);
          setTimeout(() => resolve({ status: 200 }), 300);
        } else {
          onProgress(progress);
        }
      }, 200);
    });
  }
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
