'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { isKeycloakMode } from '@/lib/oidc';
import { api } from '@/lib/axios';

const LoginPage: React.FC = () => {
  const [step, setStep] = useState<'login' | 'otp' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const { login, verifyOTP, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.push('/');
  }, [user, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    const result = await login(email, password);
    if (result.success) {
      setMessage(result.message);
      setStep('otp');
    } else {
      setError(result.message);
    }
    setLoading(false);
  };

  const handleOTPVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await verifyOTP(email, otpCode);
    if (result.success) {
      router.push('/');
    } else {
      setError(result.message);
    }
    setLoading(false);
  };

  const handleBackToLogin = () => {
    setStep('login');
    setOtpCode('');
    setError('');
    setMessage('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await api.post('/users/forgot-password', { email });
      setMessage(response.data.msg);
      setStep('reset');
    } catch (requestError: any) {
      setError(requestError.response?.data?.detail || 'Password reset could not be started.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 12) {
      setError('Password must be at least 12 characters long.');
      return;
    }
    setLoading(true);
    try {
      const response = await api.post('/users/reset-password', {
        email,
        otp_code: otpCode,
        new_password: newPassword,
      });
      handleBackToLogin();
      setMessage(response.data.msg);
    } catch (requestError: any) {
      setError(requestError.response?.data?.detail || 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  const heading = {
    login: 'Sign in',
    otp: 'Verify it’s you',
    forgot: 'Forgot password',
    reset: 'Set a new password',
  }[step];

  const description = {
    login: 'Sign in to access the CheMatSustain database.',
    otp: `We sent a 6-digit code to ${email}.`,
    forgot: 'Enter your account email to receive a five-minute reset code.',
    reset: `Enter the code sent to ${email} and choose a new password.`,
  }[step];

  if (isKeycloakMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sky-100 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-md">
          <Image src="https://chematsustain.eu/wp-content/uploads/2024/03/CMS-Logo-horizontal-color-transp.png" alt="CheMatSustain" width={240} height={72} className="mx-auto h-auto w-56" priority />
          <h1 className="mt-8 text-2xl font-bold text-blue-900">Secure consortium sign-in</h1>
          <p className="mt-2 text-sm text-slate-600">Continue to Keycloak. Multi-factor authentication is required by your organisation.</p>
          <button onClick={() => void login()} className="mt-6 w-full rounded-md bg-blue-900 px-4 py-3 font-semibold text-white hover:bg-blue-800">Continue to sign in</button>
          <Link href="/api-explorer" className="mt-3 block w-full rounded-md border border-blue-900/30 px-4 py-3 font-semibold text-blue-900 hover:bg-blue-50">Open API Explorer</Link>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute requireAuth={false}>
      <div className="min-h-screen flex items-center justify-center bg-sky-100 px-4 py-12">
        <div className="w-full max-w-md">
          {/* CheMatSustain logo (same asset as the site header) */}
          <div className="flex justify-center mb-8">
            <Image
              src="https://chematsustain.eu/wp-content/uploads/2024/03/CMS-Logo-horizontal-color-transp.png"
              alt="CheMatSustain"
              width={240}
              height={72}
              className="h-auto w-56"
              priority
            />
          </div>

          {/* Card */}
          <div className="bg-white rounded-lg shadow-md p-8">
            <h1 className="text-2xl font-bold text-blue-900 mb-1 text-center">
              {heading}
            </h1>
            <p className="text-sm text-blue-900/60 mb-8 text-center">
              {description}
            </p>

            {step === 'login' ? (
              <form className="space-y-5" onSubmit={handleLogin}>
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-blue-900 mb-1.5"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="w-full px-3 py-2.5 border border-blue-900/30 rounded-md text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="you@institution.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-blue-900 mb-1.5"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="w-full px-3 py-2.5 border border-blue-900/30 rounded-md text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <div className="mt-2 text-right">
                    <button
                      type="button"
                      onClick={() => { setStep('forgot'); setError(''); setMessage(''); }}
                      className="text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}
                {message && (
                  <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                    {message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {loading && (
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/40 border-t-white" />
                  )}
                  {loading ? 'Signing in\u2026' : 'Sign in'}
                </button>
              </form>
            ) : step === 'otp' ? (
              <form className="space-y-5" onSubmit={handleOTPVerification}>
                <div>
                  <label
                    htmlFor="otp"
                    className="block text-sm font-medium text-blue-900 mb-1.5"
                  >
                    Verification code
                  </label>
                  <input
                    id="otp"
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={6}
                    className="w-full px-3 py-3 border border-blue-900/30 rounded-md text-center text-2xl tracking-[0.5em] font-semibold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="000000"
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                  />
                </div>

                {error && (
                  <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="flex-1 py-2.5 px-4 rounded-md text-sm font-medium text-blue-900 bg-white border border-blue-900/30 hover:bg-blue-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading || otpCode.length !== 6}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading && (
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/40 border-t-white" />
                    )}
                    {loading ? 'Verifying\u2026' : 'Verify'}
                  </button>
                </div>
              </form>
            ) : step === 'forgot' ? (
              <form className="space-y-5" onSubmit={handleForgotPassword}>
                <div>
                  <label htmlFor="reset-email" className="block text-sm font-medium text-blue-900 mb-1.5">Email address</label>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@institution.org"
                    className="w-full px-3 py-2.5 border border-blue-900/30 rounded-md text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
                <div className="flex gap-3">
                  <button type="button" onClick={handleBackToLogin} className="flex-1 py-2.5 px-4 rounded-md text-sm font-medium text-blue-900 bg-white border border-blue-900/30 hover:bg-blue-50">Back</button>
                  <button type="submit" disabled={loading} className="flex-1 py-2.5 px-4 rounded-md text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60">{loading ? 'Sending…' : 'Send reset code'}</button>
                </div>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={handleResetPassword}>
                <div>
                  <label htmlFor="reset-otp" className="block text-sm font-medium text-blue-900 mb-1.5">Reset code</label>
                  <input id="reset-otp" type="text" inputMode="numeric" required maxLength={6} value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="w-full px-3 py-3 border border-blue-900/30 rounded-md text-center text-2xl tracking-[0.5em] font-semibold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label htmlFor="reset-password" className="block text-sm font-medium text-blue-900 mb-1.5">New password</label>
                  <input id="reset-password" type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 12 characters" className="w-full px-3 py-2.5 border border-blue-900/30 rounded-md text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label htmlFor="confirm-reset-password" className="block text-sm font-medium text-blue-900 mb-1.5">Confirm new password</label>
                  <input id="confirm-reset-password" type="password" autoComplete="new-password" required minLength={12} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-3 py-2.5 border border-blue-900/30 rounded-md text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                {message && <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">{message}</div>}
                {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
                <div className="flex gap-3">
                  <button type="button" onClick={handleBackToLogin} className="flex-1 py-2.5 px-4 rounded-md text-sm font-medium text-blue-900 bg-white border border-blue-900/30 hover:bg-blue-50">Cancel</button>
                  <button type="submit" disabled={loading || otpCode.length !== 6} className="flex-1 py-2.5 px-4 rounded-md text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60">{loading ? 'Resetting…' : 'Reset password'}</button>
                </div>
              </form>
            )}
          </div>

          <Link
            href="/api-explorer"
            className="mt-5 flex items-center justify-center rounded-lg border border-blue-900/20 bg-white px-4 py-3 text-sm font-semibold text-blue-900 shadow-sm transition-colors hover:bg-blue-50"
          >
            Open API Explorer
          </Link>

          {/* EU funding note - mirrors the site footer green accent */}
          <p className="text-center text-xs text-green-600 mt-6 px-4">
            CheMatSustain has received funding from the European Union under the
            Horizon Europe Programme (No. 101137990).
          </p>
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default LoginPage;
