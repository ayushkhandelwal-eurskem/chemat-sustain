'use client';

import {
  CheckCircle2,
  Clipboard,
  Code2,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Play,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';

type TestIndexItem = {
  test_id: number;
  test_name: string | null;
  work_package: string | null;
  identifier: string | null;
};

type ApiResult = {
  status: number;
  requestId: string | null;
  duration: number;
  data: unknown;
};

const apiBase = '/api/v1';

function messageFor(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'The request could not be completed.';
}

function pythonScript(testName: string, testId: string): string {
  const params = testName
    ? `params={"test_name": ${JSON.stringify(testName)}}`
    : 'params={}'
  const chosenId = testId.trim() || '3';
  return `import os
import requests

BASE_URL = "https://database.eurskem.com/api/v1"
CLIENT_ID = os.environ["CHEMAT_CLIENT_ID"]
CLIENT_SECRET = os.environ["CHEMAT_CLIENT_SECRET"]

index_response = requests.get(
    f"{BASE_URL}/test-index",
    ${params},
    auth=(CLIENT_ID, CLIENT_SECRET),
    timeout=30,
)
index_response.raise_for_status()
tests = index_response.json()
print(f"Found {len(tests)} tests")

test_id = ${chosenId}
detail_response = requests.get(
    f"{BASE_URL}/tests/{test_id}",
    auth=(CLIENT_ID, CLIENT_SECRET),
    timeout=30,
)
detail_response.raise_for_status()
print(detail_response.json())
`;
}

export default function ApiExplorerPage() {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [verified, setVerified] = useState(false);
  const [testName, setTestName] = useState('');
  const [testId, setTestId] = useState('');
  const [items, setItems] = useState<TestIndexItem[]>([]);
  const [knownTestNames, setKnownTestNames] = useState<string[]>([]);
  const [detail, setDetail] = useState<ApiResult | null>(null);
  const [lastResult, setLastResult] = useState<ApiResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const credentialsReady = clientId.trim() !== '' && clientSecret !== '';

  const authHeader = () => {
    if (!credentialsReady) throw new Error('Enter your client ID and client secret first.');
    return `Basic ${btoa(`${clientId.trim()}:${clientSecret}`)}`;
  };

  const request = async (path: string): Promise<ApiResult> => {
    const started = performance.now();
    const response = await fetch(`${apiBase}${path}`, {
      method: 'GET',
      headers: {
        Authorization: authHeader(),
        'X-Request-ID': crypto.randomUUID(),
      },
      cache: 'no-store',
    });
    const text = await response.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Preserve non-JSON server text for troubleshooting.
    }
    const result = {
      status: response.status,
      requestId: response.headers.get('X-Request-ID'),
      duration: Math.round(performance.now() - started),
      data,
    };
    if (!response.ok) {
      const detail = typeof data === 'object' && data && 'detail' in data
        ? String((data as { detail: unknown }).detail)
        : `HTTP ${response.status}`;
      throw new Error(detail);
    }
    return result;
  };

  const testCredentials = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await request('/portal/me');
      setLastResult(result);
      setVerified(true);
    } catch (requestError) {
      setVerified(false);
      setError(messageFor(requestError));
    } finally {
      setBusy(false);
    }
  };

  const runIndex = async (overrides?: { testName?: string; testId?: string }) => {
    setBusy(true);
    setError('');
    const selectedTestName = overrides?.testName ?? testName;
    const selectedTestId = overrides?.testId ?? testId;
    const params = new URLSearchParams();
    if (selectedTestName) params.set('test_name', selectedTestName);
    if (selectedTestId.trim()) params.set('test_id', selectedTestId.trim());
    try {
      const result = await request(`/test-index${params.size ? `?${params}` : ''}`);
      const records = Array.isArray(result.data) ? result.data as TestIndexItem[] : [];
      setItems(records);
      setLastResult(result);
      setVerified(true);
      if (!selectedTestName && !selectedTestId.trim()) {
        setKnownTestNames(
          Array.from(new Set(records.map((item) => item.test_name).filter(Boolean) as string[])).sort(),
        );
      }
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setBusy(false);
    }
  };

  const openTest = async (id?: number) => {
    const selected = id ? String(id) : testId.trim();
    if (!selected) {
      setError('Enter or select a test ID first.');
      return;
    }
    setBusy(true);
    setError('');
    setTestId(selected);
    try {
      const result = await request(`/tests/${selected}`);
      setDetail(result);
      setLastResult(result);
      setVerified(true);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setBusy(false);
    }
  };

  const clearCredentials = () => {
    setClientId('');
    setClientSecret('');
    setVerified(false);
    setItems([]);
    setDetail(null);
    setLastResult(null);
    setError('');
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(''), 1500);
  };

  const download = (value: unknown, filename: string) => {
    const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    const blob = new Blob([content], { type: filename.endsWith('.py') ? 'text/x-python' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const script = useMemo(() => pythonScript(testName, testId), [testName, testId]);
  const indexUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (testName) params.set('test_name', testName);
    if (testId.trim()) params.set('test_id', testId.trim());
    return `/api/v1/test-index${params.size ? `?${params}` : ''}`;
  }, [testName, testId]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="border-b border-slate-800 bg-[radial-gradient(circle_at_top_left,_#164e63,_#020617_55%)]">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">CheMatSustain Developer API</p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Explore test data without a website login</h1>
            <p className="mt-5 text-lg leading-8 text-slate-300">
              Filter the live test index by test name or test ID, open one complete test,
              and generate a ready-to-run Python example using your issued API credential.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:px-8 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-cyan-400/10 p-2 text-cyan-300"><KeyRound size={22} /></span>
              <div><h2 className="font-semibold">API credential</h2><p className="text-xs text-slate-400">Required to read protected research data</p></div>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-300">Client ID
                <input value={clientId} onChange={(event) => { setClientId(event.target.value); setVerified(false); }} autoComplete="off" spellCheck={false}
                  placeholder="cms_..." className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm outline-none focus:border-cyan-400" />
              </label>
              <label className="block text-sm font-medium text-slate-300">Client secret
                <span className="relative mt-1.5 block">
                  <input type={showSecret ? 'text' : 'password'} value={clientSecret} onChange={(event) => { setClientSecret(event.target.value); setVerified(false); }} autoComplete="new-password" spellCheck={false}
                    placeholder="Enter the one-time secret" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 pr-11 font-mono text-sm outline-none focus:border-cyan-400" />
                  <button type="button" onClick={() => setShowSecret((value) => !value)} aria-label={showSecret ? 'Hide secret' : 'Show secret'} className="absolute right-3 top-2.5 text-slate-400 hover:text-white">
                    {showSecret ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </span>
              </label>
              <div className="flex gap-2">
                <button type="button" disabled={busy || !credentialsReady} onClick={testCredentials} className="flex-1 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-40">Test credentials</button>
                <button type="button" onClick={clearCredentials} aria-label="Clear credentials" className="rounded-xl border border-slate-700 p-2.5 text-slate-300 hover:bg-slate-800"><Trash2 size={19} /></button>
              </div>
              {verified && <p className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 size={17} /> Credential accepted</p>}
            </div>
            <div className="mt-5 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-3 text-xs leading-5 text-emerald-200">
              <ShieldCheck className="mb-2" size={18} /> Credentials stay only in this page&apos;s memory. They are not saved in cookies, browser storage, URLs, examples, or downloaded files, and disappear when the page refreshes.
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="flex items-center gap-2 font-semibold"><Search size={19} className="text-cyan-300" /> Filter test index</h2>
            <div className="mt-4 space-y-4">
              <label className="block text-sm text-slate-300">Test name
                <select value={testName} onChange={(event) => setTestName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-cyan-400">
                  <option value="">All test names</option>
                  {knownTestNames.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="block text-sm text-slate-300">Test ID
                <input value={testId} onChange={(event) => setTestId(event.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="For example: 3"
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-cyan-400" />
              </label>
              <code className="block break-all rounded-lg bg-slate-950 p-3 text-xs text-cyan-200">GET {indexUrl}</code>
              <button type="button" disabled={busy || !credentialsReady} onClick={() => runIndex()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-100 disabled:opacity-40"><Play size={17} /> Run index API</button>
              <button type="button" disabled={busy || !credentialsReady || !testId} onClick={() => openTest()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500 px-4 py-2.5 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-40">Open test ID</button>
            </div>
          </section>
        </aside>

        <div className="space-y-6 min-w-0">
          {error && <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-4 text-rose-200">{error}</div>}
          {lastResult && (
            <div className="flex flex-wrap gap-3 text-xs text-slate-400">
              <span className="rounded-full border border-slate-700 px-3 py-1">HTTP {lastResult.status}</span>
              <span className="rounded-full border border-slate-700 px-3 py-1">{lastResult.duration} ms</span>
              {lastResult.requestId && <span className="rounded-full border border-slate-700 px-3 py-1 font-mono">Request {lastResult.requestId}</span>}
            </div>
          )}

          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-5">
              <div><h2 className="text-xl font-semibold">Test index</h2><p className="mt-1 text-sm text-slate-400">Unlimited lightweight results · {items.length} tests returned</p></div>
              <button type="button" disabled={!items.length} onClick={() => download(items, 'chematsustain_test_index.json')} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"><Download size={16} /> JSON</button>
            </div>
            <div className="max-h-[620px] overflow-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="sticky top-0 bg-slate-800 text-xs uppercase tracking-wide text-slate-300"><tr><th className="px-4 py-3">Test ID</th><th className="px-4 py-3">Test name</th><th className="px-4 py-3">Work Package</th><th className="px-4 py-3">Identifier</th><th className="px-4 py-3">Action</th></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {items.map((item) => <tr key={item.test_id} className="hover:bg-slate-800/50"><td className="px-4 py-3 font-mono text-cyan-300">{item.test_id}</td><td className="px-4 py-3 font-medium">{item.test_name || 'Unnamed test'}</td><td className="px-4 py-3">{item.work_package}</td><td className="px-4 py-3 font-mono text-xs text-slate-300">{item.identifier}</td><td className="px-4 py-3"><button type="button" onClick={() => openTest(item.test_id)} className="rounded-lg bg-cyan-500/10 px-3 py-1.5 font-medium text-cyan-300 hover:bg-cyan-500/20">Open</button></td></tr>)}
                  {!items.length && <tr><td colSpan={5} className="px-5 py-16 text-center text-slate-500">Enter your API credential and run the index to see live tests.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {detail && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Single-test detail</p><h2 className="mt-1 text-xl font-semibold">Test ID {testId}</h2></div><div className="flex gap-2"><button type="button" onClick={() => copy(JSON.stringify(detail.data, null, 2), 'json')} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"><Clipboard size={16} /> {copied === 'json' ? 'Copied' : 'Copy'}</button><button type="button" onClick={() => download(detail.data, `chematsustain_test_${testId}.json`)} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"><Download size={16} /> JSON</button></div></div>
              <pre className="mt-4 max-h-[650px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-300">{JSON.stringify(detail.data, null, 2)}</pre>
            </section>
          )}

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-semibold"><Code2 size={20} className="text-cyan-300" /> Python test</h2><p className="mt-1 text-sm text-slate-400">Uses environment variables—your actual secret is never inserted.</p></div><div className="flex gap-2"><button type="button" onClick={() => copy(script, 'python')} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"><Clipboard size={16} /> {copied === 'python' ? 'Copied' : 'Copy'}</button><button type="button" onClick={() => download(script, 'chematsustain_api_test.py')} className="flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"><Download size={16} /> Download .py</button></div></div>
            <pre className="mt-4 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-300">{script}</pre>
          </section>
        </div>
      </div>
    </main>
  );
}