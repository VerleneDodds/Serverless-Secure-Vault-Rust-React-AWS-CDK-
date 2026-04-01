import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const AuthContext = createContext(null);

/**
 * User data structure:
 * {
 *   id: string,          // e.g. "user-a1b2c3d4" (maps to DynamoDB PK: USER#{id})
 *   displayName: string, // e.g. "Vincent Dodds"
 *   email: string,       // e.g. "vince@example.com"
 *   avatar: string,      // initials-based or color
 *   createdAt: string,   // ISO timestamp
 *   lastLogin: string,   // ISO timestamp
 * }
 */

const STORAGE_KEY = 'secureVault_users';
const ACTIVE_USER_KEY = 'secureVault_activeUser';

function loadUsers() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

function loadActiveUserId() {
  return localStorage.getItem(ACTIVE_USER_KEY) || null;
}

function saveActiveUserId(id) {
  if (id) {
    localStorage.setItem(ACTIVE_USER_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_USER_KEY);
  }
}

// Generate a deterministic color from a string
function stringToColor(str) {
  const colors = [
    '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
    '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
    '#f97316', '#3b82f6', '#a855f7', '#84cc16',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function AuthProvider({ children }) {
  const [users, setUsers] = useState(loadUsers);
  const [activeUserId, setActiveUserId] = useState(loadActiveUserId);

  const activeUser = activeUserId ? users[activeUserId] || null : null;

  // Persist changes
  useEffect(() => {
    saveUsers(users);
  }, [users]);

  useEffect(() => {
    saveActiveUserId(activeUserId);
  }, [activeUserId]);

  const register = useCallback((displayName, email, password) => {
    // Check for duplicate email
    const existing = Object.values(users).find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
    if (existing) {
      throw new Error('An account with this email already exists');
    }

    const id = 'user-' + crypto.randomUUID().split('-')[0];
    const now = new Date().toISOString();

    const newUser = {
      id,
      displayName: displayName.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: btoa(password), // Simple encoding — not real security, just demo
      avatar: stringToColor(displayName),
      initials: getInitials(displayName.trim()),
      createdAt: now,
      lastLogin: now,
    };

    setUsers((prev) => ({ ...prev, [id]: newUser }));
    setActiveUserId(id);

    return newUser;
  }, [users]);

  const login = useCallback((email, password) => {
    const user = Object.values(users).find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
    if (!user) {
      throw new Error('No account found with this email');
    }
    if (user.passwordHash !== btoa(password)) {
      throw new Error('Incorrect password');
    }

    // Update last login
    const updatedUser = { ...user, lastLogin: new Date().toISOString() };
    setUsers((prev) => ({ ...prev, [user.id]: updatedUser }));
    setActiveUserId(user.id);

    return updatedUser;
  }, [users]);

  const logout = useCallback(() => {
    setActiveUserId(null);
  }, []);

  const switchUser = useCallback((userId) => {
    if (users[userId]) {
      const updatedUser = { ...users[userId], lastLogin: new Date().toISOString() };
      setUsers((prev) => ({ ...prev, [userId]: updatedUser }));
      setActiveUserId(userId);
    }
  }, [users]);

  const updateProfile = useCallback((updates) => {
    if (!activeUserId) return;
    setUsers((prev) => ({
      ...prev,
      [activeUserId]: {
        ...prev[activeUserId],
        ...updates,
        initials: updates.displayName
          ? getInitials(updates.displayName)
          : prev[activeUserId].initials,
        avatar: updates.displayName
          ? stringToColor(updates.displayName)
          : prev[activeUserId].avatar,
      },
    }));
  }, [activeUserId]);

  const deleteAccount = useCallback((userId) => {
    setUsers((prev) => {
      const copy = { ...prev };
      delete copy[userId];
      return copy;
    });
    if (activeUserId === userId) {
      setActiveUserId(null);
    }
    // Clean up user-scoped data
    localStorage.removeItem(`secureVault_history_${userId}`);
  }, [activeUserId]);

  const allUsers = Object.values(users);

  const value = {
    user: activeUser,
    users: allUsers,
    isAuthenticated: !!activeUser,
    register,
    login,
    logout,
    switchUser,
    updateProfile,
    deleteAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
