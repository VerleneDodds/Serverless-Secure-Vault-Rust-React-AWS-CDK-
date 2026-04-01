/**
 * Secure Storage API Service
 * 
 * Communicates with the AWS API Gateway -> Rust Lambda backend.
 * Handles presigned URL generation and direct S3 uploads.
 * All upload history is scoped per-user via owner_id.
 */

const DEFAULT_API_URL = 'https://your-api-id.execute-api.us-east-1.amazonaws.com/prod';

/**
 * Get the configured API base URL from localStorage or use the default.
 */
export function getApiUrl() {
  return localStorage.getItem('secureVault_apiUrl') || DEFAULT_API_URL;
}

/**
 * Set the API base URL in localStorage.
 */
export function setApiUrl(url) {
  localStorage.setItem('secureVault_apiUrl', url);
}

/**
 * Request a presigned upload URL from the backend.
 * POST /uploads
 * Body: { file_name: string, owner_id: string }
 * Returns: { upload_url: string, file_id: string, s3_key: string }
 */
export async function requestUploadUrl(fileName, ownerId) {
  const apiUrl = getApiUrl();
  
  const response = await fetch(`${apiUrl}/uploads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_name: fileName,
      owner_id: ownerId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Request a presigned download URL for a file.
 * GET /uploads?file_id=...&owner_id=...
 * Returns: { download_url: string, file_name: string }
 */
export async function getDownloadUrl(fileId, ownerId) {
  const apiUrl = getApiUrl().replace(/\/$/, "");
  const response = await fetch(`${apiUrl}/uploads?file_id=${fileId}&owner_id=${ownerId}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Download generation failed: ${errorText}`);
  }

  return response.json();
}

/**
 * Upload a file directly to S3 using a presigned PUT URL.
 * Supports progress tracking via XMLHttpRequest.
 */
export function uploadFileToS3(presignedUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        onProgress(percentComplete);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ status: xhr.status, statusText: xhr.statusText });
      } else {
        reject(new Error(`S3 Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during S3 upload'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload was aborted'));
    });

    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}

/**
 * Format file size in human-readable format.
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get a readable file type category from the extension.
 */
export function getFileCategory(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const categories = {
    pdf: 'pdf',
    doc: 'doc', docx: 'doc',
    xls: 'doc', xlsx: 'doc',
    ppt: 'doc', pptx: 'doc',
    jpg: 'img', jpeg: 'img', png: 'img', gif: 'img', webp: 'img', svg: 'img', bmp: 'img',
    mp4: 'img', mov: 'img', avi: 'img', mkv: 'img',
    zip: 'default', rar: 'default', tar: 'default', gz: 'default',
  };
  return categories[ext] || 'default';
}

/**
 * Get upload history scoped to the given user ID.
 */
export function getUploadHistory(userId) {
  if (!userId) return [];
  try {
    return JSON.parse(localStorage.getItem(`secureVault_history_${userId}`) || '[]');
  } catch {
    return [];
  }
}

/**
 * Add an entry to upload history for a specific user.
 */
export function addToUploadHistory(userId, entry) {
  if (!userId) return;
  const history = getUploadHistory(userId);
  history.unshift({
    ...entry,
    timestamp: new Date().toISOString(),
  });
  // Keep last 100 entries per user
  localStorage.setItem(
    `secureVault_history_${userId}`,
    JSON.stringify(history.slice(0, 100))
  );
}

/**
 * Clear upload history for a specific user.
 */
export function clearUploadHistory(userId) {
  if (!userId) return;
  localStorage.setItem(`secureVault_history_${userId}`, '[]');
}

/**
 * Get total stats across all entries for a user.
 */
export function getUserStats(userId) {
  const history = getUploadHistory(userId);
  return {
    totalUploads: history.length,
    totalSize: history.reduce((acc, f) => acc + (f.fileSize || 0), 0),
    successCount: history.filter((f) => f.status === 'success').length,
    errorCount: history.filter((f) => f.status === 'error').length,
    lastUpload: history.length > 0 ? history[0].timestamp : null,
  };
}
