'use client';
import React, { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = true
}) => {
  const { user, loading, checkAuth } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Only check auth if it's required and we haven't checked yet
    if (requireAuth && !user && !loading) {
      checkAuth();
    }
  }, [requireAuth, user, loading, checkAuth]);

  useEffect(() => {
    // Redirect to login if auth is required but user is not authenticated
    if (!loading && requireAuth && !user) {
      router.push('/login');
    }
  }, [loading, requireAuth, user, router]);

  // Show loading spinner while checking authentication (only if auth is required)
  if (requireAuth && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // If auth is required and user is not authenticated, show loading while redirecting
  if (requireAuth && !user && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // If auth is not required or user is authenticated, render children
  return <>{children}</>;
};

export default ProtectedRoute;