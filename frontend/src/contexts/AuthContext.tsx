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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const    useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const response = await api.get('/users/me');
      setUser(response.data);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
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
      
      // After successful OTP verification, check auth to get user data
      await checkAuth();
      
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
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    login,
    verifyOTP,
    logout,
    checkAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
