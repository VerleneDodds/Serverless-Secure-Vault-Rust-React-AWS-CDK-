import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Upload, FolderLock, Activity, Cloud, Lock,
  File, FileText, Image, X, CheckCircle, AlertCircle,
  Info, Settings, Clock, HardDrive, Zap, Eye, Copy,
  Trash2, ChevronRight, ExternalLink, Server, Database,
  Key, Globe, ArrowUpCircle, BarChart3, ShieldCheck,
  Cpu, Layers, CloudUpload, RefreshCw, Users
} from 'lucide-react';
import {
  requestUploadUrl, uploadFileToS3, formatFileSize,
  getFileCategory, getApiUrl, setApiUrl,
  getUploadHistory, addToUploadHistory, clearUploadHistory, getUserStats
} from './services/api';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthScreen from './components/AuthScreen';
import UserMenu from './components/UserMenu';

// =====================================================
// Toast Notification System
// =====================================================
function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="toast-container">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 100, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`toast ${toast.type}`}
          >
            <div className="toast-icon">
              {toast.type === 'success' && <CheckCircle />}
              {toast.type === 'error' && <AlertCircle />}
              {toast.type === 'info' && <Info />}
            </div>
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              {toast.message && <div className="toast-message">{toast.message}</div>}
            </div>
            <button className="toast-close" onClick={() => onDismiss(toast.id)}>
              <X />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// =====================================================
// Navbar
// =====================================================
function Navbar({ activeTab, setActiveTab }) {
  const { user } = useAuth();

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <a href="#" className="navbar-brand" onClick={(e) => { e.preventDefault(); setActiveTab('dashboard'); }}>
          <div className="navbar-logo">
            <Shield />
          </div>
          <div className="navbar-title">
            <span>SecureVault</span>
          </div>
        </a>
        <ul className="navbar-nav">
          <li>
            <button
              className={activeTab === 'dashboard' ? 'active' : ''}
              onClick={() => setActiveTab('dashboard')}
            >
              <BarChart3 /> Dashboard
            </button>
          </li>
          <li>
            <button
              className={activeTab === 'upload' ? 'active' : ''}
              onClick={() => setActiveTab('upload')}
            >
              <CloudUpload /> Upload
            </button>
          </li>
          <li>
            <button
              className={activeTab === 'architecture' ? 'active' : ''}
              onClick={() => setActiveTab('architecture')}
            >
              <Layers /> Architecture
            </button>
          </li>
          <li>
            <button
              className={activeTab === 'settings' ? 'active' : ''}
              onClick={() => setActiveTab('settings')}
            >
              <Settings /> Settings
            </button>
          </li>
          <li>
            <div className="security-badge">
              <Lock /> AES-256
            </div>
          </li>
          <li>
            <div className="nav-status-indicator" title="System Online" />
          </li>
          <li>
            <UserMenu onNavigate={setActiveTab} />
          </li>
        </ul>
      </div>
    </nav>
  );
}

// =====================================================
// Stat Card
// =====================================================
function StatCard({ icon: Icon, value, label, badge, colorClass }) {
  return (
    <motion.div
      className="stat-card"
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className="stat-card-header">
        <div className={`stat-card-icon ${colorClass}`}>
          <Icon />
        </div>
        {badge && <span className="stat-card-badge">{badge}</span>}
      </div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
    </motion.div>
  );
}

// =====================================================
// File Card
// =====================================================
function FileCard({ file, onCopyId }) {
  const category = getFileCategory(file.fileName);
  const IconComponent = category === 'pdf' ? FileText : category === 'img' ? Image : File;

  return (
    <motion.div
      className="file-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <div className={`file-card-icon ${category}`}>
        <IconComponent />
      </div>
      <div className="file-card-info">
        <div className="file-card-name">{file.fileName}</div>
        <div className="file-card-meta">
          <span><Clock size={12} /> {new Date(file.timestamp).toLocaleString()}</span>
          <span><HardDrive size={12} /> {formatFileSize(file.fileSize)}</span>
        </div>
      </div>
      <div className={`file-card-status ${file.status}`}>
        {file.status === 'success' && <><CheckCircle size={12} /> Encrypted</>}
        {file.status === 'uploading' && <><RefreshCw size={12} /> Uploading</>}
        {file.status === 'error' && <><AlertCircle size={12} /> Failed</>}
        {file.status === 'pending' && <><Clock size={12} /> Pending</>}
      </div>
      <div className="file-card-actions">
        <button title="Copy File ID" onClick={() => onCopyId(file.fileId)}>
          <Copy />
        </button>
        <button title="View S3 Key">
          <Eye />
        </button>
      </div>
    </motion.div>
  );
}

// =====================================================
// Upload Zone
// =====================================================
function UploadZone({ onFilesSelected, isUploading, uploadProgress }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFilesSelected(files);
  }, [onFilesSelected]);

  const handleClick = () => inputRef.current?.click();

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) onFilesSelected(files);
    e.target.value = '';
  };

  return (
    <motion.div
      className={`upload-zone ${isDragOver ? 'drag-over' : ''} ${isUploading ? 'uploading' : ''}`}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      whileHover={!isUploading ? { scale: 1.01 } : {}}
      whileTap={!isUploading ? { scale: 0.99 } : {}}
    >
      <div className="upload-zone-content">
        {isUploading ? (
          <>
            <div className="upload-zone-icon">
              <ArrowUpCircle />
            </div>
            <h3>Uploading to S3...</h3>
            <p>File is being encrypted and transferred via presigned URL</p>
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${uploadProgress}%` }} />
            </div>
            <p style={{ marginTop: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--color-accent-secondary)' }}>
              {uploadProgress}% complete
            </p>
          </>
        ) : (
          <>
            <div className="upload-zone-icon">
              <Upload />
            </div>
            <h3>Drop files here to encrypt & upload</h3>
            <p>Files are uploaded directly to S3 via presigned URLs. Max 5GB per file.</p>
            <div className="upload-zone-cta">
              <CloudUpload size={16} /> Browse files
            </div>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="upload-input"
        onChange={handleFileChange}
        multiple
      />
    </motion.div>
  );
}

// =====================================================
// Upload Config Panel (shows user's owner_id)
// =====================================================
function UploadConfigPanel({ apiUrl, onApiUrlChange }) {
  const { user } = useAuth();

  return (
    <div className="upload-config">
      <h3><Settings /> Upload Configuration</h3>

      <div className="form-group">
        <label className="form-label">Owner Identity</label>
        <div className="owner-identity-card">
          <div className="user-avatar user-avatar-sm" style={{ background: user.avatar }}>
            {user.initials}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user.displayName}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-accent-secondary)' }}>
              {user.id}
            </div>
          </div>
        </div>
        <div className="form-hint">
          Your owner_id maps to DynamoDB PK: <code>USER#{user.id}</code>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">API Gateway Endpoint</label>
        <input
          type="text"
          className="form-input mono"
          value={apiUrl}
          onChange={(e) => onApiUrlChange(e.target.value)}
          placeholder="https://abc123.execute-api.us-east-1.amazonaws.com/prod"
          id="api-url-input"
        />
        <div className="form-hint">Your deployed API Gateway URL (from <code>npx cdk deploy</code> output)</div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <div className="security-badge"><Shield size={12} /> KMS Encrypted</div>
        <div className="security-badge"><Lock size={12} /> SSL Enforced</div>
        <div className="security-badge"><ShieldCheck size={12} /> Versioned</div>
      </div>
    </div>
  );
}

// =====================================================
// Architecture Page
// =====================================================
function ArchitecturePage() {
  const archCards = [
    {
      icon: Key,
      title: 'AWS KMS Encryption',
      subtitle: 'Customer Managed Keys',
      colorClass: 'indigo',
      items: [
        'Customer Managed Key (CMK) with automatic yearly rotation',
        'Grants kms:Decrypt, kms:ReEncrypt*, kms:GenerateDataKey* to Lambda',
        'Unauthorized workloads cannot read ciphered DynamoDB data',
        'Compliant with PCI-DSS and SOC2 requirements',
      ],
    },
    {
      icon: HardDrive,
      title: 'S3 Storage Hardening',
      subtitle: 'Multi-layer Protection',
      colorClass: 'cyan',
      items: [
        'BlockPublicAccess.BLOCK_ALL prevents ACL-based exposures',
        'enforceSSL: true denies all non-HTTPS requests',
        'AES-256 S3 Managed Encryption on all objects',
        'Versioning enabled to protect against accidental deletes',
      ],
    },
    {
      icon: Cloud,
      title: 'Presigned URL Flow',
      subtitle: 'Decoupled Upload Architecture',
      colorClass: 'purple',
      items: [
        'Client POSTs file_name + owner_id to API Gateway',
        'Rust Lambda generates UUID and presigns S3 PUT URL',
        'URL expires in exactly 15 minutes (Least Privilege)',
        'Browser uploads directly to S3, bypassing Lambda 6MB limit',
      ],
    },
    {
      icon: Cpu,
      title: 'Rust Lambda Engine',
      subtitle: 'provided.al2023 Runtime',
      colorClass: 'green',
      items: [
        'Tokio async runtime parallelizes AWS SDK calls',
        'LLVM-compiled binary achieves ~30ms cold starts',
        'DynamoDbClient & S3Client cached across warm starts',
        'Structured tracing with tracing-subscriber for CloudWatch',
      ],
    },
    {
      icon: Database,
      title: 'DynamoDB Metadata',
      subtitle: 'Single Table Design',
      colorClass: 'indigo',
      items: [
        'Partition Key: USER#{owner_id} / Sort Key: FILE#{file_id}',
        'Stores FileID, FileName, OwnerID, UploadDate, S3Key',
        'PAY_PER_REQUEST billing for unpredictable workloads',
        'KMS Customer Managed encryption at rest',
      ],
    },
    {
      icon: Activity,
      title: 'End-to-End Observability',
      subtitle: 'X-Ray + CloudWatch',
      colorClass: 'cyan',
      items: [
        'X-Ray tracing across API Gateway → Lambda → DynamoDB/S3',
        'Latency waterfall graphs for every request',
        'Structured tracing::info! logs parsed by CloudWatch',
        'Log Insights for analyzing millions of invocations',
      ],
    },
  ];

  return (
    <>
      <div className="page-header">
        <h1>System Architecture</h1>
        <p>
          A deep look at the security layers, storage hardening, and observability
          that power this serverless infrastructure.
        </p>
      </div>
      <div className="arch-grid">
        {archCards.map((card, index) => (
          <motion.div
            key={card.title}
            className="arch-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08, type: 'spring', stiffness: 300, damping: 25 }}
          >
            <div className="arch-card-header">
              <div className={`arch-card-icon stat-card-icon ${card.colorClass}`}>
                <card.icon />
              </div>
              <div>
                <div className="arch-card-title">{card.title}</div>
                <div className="arch-card-subtitle">{card.subtitle}</div>
              </div>
            </div>
            <div className="arch-card-body">
              <ul>
                {card.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Data Flow Diagram */}
      <div className="config-panel">
        <h3 className="section-title" style={{ marginBottom: '1.5rem' }}>
          <Globe /> Request Lifecycle
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
          {['Browser', 'API Gateway', 'Rust Lambda', 'S3 Presign', 'DynamoDB Write', 'Response'].map((step, i, arr) => (
            <React.Fragment key={step}>
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.12 }}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius-sm)',
                  background: i === 0 ? 'rgba(99, 102, 241, 0.15)' :
                    i === arr.length - 1 ? 'rgba(16, 185, 129, 0.15)' :
                      'var(--color-surface-glass)',
                  border: '1px solid var(--color-border-subtle)',
                  color: i === 0 ? 'var(--color-accent-primary-light)' :
                    i === arr.length - 1 ? 'var(--color-accent-success-light)' :
                      'var(--color-text-secondary)',
                  fontWeight: 600,
                }}
              >
                {step}
              </motion.div>
              {i < arr.length - 1 && (
                <ChevronRight size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </>
  );
}

// =====================================================
// Settings Page
// =====================================================
function SettingsPage({ apiUrl, onApiUrlChange, onClearHistory, addToast }) {
  const { user, users, updateProfile, deleteAccount } = useAuth();
  const [editName, setEditName] = useState(user?.displayName || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSaveProfile = () => {
    if (editName.trim()) {
      updateProfile({ displayName: editName.trim() });
      addToast('success', 'Profile updated', 'Your display name has been changed');
    }
  };

  const handleSaveApi = () => {
    setApiUrl(apiUrl);
    addToast('success', 'Settings saved', 'API configuration has been updated');
  };

  const handleDeleteAccount = () => {
    const userId = user.id;
    deleteAccount(userId);
    addToast('info', 'Account deleted', 'Your account and data have been removed');
  };

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage your profile, API configuration, and account.</p>
      </div>

      {/* Profile Section */}
      <div className="config-panel">
        <h3 className="section-title"><Users /> Profile</h3>
        <div className="settings-profile-header">
          <div className="user-avatar user-avatar-xl" style={{ background: user.avatar }}>
            {user.initials}
          </div>
          <div className="settings-profile-info">
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{user.displayName}</div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{user.email}</div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: 'var(--color-accent-secondary)',
              marginTop: '4px',
            }}>
              Owner ID: {user.id}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Member since {new Date(user.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="form-group" style={{ marginTop: '1.5rem' }}>
          <label className="form-label">Display Name</label>
          <input
            type="text"
            className="form-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            id="settings-display-name"
          />
        </div>
        <button className="btn btn-primary" onClick={handleSaveProfile}>
          <CheckCircle size={16} /> Update Profile
        </button>
      </div>

      {/* API Config */}
      <div className="config-panel" style={{ marginTop: '1.5rem' }}>
        <h3 className="section-title"><Server /> API Configuration</h3>
        <div className="form-group">
          <label className="form-label">API Gateway Endpoint</label>
          <input
            type="text"
            className="form-input mono"
            value={apiUrl}
            onChange={(e) => onApiUrlChange(e.target.value)}
            placeholder="https://abc123.execute-api.us-east-1.amazonaws.com/prod"
            id="settings-api-url-input"
          />
          <div className="form-hint">
            After running <code>npx cdk deploy</code>, paste the output URL here.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-primary" onClick={handleSaveApi}>
            <CheckCircle size={16} /> Save Endpoint
          </button>
          <button className="btn btn-secondary" onClick={() => {
            onClearHistory();
            addToast('info', 'History cleared', 'Your upload history has been removed');
          }}>
            <Trash2 size={16} /> Clear My History
          </button>
        </div>
      </div>

      {/* Security Overview */}
      <div className="config-panel" style={{ marginTop: '1.5rem' }}>
        <h3 className="section-title"><Shield /> Security Overview</h3>
        <div className="config-row">
          <span className="config-label">Encryption</span>
          <span className="config-value">AES-256 (S3 Managed) + KMS CMK (DynamoDB)</span>
        </div>
        <div className="config-row">
          <span className="config-label">Transport</span>
          <span className="config-value">SSL/TLS Enforced (aws:SecureTransport)</span>
        </div>
        <div className="config-row">
          <span className="config-label">Access</span>
          <span className="config-value">BlockPublicAccess.BLOCK_ALL</span>
        </div>
        <div className="config-row">
          <span className="config-label">Presigned TTL</span>
          <span className="config-value">900 seconds (15 minutes)</span>
        </div>
        <div className="config-row">
          <span className="config-label">Runtime</span>
          <span className="config-value">Rust on provided.al2023 (~30ms cold start)</span>
        </div>
        <div className="config-row">
          <span className="config-label">User Isolation</span>
          <span className="config-value">DynamoDB PK: USER#{'{owner_id}'} per-user partitioning</span>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="config-panel danger-zone" style={{ marginTop: '1.5rem' }}>
        <h3 className="section-title" style={{ color: 'var(--color-accent-danger)' }}>
          <AlertCircle /> Danger Zone
        </h3>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Permanently delete your account and all associated upload history. This cannot be undone.
        </p>
        {showDeleteConfirm ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-accent-danger)' }}>Are you sure?</span>
            <button className="btn btn-danger" onClick={handleDeleteAccount}>
              Yes, Delete Account
            </button>
            <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 size={16} /> Delete Account
          </button>
        )}
      </div>
    </>
  );
}

// =====================================================
// Dashboard Page
// =====================================================
function DashboardPage({ uploadHistory, onCopyId }) {
  const { user } = useAuth();
  const stats = getUserStats(user.id);

  return (
    <>
      <div className="page-header">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="dashboard-greeting"
        >
          <h1>Welcome back, {user.displayName.split(' ')[0]}</h1>
          <p>Your encrypted file vault. Owner ID: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent-secondary)' }}>{user.id}</code></p>
        </motion.div>
      </div>

      <div className="stats-grid">
        <StatCard icon={FolderLock} value={stats.totalUploads} label="Your Uploads" badge="All Time" colorClass="indigo" />
        <StatCard icon={HardDrive} value={formatFileSize(stats.totalSize)} label="Data Stored" colorClass="cyan" />
        <StatCard icon={ShieldCheck} value={stats.successCount} label="Encrypted Files" colorClass="green" />
        <StatCard icon={Zap} value="~30ms" label="Avg Cold Start" badge="Rust" colorClass="purple" />
      </div>

      <h2 className="section-title"><Clock /> Your Recent Uploads</h2>
      {uploadHistory.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><CloudUpload /></div>
          <h3>No uploads yet</h3>
          <p>Upload files to see them here. Each is encrypted and scoped to your account.</p>
        </div>
      ) : (
        <div className="file-list">
          {uploadHistory.map((file, index) => (
            <FileCard key={file.fileId || index} file={file} onCopyId={onCopyId} />
          ))}
        </div>
      )}
    </>
  );
}

// =====================================================
// Upload Page
// =====================================================
function UploadPage({ apiUrl, onApiUrlChange, onUploadComplete, addToast }) {
  const { user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFilesSelected = async (files) => {
    if (isUploading) return;

    for (const file of files) {
      setIsUploading(true);
      setUploadProgress(0);

      try {
        addToast('info', 'Requesting presigned URL...', `File: ${file.name}`);

        // Step 1: Get presigned URL from the Rust Lambda using user's owner_id
        const response = await requestUploadUrl(file.name, user.id);

        addToast('info', 'Presigned URL received', `Uploading to S3 key: ${response.s3_key}`);

        // Step 2: Upload file directly to S3 using presigned URL
        await uploadFileToS3(response.upload_url, file, (progress) => {
          setUploadProgress(progress);
        });

        // Step 3: Record success
        onUploadComplete({
          fileId: response.file_id,
          fileName: file.name,
          fileSize: file.size,
          s3Key: response.s3_key,
          status: 'success',
        });

        addToast('success', 'Upload complete!', `${file.name} encrypted and stored in S3`);
      } catch (error) {
        console.error('Upload error:', error);

        onUploadComplete({
          fileId: 'error-' + Date.now(),
          fileName: file.name,
          fileSize: file.size,
          s3Key: '',
          status: 'error',
        });

        addToast('error', 'Upload failed', error.message);
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>Secure File Upload</h1>
        <p>
          Uploading as <strong>{user.displayName}</strong> (<code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--color-accent-secondary)' }}>{user.id}</code>)
        </p>
      </div>

      <div className="upload-section">
        <UploadZone
          onFilesSelected={handleFilesSelected}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
        />
        <UploadConfigPanel
          apiUrl={apiUrl}
          onApiUrlChange={onApiUrlChange}
        />
      </div>

      {/* Upload Flow Visual */}
      <div className="config-panel">
        <h3 className="section-title"><Zap /> How It Works</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
          {[
            { step: '01', title: 'Authenticate', desc: `Logs in as ${user.id}`, icon: Shield },
            { step: '02', title: 'API Request', desc: 'POST /uploads with file_name + owner_id', icon: Server },
            { step: '03', title: 'Presigned URL', desc: 'Rust Lambda generates 15-min S3 PUT URL', icon: Key },
            { step: '04', title: 'Direct Upload', desc: 'Browser PUTs file directly to encrypted S3', icon: CloudUpload },
          ].map((item) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: parseInt(item.step) * 0.1 }}
              style={{
                padding: '1.25rem',
                background: 'var(--color-surface-glass)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: 'var(--color-accent-primary-light)',
                  background: 'rgba(99, 102, 241, 0.1)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                }}>
                  STEP {item.step}
                </span>
                <item.icon size={16} style={{ color: 'var(--color-text-muted)' }} />
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{item.title}</div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{item.desc}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </>
  );
}

// =====================================================
// Authenticated App Shell
// =====================================================
function AppShell() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [apiUrl, setApiUrlState] = useState(getApiUrl());
  const [uploadHistory, setUploadHistory] = useState(getUploadHistory(user.id));
  const [toasts, setToasts] = useState([]);

  // Refresh history when user changes
  React.useEffect(() => {
    setUploadHistory(getUploadHistory(user.id));
  }, [user.id]);

  // Toast management
  const addToast = useCallback((type, title, message) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Handlers
  const handleApiUrlChange = (url) => {
    setApiUrlState(url);
    setApiUrl(url);
  };

  const handleUploadComplete = (entry) => {
    addToUploadHistory(user.id, entry);
    setUploadHistory(getUploadHistory(user.id));
  };

  const handleClearHistory = () => {
    clearUploadHistory(user.id);
    setUploadHistory([]);
  };

  const handleCopyId = (fileId) => {
    navigator.clipboard.writeText(fileId);
    addToast('success', 'Copied!', `File ID: ${fileId}`);
  };

  return (
    <div className="app">
      <div className="app-content">
        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="main-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab + user.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && (
                <DashboardPage uploadHistory={uploadHistory} onCopyId={handleCopyId} />
              )}
              {activeTab === 'upload' && (
                <UploadPage
                  apiUrl={apiUrl}
                  onApiUrlChange={handleApiUrlChange}
                  onUploadComplete={handleUploadComplete}
                  addToast={addToast}
                />
              )}
              {activeTab === 'architecture' && <ArchitecturePage />}
              {activeTab === 'settings' && (
                <SettingsPage
                  apiUrl={apiUrl}
                  onApiUrlChange={handleApiUrlChange}
                  onClearHistory={handleClearHistory}
                  addToast={addToast}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
        <footer className="footer">
          <div className="footer-inner">
            <span>© 2026 SecureVault — AWS CDK + Rust Lambda</span>
            <div className="footer-links">
              <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('architecture'); }}>Architecture</a>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
            </div>
          </div>
        </footer>
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

// =====================================================
// Root App — Auth Gate
// =====================================================
function AppRouter() {
  const { isAuthenticated } = useAuth();

  return (
    <AnimatePresence mode="wait">
      {isAuthenticated ? (
        <motion.div
          key="authed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <AppShell />
        </motion.div>
      ) : (
        <motion.div
          key="auth"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <AuthScreen />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
