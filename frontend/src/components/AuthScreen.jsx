import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Lock, Mail, User, ArrowRight, Eye, EyeOff, Zap, Database, Key, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
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
        if (password.length < 4) throw new Error('Password must be at least 4 characters');
        register(displayName, email, password);
      } else {
        if (!email.trim()) throw new Error('Email is required');
        if (!password) throw new Error('Password is required');
        login(email, password);
      }
    } catch (err) {
      setError(err.message);
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
        {/* Left - Branding */}
        <motion.div
          className="auth-branding"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="auth-brand-header">
            <div className="auth-logo">
              <Shield />
            </div>
            <h1 className="auth-brand-title">
              Secure<span>Vault</span>
            </h1>
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
                <div className="auth-feature-icon">
                  <feat.icon size={18} />
                </div>
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

        {/* Right - Form */}
        <motion.div
          className="auth-form-panel"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="auth-form-header">
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your vault'}</h2>
            <p>
              {mode === 'login'
                ? 'Sign in to access your encrypted file vault'
                : 'Register to start uploading encrypted files'}
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
              {mode === 'register' && (
                <motion.div
                  key="name-field"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="auth-field">
                    <label className="form-label" htmlFor="auth-name">Display Name</label>
                    <div className="auth-input-wrapper">
                      <User size={16} className="auth-input-icon" />
                      <input
                        id="auth-name"
                        type="text"
                        className="form-input auth-input"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your full name"
                        autoComplete="name"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="auth-field">
              <label className="form-label" htmlFor="auth-email">Email Address</label>
              <div className="auth-input-wrapper">
                <Mail size={16} className="auth-input-icon" />
                <input
                  id="auth-email"
                  type="email"
                  className="form-input auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="form-label" htmlFor="auth-password">Password</label>
              <div className="auth-input-wrapper">
                <Lock size={16} className="auth-input-icon" />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  className="auth-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full btn-lg auth-submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="spinner" />
              ) : (
                <>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="auth-switch">
            {mode === 'login' ? (
              <span>
                Don't have an account?{' '}
                <button onClick={switchMode} className="auth-switch-btn">Create one</button>
              </span>
            ) : (
              <span>
                Already have an account?{' '}
                <button onClick={switchMode} className="auth-switch-btn">Sign in</button>
              </span>
            )}
          </div>

          <div className="auth-demo-hint">
            <p>💡 This is a client-side demo. In production, integrate with <strong>AWS Cognito</strong> for real authentication.</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
