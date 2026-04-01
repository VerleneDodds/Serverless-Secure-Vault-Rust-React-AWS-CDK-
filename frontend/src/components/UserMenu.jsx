import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, LogOut, ChevronDown, Users, Settings, Shield, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function UserMenu({ onNavigate }) {
  const { user, users, logout, switchUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const otherUsers = users.filter((u) => u.id !== user.id);

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        id="user-menu-button"
      >
        <div className="user-avatar" style={{ background: user.avatar }}>
          {user.initials}
        </div>
        <div className="user-menu-info">
          <span className="user-menu-name">{user.displayName}</span>
          <span className="user-menu-id">{user.id}</span>
        </div>
        <ChevronDown
          size={14}
          className={`user-menu-chevron ${isOpen ? 'open' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="user-menu-dropdown"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          >
            {/* Current user header */}
            <div className="user-menu-current">
              <div className="user-avatar user-avatar-lg" style={{ background: user.avatar }}>
                {user.initials}
              </div>
              <div>
                <div className="user-menu-current-name">{user.displayName}</div>
                <div className="user-menu-current-email">{user.email}</div>
                <div className="user-menu-current-since">
                  Member since {new Date(user.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            <div className="user-menu-divider" />

            {/* Switch user section */}
            {otherUsers.length > 0 && (
              <>
                <div className="user-menu-section-label">
                  <Users size={12} /> Switch Account
                </div>
                {otherUsers.map((u) => (
                  <button
                    key={u.id}
                    className="user-menu-item"
                    onClick={() => {
                      switchUser(u.id);
                      setIsOpen(false);
                    }}
                  >
                    <div className="user-avatar user-avatar-sm" style={{ background: u.avatar }}>
                      {u.initials}
                    </div>
                    <div className="user-menu-item-info">
                      <span>{u.displayName}</span>
                      <span className="user-menu-item-email">{u.email}</span>
                    </div>
                  </button>
                ))}
                <div className="user-menu-divider" />
              </>
            )}

            {/* Actions */}
            <button
              className="user-menu-item"
              onClick={() => {
                onNavigate('settings');
                setIsOpen(false);
              }}
            >
              <Settings size={16} />
              <span>Settings</span>
            </button>

            <button
              className="user-menu-item user-menu-item-danger"
              onClick={() => {
                logout();
                setIsOpen(false);
              }}
              id="logout-button"
            >
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
