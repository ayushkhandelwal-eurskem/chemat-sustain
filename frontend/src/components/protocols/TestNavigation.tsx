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
  Eye,
} from "lucide-react";

// ---------------------------------------------------------------------------
// EDIT THESE IMPORTS to point at your actual DataViewer files.
import MTTDataViewer from '@/components/tests/mtt/page';
import DLSDataViewer from '@/components/tests/dls/page';
import FTIRDataViewer from '@/components/tests/ftir/page';
import HRSTEMDataViewer from '@/components/tests/hr_stem/page';
import UVVisDataViewer from '@/components/tests/uv_vis/page';
import ZetaDataViewer from '@/components/tests/zeta/page';
import SIMSDataViewer from '@/components/tests/sims/page';
import ROSDataViewer from '@/components/tests/ros/page';
import TBDataViewer from '@/components/tests/tb/page';
import TBMDataViewer from '@/components/tests/tbm/page';
import UPSDataViewer from '@/components/tests/ups/page';
import XPSDataViewer from '@/components/tests/xps/page';
import XRDDataViewer from '@/components/tests/xrd/page';
import DSCDataViewer from '@/components/tests/dsc/page';
import TGADataViewer from '@/components/tests/tga/page';
import MNTDataViewer from '@/components/tests/mnt/page';
import RotifierDataViewer from '@/components/tests/rotifier/page';
import WaterFleaDataViewer from '@/components/tests/waterplea/page';
// ---------------------------------------------------------------------------

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
interface SelectedTest {
  kind: "test";
  work_package: string;
  element: string;
  test: string;
}
interface SelectedPdf {
  kind: "pdf";
  protocolId: number;
  name: string;
}
type Selection = SelectedTest | SelectedPdf | null;

/* ----------------- Viewer resolution by test name ----------------- */
// Add a case per test type as you onboard them (Rotifier, Water Flea, etc.).
function resolveViewer(testName: string) {
  switch (testName.trim().toUpperCase()) {
    case "MTT":
      return MTTDataViewer;
    case "ROS":
      return ROSDataViewer;
    case "SIMS":
      return SIMSDataViewer;
    default:
      return null;
  }
}

/* -------------- Protocol file (read-only, browse view) ----------- */
// Browsing is read-only. Clicking "View SOP" opens the PDF in the right
// pane (same place test data opens). The download link opens it in a new
// tab, where the browser's PDF viewer has print/save controls.
const ProtocolFile: FC<{
  protocol: TreeProtocol;
  onView: (protocolId: number, name: string) => void;
  isViewing: boolean;
}> = ({ protocol, onView, isViewing }) => {
  if (!protocol.has_file) {
    return <div className="ml-6 mb-1 text-xs text-slate-400">No Protocol attached</div>;
  }

  const fileUrl = `${api.defaults.baseURL}/protocols/${protocol.id}/file`;
  const isPdf =
    protocol.file_mime === "application/pdf" ||
    (protocol.file_name?.toLowerCase().endsWith(".pdf") ?? false);

  return (
    <div className="ml-6 mb-1 text-xs flex items-center gap-3 flex-wrap">
      {isPdf && (
        <button
          onClick={() => onView(protocol.id, protocol.file_name ?? "SOP")}
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
            isViewing
              ? "bg-blue-600 text-white"
              : "text-blue-600 hover:bg-blue-50"
          }`}
        >
          <Eye className="h-3.5 w-3.5" /> View Protocol
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
    </div>
  );
};

/* ============================ Component ============================ */
const TestNavigationTree: FC = () => {
  const [tree, setTree] = useState<TreeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [openCategories, setOpenCategories] = useState<Set<number>>(new Set());
  const [openProtocols, setOpenProtocols] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Selection>(null);

  const fetchTree = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const res = await api.get(`/tree`, signal ? { signal } : undefined);
      if (res.status !== 200) throw new Error("Bad response");
      setTree(res.data ?? []);
      setError("");
    } catch (err: any) {
      if (err.name !== "CanceledError" && err.name !== "AbortError") {
        setError("Failed to load the navigation tree.");
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

  const toggleProtocol = useCallback((id: number) => {
    setOpenProtocols((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const isSelected = (t: TreeTest) =>
    selected?.kind === "test" &&
    selected.work_package === t.work_package_name &&
    selected.element === t.element_cms_id &&
    selected.test === t.test_name;

  const viewPdf = useCallback((protocolId: number, name: string) => {
    setSelected({ kind: "pdf", protocolId, name });
  }, []);

  const SelectedViewer =
    selected?.kind === "test" ? resolveViewer(selected.test) : null;

  return (
    <div className="bg-gray-50 min-h-screen text-black">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* ----------------------- Sidebar tree ----------------------- */}
          <aside className="bg-white rounded-lg shadow-md p-4 h-fit lg:sticky lg:top-8">
            <h2 className="text-xl font-bold text-blue-800 mb-4">Test Library</h2>

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
                        <ul className="ml-4 mt-1 space-y-1 border-l border-slate-200 pl-2">
                          {cat.protocols.length === 0 && (
                            <li className="text-slate-400 text-xs px-2 py-1">
                              No protocols
                            </li>
                          )}
                          {cat.protocols.map((proto) => {
                            const protoOpen = openProtocols.has(proto.id);
                            return (
                              <li key={proto.id}>
                                <button
                                  onClick={() => toggleProtocol(proto.id)}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-slate-700 hover:bg-blue-50 transition-colors"
                                  aria-expanded={protoOpen}
                                  title={proto.description ?? undefined}
                                >
                                  {protoOpen ? (
                                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                                  )}
                                  {protoOpen ? (
                                    <FolderOpen className="h-4 w-4 shrink-0 text-slate-500" />
                                  ) : (
                                    <Folder className="h-4 w-4 shrink-0 text-slate-500" />
                                  )}
                                  <span className="truncate text-sm">{proto.name}</span>
                                </button>

                                {protoOpen && (
                                  <>
                                    <ProtocolFile
                                      protocol={proto}
                                      onView={viewPdf}
                                      isViewing={
                                        selected?.kind === "pdf" &&
                                        selected.protocolId === proto.id
                                      }
                                    />
                                    <ul className="ml-4 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
                                      {proto.tests.length === 0 && (
                                        <li className="text-slate-400 text-xs px-2 py-1">
                                          No tests
                                        </li>
                                      )}
                                      {proto.tests.map((t) => (
                                        <li key={t.id}>
                                          <button
                                            onClick={() =>
                                              setSelected({
                                                kind: "test",
                                                work_package: t.work_package_name,
                                                element: t.element_cms_id,
                                                test: t.test_name,
                                              })
                                            }
                                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors ${
                                              isSelected(t)
                                                ? "bg-blue-600 text-white shadow-sm"
                                                : "text-slate-600 hover:bg-blue-50"
                                            }`}
                                          >
                                            <FileText
                                              className={`h-4 w-4 shrink-0 ${
                                                isSelected(t)
                                                  ? "text-white"
                                                  : "text-slate-400"
                                              }`}
                                            />
                                            <span className="truncate">{t.display_name ?? t.test_name}</span>
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  </>
                                )}
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

          {/* ----------------------- Viewer pane ----------------------- */}
          <main className="min-w-0">
            {!selected && (
              <div className="bg-white rounded-lg shadow-md p-12 text-center">
                <Folder className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500">
                  Select a test or protocol from the library to view it.
                </p>
              </div>
            )}

            {/* PDF protocol view */}
            {selected?.kind === "pdf" && (
              <div className="bg-white rounded-lg shadow-md p-4">
                <div className="flex items-center justify-between mb-3 gap-3">
                  <h2 className="text-lg font-semibold text-blue-800 truncate">
                    {selected.name}
                  </h2>
                  <a
                    href={`${api.defaults.baseURL}/protocols/${selected.protocolId}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 shrink-0 bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
                  >
                    <FileDown className="h-4 w-4" /> Open / Print
                  </a>
                </div>
                <object
                  data={`${api.defaults.baseURL}/protocols/${selected.protocolId}/file`}
                  type="application/pdf"
                  className="w-full rounded-md border border-slate-300"
                  style={{ height: "80vh" }}
                >
                  <div className="p-6 text-center text-slate-600">
                    Your browser can&apos;t display this PDF inline.{" "}
                    <a
                      href={`${api.defaults.baseURL}/protocols/${selected.protocolId}/file`}
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

            {/* Test data viewer */}
            {selected?.kind === "test" && SelectedViewer && (
              <SelectedViewer
                key={`${selected.work_package}-${selected.element}-${selected.test}`}
                work_package={selected.work_package}
                element={selected.element}
                test={selected.test}
              />
            )}

            {selected?.kind === "test" && !SelectedViewer && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6">
                <p className="text-yellow-800">
                  No viewer is registered for test type{" "}
                  <span className="font-semibold">{selected.test}</span>. Add it to{" "}
                  <code className="text-sm">resolveViewer()</code>.
                </p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default TestNavigationTree;