'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '@/lib/axios';

interface User {
  id: number;
  email: string;
  role: 'admin' | 'user';
  is_active: boolean;
  created_at: string;
  last_activity: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  verifyOTP: (email: string, otpCode: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  refreshAuth: () => Promise<void>; // New method to force refresh
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
  skipInitialCheck?: boolean;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ 
  children, 
  skipInitialCheck = false 
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!skipInitialCheck);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(skipInitialCheck);

  const checkAuth = async () => {
    try {
      setLoading(true);
      const response = await api.get('/users/me');
      setUser(response.data);
      setHasCheckedAuth(true);
    } catch (error) {
      setUser(null);
      setHasCheckedAuth(true);
    } finally {
      setLoading(false);
    }
  };

  // Force refresh auth state (useful after login)
  const refreshAuth = async () => {
    setHasCheckedAuth(false);
    await checkAuth();
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await api.post('/users/login', { email, password });

      return { success: true, message: response.data.msg };
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Login failed';
      return { success: false, message };
    }
  };

  const verifyOTP = async (email: string, otpCode: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await api.post('/users/verify-otp', { 
        email, 
        otp_code: otpCode 
      });
      
      // After successful OTP verification, force refresh auth state
      await refreshAuth();
      
      return { success: true, message: response.data.msg };
    } catch (error: any) {
      const message = error.response?.data?.detail || 'OTP verification failed';
      return { success: false, message };
    }
  };

  const logout = async () => {
    try {
      await api.post('/users/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setHasCheckedAuth(true);
    }
  };

  // Auto-check auth on mount if not skipped
  useEffect(() => {
    if (!skipInitialCheck && !hasCheckedAuth) {
      checkAuth();
    }
  }, [skipInitialCheck, hasCheckedAuth]);

  // Listen for storage events (useful for multi-tab scenarios)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_changed') {
        refreshAuth();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    login,
    verifyOTP,
    logout,
    checkAuth,
    refreshAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};