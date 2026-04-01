import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Lock, 
  Upload, 
  Settings, 
  FolderLock, 
  ShieldCheck, 
  HardDrive, 
  Zap, 
  CloudUpload, 
  Download, 
  Copy, 
  Trash2, 
  FolderPlus, 
  Folder, 
  File, 
  ChevronRight, 
  Home, 
  Clock, 
  ArrowLeft,
  XCircle,
  CheckCircle,
  Info,
  LogOut,
  ChevronDown
} from 'lucide-react';
import {
  requestUploadUrl, uploadFileToS3, formatFileSize,
  getDownloadUrl, deleteFile, listFolderItems, createFolder,
  deleteFolder, getUserStats, getApiUrl, setApiUrl
} from './services/api';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthScreen from './components/AuthScreen';

// =====================================================
// Components
// =====================================================

// =====================================================
// Stat Card
// =====================================================
function StatCard({ icon: Icon, value, label, badge, colorClass }) {
  return (
    <motion.div
      className="stat-card"
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className="stat-card-header">
        <div className={`stat-icon ${colorClass}`}>
          <Icon size={24} />
        </div>
        {badge && <span className="stat-card-badge">{badge}</span>}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </motion.div>
  );
}

function Breadcrumbs({ path, onNavigate }) {
  return (
    <nav className="breadcrumbs">
      <button onClick={() => onNavigate({ id: 'ROOT', name: 'Home' })} className="breadcrumb-item">
        <Home size={16} /> <span>Home</span>
      </button>
      {path.map((folder, index) => (
        <React.Fragment key={folder.id}>
          <ChevronRight size={14} className="breadcrumb-separator" />
          <button 
            onClick={() => onNavigate(folder)} 
            className={`breadcrumb-item ${index === path.length - 1 ? 'active' : ''}`}
          >
            {folder.name}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}

function FileCard({ file, onCopyId, onDownload, onDelete }) {
  return (
    <motion.div 
      className="file-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -4 }}
    >
      <div className="item-icon">
        <File size={28} />
      </div>
      <div className="item-details">
        <div className="item-name">{file.name}</div>
        <div className="item-meta">
          <span>{new Date(file.timestamp).toLocaleDateString()}</span>
          <span>{formatFileSize(file.size)}</span>
        </div>
      </div>
      <div className="item-actions">
        <button className="icon-btn" onClick={() => onDownload(file)} title="Download"><Download size={16} /></button>
        <button className="icon-btn" onClick={() => onCopyId(file.id)} title="Copy ID"><Copy size={16} /></button>
        <button className="icon-btn danger" onClick={() => onDelete(file)} title="Delete"><Trash2 size={16} /></button>
      </div>
    </motion.div>
  );
}

function FolderCard({ folder, onClick, onDelete }) {
  return (
    <motion.div 
      className="folder-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -4 }}
      onClick={() => onClick(folder)}
    >
      <div className="item-icon">
        <Folder size={28} />
      </div>
      <div className="item-details">
        <div className="item-name">{folder.name}</div>
        <div className="item-meta">Created {new Date(folder.upload_date).toLocaleDateString()}</div>
      </div>
      <div className="item-actions" onClick={e => e.stopPropagation()}>
        <button className="icon-btn danger" onClick={() => onDelete(folder)} title="Delete"><Trash2 size={16} /></button>
      </div>
    </motion.div>
  );
}

// =====================================================
// Pages
// =====================================================

function DashboardPage({ 
  items, 
  stats,
  uploadingFiles,
  navigationPath,
  onNavigate,
  onCreateFolder,
  onFilesSelected,
  onCopyId, 
  onDownload, 
  onDelete,
  onDeleteFolder
}) {
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);
  
  const folders = items.filter(i => i.kind === 'FOLDER');
  const files = items.filter(i => i.kind === 'FILE');
  const activeUploads = Object.values(uploadingFiles);

  const handleCreate = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName);
      setNewFolderName('');
      setShowFolderModal(false);
    }
  };

  return (
    <div 
      className="dashboard-content"
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); if (e.dataTransfer.files?.length > 0) onFilesSelected(e.dataTransfer.files); }}
    >
      <div className="page-header">
        <div className="header-top">
          <div className="dashboard-greeting">
            <h1>Vault Storage</h1>
            <Breadcrumbs path={navigationPath} onNavigate={onNavigate} />
          </div>
          <div className="header-actions">
             <button className="btn-primary" onClick={() => fileInputRef.current.click()}>
               <CloudUpload size={18} /> Upload Files
             </button>
             <button className="btn-secondary" onClick={() => setShowFolderModal(true)}>
               <FolderPlus size={18} /> New Folder
             </button>
             <input type="file" ref={fileInputRef} hidden multiple onChange={(e) => onFilesSelected(e.target.files)} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isDragOver && (
          <motion.div 
            className="drop-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="drop-overlay-content">
              <Upload size={64} />
              <h3>Release to Secure</h3>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="stats-grid">
        <StatCard icon={FolderLock} value={stats.total_files} label="Files Crypted" badge="Secure" colorClass="indigo" />
        <StatCard icon={HardDrive} value={formatFileSize(stats.total_size)} label="Total Space" colorClass="cyan" />
        <StatCard icon={ShieldCheck} value={stats.total_folders} label="Folder Objects" colorClass="green" />
        <StatCard icon={Zap} value="~30ms" label="Cold Start" badge="Rust" colorClass="purple" />
      </div>

      <AnimatePresence>
        {activeUploads.length > 0 && (
          <motion.div 
            className="active-uploads-bar"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <h3 className="section-title"><Clock size={16} /> Data In-Transit ({activeUploads.length})</h3>
            <div className="upload-progress-grid">
              {activeUploads.map(up => (
                <div key={up.id} className="upload-progress-item">
                  <div className="up-info">
                    <span className="up-name">{up.name}</span>
                    <span className="up-speed dim">{up.speed} Mbps</span>
                    <span className="up-percent">{up.progress}%</span>
                  </div>
                  <div className="up-track">
                    <motion.div 
                      className="up-bar" 
                      initial={{ width: 0 }}
                      animate={{ width: `${up.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFolderModal && (
          <div className="modal-overlay" onClick={() => setShowFolderModal(false)}>
            <motion.div 
              className="modal-content"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={e => e.stopPropagation()}
            >
              <h3>Create Secure Folder</h3>
              <input 
                autoFocus
                placeholder="Folder Name"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowFolderModal(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleCreate}>Initialize</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {items.length === 0 && activeUploads.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><CloudUpload size={80} /></div>
          <h3>Vault is Clear</h3>
          <p>Drop files here to start the encryption process.</p>
        </div>
      ) : (
        <div className="items-grid">
          {folders.map(folder => (
            <FolderCard key={folder.id} folder={folder} onClick={onNavigate} onDelete={onDeleteFolder} />
          ))}
          {files.map((file, index) => (
            <FileCard 
              key={file.id || index} 
              file={{ ...file, timestamp: file.upload_date }} 
              onCopyId={onCopyId} 
              onDownload={onDownload}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UploadConfigPanel({ onFilesSelected, currentFolderName }) {
  const fileInputRef = useRef(null);

  return (
    <div className="upload-config">
      <motion.div 
        className="upload-dropzone"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.01 }}
        onClick={() => fileInputRef.current.click()}
        style={{ padding: '8rem 2rem', border: '2px dashed var(--border)', borderRadius: '2rem', textAlign: 'center', cursor: 'pointer', background: 'var(--bg-card)' }}
      >
        <div className="dropzone-icon" style={{ marginBottom: '2rem', color: 'var(--accent)' }}><CloudUpload size={80} /></div>
        <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1rem', letterSpacing: '-0.04em' }}>Ready to Secure</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Target Folder: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{currentFolderName}</span></p>
        <button className="btn-primary" style={{ margin: '0 auto' }}>Select Files</button>
        <input 
          type="file" ref={fileInputRef} hidden multiple 
          onChange={e => onFilesSelected(e.target.files)}
        />
      </motion.div>
    </div>
  );
}

function SettingsPage({ apiUrl, onApiUrlChange, addToast }) {
  const [editUrl, setEditUrl] = useState(apiUrl);

  const handleSave = () => {
    onApiUrlChange(editUrl);
    addToast('success', 'API Saved', 'Gateway endpoint updated.');
  };

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage your cloud infrastructure and profile.</p>
      </div>

      <div className="config-panel">
        <h3 className="section-title"><Settings /> API Configuration</h3>
        <div className="form-group">
          <label className="form-label">API Gateway Endpoint</label>
          <input 
            type="text" className="form-input mono" value={editUrl}
            onChange={e => setEditUrl(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn-primary" onClick={handleSave}><CheckCircle size={16} /> Save</button>
        </div>
      </div>
    </>
  );
}

// =====================================================
// App Shell
// =====================================================

function AppShell() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [apiUrl, setApiUrlState] = useState(getApiUrl());
  const [toasts, setToasts] = useState([]);
  
  const [currentFolder, setCurrentFolder] = useState({ id: 'ROOT', name: 'Home' });
  const [navigationPath, setNavigationPath] = useState([]);
  const [folderItems, setFolderItems] = useState([]);
  const [vaultStats, setVaultStats] = useState({ total_files: 0, total_folders: 0, total_size: 0 });
  const [uploadingFiles, setUploadingFiles] = useState({});

  const addToast = useCallback((type, title, message) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  const fetchItems = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [items, stats] = await Promise.all([
        listFolderItems(user.id, currentFolder.id),
        getUserStats(user.id)
      ]);
      setFolderItems(items);
      setVaultStats(stats);
    } catch (err) {
      console.error(err);
      setFolderItems([]);
    }
  }, [user?.id, currentFolder.id]);

  React.useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleNavigate = (folder) => {
    if (folder.id === 'ROOT') {
      setCurrentFolder({ id: 'ROOT', name: 'Home' });
      setNavigationPath([]);
    } else {
      const idx = navigationPath.findIndex(f => f.id === folder.id);
      if (idx === -1) setNavigationPath(p => [...p, folder]);
      else setNavigationPath(navigationPath.slice(0, idx + 1));
      setCurrentFolder(folder);
    }
    setActiveTab('dashboard');
  };

  const handleFilesSelected = async (files) => {
    setActiveTab('dashboard');
    for (const file of Array.from(files)) {
      const tempId = 'up-' + Date.now() + Math.random();
      const startTime = Date.now();
      
      setUploadingFiles(prev => ({ 
        ...prev, 
        [tempId]: { id: tempId, name: file.name, progress: 0, speed: '0.0' } 
      }));

      try {
        const response = await requestUploadUrl(file.name, user.id, currentFolder.id, file.size);
        await uploadFileToS3(response.upload_url, file, (progress) => {
          const elapsedSecs = (Date.now() - startTime) / 1000;
          const bytesUploaded = (progress / 100) * file.size;
          const speedMbps = elapsedSecs > 0 ? ((bytesUploaded * 8) / (1024 * 1024 * elapsedSecs)).toFixed(1) : '0.0';
          
          setUploadingFiles(prev => ({ 
            ...prev, 
            [tempId]: { ...prev[tempId], progress, speed: speedMbps } 
          }));
        });
        addToast('success', 'Uploaded', file.name);
        setUploadingFiles(prev => { const next = { ...prev }; delete next[tempId]; return next; });
        fetchItems();
      } catch (err) {
        addToast('error', 'Upload failed', err.message);
        setUploadingFiles(prev => { const next = { ...prev }; delete next[tempId]; return next; });
      }
    }
  };

  const handleDownload = async (file) => {
    try {
      const { download_url } = await getDownloadUrl(file.id, user.id);
      window.open(download_url, '_blank');
    } catch (err) {
      addToast('error', 'Failed to dl', err.message);
    }
  };

  const handleDelete = async (file) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${file.name}"? This action cannot be undone.`)) return;
    try {
      await deleteFile(file.id, user.id);
      fetchItems();
      addToast('success', 'Deleted', file.name);
    } catch (err) {
      addToast('error', 'Delete failed', err.message);
    }
  };

  const handleDeleteFolder = async (folder) => {
    if (!window.confirm(`Delete folder "${folder.name}" and ALL its contents? This will permanently remove all nested files.`)) return;
    try {
      await deleteFolder(folder.id, user.id);
      fetchItems();
      addToast('success', 'Folder Deleted', folder.name);
    } catch (err) {
      addToast('error', 'Failed to delete folder', err.message);
    }
  };

  return (
    <div className="app-root">
      <div className="app-bg" />
      <div className="orb-container">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <div className="app-wrapper">
        <nav className="navbar">
          <div className="nav-brand">
            <Shield size={32} /> <span>Secure<span>Vault</span></span>
          </div>

          <div className="nav-links">
            <div 
              className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <FolderLock size={18} /> Dashboard
            </div>
            <div 
              className={`nav-item ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              <CloudUpload size={18} /> Upload
            </div>
            <div 
              className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={18} /> Settings
            </div>
          </div>

          <div className="user-profile">
            <div className="user-avatar">
              <ShieldCheck size={14} />
            </div>
            <div className="user-info">
              <div className="user-name">{user.displayName || 'Security Operator'}</div>
            </div>
          </div>
        </nav>

        <main>
          <AnimatePresence mode="wait">
            <motion.div 
              key={activeTab + (currentFolder?.id || 'root')}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {activeTab === 'dashboard' && (
                <DashboardPage 
                  items={folderItems} 
                  stats={vaultStats}
                  uploadingFiles={uploadingFiles}
                  navigationPath={navigationPath} 
                  onNavigate={handleNavigate} 
                  onCreateFolder={async (n) => { await createFolder(n, user.id, currentFolder.id); fetchItems(); }}
                  onFilesSelected={handleFilesSelected}
                  onCopyId={(id) => { navigator.clipboard.writeText(id); addToast('info', 'ID Copied', 'The file identification is now on your clipboard.'); }}
                  onDownload={handleDownload} 
                  onDelete={handleDelete}
                  onDeleteFolder={handleDeleteFolder}
                />
              )}
              {activeTab === 'upload' && (
                <UploadConfigPanel 
                  onFilesSelected={handleFilesSelected} 
                  currentFolderName={currentFolder.name} 
                />
              )}
              {activeTab === 'settings' && (
                <SettingsPage 
                  apiUrl={apiUrl} onApiUrlChange={setApiUrlState} 
                  addToast={addToast}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        <div className="toast-container">
          <AnimatePresence>
            {toasts.map(toast => (
              <motion.div 
                key={toast.id}
                className={`toast ${toast.type}`}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <div className="toast-content">
                  <div className="toast-title">
                    {toast.type === 'success' && <CheckCircle size={14} className="success" />}
                    {toast.type === 'error' && <XCircle size={14} className="danger" />}
                    {toast.type === 'info' && <Info size={14} className="accent" />}
                    {toast.title}
                  </div>
                  <div className="toast-msg">{toast.message}</div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Auth Wrapper
// =====================================================
function AppRouter() {
  const { isAuthenticated } = useAuth();
  return (
    <AnimatePresence mode="wait">
      {isAuthenticated ? <AppShell key="shell" /> : <AuthScreen key="auth" />}
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
