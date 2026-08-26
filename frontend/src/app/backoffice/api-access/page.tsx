'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/axios';

type Tab = 'credentials' | 'organisations' | 'data' | 'users' | 'guide';

type User = {
  id: number;
  email: string;
  role: 'admin' | 'user';
  is_active: boolean;
  last_activity: string | null;
};

type Organisation = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string | null;
  test_count: number;
  protocol_count: number;
  credential_count: number;
};

type ApiCredential = {
  id: string;
  client_id: string;
  name: string;
  organisation_id: string | null;
  user_id: number | null;
  scopes: string[];
  is_active: boolean;
  note: string;
  created_by: string;
  created_at: string | null;
  last_used_at: string | null;
  secret_version: number;
};

type CreatedCredential = ApiCredential & {
  client_secret: string;
  warning?: string;
};

type TestResource = {
  id: number;
  work_package_name: string | null;
  element_cms_id: string | null;
  test_name: string | null;
  organisation_id: string | null;
  organisation_name: string | null;
  organisation_slug: string | null;
  granted_organisation_ids: string[];
};

type ProtocolResource = {
  id: number;
  name: string;
  category_id: number;
  category_name: string;
  organisation_id: string | null;
  organisation_name: string | null;
  organisation_slug: string | null;
  granted_organisation_ids: string[];
};

type ResourceResponse = {
  tests: TestResource[];
  protocols: ProtocolResource[];
};

const emptyResources: ResourceResponse = { tests: [], protocols: [] };

// Sentinel value for "no filter applied", mirroring the backoffice tests
// page: never collides with a real work package / test / element value.
const ALL = 'all';

function errorMessage(error: any): string {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail) return JSON.stringify(detail);
  return error?.message || 'The request failed';
}

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
      {scope}
    </span>
  );
}

export default function ApiAccessPage() {
  const [tab, setTab] = useState<Tab>('credentials');
  const [users, setUsers] = useState<User[]>([]);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);
  const [allowedScopes, setAllowedScopes] = useState<string[]>([]);
  const [resources, setResources] = useState<ResourceResponse>(emptyResources);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [selectedOrganisationId, setSelectedOrganisationId] = useState('');
  const [credentialName, setCredentialName] = useState('');
  const [credentialNote, setCredentialNote] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    'tests:read',
    'protocols:read',
  ]);
  const [revealedCredential, setRevealedCredential] = useState<CreatedCredential | null>(null);

  const [newOrganisation, setNewOrganisation] = useState({ name: '', slug: '' });
  const [editingOrganisationId, setEditingOrganisationId] = useState('');
  const [editingOrganisation, setEditingOrganisation] = useState({
    name: '',
    slug: '',
    is_active: true,
  });

  const [dataOrganisationId, setDataOrganisationId] = useState('');
  const [selectedTestIds, setSelectedTestIds] = useState<number[]>([]);
  const [selectedProtocolIds, setSelectedProtocolIds] = useState<number[]>([]);
  const [testSearch, setTestSearch] = useState('');
  const [protocolSearch, setProtocolSearch] = useState('');

  // ---- Tests & protocols filters (mirrors the backoffice tests page) ----
  const [filterWorkPackage, setFilterWorkPackage] = useState<string>(ALL);
  const [filterTest, setFilterTest] = useState<string>(ALL);
  const [filterElement, setFilterElement] = useState<string>(ALL);
  const [filterCategory, setFilterCategory] = useState<string>(ALL);

  const [editingUserId, setEditingUserId] = useState<number | ''>('');
  const [editingUser, setEditingUser] = useState({
    email: '',
    role: 'user' as 'admin' | 'user',
    is_active: true,
    new_password: '',
  });

  const refreshAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersResponse, organisationResponse, credentialResponse, scopeResponse, resourceResponse] =
        await Promise.all([
          api.get('/users/admin'),
          api.get('/admin/access/organisations'),
          api.get('/admin/api-clients'),
          api.get('/admin/api-clients/scopes'),
          api.get('/admin/access/resources'),
        ]);
      setUsers(usersResponse.data);
      setOrganisations(organisationResponse.data);
      setCredentials(credentialResponse.data);
      setAllowedScopes(scopeResponse.data);
      setResources(resourceResponse.data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    if (!dataOrganisationId) {
      setSelectedTestIds([]);
      setSelectedProtocolIds([]);
      return;
    }
    setSelectedTestIds(
      resources.tests
        .filter((item) => item.granted_organisation_ids.includes(dataOrganisationId))
        .map((item) => item.id),
    );
    setSelectedProtocolIds(
      resources.protocols
        .filter((item) => item.granted_organisation_ids.includes(dataOrganisationId))
        .map((item) => item.id),
    );
  }, [dataOrganisationId, resources]);

  useEffect(() => {
    const user = users.find((item) => item.id === editingUserId);
    if (!user) return;
    setEditingUser({
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      new_password: '',
    });
  }, [editingUserId, users]);

  useEffect(() => {
    const organisation = organisations.find((item) => item.id === editingOrganisationId);
    if (!organisation) return;
    setEditingOrganisation({
      name: organisation.name,
      slug: organisation.slug,
      is_active: organisation.is_active,
    });
  }, [editingOrganisationId, organisations]);

  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );
  const organisationById = useMemo(
    () => new Map(organisations.map((organisation) => [organisation.id, organisation])),
    [organisations],
  );

  const filteredCredentials = useMemo(() => {
    if (!selectedUserId) return credentials;
    return credentials.filter((credential) => credential.user_id === selectedUserId);
  }, [credentials, selectedUserId]);

  // Distinct filter options, derived from the resource list itself so the
  // dropdowns always match the data (the tests page uses static lists; here
  // the values come from whatever tests/protocols actually exist).
  const uniqueSorted = (values: (string | null | undefined)[]) =>
    Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) =>
      a.localeCompare(b),
    );

  const workPackageOptions = useMemo(
    () => uniqueSorted(resources.tests.map((item) => item.work_package_name)),
    [resources.tests],
  );
  const testTypeOptions = useMemo(
    () => uniqueSorted(resources.tests.map((item) => item.test_name)),
    [resources.tests],
  );
  const elementOptions = useMemo(
    () => uniqueSorted(resources.tests.map((item) => item.element_cms_id)),
    [resources.tests],
  );
  const categoryOptions = useMemo(
    () => uniqueSorted(resources.protocols.map((item) => item.category_name)),
    [resources.protocols],
  );

  const filteredTests = useMemo(() => {
    const query = testSearch.trim().toLowerCase();
    return resources.tests.filter((item) => {
      if (filterWorkPackage !== ALL && item.work_package_name !== filterWorkPackage) return false;
      if (filterTest !== ALL && item.test_name !== filterTest) return false;
      if (filterElement !== ALL && item.element_cms_id !== filterElement) return false;
      if (
        query &&
        ![item.work_package_name, item.element_cms_id, item.test_name, item.organisation_name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query)
      )
        return false;
      return true;
    });
  }, [resources.tests, testSearch, filterWorkPackage, filterTest, filterElement]);

  const filteredProtocols = useMemo(() => {
    const query = protocolSearch.trim().toLowerCase();
    return resources.protocols.filter((item) => {
      if (filterCategory !== ALL && item.category_name !== filterCategory) return false;
      if (
        query &&
        ![item.name, item.category_name, item.organisation_name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query)
      )
        return false;
      return true;
    });
  }, [resources.protocols, protocolSearch, filterCategory]);
  // Access grants are many-to-many: every filtered resource remains selectable
  // without changing its owning organisation.
  const selectableFilteredTests = filteredTests;
  const selectableFilteredProtocols = filteredProtocols;

  const selectAllFilteredTests = () => {
    setSelectedTestIds((current) =>
      Array.from(new Set([...current, ...selectableFilteredTests.map((item) => item.id)])),
    );
  };
  const selectAllFilteredProtocols = () => {
    setSelectedProtocolIds((current) =>
      Array.from(new Set([...current, ...selectableFilteredProtocols.map((item) => item.id)])),
    );
  };
  const clearTestFilters = () => {
    setFilterWorkPackage(ALL);
    setFilterTest(ALL);
    setFilterElement(ALL);
    setTestSearch('');
  };
  const clearProtocolFilters = () => {
    setFilterCategory(ALL);
    setProtocolSearch('');
  };
  const hasActiveTestFilters =
    filterWorkPackage !== ALL || filterTest !== ALL || filterElement !== ALL || Boolean(testSearch.trim());
  const hasActiveProtocolFilters = filterCategory !== ALL || Boolean(protocolSearch.trim());

  const selectedCredentialUser = selectedUserId ? userById.get(selectedUserId) : undefined;

  const toggleScope = (scope: string) => {
    setSelectedScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  };

  const issueCredential = async () => {
    if (!selectedUserId || !selectedOrganisationId) {
      setError('Choose a user and an organisation first.');
      return;
    }
    if (!selectedScopes.length) {
      setError('Choose at least one scope.');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const user = userById.get(selectedUserId);
      const organisation = organisationById.get(selectedOrganisationId);
      const response = await api.post(`/admin/api-clients/for-user/${selectedUserId}`, {
        name: credentialName.trim() || `API access for ${user?.email}`,
        organisation_id: selectedOrganisationId,
        user_id: selectedUserId,
        scopes: selectedScopes,
        note: credentialNote.trim(),
      });
      setRevealedCredential(response.data);
      setCredentialName('');
      setCredentialNote('');
      setNotice(`Credential issued for ${user?.email} under ${organisation?.name}.`);
      await refreshAll();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const rotateCredential = async (credential: ApiCredential) => {
    if (!window.confirm(`Rotate ${credential.client_id}? The old secret will stop working immediately.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await api.post(`/admin/api-clients/${credential.id}/rotate`);
      setRevealedCredential(response.data);
      setNotice('Secret rotated. Copy the replacement now; it cannot be recovered later.');
      await refreshAll();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const setCredentialActive = async (credential: ApiCredential, active: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/api-clients/${credential.id}/${active ? 'enable' : 'disable'}`);
      setNotice(`${credential.client_id} ${active ? 'enabled' : 'disabled'}.`);
      await refreshAll();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const deleteCredential = async (credential: ApiCredential) => {
    if (!window.confirm(`Permanently delete ${credential.client_id}? Disable is safer for audit history.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/admin/api-clients/${credential.id}`);
      setNotice(`${credential.client_id} deleted.`);
      await refreshAll();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const createOrganisation = async () => {
    if (!newOrganisation.name.trim() || !newOrganisation.slug.trim()) {
      setError('Organisation name and slug are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/admin/access/organisations', {
        name: newOrganisation.name.trim(),
        slug: newOrganisation.slug.trim().toLowerCase(),
        is_active: true,
      });
      setNewOrganisation({ name: '', slug: '' });
      setNotice('Organisation created.');
      await refreshAll();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const updateOrganisation = async () => {
    if (!editingOrganisationId) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/admin/access/organisations/${editingOrganisationId}`, editingOrganisation);
      setNotice('Organisation updated.');
      await refreshAll();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const deleteOrganisation = async () => {
    if (!editingOrganisationId) return;
    const organisation = organisationById.get(editingOrganisationId);
    if (!window.confirm(`Delete ${organisation?.name}? Linked data or credentials will block deletion.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/admin/access/organisations/${editingOrganisationId}`);
      setEditingOrganisationId('');
      setNotice('Organisation deleted.');
      await refreshAll();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const saveResourceAccess = async () => {
    if (!dataOrganisationId) {
      setError('Choose an organisation first.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.put(`/admin/access/organisations/${dataOrganisationId}/resources`, {
        test_ids: selectedTestIds,
        protocol_ids: selectedProtocolIds,
      });
      setNotice('Test and protocol access saved.');
      await refreshAll();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const saveUser = async () => {
    if (!editingUserId) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/admin/access/users/${editingUserId}`, {
        email: editingUser.email.trim(),
        role: editingUser.role,
        is_active: editingUser.is_active,
        new_password: editingUser.new_password || null,
      });
      setNotice('User updated.');
      setEditingUser((current) => ({ ...current, new_password: '' }));
      await refreshAll();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async () => {
    if (!editingUserId) return;
    const user = userById.get(editingUserId);
    if (!window.confirm(`Delete ${user?.email}? Their sessions and all API credentials will be disabled.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/admin/access/users/${editingUserId}`);
      setEditingUserId('');
      setNotice('User deleted and their credentials disabled.');
      await refreshAll();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice('Copied to clipboard.');
    } catch {
      setError('Clipboard access was blocked by the browser. Select and copy the text manually.');
    }
  };

  const tabClass = (value: Tab) =>
    `rounded-lg px-4 py-2 text-sm font-medium ${
      tab === value ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
    }`;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">API Access</h1>
          <p className="mt-2 text-gray-600">
            Manage partner identities, organisations, credentials, and tenant-scoped research data.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={tabClass('credentials')} onClick={() => setTab('credentials')}>Credentials</button>
        <button className={tabClass('organisations')} onClick={() => setTab('organisations')}>Organisations</button>
        <button className={tabClass('data')} onClick={() => setTab('data')}>Tests & protocols</button>
        <button className={tabClass('users')} onClick={() => setTab('users')}>Edit users</button>
        <button className={tabClass('guide')} onClick={() => setTab('guide')}>Partner guide</button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">{notice}</div>}

      {tab === 'credentials' && (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-3">
            <section className="rounded-xl bg-white p-6 shadow xl:col-span-1">
              <h2 className="text-lg font-semibold">Issue credential</h2>
              <p className="mt-1 text-sm text-gray-500">The secret is shown once after creation.</p>
              <div className="mt-5 space-y-4">
                <label className="block text-sm font-medium">
                  User email
                  <select
                    value={selectedUserId}
                    onChange={(event) => setSelectedUserId(event.target.value ? Number(event.target.value) : '')}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                  >
                    <option value="">Choose user</option>
                    {users.filter((user) => user.is_active).map((user) => (
                      <option key={user.id} value={user.id}>{user.email}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Organisation
                  <select
                    value={selectedOrganisationId}
                    onChange={(event) => setSelectedOrganisationId(event.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                  >
                    <option value="">Choose organisation</option>
                    {organisations.filter((item) => item.is_active).map((organisation) => (
                      <option key={organisation.id} value={organisation.id}>
                        {organisation.name} ({organisation.slug})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Credential name
                  <input
                    value={credentialName}
                    onChange={(event) => setCredentialName(event.target.value)}
                    placeholder={selectedCredentialUser ? `API access for ${selectedCredentialUser.email}` : 'Partner API access'}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                  />
                </label>
                <div>
                  <p className="text-sm font-medium">Scopes</p>
                  <div className="mt-2 space-y-2">
                    {allowedScopes.map((scope) => (
                      <label key={scope} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedScopes.includes(scope)}
                          onChange={() => toggleScope(scope)}
                        />
                        {scope}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="block text-sm font-medium">
                  Internal note
                  <textarea
                    value={credentialNote}
                    onChange={(event) => setCredentialNote(event.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                    rows={3}
                    placeholder="Purpose, system owner, review date..."
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={issueCredential}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Issue API credential
                </button>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl bg-white shadow xl:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
                <div>
                  <h2 className="text-lg font-semibold">Issued credentials</h2>
                  <p className="text-sm text-gray-500">Filter by user using the selector on the left.</p>
                </div>
                <span className="text-sm text-gray-500">{filteredCredentials.length} credential(s)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Credential</th>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3">Organisation</th>
                      <th className="px-4 py-3">Scopes</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCredentials.map((credential) => (
                      <tr key={credential.id}>
                        <td className="px-4 py-4 align-top">
                          <div className="font-medium">{credential.name}</div>
                          <code className="text-xs text-gray-500">{credential.client_id}</code>
                          <div className="mt-1 text-xs text-gray-400">
                            v{credential.secret_version} · last used {formatDate(credential.last_used_at)}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">{credential.user_id ? userById.get(credential.user_id)?.email : 'System'}</td>
                        <td className="px-4 py-4 align-top">
                          {credential.organisation_id ? organisationById.get(credential.organisation_id)?.name : 'None'}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex max-w-xs flex-wrap gap-1">
                            {credential.scopes.map((scope) => <ScopeBadge key={scope} scope={scope} />)}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${credential.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {credential.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-wrap gap-2">
                            <button className="text-blue-700 hover:underline" onClick={() => rotateCredential(credential)}>Rotate</button>
                            <button className="text-amber-700 hover:underline" onClick={() => setCredentialActive(credential, !credential.is_active)}>
                              {credential.is_active ? 'Disable' : 'Enable'}
                            </button>
                            <button className="text-red-700 hover:underline" onClick={() => deleteCredential(credential)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredCredentials.length && (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">No credentials found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}

      {tab === 'organisations' && (
        <div className="grid gap-6 xl:grid-cols-3">
          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-lg font-semibold">Create organisation</h2>
            <div className="mt-4 space-y-4">
              <label className="block text-sm font-medium">
                Name
                <input
                  value={newOrganisation.name}
                  onChange={(event) => setNewOrganisation((current) => ({ ...current, name: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="ProtoQSAR"
                />
              </label>
              <label className="block text-sm font-medium">
                Slug
                <input
                  value={newOrganisation.slug}
                  onChange={(event) => setNewOrganisation((current) => ({ ...current, slug: event.target.value.toLowerCase() }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="protoqsar"
                />
              </label>
              <button disabled={busy} onClick={createOrganisation} className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50">
                Create organisation
              </button>
            </div>
          </section>

          <section className="rounded-xl bg-white p-6 shadow xl:col-span-2">
            <h2 className="text-lg font-semibold">Edit or delete organisation</h2>
            <select
              value={editingOrganisationId}
              onChange={(event) => setEditingOrganisationId(event.target.value)}
              className="mt-4 w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Choose organisation</option>
              {organisations.map((organisation) => (
                <option key={organisation.id} value={organisation.id}>{organisation.name}</option>
              ))}
            </select>
            {editingOrganisationId && (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium">
                  Name
                  <input value={editingOrganisation.name} onChange={(event) => setEditingOrganisation((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                </label>
                <label className="text-sm font-medium">
                  Slug
                  <input value={editingOrganisation.slug} onChange={(event) => setEditingOrganisation((current) => ({ ...current, slug: event.target.value.toLowerCase() }))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={editingOrganisation.is_active} onChange={(event) => setEditingOrganisation((current) => ({ ...current, is_active: event.target.checked }))} />
                  Active organisation
                </label>
                <div className="flex justify-end gap-3">
                  <button disabled={busy} onClick={updateOrganisation} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save</button>
                  <button disabled={busy} onClick={deleteOrganisation} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">Delete</button>
                </div>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl bg-white shadow xl:col-span-3">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr><th className="px-4 py-3">Organisation</th><th className="px-4 py-3">Tests</th><th className="px-4 py-3">Protocols</th><th className="px-4 py-3">Credentials</th><th className="px-4 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y">
                {organisations.map((organisation) => (
                  <tr key={organisation.id}>
                    <td className="px-4 py-3"><div className="font-medium">{organisation.name}</div><code className="text-xs text-gray-500">{organisation.slug}</code></td>
                    <td className="px-4 py-3">{organisation.test_count}</td>
                    <td className="px-4 py-3">{organisation.protocol_count}</td>
                    <td className="px-4 py-3">{organisation.credential_count}</td>
                    <td className="px-4 py-3">{organisation.is_active ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {tab === 'data' && (
        <div className="space-y-6">
          <section className="rounded-xl bg-white p-6 shadow">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <label className="min-w-72 text-sm font-medium">
                Organisation receiving access
                <select value={dataOrganisationId} onChange={(event) => setDataOrganisationId(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2">
                  <option value="">Choose organisation</option>
                  {organisations.filter((item) => item.is_active).map((organisation) => (
                    <option key={organisation.id} value={organisation.id}>{organisation.name}</option>
                  ))}
                </select>
              </label>
              <button disabled={busy || !dataOrganisationId} onClick={saveResourceAccess} className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white disabled:opacity-50">
                Save access
              </button>
            </div>
            <p className="mt-3 text-sm text-gray-500">
              Saving replaces this organisation&apos;s current test and protocol selection. Records owned by another partner stay locked unless reassignment is explicitly enabled.
            </p>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-xl bg-white p-5 shadow">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="font-semibold">Tests</h2><p className="text-sm text-gray-500">{selectedTestIds.length} selected of {resources.tests.length}</p></div>
                <input value={testSearch} onChange={(event) => setTestSearch(event.target.value)} placeholder="Search tests" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>

              {/* Filters - same pattern as the backoffice tests page */}
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <label className="text-xs font-medium text-gray-600">
                  Work Package
                  <select value={filterWorkPackage} onChange={(event) => setFilterWorkPackage(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900">
                    <option value={ALL}>All work packages</option>
                    {workPackageOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-gray-600">
                  Test
                  <select value={filterTest} onChange={(event) => setFilterTest(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900">
                    <option value={ALL}>All test types</option>
                    {testTypeOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-gray-600">
                  Element
                  <select value={filterElement} onChange={(event) => setFilterElement(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900">
                    <option value={ALL}>All elements</option>
                    {elementOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!dataOrganisationId || !selectableFilteredTests.length}
                    onClick={selectAllFilteredTests}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Select all ({selectableFilteredTests.length})
                  </button>
                  <button
                    type="button"
                    disabled={!selectedTestIds.length}
                    onClick={() => setSelectedTestIds([])}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50"
                  >
                    Clear selection
                  </button>
                  {hasActiveTestFilters && (
                    <button type="button" onClick={clearTestFilters} className="rounded-lg px-3 py-1.5 text-xs font-medium text-blue-700 hover:underline">
                      Clear filters
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500">Showing {filteredTests.length} of {resources.tests.length}</p>
              </div>
              <div className="mt-4 max-h-[34rem] space-y-2 overflow-y-auto pr-2">
                {filteredTests.map((test) => {
                  return (
                    <label key={test.id} className="flex gap-3 rounded-lg border p-3 text-sm hover:bg-blue-50">
                      <input
                        type="checkbox"
                        disabled={!dataOrganisationId}
                        checked={selectedTestIds.includes(test.id)}
                        onChange={(event) => setSelectedTestIds((current) => event.target.checked ? [...current, test.id] : current.filter((id) => id !== test.id))}
                      />
                      <span>
                        <span className="font-medium">{test.test_name || `Test ${test.id}`}</span>
                        <span className="block text-xs text-gray-500">{test.work_package_name} · {test.element_cms_id}</span>
                        <span className="block text-xs text-gray-400">Owner: {test.organisation_name || 'Unassigned'}</span>
                      </span>
                    </label>
                  );
                })}
                {!filteredTests.length && (
                  <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                    No tests match your filters.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-xl bg-white p-5 shadow">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="font-semibold">Protocols</h2><p className="text-sm text-gray-500">{selectedProtocolIds.length} selected of {resources.protocols.length}</p></div>
                <input value={protocolSearch} onChange={(event) => setProtocolSearch(event.target.value)} placeholder="Search protocols" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <label className="text-xs font-medium text-gray-600">
                  Category
                  <select value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900">
                    <option value={ALL}>All categories</option>
                    {categoryOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!dataOrganisationId || !selectableFilteredProtocols.length}
                    onClick={selectAllFilteredProtocols}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Select all ({selectableFilteredProtocols.length})
                  </button>
                  <button
                    type="button"
                    disabled={!selectedProtocolIds.length}
                    onClick={() => setSelectedProtocolIds([])}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50"
                  >
                    Clear selection
                  </button>
                  {hasActiveProtocolFilters && (
                    <button type="button" onClick={clearProtocolFilters} className="rounded-lg px-3 py-1.5 text-xs font-medium text-blue-700 hover:underline">
                      Clear filters
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500">Showing {filteredProtocols.length} of {resources.protocols.length}</p>
              </div>
              <div className="mt-4 max-h-[34rem] space-y-2 overflow-y-auto pr-2">
                {filteredProtocols.map((protocol) => {
                  return (
                    <label key={protocol.id} className="flex gap-3 rounded-lg border p-3 text-sm hover:bg-blue-50">
                      <input
                        type="checkbox"
                        disabled={!dataOrganisationId}
                        checked={selectedProtocolIds.includes(protocol.id)}
                        onChange={(event) => setSelectedProtocolIds((current) => event.target.checked ? [...current, protocol.id] : current.filter((id) => id !== protocol.id))}
                      />
                      <span>
                        <span className="font-medium">{protocol.name}</span>
                        <span className="block text-xs text-gray-500">{protocol.category_name}</span>
                        <span className="block text-xs text-gray-400">Owner: {protocol.organisation_name || 'Unassigned'}</span>
                      </span>
                    </label>
                  );
                })}
                {!filteredProtocols.length && (
                  <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                    No protocols match your filters.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="grid gap-6 xl:grid-cols-3">
          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-lg font-semibold">Choose user</h2>
            <select value={editingUserId} onChange={(event) => setEditingUserId(event.target.value ? Number(event.target.value) : '')} className="mt-4 w-full rounded-md border border-gray-300 px-3 py-2">
              <option value="">Choose user</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
            </select>
            <Link href="/backoffice/users" className="mt-4 inline-block text-sm text-blue-700 hover:underline">Create a new user on the Users page</Link>
          </section>
          <section className="rounded-xl bg-white p-6 shadow xl:col-span-2">
            <h2 className="text-lg font-semibold">Change, deactivate, or delete</h2>
            {!editingUserId && <p className="mt-4 text-sm text-gray-500">Select a user to edit.</p>}
            {editingUserId && (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium">Email<input type="email" value={editingUser.email} onChange={(event) => setEditingUser((current) => ({ ...current, email: event.target.value }))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" /></label>
                <label className="text-sm font-medium">Role<select value={editingUser.role} onChange={(event) => setEditingUser((current) => ({ ...current, role: event.target.value as 'admin' | 'user' }))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"><option value="user">User</option><option value="admin">Admin</option></select></label>
                <label className="text-sm font-medium">New password (optional)<input type="password" minLength={12} value={editingUser.new_password} onChange={(event) => setEditingUser((current) => ({ ...current, new_password: event.target.value }))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" placeholder="At least 12 characters" /></label>
                <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={editingUser.is_active} onChange={(event) => setEditingUser((current) => ({ ...current, is_active: event.target.checked }))} />Active user</label>
                <div className="md:col-span-2 flex justify-end gap-3">
                  <button disabled={busy} onClick={saveUser} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save changes</button>
                  <button disabled={busy} onClick={deleteUser} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">Delete user</button>
                </div>
                <p className="md:col-span-2 text-xs text-gray-500">Deleting a user invalidates their sessions and disables every linked API credential. Credential records remain for audit history.</p>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'guide' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-lg font-semibold">What the partner receives</h2>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-gray-700">
              <li>Their individual <code>client_id</code>.</li>
              <li>Their individual <code>client_secret</code>, shown only once.</li>
              <li>The approved endpoint and scopes.</li>
              <li>A warning to store the secret in a password manager and never commit it to code.</li>
            </ol>
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              The email address identifies who owns the credential. It is not the API username. Basic Authentication uses the client ID as the username and the client secret as the password.
            </div>
          </section>
          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-lg font-semibold">Usage example</h2>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100">{`CLIENT_ID='cms_...'
CLIENT_SECRET='...'

curl --fail-with-body \\
  --user "\${CLIENT_ID}:\${CLIENT_SECRET}" \\
  'https://database.eurskem.com/api/v1/tests'`}</pre>
            <p className="mt-4 text-sm text-gray-600">An empty array <code>[]</code> means authentication worked but no test records are assigned to that organisation.</p>
          </section>
          <section className="rounded-xl bg-white p-6 shadow lg:col-span-2">
            <h2 className="text-lg font-semibold">Operational rules</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3 text-sm">
              <div className="rounded-lg border p-4"><strong>One key per person/system</strong><p className="mt-2 text-gray-600">Never share one credential across a whole partner organisation.</p></div>
              <div className="rounded-lg border p-4"><strong>Disable before deleting</strong><p className="mt-2 text-gray-600">Disabling is immediate and preserves attribution in logs.</p></div>
              <div className="rounded-lg border p-4"><strong>Rotate exposed secrets</strong><p className="mt-2 text-gray-600">Rotation invalidates the previous secret immediately.</p></div>
            </div>
          </section>
        </div>
      )}

      {revealedCredential && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Copy the secret now</h2>
                <p className="mt-1 text-sm text-red-700">It is hashed on save and cannot be shown again.</p>
              </div>
              <button onClick={() => setRevealedCredential(null)} className="text-gray-500 hover:text-gray-900">Close</button>
            </div>
            <div className="mt-5 space-y-4">
              <div><label className="text-sm font-medium">Client ID</label><div className="mt-1 flex gap-2"><input readOnly value={revealedCredential.client_id} className="w-full rounded-md border px-3 py-2 font-mono text-sm" /><button onClick={() => copyText(revealedCredential.client_id)} className="rounded-md border px-3 py-2 text-sm">Copy</button></div></div>
              <div><label className="text-sm font-medium">Client secret</label><div className="mt-1 flex gap-2"><input readOnly value={revealedCredential.client_secret} className="w-full rounded-md border px-3 py-2 font-mono text-sm" /><button onClick={() => copyText(revealedCredential.client_secret)} className="rounded-md border px-3 py-2 text-sm">Copy</button></div></div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                Assigned email: <strong>{revealedCredential.user_id ? userById.get(revealedCredential.user_id)?.email : 'System credential'}</strong>. The partner uses the client ID and secret in their software; they do not enter their email in the API request.
              </div>
              <div>
                <div className="flex items-center justify-between"><label className="text-sm font-medium">Test command</label><button onClick={() => {
  const curlCmd = 'curl --fail-with-body --user \'' + 
    revealedCredential.client_id + ':' + revealedCredential.client_secret + 
    '\' \'https://database.eurskem.com/api/v1/tests\'';
  copyText(curlCmd);
}} className="text-sm text-blue-700">Copy command</button></div>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100">{`curl --fail-with-body \\
  --user '${revealedCredential.client_id}:${revealedCredential.client_secret}' \\ /* no-gitleaks */
  'https://database.eurskem.com/api/v1/tests'`}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
