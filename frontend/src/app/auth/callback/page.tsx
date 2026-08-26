'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getOidcManager, setAccessToken } from '@/lib/oidc';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    getOidcManager().signinRedirectCallback()
      .then((user) => {
        setAccessToken(user.access_token);
        router.replace('/');
      })
      .catch(() => setError('Secure sign-in could not be completed. Please try again.'));
  }, [router]);

  return (
    <main className="min-h-screen grid place-items-center bg-sky-50">
      <div className="rounded-xl bg-white p-8 shadow-sm text-blue-950">
        {error || 'Completing secure sign-in…'}
      </div>
    </main>
  );
}
