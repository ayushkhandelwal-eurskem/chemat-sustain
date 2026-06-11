"use client";

import { api } from "@/lib/axios";
import { FC, useEffect, useState, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Upload,
  FileDown,
  Loader2,
  Pencil,
  Trash2,
  Plus,
  Check,
  X,
  Eye,
  EyeOff,
} from "lucide-react";

/* ----------------------------- Types ----------------------------- */
interface TreeTest {
  id: number;
  work_package_name: string;
  element_cms_id: string;
  test_name: string;
  display_name?: string | null;
}
interface TreeProtocol {
  id: number;
  name: string;
  description?: string | null;
  has_file?: boolean;
  file_name?: string | null;
  file_mime?: string | null;
  tests: TreeTest[];
}
interface TreeCategory {
  id: number;
  name: string;
  protocols: TreeProtocol[];
}

/* --------------------------- Inline edit -------------------------- */
const InlineEdit: FC<{
  value: string;
  onSave: (next: string) => Promise<void>;
  placeholder?: string;
  className?: string;
}> = ({ value, onSave, placeholder, className }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  const commit = async () => {
    if (draft.trim() === value.trim()) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <span className={`group inline-flex items-center gap-2 ${className ?? ""}`}>
        <span>{value || <span className="text-slate-400">{placeholder}</span>}</span>
        <button
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-600 transition-opacity"
          aria-label="Rename"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="border border-blue-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <button
        onClick={commit}
        disabled={busy}
        className="text-green-600 hover:text-green-800"
        aria-label="Save"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </button>
      <button
        onClick={() => setEditing(false)}
        disabled={busy}
        className="text-slate-400 hover:text-red-600"
        aria-label="Cancel"
      >
        <X className="h-4 w-4" />
      </button>
    </span>
  );
};

/* --------------------- Protocol file controls -------------------- */
const ProtocolFile: FC<{ protocol: TreeProtocol; onChange: () => void }> = ({
  protocol,
  onChange,
}) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showViewer, setShowViewer] = useState(false);

  const fileUrl = `${api.defaults.baseURL}/protocols/${protocol.id}/file`;
  // Only PDFs can be embedded inline in the browser; Word files stay download-only.
  const isPdf =
    protocol.file_mime === "application/pdf" ||
    (protocol.file_name?.toLowerCase().endsWith(".pdf") ?? false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/protocols/${protocol.id}/file`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange();
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Upload failed.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remove the attached file from this protocol?")) return;
    setBusy(true);
    try {
      await api.delete(`/protocols/${protocol.id}/file`);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="text-xs">
      <div className="flex items-center gap-3 flex-wrap">
        {protocol.has_file ? (
          <>
            {isPdf && (
              <button
                onClick={() => setShowViewer((v) => !v)}
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
              >
                {showViewer ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" /> Hide
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" /> View
                  </>
                )}
              </button>
            )}
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
            >
              <FileDown className="h-3.5 w-3.5" />
              {protocol.file_name ?? "Download"}
            </a>
            <button
              onClick={handleDelete}
              disabled={busy}
              className="inline-flex items-center gap-1 text-slate-400 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          </>
        ) : (
          <span className="text-slate-400">No file attached</span>
        )}

        <label className="inline-flex items-center gap-1 cursor-pointer text-slate-500 hover:text-blue-600">
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {protocol.has_file ? "Replace" : "Upload"}
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={handleUpload}
            disabled={busy}
          />
        </label>

        {err && <span className="text-red-600">{err}</span>}
      </div>

      {/* Inline PDF viewer */}
      {protocol.has_file && isPdf && showViewer && (
        <div className="mt-3 rounded-md overflow-hidden border border-slate-300 bg-slate-50">
          <object
            data={fileUrl}
            type="application/pdf"
            className="w-full"
            style={{ height: "70vh" }}
          >
            {/* Fallback if the browser can't embed PDFs */}
            <div className="p-6 text-center text-slate-600">
              Your browser can&apos;t display this PDF inline.{" "}
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Open it in a new tab
              </a>
              .
            </div>
          </object>
        </div>
      )}
    </div>
  );
};

/* ====================== Add-protocol inline form ================== */
const AddProtocol: FC<{ categoryId: number; onAdded: () => void }> = ({
  categoryId,
  onAdded,
}) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.post(`/protocols`, {
        category_id: categoryId,
        name: name.trim(),
        description: desc.trim() || null,
      });
      setName("");
      setDesc("");
      setOpen(false);
      onAdded();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mt-2"
      >
        <Plus className="h-4 w-4" /> Add protocol
      </button>
    );
  }

  return (
    <div className="bg-blue-50 p-3 rounded-md mt-2 flex flex-col gap-2">
      <input
        autoFocus
        value={name}
        placeholder="Protocol name"
        onChange={(e) => setName(e.target.value)}
        className="border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <input
        value={desc}
        placeholder="Description (optional)"
        onChange={(e) => setDesc(e.target.value)}
        className="border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy || !name.trim()}
          className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-1 rounded text-sm text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

/* ====================== Add-category inline form ================== */
const AddCategory: FC<{ onAdded: (name: string) => Promise<void> }> = ({
  onAdded,
}) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onAdded(name.trim());
      setName("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 mt-4"
      >
        <Plus className="h-4 w-4" /> Add category
      </button>
    );
  }

  return (
    <div className="bg-blue-50 p-3 rounded-md mt-4 flex items-center gap-2 max-w-md">
      <input
        autoFocus
        value={name}
        placeholder="Category name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        className="flex-1 border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <button
        onClick={submit}
        disabled={busy || !name.trim()}
        className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Save
      </button>
      <button
        onClick={() => setOpen(false)}
        className="px-3 py-1 rounded text-sm text-slate-600 hover:bg-slate-100"
      >
        Cancel
      </button>
    </div>
  );
};
const ProtocolManager: FC = () => {
  const [tree, setTree] = useState<TreeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<number>>(new Set());

  const fetchTree = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await api.get(`/tree`, signal ? { signal } : undefined);
      if (res.status !== 200) throw new Error("Bad response");
      setTree(res.data ?? []);
      setError("");
    } catch (err: any) {
      if (err.name !== "CanceledError" && err.name !== "AbortError") {
        setError("Failed to load protocols.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    fetchTree(ac.signal);
    return () => ac.abort();
  }, [fetchTree]);

  const toggleCategory = useCallback((id: number) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  /* --------------------------- mutations -------------------------- */
  const addCategory = async (name: string) => {
    await api.post(`/categories`, { name });
    await fetchTree();
  };
  const deleteCategory = async (id: number, name: string) => {
    if (
      !confirm(
        `Delete category "${name}" and ALL its protocols, test links, and uploaded files? This cannot be undone.`
      )
    )
      return;
    await api.delete(`/categories/${id}`);
    await fetchTree();
  };
  const renameCategory = async (id: number, name: string) => {
    await api.patch(`/categories/${id}`, { name });
    await fetchTree();
  };
  const renameProtocol = async (id: number, name: string) => {
    await api.patch(`/protocols/${id}`, { name });
    await fetchTree();
  };
  const renameTest = async (linkId: number, display_name: string) => {
    await api.patch(`/protocol-tests/${linkId}/rename`, null, {
      params: { display_name },
    });
    await fetchTree();
  };
  const deleteProtocol = async (id: number) => {
    if (!confirm("Delete this protocol and all its test links? This cannot be undone."))
      return;
    await api.delete(`/protocols/${id}`);
    await fetchTree();
  };

  /* ----------------------------- render --------------------------- */
  if (loading) {
    return (
      <div className="bg-white flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen py-8 text-black">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-2">Protocol Management</h1>
          <p className="text-slate-600">
            Organize tests into categories and manage their protocol documents. Hover a
            name to rename it.
          </p>
          <AddCategory onAdded={addCategory} />
        </div>

        {error && (
          <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {tree.length === 0 && !error && (
          <div className="bg-white rounded-lg shadow-md p-12 text-center text-slate-500">
            No categories yet.
          </div>
        )}

        {/* One card per category */}
        {tree.map((cat) => {
          const open = openCategories.has(cat.id);
          return (
            <div key={cat.id} className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="inline-flex items-center gap-2"
                  aria-expanded={open}
                >
                  {open ? (
                    <ChevronDown className="h-5 w-5 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-slate-500" />
                  )}
                  {open ? (
                    <FolderOpen className="h-5 w-5 text-blue-600" />
                  ) : (
                    <Folder className="h-5 w-5 text-blue-600" />
                  )}
                </button>
                <div className="flex-1 ml-2">
                  <InlineEdit
                    value={cat.name}
                    onSave={(n) => renameCategory(cat.id, n)}
                    className="text-xl font-bold text-blue-800"
                  />
                </div>
                <button
                  onClick={() => deleteCategory(cat.id, cat.name)}
                  className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-800 shrink-0"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>

              {open && (
                <div className="mt-4 space-y-4">
                  {cat.protocols.length === 0 && (
                    <p className="text-slate-400 text-sm">No protocols in this category.</p>
                  )}

                  {cat.protocols.map((proto) => (
                    <div
                      key={proto.id}
                      className="bg-blue-50 rounded-md p-4 border border-blue-100"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <InlineEdit
                            value={proto.name}
                            onSave={(n) => renameProtocol(proto.id, n)}
                            className="font-semibold text-slate-800"
                          />
                          {proto.description && (
                            <p className="text-sm text-slate-500 mt-0.5">
                              {proto.description}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => deleteProtocol(proto.id)}
                          className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-800 shrink-0"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      </div>

                      {/* File row */}
                      <div className="mt-3">
                        <ProtocolFile protocol={proto} onChange={fetchTree} />
                      </div>

                      {/* Tests under this protocol */}
                      {proto.tests.length > 0 && (
                        <div className="mt-3 border-t border-blue-200 pt-3">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                            Tests
                          </p>
                          <ul className="space-y-1">
                            {proto.tests.map((t) => (
                              <li
                                key={t.id}
                                className="flex items-center gap-2 text-sm"
                              >
                                <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                                <InlineEdit
                                  value={t.display_name ?? t.test_name}
                                  onSave={(n) => renameTest(t.id, n)}
                                  className="text-slate-700"
                                />
                                <span className="text-xs text-slate-400">
                                  ({t.work_package_name} / {t.element_cms_id} / {t.test_name})
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}

                  <AddProtocol categoryId={cat.id} onAdded={fetchTree} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProtocolManager;