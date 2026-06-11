"use client";

import { api } from "@/lib/axios";
import { FC, useEffect, useState, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileDown,
} from "lucide-react";

/* ----------------------------- Types ----------------------------- */
interface TreeProtocol {
  id: number;
  name: string;
  description?: string | null;
  has_file?: boolean;
  file_name?: string | null;
  file_mime?: string | null;
}
interface TreeCategory {
  id: number;
  name: string;
  protocols: TreeProtocol[];
}
interface SelectedPdf {
  protocolId: number;
  name: string;
}

/* ============================ Component ============================ */
const ProtocolBrowser: FC = () => {
  const [tree, setTree] = useState<TreeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [openCategories, setOpenCategories] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<SelectedPdf | null>(null);

  const fetchTree = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const res = await api.get(`/tree`, signal ? { signal } : undefined);
      if (res.status !== 200) throw new Error("Bad response");
      setTree(res.data ?? []);
      setError("");
    } catch (err: any) {
      if (err.name !== "CanceledError" && err.name !== "AbortError") {
        setError("Failed to load the protocol library.");
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

  const openProtocol = useCallback((proto: TreeProtocol) => {
    if (proto.has_file) {
      setSelected({ protocolId: proto.id, name: proto.file_name ?? proto.name });
    }
  }, []);

  const fileUrl = selected
    ? `${api.defaults.baseURL}/protocols/${selected.protocolId}/file`
    : "";

  return (
    <div className="bg-gray-50 min-h-screen text-black">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* ----------------------- Sidebar tree ----------------------- */}
          <aside className="bg-white rounded-lg shadow-md p-4 h-fit lg:sticky lg:top-8">
            <h2 className="text-xl font-bold text-blue-800 mb-4">Protocols</h2>

            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
              </div>
            )}

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}

            {!loading && !error && tree.length === 0 && (
              <p className="text-slate-500 text-sm">No categories yet.</p>
            )}

            {!loading && !error && (
              <ul className="space-y-1">
                {tree.map((cat) => {
                  const catOpen = openCategories.has(cat.id);
                  return (
                    <li key={cat.id}>
                      <button
                        onClick={() => toggleCategory(cat.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-slate-800 font-semibold hover:bg-blue-50 transition-colors"
                        aria-expanded={catOpen}
                      >
                        {catOpen ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                        )}
                        {catOpen ? (
                          <FolderOpen className="h-4 w-4 shrink-0 text-blue-600" />
                        ) : (
                          <Folder className="h-4 w-4 shrink-0 text-blue-600" />
                        )}
                        <span className="truncate">{cat.name}</span>
                      </button>

                      {catOpen && (
                        <ul className="ml-4 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
                          {cat.protocols.length === 0 && (
                            <li className="text-slate-400 text-xs px-2 py-1">
                              No protocols
                            </li>
                          )}
                          {cat.protocols.map((proto) => {
                            const isViewing = selected?.protocolId === proto.id;
                            return (
                              <li key={proto.id}>
                                <button
                                  onClick={() => openProtocol(proto)}
                                  disabled={!proto.has_file}
                                  title={
                                    proto.has_file
                                      ? proto.description ?? undefined
                                      : "No file attached"
                                  }
                                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors ${
                                    isViewing
                                      ? "bg-blue-600 text-white shadow-sm"
                                      : proto.has_file
                                      ? "text-slate-700 hover:bg-blue-50"
                                      : "text-slate-400 cursor-default"
                                  }`}
                                >
                                  <FileText
                                    className={`h-4 w-4 shrink-0 ${
                                      isViewing ? "text-white" : "text-slate-400"
                                    }`}
                                  />
                                  <span className="truncate">{proto.name}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* ----------------------- PDF pane ----------------------- */}
          <main className="min-w-0">
            {!selected && (
              <div className="bg-white rounded-lg shadow-md p-12 text-center">
                <Folder className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500">
                  Select a protocol from the library to view its document.
                </p>
              </div>
            )}

            {selected && (
              <div className="bg-white rounded-lg shadow-md p-4">
                <div className="flex items-center justify-between mb-3 gap-3">
                  <h2 className="text-lg font-semibold text-blue-800 truncate">
                    {selected.name}
                  </h2>
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 shrink-0 bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
                  >
                    <FileDown className="h-4 w-4" /> Open / Print
                  </a>
                </div>
                <object
                  data={fileUrl}
                  type="application/pdf"
                  className="w-full rounded-md border border-slate-300"
                  style={{ height: "80vh" }}
                >
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
          </main>
        </div>
      </div>
    </div>
  );
};

export default ProtocolBrowser;