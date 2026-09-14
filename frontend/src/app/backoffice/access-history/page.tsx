'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/axios';

type AccessEvent = {
  event_id: string;
  test_id: number | null;
  test_name: string;
  work_package_name: string;
  element_cms_id: string;
  organisation_id: string | null;
  access_level: 'public' | 'private';
  released_sections: string[];
  request_id: string | null;
  source_endpoint: string;
  accessed_at: string;
};

type Result = {
  user: { id: number; name?: string; email: string; role: string; is_active: boolean; last_activity: string | null } | null;
  events: AccessEvent[];
  retention_days: number;
};

export default function AccessHistoryPage() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await api.get('/users/admin/access-history', { params: { email: email.trim() } });
      setResult(response.data);
    } catch (requestError: any) {
      setError(requestError.response?.data?.detail || 'Access history could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-gray-900">
      <div>
        <h1 className="text-3xl font-bold">Data Access History</h1>
        <p className="mt-2 text-gray-600">Search by exact email. Records and encrypted backups expire 20 days after access.</p>
      </div>

      <form onSubmit={search} className="flex max-w-2xl gap-3 rounded-lg bg-white p-5 shadow">
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.org" className="flex-1 rounded-md border border-gray-300 px-3 py-2" />
        <button disabled={loading} className="rounded-md bg-blue-600 px-5 py-2 font-medium text-white disabled:opacity-50">{loading ? 'Searching…' : 'Search'}</button>
      </form>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

      {result && (
        <>
          <section className="rounded-lg bg-white p-5 shadow">
            <h2 className="text-lg font-semibold">Account</h2>
            {result.user ? (
              <dl className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                <div><dt className="text-gray-500">Name</dt><dd className="font-medium">{result.user.name || 'Not recorded'}</dd></div>
                <div><dt className="text-gray-500">Email</dt><dd className="font-medium">{result.user.email}</dd></div>
                <div><dt className="text-gray-500">Role / status</dt><dd className="font-medium">{result.user.role} · {result.user.is_active ? 'Active' : 'Inactive'}</dd></div>
                <div><dt className="text-gray-500">User ID</dt><dd>{result.user.id}</dd></div>
                <div><dt className="text-gray-500">Last activity</dt><dd>{result.user.last_activity ? new Date(result.user.last_activity).toLocaleString() : 'Never'}</dd></div>
              </dl>
            ) : <p className="mt-2 text-gray-600">The account was removed; retained event snapshots are shown below.</p>}
          </section>

          <section className="overflow-hidden rounded-lg bg-white shadow">
            <div className="border-b p-5"><h2 className="text-lg font-semibold">Retained accesses ({result.events.length})</h2></div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50"><tr>{['Accessed', 'Test', 'Work package / element', 'Access', 'Sections returned', 'Request ID'].map((label) => <th key={label} className="px-4 py-3 text-left font-semibold text-gray-600">{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {result.events.map((item) => (
                    <tr key={item.event_id}>
                      <td className="whitespace-nowrap px-4 py-3">{new Date(item.accessed_at).toLocaleString()}</td>
                      <td className="px-4 py-3"><div className="font-medium">{item.test_name}</div><div className="text-gray-500">ID {item.test_id ?? 'deleted'}</div></td>
                      <td className="px-4 py-3">{item.work_package_name} / {item.element_cms_id}</td>
                      <td className="px-4 py-3 capitalize">{item.access_level}</td>
                      <td className="px-4 py-3">{item.released_sections.join(', ') || 'Metadata only'}</td>
                      <td className="max-w-48 truncate px-4 py-3 font-mono text-xs" title={item.request_id || ''}>{item.request_id || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.events.length === 0 && <p className="p-8 text-center text-gray-500">No retained data accesses.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}