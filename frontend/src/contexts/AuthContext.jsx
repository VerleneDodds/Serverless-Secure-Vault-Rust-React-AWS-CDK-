import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { 
  signIn, 
  signUp, 
  signOut, 
  fetchAuthSession, 
  getCurrentUser, 
  fetchUserAttributes, 
  confirmSignUp,
  setUpTOTP,
  verifyTOTPSetup,
  confirmSignIn,
  updateMFAPreference,
  fetchMFAPreference
} from 'aws-amplify/auth';

const AuthContext = createContext(null);

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
  return colors[abs(hash) % colors.length];
}

function abs(n) { return n < 0 ? -n : n; }

function getInitials(name) {
  return name ? name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) : '??';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuthStatus = useCallback(async () => {
    try {
      setLoading(true);
      const { userId } = await getCurrentUser();
      const attributes = await fetchUserAttributes();
      
      let mfaEnabled = false;
      try {
        const mfaPref = await fetchMFAPreference();
        mfaEnabled = mfaPref.preferred === 'TOTP';
      } catch (err) {
        console.warn('Could not fetch MFA prefs:', err);
      }
      
      const authUser = {
        id: userId,
        displayName: attributes.name || attributes.email.split('@')[0],
        email: attributes.email,
        avatar: stringToColor(attributes.name || attributes.email),
        initials: getInitials(attributes.name || attributes.email.split('@')[0]),
        mfaEnabled
      };
      
      setUser(authUser);
      return authUser;
    } catch (err) {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const register = useCallback(async (displayName, email, password) => {
    try {
      const { userId } = await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            name: displayName,
          },
        }
      });
      return { userId };
    } catch (err) {
      console.error('Registration error:', err);
      if (err.name === 'UsernameExistsException') {
        throw new Error('An account with this email already exists');
      }
      throw new Error(err.message || 'Failed to register');
    }
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const { isSignedIn, nextStep } = await signIn({ username: email, password });
      if (isSignedIn) {
        await checkAuthStatus();
      }
      return { isSignedIn, nextStep };
    } catch (err) {
      console.error('Login error:', err);
      if (err.name === 'UserNotFoundException' || err.name === 'NotAuthorizedException') {
        throw new Error('Invalid email or password');
      }
      if (err.name === 'UserNotConfirmedException') {
        throw new Error('Please verify your email before logging in');
      }
      throw err; // Re-throw to allow component-level special handling
    }
  }, [checkAuthStatus]);

  const confirmMFA = useCallback(async (challengeResponse) => {
    try {
      const { isSignedIn, nextStep } = await confirmSignIn({
        challengeResponse
      });
      if (isSignedIn) {
        await checkAuthStatus();
      }
      return { isSignedIn, nextStep };
    } catch (err) {
      console.error('MFA Confirmation error:', err);
      throw new Error(err.message || 'Verification failed');
    }
  }, [checkAuthStatus]);

  const setupTOTPDevice = useCallback(async () => {
    try {
      const details = await setUpTOTP();
      const { userId } = await getCurrentUser();
      const appName = "SecureCloudStorage";
      const uri = details.getSetupUri(appName, userId).toString();
      return { secret: details.sharedSecret, uri };
    } catch (err) {
      console.error('TOTP Setup error:', err);
      throw err;
    }
  }, []);

  const verifyTOTP = useCallback(async (code) => {
    try {
      await verifyTOTPSetup({ code });
      await updateMFAPreference({ totp: 'PREFERRED' });
      await checkAuthStatus(); // Refresh user state
    } catch (err) {
      console.error('TOTP Verification error:', err);
      throw err;
    }
  }, [checkAuthStatus]);

  const disableMFA = useCallback(async () => {
    try {
      await updateMFAPreference({ totp: 'DISABLED' });
      await checkAuthStatus(); // Refresh user state
    } catch (err) {
      console.error('Disable MFA error:', err);
      throw err;
    }
  }, [checkAuthStatus]);

  const logout = useCallback(async () => {
    try {
      await signOut();
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  }, []);

  const confirmRegistration = useCallback(async (email, code) => {
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
    } catch (err) {
      console.error('Confirmation error:', err);
      throw new Error(err.message || 'Failed to verify code');
    }
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    register,
    login,
    logout,
    confirmRegistration,
    confirmMFA,
    setupTOTPDevice,
    verifyTOTP,
    disableMFA,
    checkAuthStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
