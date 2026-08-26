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

function testNamesFrom(records: TestIndexItem[]): string[] {
  return Array.from(
    new Set(records.map((item) => item.test_name).filter(Boolean) as string[]),
  ).sort((left, right) => left.localeCompare(right));
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
      const indexResult = await request('/test-index');
      const records = Array.isArray(indexResult.data) ? indexResult.data as TestIndexItem[] : [];
      setItems(records);
      setKnownTestNames(testNamesFrom(records));
      setLastResult(indexResult);
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
        setKnownTestNames(testNamesFrom(records));
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
    setKnownTestNames([]);
    setTestName('');
    setTestId('');
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
    <main className="min-h-screen bg-gray-50 text-slate-900">
      <div className="container mx-auto px-4 py-10">
        <section className="mb-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
          <div className="max-w-3xl">
            <p className="mb-1 text-sm font-medium uppercase tracking-wide text-blue-700">CheMatSustain Developer API</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Explore test data without a website login</h1>
            <p className="mt-3 leading-relaxed text-slate-600">
              Filter the live test index by test name or test ID, open one complete test,
              and generate a ready-to-run Python example using your issued API credential.
            </p>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-blue-50 p-2 text-blue-700"><KeyRound size={22} /></span>
              <div><h2 className="font-semibold text-slate-900">API credential</h2><p className="text-xs text-slate-500">Required to read protected research data</p></div>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">Client ID
                <input value={clientId} onChange={(event) => { setClientId(event.target.value); setVerified(false); setKnownTestNames([]); setItems([]); setTestName(''); setTestId(''); }} autoComplete="off" spellCheck={false}
                  placeholder="cms_..." className="mt-1.5 w-full rounded-md border border-blue-900/30 bg-white px-3 py-2.5 font-mono text-sm text-blue-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Client secret
                <span className="relative mt-1.5 block">
                  <input type={showSecret ? 'text' : 'password'} value={clientSecret} onChange={(event) => { setClientSecret(event.target.value); setVerified(false); setKnownTestNames([]); setItems([]); setTestName(''); setTestId(''); }} autoComplete="new-password" spellCheck={false}
                    placeholder="Enter the one-time secret" className="w-full rounded-md border border-blue-900/30 bg-white px-3 py-2.5 pr-11 font-mono text-sm text-blue-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={() => setShowSecret((value) => !value)} aria-label={showSecret ? 'Hide secret' : 'Show secret'} className="absolute right-3 top-2.5 text-slate-400 hover:text-blue-700">
                    {showSecret ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </span>
              </label>
              <div className="flex gap-2">
                <button type="button" disabled={busy || !credentialsReady} onClick={testCredentials} className="flex-1 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">Test credentials</button>
                <button type="button" onClick={clearCredentials} aria-label="Clear credentials" className="rounded-md border border-slate-300 p-2.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-blue-700"><Trash2 size={19} /></button>
              </div>
              {verified && <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 size={17} /> Credential accepted</p>}
            </div>
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
              <ShieldCheck className="mb-2" size={18} /> Credentials stay only in this page&apos;s memory. They are not saved in cookies, browser storage, URLs, examples, or downloaded files, and disappear when the page refreshes.
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Search size={19} className="text-blue-700" /> Filter test index</h2>
            <div className="mt-4 space-y-4">
              <label className="block text-sm font-medium text-slate-700">Test name
                <select value={testName} onChange={(event) => setTestName(event.target.value)} className="mt-1.5 w-full rounded-md border border-blue-900/30 bg-white px-3 py-2.5 text-blue-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                  <option value="">All test names</option>
                  {knownTestNames.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">Test ID
                <input value={testId} onChange={(event) => setTestId(event.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="For example: 3"
                  className="mt-1.5 w-full rounded-md border border-blue-900/30 bg-white px-3 py-2.5 text-blue-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
              </label>
              <code className="block break-all rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-blue-800">GET {indexUrl}</code>
              <button type="button" disabled={busy || !credentialsReady} onClick={() => runIndex()} className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"><Play size={17} /> Run index API</button>
              <button type="button" disabled={busy || !credentialsReady || !testId} onClick={() => openTest()} className="flex w-full items-center justify-center gap-2 rounded-md border border-blue-600 px-4 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40">Open test ID</button>
            </div>
          </section>
        </aside>

        <div className="space-y-6 min-w-0">
          {error && <div role="alert" className="rounded-lg border border-red-400 bg-red-100 p-4 text-red-700">{error}</div>}
          {lastResult && (
            <div className="flex flex-wrap gap-3 text-xs text-slate-600">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1">HTTP {lastResult.status}</span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{lastResult.duration} ms</span>
              {lastResult.requestId && <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-mono">Request {lastResult.requestId}</span>}
            </div>
          )}

          <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
              <div><h2 className="text-xl font-semibold text-blue-900">Test index</h2><p className="mt-1 text-sm text-slate-500">Unlimited lightweight results · {items.length} tests returned</p></div>
              <button type="button" disabled={!items.length} onClick={() => download(items, 'chematsustain_test_index.json')} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><Download size={16} /> JSON</button>
            </div>
            <div className="max-h-[620px] overflow-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="sticky top-0 bg-gray-100 text-xs uppercase tracking-wide text-blue-900"><tr><th className="px-4 py-3">Test ID</th><th className="px-4 py-3">Test name</th><th className="px-4 py-3">Work Package</th><th className="px-4 py-3">Identifier</th><th className="px-4 py-3">Action</th></tr></thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {items.map((item) => <tr key={item.test_id} className="hover:bg-blue-50/50"><td className="px-4 py-3 font-mono font-medium text-blue-700">{item.test_id}</td><td className="px-4 py-3 font-medium text-slate-900">{item.test_name || 'Unnamed test'}</td><td className="px-4 py-3">{item.work_package}</td><td className="px-4 py-3 font-mono text-xs text-slate-600">{item.identifier}</td><td className="px-4 py-3"><button type="button" onClick={() => openTest(item.test_id)} className="rounded-md bg-blue-50 px-3 py-1.5 font-medium text-blue-700 transition-colors hover:bg-blue-100">Open</button></td></tr>)}
                  {!items.length && <tr><td colSpan={5} className="px-5 py-16 text-center text-slate-500">Enter your API credential and run the index to see live tests.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {detail && (
            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Single-test detail</p><h2 className="mt-1 text-xl font-semibold text-blue-900">Test ID {testId}</h2></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => copy(JSON.stringify(detail.data, null, 2), 'json')} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Clipboard size={16} /> {copied === 'json' ? 'Copied' : 'Copy'}</button><button type="button" onClick={() => download(detail.data, `chematsustain_test_${testId}.json`)} className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Download size={16} /> JSON</button></div></div>
              <pre className="mt-4 max-h-[650px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-4 text-xs leading-6 text-slate-200">{JSON.stringify(detail.data, null, 2)}</pre>
            </section>
          )}

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-semibold text-blue-900"><Code2 size={20} className="text-blue-700" /> Python test</h2><p className="mt-1 text-sm text-slate-500">Uses environment variables—your actual secret is never inserted.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => copy(script, 'python')} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Clipboard size={16} /> {copied === 'python' ? 'Copied' : 'Copy'}</button><button type="button" onClick={() => download(script, 'chematsustain_api_test.py')} className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Download size={16} /> Download .py</button></div></div>
            <pre className="mt-4 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-4 text-xs leading-6 text-slate-200">{script}</pre>
          </section>
        </div>
        </div>
      </div>
    </main>
  );
}