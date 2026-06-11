'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

const LoginPage: React.FC = () => {
  const [step, setStep] = useState<'login' | 'otp'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
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
  };

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
              {step === 'login' ? 'Sign in' : 'Verify it\u2019s you'}
            </h1>
            <p className="text-sm text-blue-900/60 mb-8 text-center">
              {step === 'login'
                ? 'Sign in to access the CheMatSustain database.'
                : `We sent a 6-digit code to ${email}.`}
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
                    placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
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
            ) : (
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
            )}
          </div>

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