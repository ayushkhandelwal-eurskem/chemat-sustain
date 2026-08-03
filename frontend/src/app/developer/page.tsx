'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/axios';
import { useAuth } from '@/contexts/AuthContext';

type ApiDefinition = { id: string; name: string; version: string; description: string; classification: string; scopes: string[] };
type Application = { id: string; name: string; description: string; client_id?: string; credential_version: number; is_active: boolean };
type AccessRequest = { id: string; application_id: string; requested_scopes: string[]; justification: string; status: string };

export default function DeveloperPortalPage() {
  const { user, loading } = useAuth();
  const [catalog, setCatalog] = useState<ApiDefinition[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    const [catalogResponse, appsResponse, requestsResponse] = await Promise.all([
      api.get('/api/v1/portal/catalog'),
      api.get('/api/v1/portal/applications'),
      api.get('/api/v1/portal/access-requests'),
    ]);
    setCatalog(catalogResponse.data);
    setApplications(appsResponse.data);
    setRequests(requestsResponse.data);
  };

  useEffect(() => { if (user) void load().catch(() => setMessage('Portal data could not be loaded.')); }, [user]);

  const createApplication = async (event: React.FormEvent) => {
    event.preventDefault();
    await api.post('/api/v1/portal/applications', { name, description: 'CheMatSustain consortium integration' });
    setName('');
    setMessage('Application registered. You can now request scopes.');
    await load();
  };

  if (loading) return <main className="min-h-screen grid place-items-center">Loading…</main>;
  if (!user) return <main className="min-h-screen grid place-items-center">Please sign in to open the Developer Portal.</main>;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">CheMatSustain</p>
          <h1 className="text-3xl font-bold text-blue-950">Developer Portal</h1>
          <p className="mt-2 text-slate-600">Organisation: {user.organisation_id}</p>
        </div>

        {message && <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">{message}</div>}

        <section className="grid gap-4 md:grid-cols-2">
          {catalog.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-semibold text-blue-950">{item.name}</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{item.version}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{item.description}</p>
              <p className="mt-4 text-xs font-medium text-slate-500">{item.scopes.join(' · ')}</p>
            </article>
          ))}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-blue-950">Register an application</h2>
          <form onSubmit={createApplication} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={120}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2" placeholder="Application name" />
            <button className="rounded-lg bg-blue-900 px-5 py-2 font-semibold text-white hover:bg-blue-800">Register</button>
          </form>
          <div className="mt-6 space-y-3">
            {applications.map((app) => (
              <div key={app.id} className="rounded-lg border border-slate-200 p-4">
                <p className="font-medium">{app.name}</p>
                <p className="text-xs text-slate-500">ID: {app.id} · Credential version {app.credential_version}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-blue-950">Access requests</h2>
          <div className="mt-4 space-y-3">
            {requests.length === 0 && <p className="text-sm text-slate-500">No access requests yet.</p>}
            {requests.map((request) => (
              <div key={request.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex justify-between gap-4"><span className="font-medium">{request.requested_scopes.join(', ')}</span><span>{request.status}</span></div>
                <p className="mt-1 text-sm text-slate-600">{request.justification}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
