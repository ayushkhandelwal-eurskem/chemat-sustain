'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Database,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/axios';

type Audience = 'public' | 'team';
type Step = 'signin' | 'register' | 'otp' | 'forgot' | 'reset';

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';
const primaryButtonClass =
  'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60';

export default function LoginPage() {
  const [audience, setAudience] = useState<Audience>('public');
  const [step, setStep] = useState<Step>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const { login, verifyOTP, refreshUser, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace('/');
  }, [router, user]);

  const clearStatus = () => {
    setError('');
    setMessage('');
  };

  const selectAudience = (nextAudience: Audience) => {
    setAudience(nextAudience);
    setStep('signin');
    setOtpCode('');
    clearStatus();
  };

  const goTo = (nextStep: Step) => {
    setStep(nextStep);
    setOtpCode('');
    setConfirmPassword('');
    setNewPassword('');
    clearStatus();
  };

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    clearStatus();
    const result = await login(email, password);
    setLoading(false);

    if (!result.success) {
      setError(result.message);
      return;
    }
    if (result.requiresOTP) {
      setAudience('team');
      setMessage(result.message);
      setStep('otp');
      return;
    }
    if (result.authenticated) {
      router.replace('/');
      return;
    }
    setError('The sign-in response could not be completed. Please try again.');
  };

  const handleRegistration = async (event: React.FormEvent) => {
    event.preventDefault();
    clearStatus();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 12) {
      setError('Password must be at least 12 characters long.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/users/register', { name, email, password });
      if (!response.data.authenticated) {
        throw new Error('Registration did not create a session.');
      }
      await refreshUser();
      router.replace('/');
    } catch (requestError: any) {
      setError(requestError.response?.data?.detail || requestError.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPVerification = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    const result = await verifyOTP(email, otpCode);
    setLoading(false);
    if (result.success) {
      router.replace('/');
    } else {
      setError(result.message);
    }
  };

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    clearStatus();
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

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    clearStatus();
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
      setStep('signin');
      setOtpCode('');
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage(response.data.msg);
    } catch (requestError: any) {
      setError(requestError.response?.data?.detail || 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  const title = step === 'register'
    ? 'Create public viewer account'
    : step === 'otp'
      ? 'Verify team sign-in'
      : step === 'forgot'
        ? 'Recover your account'
        : step === 'reset'
          ? 'Choose a new password'
          : audience === 'public'
            ? 'View released public data'
            : 'Team & administrator sign in';

  const description = step === 'register'
    ? 'Register with your name, email, and password. No sign-in code is required for public access.'
    : step === 'otp'
      ? `Enter the six-digit security code sent to ${email}.`
      : step === 'forgot'
        ? 'Enter your account email. If an active account exists, we will send a password-reset code.'
        : step === 'reset'
          ? `Use the reset code sent to ${email}, then create a new password.`
          : audience === 'public'
            ? 'Sign in with email and password to browse only the data sections approved for public release.'
            : 'Consortium and administrator accounts use email, password, and a second verification step.';

  return (
    <ProtectedRoute requireAuth={false}>
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dff4ff_0,_#eff8ff_32%,_#f8fafc_72%)] px-4 py-8 sm:px-6 lg:py-12">
        <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-3xl border border-white/80 bg-white shadow-2xl shadow-blue-950/10 lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="relative overflow-hidden bg-blue-950 p-7 text-white sm:p-10 lg:p-12">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-green-400/10 blur-3xl" />
            <div className="relative">
              <div className="rounded-2xl bg-white p-4 shadow-lg">
                <Image
                  src="https://chematsustain.eu/wp-content/uploads/2024/03/CMS-Logo-horizontal-color-transp.png"
                  alt="CheMatSustain"
                  width={300}
                  height={90}
                  className="h-auto w-64"
                  priority
                />
              </div>

              <p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                Research data portal
              </p>
              <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
                One secure entry point for public data and research APIs.
              </h1>
              <p className="mt-4 max-w-lg text-sm leading-6 text-blue-100">
                Browse governed CheMatSustain datasets, manage authorized research access, or test an issued API credential.
              </p>

              <div className="mt-8 space-y-3">
                <Feature icon={<Database size={19} />} title="Public data viewer" text="Registration is open. You see only explicitly released tests and sections." />
                <Feature icon={<ShieldCheck size={19} />} title="Team & administration" text="Privileged accounts retain email verification as a second factor." />
                <Feature icon={<KeyRound size={19} />} title="API Explorer" text="Use an issued client ID and secret to inspect your assigned API resources." />
              </div>

              <Link
                href="/api-explorer"
                className="mt-8 flex items-center justify-between rounded-2xl border border-cyan-300/30 bg-white/10 px-5 py-4 transition hover:bg-white/15"
              >
                <span>
                  <span className="block text-sm font-semibold">Open API Explorer</span>
                  <span className="mt-1 block text-xs text-blue-200">Website sign-in is not required</span>
                </span>
                <ArrowRight size={20} />
              </Link>
            </div>
          </aside>

          <section className="p-6 sm:p-10 lg:p-12">
            {(step === 'signin' || step === 'register') && (
              <div className="mb-8 grid grid-cols-2 rounded-2xl bg-slate-100 p-1.5" aria-label="Choose account access type">
                <AudienceButton
                  active={audience === 'public'}
                  icon={<Users size={18} />}
                  label="Public access"
                  onClick={() => selectAudience('public')}
                />
                <AudienceButton
                  active={audience === 'team'}
                  icon={<LockKeyhole size={18} />}
                  label="Team & admin"
                  onClick={() => selectAudience('team')}
                />
              </div>
            )}

            <div className="mb-7">
              {(step === 'otp' || step === 'forgot' || step === 'reset') && (
                <button
                  type="button"
                  onClick={() => goTo('signin')}
                  className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-blue-800 hover:text-blue-950"
                >
                  <ArrowLeft size={16} /> Back to sign in
                </button>
              )}
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-900">
                {step === 'register' ? <UserPlus size={22} /> : step === 'otp' ? <ShieldCheck size={22} /> : step === 'forgot' || step === 'reset' ? <KeyRound size={22} /> : audience === 'public' ? <BookOpen size={22} /> : <LockKeyhole size={22} />}
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-950 sm:text-3xl">{title}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
            </div>

            {step === 'signin' && (
              <form className="space-y-5" onSubmit={handleSignIn}>
                <EmailField value={email} onChange={setEmail} />
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-semibold text-slate-800">Password</label>
                    <button type="button" onClick={() => goTo('forgot')} className="text-xs font-semibold text-blue-700 hover:text-blue-900">
                      Forgot password?
                    </button>
                  </div>
                  <input id="password" type="password" autoComplete="current-password" required maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} placeholder="Enter your password" />
                </div>
                <Status message={message} error={error} />
                <button type="submit" disabled={loading} className={primaryButtonClass}>
                  {loading ? 'Signing in…' : audience === 'public' ? 'Sign in to public data' : 'Continue securely'}
                  {!loading && <ArrowRight size={17} />}
                </button>
                {audience === 'public' && (
                  <p className="text-center text-sm text-slate-600">
                    New public viewer?{' '}
                    <button type="button" onClick={() => goTo('register')} className="font-semibold text-blue-800 hover:text-blue-950">
                      Create an account
                    </button>
                  </p>
                )}
                {audience === 'team' && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                    Team and administrator accounts are issued internally. Contact your project administrator if you need access.
                  </p>
                )}
              </form>
            )}

            {step === 'register' && (
              <form className="space-y-5" onSubmit={handleRegistration}>
                <div>
                  <label htmlFor="name" className="mb-2 block text-sm font-semibold text-slate-800">Full name</label>
                  <input id="name" type="text" autoComplete="name" required minLength={2} maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="Your full name" />
                </div>
                <EmailField value={email} onChange={setEmail} />
                <PasswordPair password={password} confirmPassword={confirmPassword} setPassword={setPassword} setConfirmPassword={setConfirmPassword} />
                <Status message={message} error={error} />
                <button type="submit" disabled={loading} className={primaryButtonClass}>
                  {loading ? 'Creating account…' : 'Register and view public data'}
                  {!loading && <ArrowRight size={17} />}
                </button>
                <button type="button" onClick={() => goTo('signin')} className="w-full text-sm font-semibold text-blue-800 hover:text-blue-950">
                  Already registered? Sign in
                </button>
              </form>
            )}

            {step === 'otp' && (
              <form className="space-y-5" onSubmit={handleOTPVerification}>
                <CodeField id="signin-code" value={otpCode} onChange={setOtpCode} label="Security code" />
                <Status message={message} error={error} />
                <button type="submit" disabled={loading || otpCode.length !== 6} className={primaryButtonClass}>
                  {loading ? 'Verifying…' : 'Verify and sign in'}
                </button>
              </form>
            )}

            {step === 'forgot' && (
              <form className="space-y-5" onSubmit={handleForgotPassword}>
                <EmailField value={email} onChange={setEmail} />
                <Status message={message} error={error} />
                <button type="submit" disabled={loading} className={primaryButtonClass}>
                  {loading ? 'Sending…' : 'Send password-reset code'}
                </button>
              </form>
            )}

            {step === 'reset' && (
              <form className="space-y-5" onSubmit={handleResetPassword}>
                <CodeField id="reset-code" value={otpCode} onChange={setOtpCode} label="Password-reset code" />
                <PasswordPair password={newPassword} confirmPassword={confirmPassword} setPassword={setNewPassword} setConfirmPassword={setConfirmPassword} />
                <Status message={message} error={error} />
                <button type="submit" disabled={loading || otpCode.length !== 6} className={primaryButtonClass}>
                  {loading ? 'Resetting…' : 'Reset password'}
                </button>
              </form>
            )}

            <div className="mt-8 border-t border-slate-200 pt-5 text-center text-xs leading-5 text-slate-500">
              Public accounts are limited to approved public datasets. Access is logged and retained according to the data-access policy.
            </div>
          </section>
        </div>

        <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-5 text-green-700">
          CheMatSustain has received funding from the European Union under the Horizon Europe Programme (No. 101137990).
        </p>
      </main>
    </ProtectedRoute>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mt-0.5 text-cyan-300">{icon}</div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-blue-200">{text}</p>
      </div>
    </div>
  );
}

function AudienceButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition ${active ? 'bg-white text-blue-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
    >
      {icon} {label}
    </button>
  );
}

function EmailField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-800">Email address</label>
      <input id="email" type="email" autoComplete="email" required value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} placeholder="you@institution.org" />
    </div>
  );
}

function PasswordPair({ password, confirmPassword, setPassword, setConfirmPassword }: {
  password: string;
  confirmPassword: string;
  setPassword: (value: string) => void;
  setConfirmPassword: (value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="new-password" className="mb-2 block text-sm font-semibold text-slate-800">Password</label>
        <input id="new-password" type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} placeholder="At least 12 characters" />
      </div>
      <div>
        <label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold text-slate-800">Confirm password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} placeholder="Repeat password" />
      </div>
    </div>
  );
}

function CodeField({ id, value, onChange, label }: { id: string; value: string; onChange: (value: string) => void; label: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-slate-800">{label}</label>
      <input id={id} type="text" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={value} onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))} className={`${inputClass} text-center text-2xl font-bold tracking-[0.45em]`} placeholder="000000" />
    </div>
  );
}

function Status({ message, error }: { message: string; error: string }) {
  if (error) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>;
  if (message) return <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"><CheckCircle2 className="mt-0.5 shrink-0" size={16} />{message}</div>;
  return null;
}