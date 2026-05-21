"use client";
import React, { FC, useEffect, useState, useMemo } from "react";
import { api } from "@/lib/axios";
import {
  Download,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/* ================================================================== */
/* Types                                                              */
/* ================================================================== */
interface PageProps {
  work_package: string;
  element: string;
  test: string;
  file?: string;
}

interface Scientist {
  name?: string | null;
  email?: string | null;
}

interface WorkPackageData {
  wp_name?: string | null;
  partner?: string | null;
  laboratory_name?: string | null;
  full_test_name?: string | null;
  oecd_iso_ref?: string | null;
  test_type?: string | null;
  endpoint?: string | null;
  endpoint_outcome?: string | null;
  sop?: string | null;
  test_start_date?: string | null;
  test_end_date?: string | null;
  lead_scientists?: Scientist[];
  assay_scientists?: Scientist[];
}

interface MaterialData {
  material_identifier?: string | null;
  erm_id?: string | null;
  material_name?: string | null;
  core_chemistry?: string | null;
  cas_for_core?: string | null;
  material_supplier?: string | null;
  material_state?: string | null;
  batch?: string | null;
  vial?: string | null;
  preparation_date?: string | null;
  stock_concentration?: string | null;
  molecular_weight?: string | null;
  particles_in_stock?: string | null;
}

interface ApplicationData {
  start_rotifers_per_well?: number | null;
  total_volume_per_replicate_ml?: number | null;
  concentrations_tested?: number[];
  concentration_unit?: string | null;
  replicates_per_concentration?: number | null;
}

interface TestConditionsData {
  test_medium?: string[];
  light_cycle?: string | null;
  light_intensity?: string | null;
  illumination_direction?: string | null;
  temperature?: string | null;
  aeration?: string | null;
  salinity_ppt?: number | null;
  total_incubation_time_h?: number | null;
}

interface AnalysisData {
  type_of_measurement?: string | null;
  measurement_device?: string | null;
  timepoints_h?: number[];
}

interface ReplicationMeta {
  test_identifier_number?: string | null;
  test_start_date?: string | null;
  test_end_date?: string | null;
  replicates_per_concentration?: number | null;
  no_of_concentrations?: number | null;
}

interface ParserWarning {
  type?: string;
  value?: string;
  message?: string;
}

interface TestDetails {
  work_package?: WorkPackageData;
  material?: MaterialData;
  application?: ApplicationData;
  test_conditions?: TestConditionsData;
  analysis?: AnalysisData;
  replications?: ReplicationMeta[];
  parser_warnings?: ParserWarning[];
}

interface RotifierRawRow {
  toxicant?: string | null;
  time_label?: string | null;
  wells?: Record<string, string>;
  wells_numeric?: Record<string, number | null>;
  well_total?: number | null;
  mean_dead?: number | null;
}

interface RotifierRawBlock {
  run_label?: string;
  raw_sheet_name?: string;
  toxicant_tested?: string | null;
  well_headers?: string[];
  rows?: RotifierRawRow[];
}

interface RotifierProcessedBlock {
  title?: string | null;
  section_label?: string | null;
  column_headers?: string[];
  rows?: { time_label?: string; values?: Record<string, any> }[];
}

interface RotifierProcessed {
  available: boolean;
  toxicant_tested?: string | null;
  absolute_mortality?: RotifierProcessedBlock | null;
  relative_mortality_percent?: RotifierProcessedBlock | null;
}

interface AcceptanceItem {
  label?: string | null;
  detail?: string | null;
  result?: string | null;
}

interface StatisticTextItem {
  label?: string | null;
  lines?: string[];
}

interface EcValue {
  name: string;
  description?: string | null;
  value?: string | null;
}

interface ReachClassification {
  title?: string | null;
  category?: string | null;
  ec_threshold_label?: string | null;
  ec_threshold_value?: string | null;
  hazardous_label?: string | null;
  hazardous_value?: string | null;
}

interface MortalityTable {
  section_label?: string | null;
  time_column?: string;
  column_headers?: string[];
  rows?: { time_h?: number; values?: Record<string, any> }[];
}

interface RotifierFinal {
  available: boolean;
  section_label?: string | null;
  mortality_table?: MortalityTable;
  validity?: AcceptanceItem | null;
  statistic_text?: StatisticTextItem | null;
  ec_values?: EcValue[];
  reach_classification?: ReachClassification | null;
}

interface RotifierData {
  test_details: TestDetails;
  /** New API shape */
  raw_data?: RotifierRawBlock[];
  /** Old API shape (fallback) */
  replications?: RotifierRawBlock[];
  processed_data: RotifierProcessed;
  final_results: RotifierFinal;
}

type TabKey = "test-conditions" | "raw-data" | "processed-data" | "results";

const TABS: { key: TabKey; label: string }[] = [
  { key: "test-conditions", label: "Test Conditions" },
  { key: "raw-data", label: "Raw Data" },
  { key: "processed-data", label: "Processed Data" },
  { key: "results", label: "Final Results" },
];

/* ================================================================== */
/* Utilities                                                          */
/* ================================================================== */
const COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

const degC = (s?: string | null) => (s ?? "").replace(/oC/g, "°C");
const dotComma = (s?: string | null) =>
  s == null ? "" : String(s).replace(/,/g, ".");

const fmt = (v: any, d = 2): string => {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(d);
  }
  return String(v);
};

const csvEsc = (v: string) => `"${v.replace(/"/g, '""')}"`;

function downloadTableCSV(tableId: string, fileName: string) {
  const t = document.getElementById(tableId);
  if (!t) return;
  let csv = "data:text/csv;charset=utf-8,";
  t.querySelectorAll("tr").forEach((r) => {
    csv +=
      Array.from(r.querySelectorAll("th,td"))
        .map((c) => csvEsc(c.textContent ?? ""))
        .join(",") + "\r\n";
  });
  const a = document.createElement("a");
  a.href = encodeURI(csv);
  a.download = `${fileName}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ================================================================== */
/* Reusable components                                                */
/* ================================================================== */
const CollapsibleSection: FC<{
  title: string;
  open?: boolean;
  children: React.ReactNode;
}> = ({ title, open = true, children }) => {
  const [isOpen, setIsOpen] = useState(open);
  return (
    <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition"
        onClick={() => setIsOpen((p) => !p)}
      >
        <h2 className="text-xl font-bold text-blue-800">{title}</h2>
        {isOpen ? (
          <ChevronUp className="text-gray-400" size={20} />
        ) : (
          <ChevronDown className="text-gray-400" size={20} />
        )}
      </button>
      {isOpen && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
};

const KVTable: FC<{
  id: string;
  rows: { label: string; value: React.ReactNode }[];
  dl?: string;
}> = ({ id, rows, dl }) => {
  const visible = rows.filter(
    (r) =>
      r.value !== null &&
      r.value !== undefined &&
      r.value !== "" &&
      r.value !== "None",
  );
  if (visible.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">No data available.</p>
    );
  }
  return (
    <>
      {dl && (
        <div className="flex justify-end mb-3">
          <button
            type="button"
            onClick={() => downloadTableCSV(id, dl)}
            className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"
          >
            <Download size={14} />
            <span>Download</span>
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table id={id} className="min-w-full bg-white border border-gray-200">
          <thead>
            <tr className="bg-gray-100">
              <th className="py-2 px-4 border text-left">Property</th>
              <th className="py-2 px-4 border text-left">Value</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                <td className="py-2 px-4 border font-medium">{r.label}</td>
                <td className="py-2 px-4 border">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

const AcceptanceBadge: FC<{ result?: string | null }> = ({ result }) => {
  if (!result) return null;
  const upper = result.trim().toUpperCase();
  const passed =
    upper === "PASSED" ||
    upper === "YES" ||
    upper === "Y" ||
    upper === "TRUE";
  const failed =
    upper === "FAILED" || upper === "NO" || upper === "N" || upper === "FALSE";
  if (passed) {
    return (
      <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-1 rounded-full">
        <CheckCircle size={14} /> {result}
      </span>
    );
  }
  if (failed) {
    return (
      <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 text-xs font-semibold px-2.5 py-1 rounded-full">
        <XCircle size={14} /> {result}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs font-semibold px-2.5 py-1 rounded-full">
      {result}
    </span>
  );
};

const AcceptanceBanner: FC<{
  label?: string | null;
  detail?: string | null;
  result?: string | null;
}> = ({ label, detail, result }) => {
  if (!result) return null;
  const upper = result.trim().toUpperCase();
  const passed =
    upper === "PASSED" ||
    upper === "YES" ||
    upper === "Y" ||
    upper === "TRUE";
  return (
    <div
      className={`my-4 p-4 rounded-md border ${
        passed
          ? "bg-green-50 border-green-300"
          : "bg-red-50 border-red-300"
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {passed ? (
          <CheckCircle size={20} className="text-green-600" />
        ) : (
          <XCircle size={20} className="text-red-600" />
        )}
        <span
          className={`font-semibold ${
            passed ? "text-green-800" : "text-red-800"
          }`}
        >
          {label ?? "Acceptance criteria"}: {result}
        </span>
      </div>
      {detail && (
        <p className="mt-1 text-sm text-gray-700 italic">{detail}</p>
      )}
    </div>
  );
};

/* ================================================================== */
/* Main component                                                     */
/* ================================================================== */
const RotifierDataViewer: FC<PageProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<RotifierData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("test-conditions");
  const [rawRunIdx, setRawRunIdx] = useState(0);
  const [procMetric, setProcMetric] = useState<"absolute" | "relative">(
    "relative",
  );

  /* -------------- Fetch -------------- */
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        const res = await api.post(
          `/tests/listings`,
          {
            work_package_name: work_package,
            element_cms_id: element,
            test_name: test,
          },
          { signal: ac.signal },
        );
        if (res.status !== 200) throw new Error("Bad");
        setData(res.data);
      } catch (err: any) {
        if (err.name !== "CanceledError" && err.name !== "AbortError") {
          setError("Failed to load Rotifier data.");
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [work_package, element, test]);

  /* -------------- Safe accessors -------------- */
  const safeRawBlocks = useMemo(
    () => (data?.raw_data ?? data?.replications ?? []) as RotifierRawBlock[],
    [data?.raw_data, data?.replications],
  );

  const td = data?.test_details ?? {};
  const wp = td.work_package ?? {};
  const mat = td.material ?? {};
  const app = td.application ?? {};
  const tc = td.test_conditions ?? {};
  const an = td.analysis ?? {};
  const reps = td.replications ?? [];
  const warnings = td.parser_warnings ?? [];

  const proc = data?.processed_data ?? { available: false };
  const fr = data?.final_results ?? { available: false };
  const concUnit = app.concentration_unit ?? "mg·l⁻¹";

  /* -------------- Chart builders -------------- */
  const rawChartData = useMemo(() => {
    if (!safeRawBlocks.length) return [];
    const blk = safeRawBlocks[rawRunIdx];
    if (!blk?.rows?.length) return [];
    // Group rows by toxicant; produce two series (24 h, 48 h)
    const tox: Record<string, Record<string, number | null>> = {};
    for (const r of blk.rows) {
      const t = r.toxicant ?? "?";
      tox[t] ??= {};
      tox[t][r.time_label ?? "?"] = r.mean_dead ?? null;
    }
    return Object.entries(tox).map(([toxicant, byTime]) => ({
      toxicant,
      ...byTime,
    }));
  }, [safeRawBlocks, rawRunIdx]);

  const procActiveBlock: RotifierProcessedBlock | null = useMemo(() => {
    if (!proc.available) return null;
    return procMetric === "absolute"
      ? proc.absolute_mortality ?? null
      : proc.relative_mortality_percent ?? null;
  }, [proc, procMetric]);

  const finalChartData = useMemo(() => {
    const mt = fr.mortality_table;
    if (!mt?.rows?.length || !mt.column_headers?.length) return [];
    return mt.column_headers.map((h) => {
      const point: any = { group: dotComma(h) };
      for (const row of mt.rows ?? []) {
        const v = row.values?.[h];
        const numeric = typeof v === "number" ? v : Number(v);
        point[`${row.time_h ?? "?"} h`] = Number.isFinite(numeric)
          ? numeric
          : null;
      }
      return point;
    });
  }, [fr.mortality_table]);

  const finalTimeLabels = useMemo(() => {
    const mt = fr.mortality_table;
    if (!mt?.rows) return [];
    return mt.rows
      .map((r) => (r.time_h != null ? `${r.time_h} h` : null))
      .filter(Boolean) as string[];
  }, [fr.mortality_table]);

  /* -------------- Loading / error -------------- */
  if (loading) {
    return (
      <div className="bg-white flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>{error || "No data."}</p>
        </div>
      </div>
    );
  }

  /* -------------- Render -------------- */
  return (
    <div className="bg-gray-50 min-h-screen py-8 text-black">
      <div className="container mx-auto px-4">
        {/* ===== HEADER ===== */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-4">
            Rotifer Toxicity Test Data Report
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Parameters</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2">
                  <span className="font-semibold">Work Package:</span>{" "}
                  {wp.wp_name}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">CMS Identifier:</span>{" "}
                  {mat.material_identifier}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Partner:</span> {wp.partner}
                </p>
                <p>
                  <span className="font-semibold">Material:</span>{" "}
                  {mat.material_name}
                </p>
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Information</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2">
                  <span className="font-semibold">Full Name:</span>{" "}
                  {wp.full_test_name}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Test Type:</span>{" "}
                  {wp.test_type}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Endpoint:</span>{" "}
                  {wp.endpoint}
                </p>
                <p>
                  <span className="font-semibold">Metric:</span>{" "}
                  {wp.endpoint_outcome}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ===== TABS ===== */}
        <div className="w-full mb-8">
          <ul
            className="relative flex flex-wrap p-1.5 list-none rounded-md bg-slate-100"
            role="tablist"
          >
            {TABS.map((tab) => (
              <li
                key={tab.key}
                className="z-30 flex-auto text-center"
                role="presentation"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  className={`z-30 w-full px-0 py-2 text-sm mb-0 transition-all rounded-md ${
                    activeTab === tab.key
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* ============================================================= */}
        {/* TEST CONDITIONS                                                */}
        {/* ============================================================= */}
        {activeTab === "test-conditions" && (
          <>
            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-md p-4 mb-6 flex items-start gap-3">
                <AlertTriangle
                  size={20}
                  className="text-yellow-700 mt-0.5 shrink-0"
                />
                <div>
                  <p className="font-semibold text-yellow-800 mb-1">
                    Parser warnings ({warnings.length})
                  </p>
                  <ul className="text-sm text-yellow-700 list-disc list-inside">
                    {warnings.map((w, i) => (
                      <li key={i}>
                        <span className="font-medium">{w.type}:</span>{" "}
                        {w.message}
                        {w.value ? ` (value: ${w.value})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <CollapsibleSection title="Material Information">
              <KVTable
                id="matTbl"
                dl="Rotifier_Material"
                rows={[
                  {
                    label: "CMS Identifier",
                    value: mat.material_identifier,
                  },
                  { label: "ERM Identifier", value: mat.erm_id },
                  { label: "Material Name", value: mat.material_name },
                  { label: "Core Chemistry", value: mat.core_chemistry },
                  { label: "CAS for Core", value: mat.cas_for_core },
                  {
                    label: "Material Supplier",
                    value: mat.material_supplier,
                  },
                  { label: "Material State", value: mat.material_state },
                  { label: "Batch", value: mat.batch },
                  { label: "Vial", value: mat.vial },
                  {
                    label: "Preparation Date",
                    value: mat.preparation_date,
                  },
                  {
                    label: "Stock Concentration",
                    value: mat.stock_concentration,
                  },
                  {
                    label: "Molecular Weight",
                    value: mat.molecular_weight,
                  },
                  {
                    label: "Particles in Stock",
                    value: mat.particles_in_stock,
                  },
                ]}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Application">
              <KVTable
                id="appTbl"
                dl="Rotifier_Application"
                rows={[
                  {
                    label: "Start number of rotifers per well",
                    value: app.start_rotifers_per_well,
                  },
                  {
                    label: "Total volume per replicate (ml)",
                    value: app.total_volume_per_replicate_ml,
                  },
                  {
                    label: `Concentrations tested (${concUnit})`,
                    value:
                      app.concentrations_tested?.length
                        ? app.concentrations_tested
                            .map((c) => fmt(c, 3))
                            .join(", ")
                        : null,
                  },
                  {
                    label: "Replicates per concentration",
                    value: app.replicates_per_concentration,
                  },
                ]}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Test Conditions">
              <KVTable
                id="tcTbl"
                dl="Rotifier_TestConditions"
                rows={[
                  {
                    label: "Test medium",
                    value: tc.test_medium?.length ? (
                      <ul className="list-disc list-inside">
                        {tc.test_medium.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    ) : null,
                  },
                  { label: "Light cycle (h)", value: tc.light_cycle },
                  {
                    label: "Light intensity (lux)",
                    value: tc.light_intensity,
                  },
                  {
                    label: "Illumination direction",
                    value: tc.illumination_direction,
                  },
                  {
                    label: "Temperature (°C)",
                    value: degC(tc.temperature ?? ""),
                  },
                  { label: "Aeration", value: tc.aeration },
                  { label: "Salinity (ppt)", value: tc.salinity_ppt },
                  {
                    label: "Total incubation time (h)",
                    value: tc.total_incubation_time_h,
                  },
                ]}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Analysis">
              <KVTable
                id="anTbl"
                dl="Rotifier_Analysis"
                rows={[
                  {
                    label: "Type of measurement",
                    value: an.type_of_measurement,
                  },
                  {
                    label: "Measurement device",
                    value: an.measurement_device,
                  },
                  {
                    label: "Timepoints (h)",
                    value: an.timepoints_h?.length
                      ? an.timepoints_h.join(", ")
                      : null,
                  },
                ]}
              />
            </CollapsibleSection>

            {reps.length > 0 && (
              <CollapsibleSection title="Replication Metadata">
                <div className="overflow-x-auto">
                  <table
                    id="repTbl"
                    className="min-w-full bg-white border border-gray-200 text-sm"
                  >
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-3 border text-left">
                          Test Identifier
                        </th>
                        <th className="py-2 px-3 border text-left">
                          Start Date
                        </th>
                        <th className="py-2 px-3 border text-left">
                          End Date
                        </th>
                        <th className="py-2 px-3 border text-right">
                          Replicates / conc.
                        </th>
                        <th className="py-2 px-3 border text-right">
                          # Concentrations
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {reps.map((r, i) => (
                        <tr
                          key={i}
                          className={i % 2 === 0 ? "bg-gray-50" : ""}
                        >
                          <td className="py-2 px-3 border font-medium">
                            {r.test_identifier_number}
                          </td>
                          <td className="py-2 px-3 border">
                            {r.test_start_date}
                          </td>
                          <td className="py-2 px-3 border">
                            {r.test_end_date}
                          </td>
                          <td className="py-2 px-3 border text-right">
                            {r.replicates_per_concentration}
                          </td>
                          <td className="py-2 px-3 border text-right">
                            {r.no_of_concentrations}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CollapsibleSection>
            )}

            <CollapsibleSection title="Scientists Information">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-blue-50 p-4 rounded-md">
                  <h3 className="font-semibold mb-2">Lead Scientist</h3>
                  {(wp.lead_scientists ?? []).length === 0 && (
                    <p className="text-sm text-gray-500 italic">
                      Not provided
                    </p>
                  )}
                  {(wp.lead_scientists ?? []).map((s, i) => (
                    <div key={i} className="mb-1 text-sm">
                      <span className="font-medium">{s.name}</span>
                      {s.email && (
                        <span className="text-gray-600"> · {s.email}</span>
                      )}
                    </div>
                  ))}
                  <div className="mt-3 text-sm">
                    <span className="font-medium">Laboratory:</span>{" "}
                    {wp.laboratory_name}
                  </div>
                </div>
                <div className="bg-blue-50 p-4 rounded-md">
                  <h3 className="font-semibold mb-2">Assay Conducted By</h3>
                  {(wp.assay_scientists ?? []).length === 0 && (
                    <p className="text-sm text-gray-500 italic">
                      Not provided
                    </p>
                  )}
                  {(wp.assay_scientists ?? []).map((s, i) => (
                    <div key={i} className="mb-1 text-sm">
                      <span className="font-medium">{s.name}</span>
                      {s.email && (
                        <span className="text-gray-600"> · {s.email}</span>
                      )}
                    </div>
                  ))}
                  <div className="mt-3 text-sm">
                    <span className="font-medium">SOP:</span> {wp.sop}
                  </div>
                  {wp.oecd_iso_ref && (
                    <div className="mt-1 text-sm">
                      <span className="font-medium">OECD/ISO:</span>{" "}
                      {wp.oecd_iso_ref}
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleSection>
          </>
        )}

        {/* ============================================================= */}
        {/* RAW DATA                                                       */}
        {/* ============================================================= */}
        {activeTab === "raw-data" &&
          safeRawBlocks.length > 0 &&
          (() => {
            const blk = safeRawBlocks[rawRunIdx];
            const wellHeaders = blk.well_headers ?? [];
            const rows = blk.rows ?? [];
            const timeLabels = Array.from(
              new Set(rows.map((r) => r.time_label).filter(Boolean)),
            ) as string[];
            return (
              <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
                  <h2 className="text-xl font-bold text-blue-800">
                    Raw Data — Deceased Rotifers per Well
                  </h2>
                  <div className="flex items-center gap-3">
                    {safeRawBlocks.length > 1 && (
                      <select
                        value={rawRunIdx}
                        onChange={(e) => setRawRunIdx(Number(e.target.value))}
                        className="bg-gray-50 border border-gray-300 text-sm rounded-lg p-2"
                      >
                        {safeRawBlocks.map((b, i) => (
                          <option key={i} value={i}>
                            {b.run_label ?? `Run ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        downloadTableCSV(
                          "rawTbl",
                          `Rotifier_Raw_${blk.run_label ?? "R1"}`,
                        )
                      }
                      className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"
                    >
                      <Download size={14} />
                      <span>Download</span>
                    </button>
                  </div>
                </div>

                {blk.toxicant_tested && (
                  <p className="text-sm text-gray-700 mb-3">
                    <span className="font-semibold">Toxicant tested:</span>{" "}
                    {blk.toxicant_tested}
                  </p>
                )}

                <div className="overflow-x-auto mb-6">
                  <table
                    id="rawTbl"
                    className="min-w-full bg-white border border-gray-200 text-sm"
                  >
                    <thead>
                      <tr className="bg-gray-200">
                        <th
                          className="py-2 px-3 border text-left"
                          colSpan={2}
                        >
                          Toxicant / Time
                        </th>
                        <th
                          className="py-2 px-3 border text-center"
                          colSpan={wellHeaders.length}
                        >
                          Deceased rotifers per well
                        </th>
                        <th className="py-2 px-3 border text-right">
                          Mean
                        </th>
                      </tr>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-3 border text-left">
                          Toxicant
                        </th>
                        <th className="py-2 px-3 border text-left">Time</th>
                        {wellHeaders.map((h, i) => (
                          <th
                            key={i}
                            className="py-2 px-3 border text-right"
                          >
                            {h}
                          </th>
                        ))}
                        <th className="py-2 px-3 border text-right">
                          dead/total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, ri) => {
                        const isControl =
                          (r.toxicant ?? "").toLowerCase() === "control";
                        // A new toxicant group starts whenever the current
                        // row's toxicant differs from the previous row's.
                        const prevTox = ri > 0 ? rows[ri - 1].toxicant : null;
                        const isGroupStart = ri > 0 && r.toxicant !== prevTox;
                        // Heavy top border to visually separate each toxicant
                        // (24 h + 48 h rows stay grouped, next toxicant gets a
                        // bold rule above it).
                        const groupBorder = isGroupStart
                          ? "border-t-4 border-t-blue-700"
                          : "";
                        const rowBg = isControl
                          ? "bg-red-50"
                          : ri % 2 === 0
                            ? "bg-gray-50"
                            : "";
                        return (
                          <tr
                            key={ri}
                            className={`${rowBg} ${groupBorder}`.trim()}
                          >
                            <td className="py-2 px-3 border font-medium">
                              {r.toxicant}
                            </td>
                            <td className="py-2 px-3 border">
                              {r.time_label}
                            </td>
                            {wellHeaders.map((h, hi) => (
                              <td
                                key={hi}
                                className="py-2 px-3 border text-right font-mono"
                              >
                                {r.wells?.[h] ?? ""}
                              </td>
                            ))}
                            <td className="py-2 px-3 border text-right">
                              {r.mean_dead != null
                                ? `${fmt(r.mean_dead, 2)}/${r.well_total ?? "?"}`
                                : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Chart: mean dead rotifers per toxicant across timepoints */}
                {rawChartData.length > 0 && (
                  <div className="mb-2">
                    <h3 className="text-md font-semibold mb-3">
                      Mean Deceased Rotifers per Toxicant
                    </h3>
                    <ResponsiveContainer width="100%" height={360}>
                      <BarChart
                        data={rawChartData}
                        margin={{ top: 15, right: 30, left: 20, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="toxicant"
                          angle={-25}
                          textAnchor="end"
                          height={70}
                          interval={0}
                        />
                        <YAxis
                          label={{
                            value: "Mean Dead Rotifers",
                            angle: -90,
                            position: "insideLeft",
                          }}
                        />
                        <Tooltip />
                        <Legend />
                        {timeLabels.map((tl, i) => (
                          <Bar
                            key={tl}
                            dataKey={tl}
                            fill={COLORS[i % COLORS.length]}
                            name={tl}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            );
          })()}

        {activeTab === "raw-data" && safeRawBlocks.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <p className="text-gray-500 italic">No raw data available.</p>
          </div>
        )}

        {/* ============================================================= */}
        {/* PROCESSED DATA                                                 */}
        {/* ============================================================= */}
        {activeTab === "processed-data" && (
          <>
            {!proc.available && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                <p className="text-gray-500 italic">
                  No processed data available.
                </p>
              </div>
            )}
            {proc.available && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
                  <h2 className="text-xl font-bold text-blue-800">
                    Processed Mortality
                  </h2>
                  <div className="flex items-center gap-3">
                    <select
                      value={procMetric}
                      onChange={(e) =>
                        setProcMetric(
                          e.target.value as "absolute" | "relative",
                        )
                      }
                      className="bg-gray-50 border border-gray-300 text-sm rounded-lg p-2"
                    >
                      <option value="absolute">Absolute mortality</option>
                      <option value="relative">
                        Relative mortality (%)
                      </option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        downloadTableCSV(
                          "procTbl",
                          `Rotifier_Proc_${procMetric}`,
                        )
                      }
                      className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"
                    >
                      <Download size={14} />
                      <span>Download</span>
                    </button>
                  </div>
                </div>

                {proc.toxicant_tested && (
                  <p className="text-sm text-gray-700 mb-2">
                    <span className="font-semibold">Toxicant tested:</span>{" "}
                    {proc.toxicant_tested}
                  </p>
                )}
                {procActiveBlock?.section_label && (
                  <p className="text-sm text-gray-700 mb-3">
                    <span className="font-semibold">Section:</span>{" "}
                    {procActiveBlock.section_label}
                  </p>
                )}

                <div className="overflow-x-auto mb-6">
                  <table
                    id="procTbl"
                    className="min-w-full bg-white border border-gray-200 text-sm"
                  >
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-3 border text-left">
                          Time
                        </th>
                        {(procActiveBlock?.column_headers ?? []).map(
                          (h, i) => (
                            <th
                              key={i}
                              className="py-2 px-3 border text-right"
                            >
                              {dotComma(h)}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {(procActiveBlock?.rows ?? []).map((row, ri) => (
                        <tr
                          key={ri}
                          className={ri % 2 === 0 ? "bg-gray-50" : ""}
                        >
                          <td className="py-2 px-3 border font-medium">
                            {row.time_label}
                          </td>
                          {(procActiveBlock?.column_headers ?? []).map(
                            (h, hi) => {
                              const v = row.values?.[h];
                              return (
                                <td
                                  key={hi}
                                  className="py-2 px-3 border text-right"
                                >
                                  {procMetric === "relative" &&
                                  typeof v === "number"
                                    ? `${fmt(v, 2)}%`
                                    : v == null
                                      ? ""
                                      : String(v)}
                                </td>
                              );
                            },
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ============================================================= */}
        {/* FINAL RESULTS                                                  */}
        {/* ============================================================= */}
        {activeTab === "results" && (
          <>
            {!fr.available && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                <p className="text-gray-500 italic">
                  No final results available.
                </p>
              </div>
            )}
            {fr.available && (
              <>
                {/* Mortality table + chart */}
                <CollapsibleSection title="Mortality Results (%)">
                  <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                    {fr.section_label && (
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Section:</span>{" "}
                        {fr.section_label}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        downloadTableCSV("frTbl", "Rotifier_FinalMortality")
                      }
                      className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"
                    >
                      <Download size={14} />
                      <span>Download</span>
                    </button>
                  </div>
                  <div className="overflow-x-auto mb-6">
                    <table
                      id="frTbl"
                      className="min-w-full bg-white border border-gray-200 text-sm"
                    >
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="py-2 px-3 border text-left">
                            {fr.mortality_table?.time_column ?? "Time (h)"}
                          </th>
                          {(fr.mortality_table?.column_headers ?? []).map(
                            (h, i) => (
                              <th
                                key={i}
                                className="py-2 px-3 border text-right"
                              >
                                {dotComma(h)}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {(fr.mortality_table?.rows ?? []).map((row, ri) => (
                          <tr
                            key={ri}
                            className={ri % 2 === 0 ? "bg-gray-50" : ""}
                          >
                            <td className="py-2 px-3 border font-medium">
                              {row.time_h}
                            </td>
                            {(fr.mortality_table?.column_headers ?? []).map(
                              (h, hi) => {
                                const v = row.values?.[h];
                                return (
                                  <td
                                    key={hi}
                                    className="py-2 px-3 border text-right"
                                  >
                                    {typeof v === "number"
                                      ? `${fmt(v, 2)}%`
                                      : v == null
                                        ? ""
                                        : String(v)}
                                  </td>
                                );
                              },
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {finalChartData.length > 0 && finalTimeLabels.length > 0 && (
                    <div>
                      <h3 className="text-md font-semibold mb-3">
                        Mortality (%) by Concentration
                      </h3>
                      <ResponsiveContainer width="100%" height={360}>
                        <BarChart
                          data={finalChartData}
                          margin={{
                            top: 15,
                            right: 30,
                            left: 20,
                            bottom: 40,
                          }}
                          barCategoryGap="20%"
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="group"
                            angle={-25}
                            textAnchor="end"
                            height={70}
                            interval={0}
                            label={{
                              value: `Concentration (${concUnit})`,
                              position: "insideBottom",
                              offset: -10,
                            }}
                          />
                          <YAxis
                            label={{
                              value: "Mortality (%)",
                              angle: -90,
                              position: "insideLeft",
                            }}
                          />
                          <Tooltip />
                          <Legend />
                          {finalTimeLabels.map((tl, i) => (
                            <Bar
                              key={tl}
                              dataKey={tl}
                              fill={COLORS[i % COLORS.length]}
                              name={tl}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CollapsibleSection>

                {/* Validity */}
                {fr.validity && (
                  <CollapsibleSection title="Validity of the Test">
                    <AcceptanceBanner
                      label={fr.validity.label}
                      detail={fr.validity.detail}
                      result={fr.validity.result}
                    />
                  </CollapsibleSection>
                )}

                {/* Statistic analysis text */}
                {fr.statistic_text &&
                  (fr.statistic_text.lines ?? []).length > 0 && (
                    <CollapsibleSection title={fr.statistic_text.label ?? "Statistical Analysis"}>
                      <div className="bg-blue-50 p-4 rounded-md">
                        {(fr.statistic_text.lines ?? []).map((line, i) => (
                          <p key={i} className="mb-1 text-sm">
                            {line}
                          </p>
                        ))}
                      </div>
                    </CollapsibleSection>
                  )}

                {/* EC values */}
                {(fr.ec_values ?? []).length > 0 && (
                  <CollapsibleSection title="Effective Concentrations (EC)">
                    <div className="overflow-x-auto">
                      <table
                        id="ecTbl"
                        className="min-w-full bg-white border border-gray-200 text-sm"
                      >
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="py-2 px-3 border text-left">
                              Name
                            </th>
                            <th className="py-2 px-3 border text-left">
                              Description
                            </th>
                            <th className="py-2 px-3 border text-left">
                              Value
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(fr.ec_values ?? []).map((ec, i) => (
                            <tr
                              key={i}
                              className={i % 2 === 0 ? "bg-gray-50" : ""}
                            >
                              <td className="py-2 px-3 border font-semibold text-blue-800">
                                {ec.name}
                              </td>
                              <td className="py-2 px-3 border text-gray-700">
                                {ec.description}
                              </td>
                              <td className="py-2 px-3 border font-mono">
                                {ec.value}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CollapsibleSection>
                )}

                {/* REACH classification */}
                {fr.reach_classification && (
                  <CollapsibleSection
                    title={
                      fr.reach_classification.title ??
                      "REACH Classification"
                    }
                  >
                    <div className="bg-blue-50 p-4 rounded-md mb-4">
                      <p className="mb-2 text-sm">
                        <span className="font-semibold">Category:</span>{" "}
                        {fr.reach_classification.category}
                      </p>
                      {fr.reach_classification.ec_threshold_label && (
                        <p className="mb-2 text-sm">
                          <span className="font-semibold">
                            {fr.reach_classification.ec_threshold_label}:
                          </span>{" "}
                          {fr.reach_classification.ec_threshold_value}
                        </p>
                      )}
                      {fr.reach_classification.hazardous_label && (
                        <div className="flex items-center gap-2 mt-3">
                          <span className="font-semibold">
                            {fr.reach_classification.hazardous_label}
                          </span>
                          <AcceptanceBadge
                            result={
                              fr.reach_classification.hazardous_value ?? ""
                            }
                          />
                        </div>
                      )}
                    </div>
                  </CollapsibleSection>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default RotifierDataViewer;