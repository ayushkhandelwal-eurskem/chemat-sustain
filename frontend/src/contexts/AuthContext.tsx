'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/axios';

interface User {
  id?: number;
  subject?: string;
  email: string;
  role: 'admin' | 'user';
  roles?: string[];
  scopes?: string[];
  organisation_id?: string;
  is_active: boolean;
  created_at?: string;
  last_activity?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email?: string, password?: string) => Promise<{ success: boolean; message: string }>;
  verifyOTP: (email: string, otpCode: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode; skipInitialCheck?: boolean }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/users/me');
      setUser(response.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = async (email?: string, password?: string) => {
    try {
      const response = await api.post('/users/login', { email, password });
      return { success: true, message: response.data.msg };
    } catch (error: any) {
      return { success: false, message: error.response?.data?.detail || 'Login failed' };
    }
  };

  const verifyOTP = async (email: string, otpCode: string) => {
    try {
      const response = await api.post('/users/verify-otp', { email, otp_code: otpCode });
      await checkAuth();
      return { success: true, message: response.data.msg };
    } catch (error: any) {
      return { success: false, message: error.response?.data?.detail || 'Verification failed' };
    }
  };

  const logout = async () => {
    setUser(null);
    await api.post('/users/logout').catch(() => undefined);
  };

  useEffect(() => { void checkAuth(); }, [checkAuth]);

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyOTP, logout, checkAuth, refreshAuth: checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};
