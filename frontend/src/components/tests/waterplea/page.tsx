"use client";
import React, { FC, useEffect, useState, useMemo } from "react";
import { api } from "@/lib/axios";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import {
  Download,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

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

/* ------------------------------------------------------------------ types */
interface PageProps {
  work_package: string;
  element: string;
  test: string;
  file?: string;
}

interface Scientist {
  name?: string;
  email?: string;
}

interface WorkPackageData {
  wp_name?: string;
  partner?: string;
  test_facility?: string;
  full_test_name?: string;
  oecd_iso_ref?: string;
  test_type?: string;
  endpoint?: string;
  metric?: string;
  sop?: string;
  lead_scientists?: Scientist[];
  assay_scientists?: Scientist[];
}

interface MaterialData {
  material_identifier?: string;
  erm_id?: string;
  material_name?: string;
  core_chemistry?: string;
  cas_no?: string;
  cas_no_for_core?: string;
  material_supplier?: string;
  material_state?: string;
  batch?: string;
  vial?: string;
  preparation_date?: string;
  stock_concentration?: string;
  molecular_weight?: string;
  particles_stock?: string;
}

interface ApplicationData {
  start_daphnids_per_well?: number;
  total_volume_per_replicate_ml?: number;
  concentrations_tested?: number[];
  concentration_unit?: string;
  replicates_per_concentration?: number;
}

interface TestConditionsData {
  test_medium?: string[];
  light_cycle_h?: string;
  light_intensity_lux?: string;
  illumination_direction?: string;
  temperature_c?: string;
  aeration?: string;
  salinity_ppt?: number | string;
  total_incubation_time_h?: number | string;
}

interface AnalysisData {
  type_of_measurement?: string;
  measurement_device?: string;
  timepoints_h?: (number | string)[];
}

interface ReplicationMeta {
  test_start_date?: string;
  test_end_date?: string;
  replicates_per_concentration?: number;
}

interface WellObservation {
  concentration?: string;
  time?: string;
  well_1?: string;
  well_2?: string;
  well_3?: string;
  well_4?: string;
  total?: string;
  mortality_percent?: number;
}

interface RawDataBlock {
  toxicant?: string;
  well_headers?: string[];
  observations?: WellObservation[];
}

interface MortalityGrid {
  concentrations?: string[];
  timepoints_h?: (number | string)[];
  rows?: { time_h?: number | string; mortality_percent?: number[] }[];
}

interface FinalResults {
  mortality_grid?: MortalityGrid;
  validity?: string;
  validity_criteria?: string;
  significant_difference_to_control?: string;
  ec50?: string;
  ec50_description?: string;
  reach_classification?: string;
  reach_category?: string;
  reach_threshold_label?: string;
  reach_threshold_value?: string;
  hazardous?: string;
}

interface WaterFleaData {
  test_details: {
    work_package: WorkPackageData;
    material: MaterialData;
    application?: ApplicationData;
    test_conditions?: TestConditionsData;
    analysis?: AnalysisData;
    replications?: ReplicationMeta[];
    parser_warnings?: string[];
  };
  /** New API shape */
  raw_data?: RawDataBlock[];
  /** Old API shape (fallback) */
  replications?: RawDataBlock[];
  processed_data?: Record<string, unknown>;
  final_results: FinalResults;
}

const TABS = [
  { key: "test-conditions", label: "Test Conditions" },
  { key: "raw-data", label: "Raw Data" },
  { key: "results", label: "Final Results" },
];

/* -------------------------------------------------------------- utilities */
function downloadTableCSV(tableId: string, filename: string) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const rows = table.querySelectorAll("tr");
  let csv = "data:text/csv;charset=utf-8,";
  rows.forEach((row) => {
    const cells = row.querySelectorAll("th, td");
    csv +=
      Array.from(cells)
        .map((c) => `"${(c.textContent || "").replace(/"/g, '""')}"`)
        .join(",") + "\r\n";
  });
  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csv));
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const fmtDate = (d?: string) => {
  if (!d) return "—";
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString();
};

const isPassed = (v?: string) => !!v && /pass/i.test(v);

/* ------------------------------------------------------ shared components */
const AcceptanceBadge: FC<{ status?: string }> = ({ status }) => {
  if (!status) return <span>—</span>;
  const passed = isPassed(status);
  return (
    <span
      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${
        passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
      }`}
    >
      {passed ? <CheckCircle size={16} /> : <XCircle size={16} />}
      {status}
    </span>
  );
};

const CollapsibleSection: FC<{
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-lg shadow-md mb-8">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex justify-between items-center p-6 text-left"
      >
        <h2 className="text-xl font-bold text-blue-800">{title}</h2>
        {open ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
};

interface KVRow {
  label: string;
  value: React.ReactNode;
}
const KVTable: FC<{
  id: string;
  title: string;
  rows: KVRow[];
  download?: boolean;
}> = ({ id, title, rows, download = true }) => (
  <div className="bg-white rounded-lg shadow-md p-6 mb-8">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-xl font-bold text-blue-800">{title}</h2>
      {download && (
        <button
          onClick={() => downloadTableCSV(id, title.replace(/\s+/g, "_"))}
          className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
        >
          <Download size={16} />
          <span>Download</span>
        </button>
      )}
    </div>
    <div className="overflow-x-auto">
      <table id={id} className="min-w-full bg-white border border-gray-200">
        <thead>
          <tr className="bg-gray-100">
            <th className="py-2 px-4 border text-left">Property</th>
            <th className="py-2 px-4 border text-left">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label} className={i % 2 === 1 ? "bg-gray-50" : ""}>
              <td className="py-2 px-4 border font-medium">{r.label}</td>
              <td className="py-2 px-4 border">{r.value ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

/* ------------------------------------------------------------- main view */
const WaterFleaDataViewer: FC<PageProps> = ({
  work_package,
  element,
  test,
}) => {
  const [data, setData] = useState<WaterFleaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("test-conditions");
  const [selectedBlock, setSelectedBlock] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await api.post(
          `/tests/listings`,
          {
            work_package_name: work_package,
            element_cms_id: element,
            test_name: test,
          },
          { signal: controller.signal }
        );
        if (response.status !== 200) throw new Error("Network response was not ok");
        setData(response.data);
        setLoading(false);
      } catch (err: any) {
        if (err?.name === "CanceledError" || err?.name === "AbortError") return;
        console.error("Error fetching data:", err);
        setError("Failed to load data. Please try again later.");
        setLoading(false);
      }
    };
    fetchData();
    return () => controller.abort();
  }, [work_package, element, test]);

  /* -------- safe accessors (handle both API shapes) -------- */
  const safeRawBlocks = useMemo<RawDataBlock[]>(() => {
    return data?.raw_data ?? data?.replications ?? [];
  }, [data?.raw_data, data?.replications]);

  const td = data?.test_details;
  const wp = td?.work_package;
  const material = td?.material;
  const application = td?.application;
  const conditions = td?.test_conditions;
  const analysis = td?.analysis;
  const repMeta = td?.replications ?? [];
  const warnings = td?.parser_warnings ?? [];
  const fr = data?.final_results;
  const grid = fr?.mortality_grid;

  const activeBlock = safeRawBlocks[selectedBlock];

  /* raw-data chart: mortality % per concentration, grouped by timepoint */
  const rawChartData = useMemo(() => {
    if (!activeBlock?.observations) return [];
    const byConc: Record<string, any> = {};
    activeBlock.observations.forEach((o) => {
      const c = o.concentration || "—";
      if (!byConc[c]) byConc[c] = { concentration: c };
      if (o.time) byConc[c][o.time] = o.mortality_percent ?? 0;
    });
    return Object.values(byConc);
  }, [activeBlock]);

  const rawTimeKeys = useMemo(() => {
    const set = new Set<string>();
    activeBlock?.observations?.forEach((o) => o.time && set.add(o.time));
    return Array.from(set);
  }, [activeBlock]);

  /* final-results chart: mortality % vs concentration per timepoint */
  const resultsChartData = useMemo(() => {
    if (!grid?.concentrations || !grid?.rows) return [];
    return grid.concentrations.map((c, ci) => {
      const point: any = { concentration: c };
      grid.rows!.forEach((row) => {
        const tp = `${row.time_h} h`;
        point[tp] = row.mortality_percent?.[ci] ?? 0;
      });
      return point;
    });
  }, [grid]);

  const resultTimeKeys = useMemo(
    () => (grid?.rows ?? []).map((r) => `${r.time_h} h`),
    [grid]
  );

  if (loading) {
    return (
      <div className="bg-white flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="bg-white flex items-center justify-center min-h-screen">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>{error || "No data available."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen py-8 text-black">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-4">
            Test Data Report
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Parameters</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2">
                  <span className="font-semibold">Work Package:</span>{" "}
                  {work_package}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Element:</span> {element}
                </p>
                <p>
                  <span className="font-semibold">ERM Identifier:</span>{" "}
                  {material?.erm_id}
                </p>
              </div>
            </div>
            {wp && (
              <div>
                <h2 className="text-lg font-semibold mb-3">Test Information</h2>
                <div className="bg-blue-50 p-4 rounded-md">
                  <p className="mb-2">
                    <span className="font-semibold">Full Test Name:</span>{" "}
                    {wp.full_test_name}
                  </p>
                  <p className="mb-2">
                    <span className="font-semibold">OECD/ISO Ref:</span>{" "}
                    {wp.oecd_iso_ref}
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
                    <span className="font-semibold">Metric:</span> {wp.metric}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="w-full mb-8">
          <ul
            className="relative flex flex-wrap p-1.5 list-none rounded-md bg-slate-100"
            role="list"
          >
            {TABS.map((tab) => (
              <li key={tab.key} className="z-30 flex-auto text-center">
                <a
                  className={`z-30 flex items-center justify-center w-full px-0 py-2 text-sm mb-0 transition-all ease-in-out border-0 rounded-md cursor-pointer ${
                    activeTab === tab.key
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-slate-600 bg-inherit"
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                >
                  {tab.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* ----------------------------- Test Conditions ----------------------------- */}
        {activeTab === "test-conditions" && (
          <>
            {/* Parser warnings */}
            {warnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-md p-4 mb-8 flex gap-3">
                <AlertTriangle className="text-yellow-600 shrink-0" size={20} />
                <div>
                  <p className="font-semibold text-yellow-800 mb-1">
                    Parser Warnings
                  </p>
                  <ul className="list-disc list-inside text-sm text-yellow-800">
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Material */}
            {material && (
              <KVTable
                id="materialTable"
                title="Material Information"
                rows={[
                  { label: "Material Identifier", value: material.material_identifier || element },
                  { label: "ERM Identifier", value: material.erm_id },
                  { label: "Material Name", value: material.material_name },
                  { label: "Core Chemistry", value: material.core_chemistry },
                  { label: "CAS No", value: material.cas_no },
                  { label: "CAS No for Core", value: material.cas_no_for_core },
                  { label: "Supplier", value: material.material_supplier },
                  { label: "Material State", value: material.material_state },
                  { label: "Batch", value: material.batch },
                  { label: "Vial", value: material.vial },
                  { label: "Preparation Date", value: fmtDate(material.preparation_date) },
                  { label: "Stock Concentration", value: material.stock_concentration },
                  { label: "Molecular Weight", value: material.molecular_weight },
                  { label: "No. of Particles in Stock", value: material.particles_stock },
                ]}
              />
            )}

            {/* Application */}
            {application && (
              <KVTable
                id="applicationTable"
                title="Application"
                rows={[
                  { label: "Start Daphnids per Well", value: application.start_daphnids_per_well },
                  { label: "Total Volume per Replicate (ml)", value: application.total_volume_per_replicate_ml },
                  {
                    label: `Concentrations Tested (${application.concentration_unit || "mg/L"})`,
                    value: application.concentrations_tested?.join(", "),
                  },
                  { label: "Replicates per Concentration", value: application.replicates_per_concentration },
                ]}
              />
            )}

            {/* Test Conditions */}
            {conditions && (
              <KVTable
                id="conditionsTable"
                title="Test Conditions"
                rows={[
                  { label: "Test Medium", value: conditions.test_medium?.join("; ") },
                  { label: "Light Cycle (h)", value: conditions.light_cycle_h },
                  { label: "Light Intensity (lux)", value: conditions.light_intensity_lux },
                  { label: "Illumination Direction", value: conditions.illumination_direction },
                  { label: "Temperature (°C)", value: conditions.temperature_c },
                  { label: "Aeration", value: conditions.aeration },
                  { label: "Salinity (ppt)", value: conditions.salinity_ppt },
                  { label: "Total Incubation Time (h)", value: conditions.total_incubation_time_h },
                ]}
              />
            )}

            {/* Analysis */}
            {analysis && (
              <KVTable
                id="analysisTable"
                title="Analysis"
                rows={[
                  { label: "Type of Measurement", value: analysis.type_of_measurement },
                  { label: "Measurement Device", value: analysis.measurement_device },
                  { label: "Timepoints (h)", value: analysis.timepoints_h?.join(", ") },
                ]}
              />
            )}

            {/* Replication metadata */}
            {repMeta.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-blue-800">
                    Replication Metadata
                  </h2>
                  <button
                    onClick={() => downloadTableCSV("replicationTable", "Replication_Metadata")}
                    className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                  >
                    <Download size={16} />
                    <span>Download</span>
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table id="replicationTable" className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Start Date</th>
                        <th className="py-2 px-4 border text-left">End Date</th>
                        <th className="py-2 px-4 border text-left">Replicates / Concentration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repMeta.map((r, i) => (
                        <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                          <td className="py-2 px-4 border">{fmtDate(r.test_start_date)}</td>
                          <td className="py-2 px-4 border">{fmtDate(r.test_end_date)}</td>
                          <td className="py-2 px-4 border">{r.replicates_per_concentration ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Scientists */}
            {wp && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-blue-800">
                    Scientists Information
                  </h2>
                  <button
                    onClick={() => downloadTableCSV("scientistsTable", "Scientists_Info")}
                    className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                  >
                    <Download size={16} />
                    <span>Download</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Lead Scientists</h3>
                    <table id="scientistsTable" className="min-w-full bg-white border border-gray-200">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="py-2 px-4 border text-left">Name</th>
                          <th className="py-2 px-4 border text-left">Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(wp.lead_scientists ?? []).map((s, i) => (
                          <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                            <td className="py-2 px-4 border">{s.name}</td>
                            <td className="py-2 px-4 border">{s.email}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Assay Scientists</h3>
                    <table className="min-w-full bg-white border border-gray-200">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="py-2 px-4 border text-left">Name</th>
                          <th className="py-2 px-4 border text-left">Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(wp.assay_scientists ?? []).map((s, i) => (
                          <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                            <td className="py-2 px-4 border">{s.name}</td>
                            <td className="py-2 px-4 border">{s.email}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ----------------------------- Raw Data ----------------------------- */}
        {activeTab === "raw-data" && (
          <>
            {safeRawBlocks.length > 1 && (
              <div className="bg-white rounded-lg shadow-md p-4 mb-8">
                <label className="font-semibold mr-3">Toxicant block:</label>
                <select
                  value={selectedBlock}
                  onChange={(e) => setSelectedBlock(Number(e.target.value))}
                  className="border border-gray-300 rounded px-3 py-2"
                >
                  {safeRawBlocks.map((b, i) => (
                    <option key={i} value={i}>
                      {b.toxicant || `Block ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeBlock ? (
              <>
                <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                  <h2 className="text-xl font-bold text-blue-800 mb-4">
                    Mortality (%) — {activeBlock.toxicant}
                  </h2>
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={rawChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="concentration" />
                      <YAxis
                        label={{ value: "Mortality (%)", angle: -90, position: "insideLeft" }}
                      />
                      <Tooltip />
                      <Legend />
                      {rawTimeKeys.map((t, i) => (
                        <Bar key={t} dataKey={t} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-blue-800">
                      Deceased Daphnids per Well
                    </h2>
                    <button
                      onClick={() => downloadTableCSV("rawTable", `Raw_Data_${activeBlock.toxicant}`)}
                      className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                    >
                      <Download size={16} />
                      <span>Download</span>
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table id="rawTable" className="min-w-full bg-white border border-gray-200">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="py-2 px-4 border text-left">Concentration</th>
                          <th className="py-2 px-4 border text-left">Time</th>
                          {(activeBlock.well_headers ?? [
                            "Well 1",
                            "Well 2",
                            "Well 3",
                            "Well 4",
                            "Total",
                            "%",
                          ]).map((h) => (
                            <th key={h} className="py-2 px-4 border text-left">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(activeBlock.observations ?? []).map((o, i) => {
                          const prev = activeBlock.observations?.[i - 1];
                          const concChanged = i === 0 || prev?.concentration !== o.concentration;
                          return (
                            <tr
                              key={i}
                              className={`${i % 2 === 1 ? "bg-gray-50" : ""} ${
                                concChanged ? "border-t-4 border-t-blue-700" : ""
                              }`}
                            >
                              <td className="py-2 px-4 border font-medium">
                                {concChanged ? o.concentration : ""}
                              </td>
                              <td className="py-2 px-4 border">{o.time}</td>
                              <td className="py-2 px-4 border">{o.well_1}</td>
                              <td className="py-2 px-4 border">{o.well_2}</td>
                              <td className="py-2 px-4 border">{o.well_3}</td>
                              <td className="py-2 px-4 border">{o.well_4}</td>
                              <td className="py-2 px-4 border">{o.total}</td>
                              <td className="py-2 px-4 border">
                                {o.mortality_percent ?? "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-lg shadow-md p-6">No raw data available.</div>
            )}
          </>
        )}

        {/* ----------------------------- Final Results ----------------------------- */}
        {activeTab === "results" && fr && (
          <>
            {/* Validity / classification summary */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-xl font-bold text-blue-800 mb-4">
                Result Summary
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-blue-50 p-4 rounded-md">
                  <p className="mb-2 flex items-center gap-2">
                    <span className="font-semibold">Validity of the test:</span>
                    <AcceptanceBadge status={fr.validity} />
                  </p>
                  {fr.validity_criteria && (
                    <p className="text-sm text-gray-600 mb-2">{fr.validity_criteria}</p>
                  )}
                  <p className="mb-2">
                    <span className="font-semibold">Significant difference to control:</span>{" "}
                    {fr.significant_difference_to_control}
                  </p>
                  <p>
                    <span className="font-semibold">Calculated EC50:</span> {fr.ec50}
                  </p>
                  {fr.ec50_description && (
                    <p className="text-sm text-gray-600 mt-1">{fr.ec50_description}</p>
                  )}
                </div>
                <div
                  className={`p-4 rounded-md ${
                    isPassed(fr.hazardous) || /yes/i.test(fr.hazardous || "")
                      ? "bg-red-50"
                      : "bg-green-50"
                  }`}
                >
                  <p className="font-semibold mb-2">{fr.reach_classification}</p>
                  <p className="mb-2">{fr.reach_category}</p>
                  {fr.reach_threshold_label && (
                    <p className="mb-2">
                      <span className="font-semibold">{fr.reach_threshold_label}:</span>{" "}
                      {fr.reach_threshold_value}
                    </p>
                  )}
                  <p className="flex items-center gap-2">
                    <span className="font-semibold">Hazardous?</span>
                    <span
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${
                        /yes/i.test(fr.hazardous || "")
                          ? "bg-red-100 text-red-800"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {/yes/i.test(fr.hazardous || "") ? (
                        <XCircle size={16} />
                      ) : (
                        <CheckCircle size={16} />
                      )}
                      {fr.hazardous || "—"}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Mortality chart */}
            {grid && resultsChartData.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                <h2 className="text-xl font-bold text-blue-800 mb-4">
                  Mortality (%) vs Concentration
                </h2>
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart data={resultsChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="concentration" />
                    <YAxis
                      domain={[0, 100]}
                      label={{ value: "Mortality (%)", angle: -90, position: "insideLeft" }}
                    />
                    <Tooltip />
                    <Legend />
                    {resultTimeKeys.map((t, i) => (
                      <Line
                        key={t}
                        type="monotone"
                        dataKey={t}
                        stroke={COLORS[i % COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Mortality grid table */}
            {grid && grid.rows && grid.rows.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-blue-800">
                    Mortality Grid
                  </h2>
                  <button
                    onClick={() => downloadTableCSV("gridTable", "Mortality_Grid")}
                    className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                  >
                    <Download size={16} />
                    <span>Download</span>
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table id="gridTable" className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Time (h)</th>
                        {(grid.concentrations ?? []).map((c) => (
                          <th key={c} className="py-2 px-4 border text-left">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grid.rows.map((row, i) => (
                        <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                          <td className="py-2 px-4 border font-medium">{row.time_h}</td>
                          {(row.mortality_percent ?? []).map((v, ci) => (
                            <td key={ci} className="py-2 px-4 border">
                              {v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WaterFleaDataViewer;