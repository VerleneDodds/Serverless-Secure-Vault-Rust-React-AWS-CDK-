import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Lock, Mail, User, ArrowRight, Eye, EyeOff, Zap, Database, Key, ShieldCheck, Smartphone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function AuthScreen() {
  const { login, register, confirmRegistration, confirmMFA, loginAsGuest } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'confirm' | 'mfa'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'register') {
        if (!displayName.trim()) throw new Error('Display name is required');
        if (!email.trim()) throw new Error('Email is required');
        if (password.length < 8) throw new Error('Password must be at least 8 characters');
        await register(displayName, email, password);
        setMode('confirm');
      } else if (mode === 'confirm') {
        if (!confirmationCode.trim()) throw new Error('Verification code is required');
        await confirmRegistration(email, confirmationCode);
        setMode('login');
        setError('Email verified! Please sign in.');
      } else if (mode === 'mfa') {
        if (!mfaCode.trim()) throw new Error('2FA code is required');
        await confirmMFA(mfaCode);
      } else {
        if (!email.trim()) throw new Error('Email is required');
        if (!password) throw new Error('Password is required');
        
        const { nextStep } = await login(email, password);
        
        if (nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') {
          setMode('mfa');
        }
      }
    } catch (err) {
      console.error('Auth Error Details:', err);
      
      // Better error names from Amplify
      const msg = err.message || 'Authentication failed';
      setError(msg);

      // Smart transitions
      if (msg.includes('verify your email') || msg.includes('NotConfirmed')) {
        setMode('confirm');
      } else if (msg.includes('already exists')) {
        setMode('confirm');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
  };

  const features = [
    { icon: ShieldCheck, label: 'AES-256 Encryption', desc: 'Every file encrypted at rest' },
    { icon: Key, label: 'KMS Managed Keys', desc: 'Auto-rotating customer keys' },
    { icon: Zap, label: 'Rust Lambda', desc: '~30ms cold starts' },
    { icon: Database, label: 'DynamoDB Metadata', desc: 'Per-user isolated storage' },
  ];

  return (
    <div className="auth-screen">
      <div className="auth-bg-effects">
        <div className="auth-bg-orb auth-bg-orb-1" />
        <div className="auth-bg-orb auth-bg-orb-2" />
        <div className="auth-bg-orb auth-bg-orb-3" />
      </div>

      <div className="auth-container">
        <motion.div
          className="auth-branding"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="auth-brand-header">
            <div className="auth-logo"><Shield /></div>
            <h1 className="auth-brand-title">Secure<span>Vault</span></h1>
            <p className="auth-brand-subtitle">
              Enterprise-grade encrypted file storage powered by AWS S3, KMS, and Rust Lambda
            </p>
          </div>

          <div className="auth-features">
            {features.map((feat, i) => (
              <motion.div
                key={feat.label}
                className="auth-feature"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
              >
                <div className="auth-feature-icon"><feat.icon size={18} /></div>
                <div>
                  <div className="auth-feature-label">{feat.label}</div>
                  <div className="auth-feature-desc">{feat.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="auth-brand-footer">
            <span className="security-badge"><Lock size={12} /> End-to-End Encrypted</span>
          </div>
        </motion.div>

        <motion.div
          className="auth-form-panel"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="auth-form-header">
            <h2>
              {mode === 'login' ? 'Welcome back' : 
               mode === 'confirm' ? 'Verify your email' : 
               mode === 'mfa' ? 'Tactical Authentication' :
               'Create your vault'}
            </h2>
            <p>
              {mode === 'login' ? 'Sign in to access your encrypted file vault' : 
               mode === 'confirm' ? `Enter the code sent to ${email}` : 
               mode === 'mfa' ? 'Enter the security code from your authenticator' :
               'Register to start uploading encrypted files'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  className="auth-error"
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {mode === 'confirm' ? (
                <motion.div key="confirm-field" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <div className="auth-field">
                    <label className="form-label" htmlFor="auth-code">Verification Code</label>
                    <div className="auth-input-wrapper">
                      <Key size={16} className="auth-input-icon" />
                      <input id="auth-code" type="text" className="form-input auth-input" value={confirmationCode} onChange={e => setConfirmationCode(e.target.value)} placeholder="000000" />
                    </div>
                  </div>
                </motion.div>
              ) : mode === 'mfa' ? (
                <motion.div key="mfa-field" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <div className="auth-field">
                    <label className="form-label" htmlFor="mfa-code">6-Digit Security Code</label>
                    <div className="auth-input-wrapper">
                      <Smartphone size={16} className="auth-input-icon" />
                      <input id="mfa-code" autoFocus type="text" className="form-input auth-input" value={mfaCode} onChange={e => setMfaCode(e.target.value)} placeholder="000 000" />
                    </div>
                  </div>
                </motion.div>
              ) : (
                <>
                  {mode === 'register' && (
                    <motion.div key="name-field" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                      <div className="auth-field">
                        <label className="form-label" htmlFor="auth-name">Display Name</label>
                        <div className="auth-input-wrapper">
                          <User size={16} className="auth-input-icon" />
                          <input id="auth-name" type="text" className="form-input auth-input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your full name" autoComplete="name" />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div className="auth-field">
                    <label className="form-label" htmlFor="auth-email">Email Address</label>
                    <div className="auth-input-wrapper">
                      <Mail size={16} className="auth-input-icon" />
                      <input id="auth-email" type="email" className="form-input auth-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" disabled={mode === 'confirm'} />
                    </div>
                  </div>

                  <div className="auth-field">
                    <label className="form-label" htmlFor="auth-password">Password</label>
                    <div className="auth-input-wrapper">
                      <Lock size={16} className="auth-input-icon" />
                      <input id="auth-password" type={showPassword ? 'text' : 'password'} className="form-input auth-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                      <button type="button" className="auth-toggle-password" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </AnimatePresence>

            <button type="submit" className="btn btn-primary btn-full btn-lg auth-submit" disabled={isLoading}>
              {isLoading ? <div className="spinner" /> : (
                <>
                  {mode === 'login' ? 'Sign In' : mode === 'confirm' ? 'Verify Code' : mode === 'mfa' ? 'Secure Login' : 'Create Account'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {mode === 'login' && (
            <div className="auth-demo-mode">
              <div className="demo-divider"><span>OR</span></div>
              <button 
                type="button" 
                className="btn btn-secondary btn-full btn-lg auth-demo-btn" 
                onClick={loginAsGuest}
                disabled={isLoading}
              >
                <Database size={16} />
                View Interactive Demo
              </button>
              <p className="demo-hint text-center">Technical Recruiter? Explore the UI with mock data instanteously.</p>
            </div>
          )}

          {mode !== 'mfa' && (
            <div className="auth-switch">
              {mode === 'login' ? (
                <span>Don't have an account? <button onClick={switchMode} className="auth-switch-btn" type="button">Create one</button></span>
              ) : (
                <span>Already have an account? <button onClick={switchMode} className="auth-switch-btn" type="button">Sign in</button></span>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
