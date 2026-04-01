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
  ChevronDown,
  RefreshCw,
  Sun,
  Moon,
  User
} from 'lucide-react';
import {
  requestUploadUrl, uploadFileToS3, formatFileSize,
  getDownloadUrl, deleteFile, listFolderItems, createFolder,
  deleteFolder, getUserStats, getApiUrl, setApiUrl, confirmUpload,
  listVaults, createVault, deleteVault as deleteFileVault,
  performCleanup
} from './services/api';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthScreen from './components/AuthScreen';

// =====================================================
// Loading Screen
// =====================================================
function LoadingScreen() {
  return (
    <div className="auth-screen">
      <div className="auth-bg-effects">
        <div className="auth-bg-orb auth-bg-orb-1" />
      </div>
      <motion.div 
        className="loading-container"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ textAlign: 'center', zIndex: 10 }}
      >
        <div className="loading-logo-wrapper">
          <motion.div 
            className="loading-pulse"
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="auth-logo" style={{ margin: '0 auto 2rem' }}>
            <Shield size={32} />
          </div>
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>Initializing Vault</h2>
        <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Establishing secure connection...</p>
      </motion.div>
    </div>
  );
}

// =====================================================
// Components
// =====================================

// =====================================================
// Stat Card
// =====================================================
function StatCard({ icon: Icon, value, label }) {
  return (
    <motion.div className="stat-card" whileHover={{ y: -5 }}>
      <div className="stat-icon"><Icon size={24} /></div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </motion.div>
  );
}

function ItemCard({ icon: Icon, name, meta, actions, onClick }) {
  return (
    <motion.div className="item-card" whileHover={{ scale: 1.01 }} onClick={onClick}>
      <div className="item-icon"><Icon size={24} /></div>
      <div className="item-details">
        <div className="item-name">{name}</div>
        <div className="item-meta">{meta}</div>
      </div>
      <div className="item-actions" onClick={e => e.stopPropagation()}>{actions}</div>
    </motion.div>
  );
}

// =====================================================
// Pages
// =====================================================
function Breadcrumbs({ path, onNavigate }) {
  return (
    <nav className="breadcrumbs" style={{ marginTop: '1rem' }}>
      <button onClick={() => onNavigate({ id: 'ROOT', name: 'Home' })} className={`breadcrumb-item ${path.length === 0 ? 'active' : ''}`}>
        <Home size={16} /> <span>Home</span>
      </button>
      {path.map((folder, index) => (
        <React.Fragment key={folder.id}>
          <ChevronRight size={14} />
          <button onClick={() => onNavigate(folder)} className={`breadcrumb-item ${index === path.length - 1 ? 'active' : ''}`}>
            {folder.name}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}

function DashboardPage({ 
  items, stats, uploadingFiles, navigationPath, onNavigate, 
  onCreateFolder, onFilesSelected, onCopyId, onDownload, onDelete, onDeleteFolder 
}) {
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);
  
  const folders = items.filter(i => i.kind === 'FOLDER');
  const files = items.filter(i => i.kind === 'FILE');
  const activeUploads = Object.values(uploadingFiles);

  const handleCreate = () => { if (newFolderName.trim()) { onCreateFolder(newFolderName); setNewFolderName(''); setShowFolderModal(false); } };

  return (
    <div 
      className="dashboard-content"
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); if (e.dataTransfer.files?.length > 0) onFilesSelected(e.dataTransfer.files); }}
    >
      <input type="file" ref={fileInputRef} hidden multiple onChange={(e) => onFilesSelected(e.target.files)} />
      <div className="page-header">
        <div>
          <h1>Vault Storage</h1>
          <Breadcrumbs path={navigationPath} onNavigate={onNavigate} />
        </div>
        <div className="header-actions">
           <button className="btn-primary" onClick={(e) => { e.stopPropagation(); fileInputRef.current.click(); }}><CloudUpload size={18} /> Upload Files</button>
           <button className="btn-secondary" onClick={(e) => { e.stopPropagation(); setShowFolderModal(true); }}><FolderPlus size={18} /> New Folder</button>
        </div>
      </div>

      <AnimatePresence>
        {isDragOver && (
          <motion.div className="drop-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="drop-overlay-content"><Shield size={64} /><h3>Release to Secure</h3></div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="stats-grid">
        <StatCard icon={FolderLock} value={stats.total_files} label="Files Secured" />
        <StatCard icon={HardDrive} value={formatFileSize(stats.total_size)} label="Vault Capacity" />
        <StatCard icon={ShieldCheck} value={stats.total_folders} label="Folders Hierarchy" />
      </div>

      <AnimatePresence>
        {activeUploads.length > 0 && (
          <motion.div className="active-uploads-bar" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <h3 className="section-title"><Clock size={16} /> Data In-Transit ({activeUploads.length})</h3>
            <div className="upload-progress-grid">
              {activeUploads.map(up => (
                <div key={up.id} className="upload-progress-item">
                  <div className="up-info"><span>{up.name}</span><span className="dim">{up.speed} Mb/s</span><span>{up.progress}%</span></div>
                  <div className="up-track"><motion.div className="up-bar" animate={{ width: `${up.progress}%` }} /></div>
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
              initial={{ scale: 0.9, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-header">
                <div className="modal-icon"><FolderPlus size={24} /></div>
                <h3>Create Secure Folder</h3>
              </div>
              
              <input 
                autoFocus 
                className="glass-input"
                placeholder="Folder Designation..." 
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

      <div className="items-grid">
        {folders.map(folder => (
          <ItemCard 
            key={folder.id} 
            icon={Folder} 
            name={
              <div className="item-meta-group">
                {folder.name}
                {folder.isVolatile && <span className="volatile-badge"><Zap size={10} /> Demo: Volatile</span>}
              </div>
            }
            meta={`Created ${new Date(folder.upload_date).toLocaleDateString()}`}
            onClick={() => onNavigate(folder)}
            actions={<button className="action-btn danger" onClick={() => onDeleteFolder(folder)}><Trash2 size={16} /></button>}
          />
        ))}
        {files.map(file => (
          <ItemCard 
            key={file.id} 
            icon={File} 
            name={
              <div className="item-meta-group">
                {file.name}
                {file.isVolatile && <span className="volatile-badge"><Zap size={10} /> Demo: Volatile</span>}
              </div>
            }
            meta={`${new Date(file.upload_date).toLocaleDateString()} • ${formatFileSize(file.size)}`}
            actions={
              <>
                <button className="action-btn" onClick={() => onDownload(file)}><Download size={16} /></button>
                <button className="action-btn" onClick={() => onCopyId(file.id)}><Copy size={16} /></button>
                <button className="action-btn danger" onClick={() => onDelete(file)}><Trash2 size={16} /></button>
              </>
            }
          />
        ))}
        {items.length === 0 && activeUploads.length === 0 && (
          <div className="empty-state" style={{ gridColumn: '1/-1' }}>
            <Shield size={64} style={{ opacity: 0.2, marginBottom: '1.5rem' }} />
            <p>Vault is Currently Clear</p>
          </div>
        )}
      </div>
    </div>
  );
}

function UploadConfigPanel({ onFilesSelected, currentFolderName }) {
  const fileInputRef = useRef(null);
  return (
    <div className="settings-container">
      <div className="page-header"><h1>Deploy Assets</h1><p>Source destination: <b>{currentFolderName}</b></p></div>
      <motion.div 
        className="settings-section" style={{ textAlign: 'center', padding: '10rem 2rem', cursor: 'pointer' }}
        onClick={() => fileInputRef.current.click()} whileHover={{ scale: 1.01 }}
      >
        <CloudUpload size={64} style={{ color: 'var(--accent)', marginBottom: '1.5rem' }} />
        <h2>Drop Files to Initialize Protocol</h2>
        <p className="dim">Files will be encrypted and streamed directly to S3</p>
        <input type="file" ref={fileInputRef} hidden multiple onChange={e => onFilesSelected(e.target.files)} />
      </motion.div>
    </div>
  );
}

function SettingsPage({ apiUrl, onApiUrlChange, theme, onThemeChange, addToast }) {
  const { setupTOTPDevice, verifyTOTP, user, disableMFA } = useAuth();
  const [editUrl, setEditUrl] = useState(apiUrl);
  const [mfaStep, setMfaStep] = useState('idle'); // idle, qr, verify
  const [mfaData, setMfaData] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const handleSave = () => { onApiUrlChange(editUrl); addToast('success', 'Core Updated', 'Gateway endpoint configurations saved.'); };

  const startMfaSetup = async () => {
    setIsBusy(true);
    try {
      const data = await setupTOTPDevice();
      setMfaData(data);
      setMfaStep('qr');
    } catch (err) {
      console.error('MFA Setup Rejection:', err);
      addToast('error', 'MFA Setup Failed', err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const completeMfaSetup = async () => {
    setIsBusy(true);
    try {
      await verifyTOTP(mfaCode);
      addToast('success', '2FA Enabled', 'Your account is now tactically secured.');
      setMfaStep('idle');
      setMfaData(null);
      setMfaCode('');
    } catch (err) {
      addToast('error', 'Verification Failed', err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDisableMFA = async () => {
    if (!window.confirm('WARNING: Disabling 2FA will lower your vault security clearance. Proceed?')) return;
    setIsBusy(true);
    try {
      await disableMFA();
      addToast('info', '2FA Deactivated', 'Multi-factor secondary protocol has been disabled.');
    } catch (err) {
      addToast('error', 'Disable Failed', err.message);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="settings-container">
      <div className="page-header"><h1>Portal Settings</h1></div>
      
      <div className="view-header" style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        <p className="dim">Authenticated Identity: <strong style={{ color: 'var(--text-primary)' }}>{user.email}</strong></p>
      </div>

      <div className="settings-section">
        <h2><Zap /> Personalization</h2>
        <div className="setting-group">
          <label>Display Architecture</label>
          <div className="theme-toggle-group">
            <button className={`theme-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => onThemeChange('dark')}><Moon /> Dark Architecture</button>
            <button className={`theme-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => onThemeChange('light')}><Sun /> Light Architecture</button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h2><ShieldCheck /> Security Architecture</h2>
        <div className="setting-group">
          <label>Two-Factor Authentication (TOTP)</label>
          
          {user.mfaEnabled ? (
            <div className="mfa-active-panel" style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '1.5rem', borderRadius: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 10px #10b981' }} />
                <span style={{ fontWeight: 700, color: '#10b981', fontSize: '0.9rem', letterSpacing: '0.05em' }}>PROTOCOL ACTIVE</span>
              </div>
              <p className="dim" style={{ marginBottom: '1.5rem' }}>Your account is protected by hardware-based verification. Unauthorized access is tactically blocked.</p>
              <button className="btn-secondary" onClick={handleDisableMFA} disabled={isBusy} style={{ borderColor: 'rgba(244, 63, 94, 0.3)', color: 'var(--rose)' }}>
                {isBusy ? 'Wait...' : 'Deactivate 2FA'}
              </button>
            </div>
          ) : (
            <>
              {mfaStep === 'idle' ? (
                <div className="mfa-idle-panel">
                  <p className="dim">Harden your vault with authenticator-based security.</p>
                  <button className="btn-secondary" onClick={startMfaSetup} disabled={isBusy}>
                    <Lock size={16} /> {isBusy ? 'Wait...' : 'Set Up Electronic 2FA'}
                  </button>
                </div>
              ) : mfaStep === 'qr' ? (
                <div className="mfa-qr-panel">
                   <div className="qr-box" style={{ background: 'white', padding: '1rem', borderRadius: '12px', width: '232px', margin: '1rem 0' }}>
                     <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mfaData.uri)}`} alt="QR" />
                   </div>
                   <p className="dim">Scan this code in your Authenticator app (e.g. Google Auth, Authy).</p>
                   <button className="btn-primary" onClick={() => setMfaStep('verify')} style={{ marginTop: '1rem' }}>I've Scanned It</button>
                </div>
              ) : (
                <div className="mfa-verify-panel">
                   <input type="text" className="mfa-input" placeholder="000 000" value={mfaCode} onChange={e => setMfaCode(e.target.value)} style={{ marginBottom: '2rem' }} />
                   <div className="flex-actions" style={{ display: 'flex', gap: '1rem' }}>
                     <button className="btn-secondary" onClick={() => setMfaStep('qr')}>Back</button>
                     <button className="btn-primary" onClick={completeMfaSetup} disabled={isBusy}>Finalize Handshake</button>
                   </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="settings-section">
        <h2><Zap /> Infrastructure</h2>
        <div className="setting-group">
          <label>API Gateway Endpoint</label>
          <input type="text" value={editUrl} onChange={e => setEditUrl(e.target.value)} placeholder="https://api..." />
        </div>
        <button className="btn-primary" onClick={handleSave}><CheckCircle size={18} /> Update Core Settings</button>
      </div>
    </div>
  );
}

// =====================================================
// App Shell
// =====================================================

function AppShell() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showVaultMenu, setShowVaultMenu] = useState(false);
  const [isCreatingVault, setIsCreatingVault] = useState(false);
  const [newVaultName, setNewVaultName] = useState('');
  const [apiUrl, setApiUrlState] = useState(getApiUrl());
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [toasts, setToasts] = useState([]);

  const [vaults, setVaults] = useState([]);
  const [activeVault, setActiveVault] = useState(null);
  const [isVaultLoading, setIsVaultLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);

  const addToast = useCallback((type, title, message) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  const [currentFolder, setCurrentFolder] = useState({ id: 'ROOT', name: 'Home' });
  const [navigationPath, setNavigationPath] = useState([]);
  const [folderItems, setFolderItems] = useState([]);
  const [vaultStats, setVaultStats] = useState({ total_files: 0, total_folders: 0, total_size: 0 });
  const [uploadingFiles, setUploadingFiles] = useState({});

  const fetchVaults = useCallback(async () => {
    if (!user?.id) return;
    const currentUrl = getApiUrl();
    if (currentUrl.includes('your-api-id')) {
      addToast('info', 'Portal Setup Required', 'Please configure your API Gateway endpoint in the Infrastructure settings to initialize your vaults.');
      setIsVaultLoading(false);
      return;
    }
    if (isInitializing) return;
    try {
      setIsVaultLoading(true);
      let vList = await listVaults(user.id);
      if (vList.length === 0 && !isInitializing) {
        setIsInitializing(true);
        try {
          await createVault(user.id, "Primary Vault");
          vList = await listVaults(user.id);
        } finally {
          setIsInitializing(false);
        }
      }
      setVaults(vList);
      
      const savedVaultId = localStorage.getItem(`secureVault_activeVault_${user.id}`);
      const found = vList.find(v => v.id === savedVaultId);
      if (found) {
        setActiveVault(found);
      } else if (vList.length > 0) {
        setActiveVault(vList[0]);
      }
    } catch (err) {
      console.error('Vault fetch error:', err);
      // Only show error if it's not a config issue
      addToast('error', 'Vault Access Failed', 'Ensure your API endpoint is correct and the backend is deployed.');
    } finally {
      setIsVaultLoading(false);
    }
  }, [user?.id, addToast, isInitializing]);

  const handleSwitchVault = (vault) => {
    setActiveVault(vault);
    localStorage.setItem(`secureVault_activeVault_${user.id}`, vault.id);
    setCurrentFolder({ id: 'ROOT', name: 'Home' });
    setNavigationPath([]);
    setActiveTab('dashboard');
  };

  const handleDeleteVault = async (vault) => {
    if (vaults.length <= 1) {
      addToast('info', 'Operation Denied', 'You must maintain at least one secure environment.');
      return;
    }
    if (!window.confirm(`Permanently decommission vault "${vault.name}" and ALL assets within? This cannot be undone.`)) return;
    try {
      // Using api.js service for authenticated deletion
      await deleteFileVault(user.id, vault.id);
      
      if (activeVault?.id === vault.id) {
        setActiveVault(null);
        localStorage.removeItem(`secureVault_activeVault_${user.id}`);
      }
      await fetchVaults();
      addToast('success', 'Vault Decommissioned', `"${vault.name}" has been wiped.`);
    } catch (err) {
      addToast('error', 'Decommission Failed', err.message);
    }
  };

  const handleCreateVault = async (name) => {
    if (getApiUrl().includes('your-api-id')) {
      addToast('error', 'Configuration Missing', 'Please set your API endpoint in Settings first.');
      return;
    }
    try {
      await createVault(user.id, name);
      await fetchVaults();
      addToast('success', 'Vault Created', `"${name}" has been initialized.`);
    } catch (err) {
      addToast('error', 'Creation Failed', err.message);
    }
  };

  const fetchItems = useCallback(async () => {
    if (!user?.id || !activeVault?.id) return;
    try {
      const [items, stats] = await Promise.all([
        listFolderItems(activeVault.id, currentFolder.id),
        getUserStats(activeVault.id)
      ]);
      setFolderItems(items);
      setVaultStats(stats);
    } catch (err) {
      console.error(err);
      setFolderItems([]);
    }
  }, [user?.id, activeVault?.id, currentFolder.id]);

  const handleApiUrlChange = (url) => {
    setApiUrl(url);
    setApiUrlState(url);
  };

  React.useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  React.useEffect(() => { fetchVaults(); }, [fetchVaults]);
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
    if (!activeVault) return;
    setActiveTab('dashboard');
    for (const file of Array.from(files)) {
      const tempId = 'up-' + Date.now() + Math.random();
      const startTime = Date.now();
      
      setUploadingFiles(prev => ({ ...prev, [tempId]: { id: tempId, name: file.name, progress: 0, speed: '0.0' } }));

      try {
        const response = await requestUploadUrl(file.name, user.id, activeVault.id, currentFolder.id, file.size, file.type);
        const fileId = response.file_id;

        await uploadFileToS3(response.upload_url, file, (progress) => {
          const elapsedSecs = (Date.now() - startTime) / 1000;
          const bytesUploaded = (progress / 100) * file.size;
          const speedMbps = elapsedSecs > 0 ? ((bytesUploaded * 8) / (1024 * 1024 * elapsedSecs)).toFixed(1) : '0.0';
          setUploadingFiles(prev => ({ ...prev, [tempId]: { ...prev[tempId], progress, speed: speedMbps } }));
        });

        await confirmUpload(fileId, activeVault.id);
        addToast('success', 'Secured', file.name);
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
      const { download_url } = await getDownloadUrl(file.id, activeVault.id);
      window.open(download_url, '_blank');
    } catch (err) {
      addToast('error', 'Failed to dl', err.message);
    }
  };

  const handleDelete = async (file) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${file.name}"?`)) return;
    try {
      await deleteFile(file.id, activeVault.id);
      fetchItems();
      addToast('success', 'Deleted', file.name);
    } catch (err) {
      addToast('error', 'Delete failed', err.message);
    }
  };

  const handleDeleteFolder = async (folder) => {
    if (!window.confirm(`Delete folder "${folder.name}" and ALL its contents?`)) return;
    try {
      await deleteFolder(folder.id, activeVault.id);
      fetchItems();
      addToast('success', 'Folder Deleted', folder.name);
    } catch (err) {
      addToast('error', 'Failed to delete folder', err.message);
    }
  };

  const handleCleanup = async () => {
    if (!activeVault) return;
    try {
      const text = await performCleanup(activeVault.id);
      addToast('success', 'Vault Cleaned', text);
      fetchItems();
    } catch (err) {
      addToast('error', 'Cleanup failed', err.message);
    }
  };

  // ... duplicate blocks removed ...

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
          <div className="nav-brand-group">
            <div className="nav-brand">
              <Shield size={32} /> <span>Secure<span>Vault</span></span>
            </div>

            {user.isGuest && (
              <div className="demo-badge">
                <Zap size={14} fill="currentColor" />
                UI DEMO MODE
              </div>
            )}

            <div className="vault-switcher">
              <div className={`vault-pill ${showVaultMenu ? 'active' : ''}`} onClick={() => setShowVaultMenu(!showVaultMenu)}>
                <HardDrive size={16} />
                <span>{activeVault?.name || (isVaultLoading ? 'Initializing...' : 'Configure API')}</span>
                <ChevronDown size={14} style={{ opacity: 0.5, transform: showVaultMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />
              </div>

              <AnimatePresence>
                {showVaultMenu && (
                  <motion.div 
                    className="vault-menu" 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  >
                    <div className="menu-header">Available Environments</div>
                    {vaults.map(vault => (
                      <div 
                        key={vault.id} 
                        className={`menu-item ${activeVault?.id === vault.id ? 'current' : ''}`}
                        onClick={() => { handleSwitchVault(vault); setShowVaultMenu(false); }}
                      >
                        <Lock size={14} />
                        <div style={{ flex: 1 }}>
                          <div className="item-name">{vault.name}</div>
                          <div className="item-id">{vault.id}</div>
                        </div>
                        <button 
                          className="vault-delete-btn" 
                          onClick={(e) => { e.stopPropagation(); handleDeleteVault(vault); }}
                          title="Decommission Vault"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    <div className="menu-divider" />
                    {!isCreatingVault ? (
                      <div className="menu-item add" onClick={() => setIsCreatingVault(true)}>
                        <FolderPlus size={14} /> Initialize New Vault
                      </div>
                    ) : (
                      <div className="vault-input-group">
                        <input 
                          autoFocus 
                          placeholder="Vault name..." 
                          value={newVaultName} 
                          onChange={e => setNewVaultName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && (handleCreateVault(newVaultName), setIsCreatingVault(false), setNewVaultName(''))}
                        />
                        <button onClick={() => { handleCreateVault(newVaultName); setIsCreatingVault(false); setNewVaultName(''); }}>Add</button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
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
            <div className={`nav-item ${activeTab === 'cleanup' ? 'active' : ''}`} onClick={handleCleanup}>
              <RefreshCw size={18} /> Sync
            </div>
            <div 
              className="nav-item" 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              style={{ borderLeft: '1px solid var(--border)', borderRadius: 0, paddingLeft: '1.25rem', marginLeft: '0.5rem' }}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </div>
          </div>

          <div className="user-profile">
            <div className="user-pill" onClick={() => setShowUserMenu(!showUserMenu)}>
              <div className="user-avatar" style={{ background: user.avatar || 'var(--accent)' }}>
                {user.initials || <User size={14} />}
              </div>
              <div className="user-name">{user.displayName || 'Operator'}</div>
              <ChevronDown size={16} style={{ opacity: 0.5, transform: showUserMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />
            </div>

            <AnimatePresence>
              {showUserMenu && (
                <motion.div 
                  className="user-menu"
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                >
                  <button className="user-menu-item" onClick={() => { setActiveTab('settings'); setShowUserMenu(false); }}>
                    <Settings size={16} /> Portal Settings
                  </button>
                  <button className="user-menu-item" onClick={() => { handleCleanup(); setShowUserMenu(false); }}>
                    <RefreshCw size={16} /> Clean & Sync
                  </button>
                  <div style={{ height: '1px', background: 'var(--border)', margin: '0.5rem 0' }} />
                  <button className="user-menu-item danger" onClick={logout}>
                    <LogOut size={16} /> End Session
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
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
                  onCreateFolder={async (n) => { 
                    if (!activeVault) { addToast('error', 'Select Vault', 'Please select a secure vault first.'); return; }
                    try {
                      await createFolder(n, user.id, activeVault.id, currentFolder.id);
                      fetchItems();
                    } catch(err) { addToast('error', 'Creation Failed', err.message); }
                  }}
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
                  apiUrl={apiUrl} onApiUrlChange={handleApiUrlChange} 
                  theme={theme} onThemeChange={setTheme}
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
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <LoadingScreen key="loading" />;
  }

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
