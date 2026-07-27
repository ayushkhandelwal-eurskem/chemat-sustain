"use client";
import React, { FC, useEffect, useState, useMemo } from "react";
import { api } from "@/lib/axios";
import { Download, ChevronDown, ChevronUp, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ScatterChart, Scatter,
} from "recharts";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
interface PageProps { work_package: string; element: string; test: string; file?: string; }
type TabKey = "test-conditions" | "raw-data" | "processed-data" | "results";
const TABS: { key: TabKey; label: string }[] = [
  { key: "test-conditions", label: "Test Conditions" },
  { key: "raw-data", label: "Raw Data" },
  { key: "processed-data", label: "Processed Data" },
  { key: "results", label: "Final Results" },
];

interface Scientist { name?: string | null; email?: string | null; }
interface WorkPackageData {
  wp_name?: string; partner?: string; laboratory_name?: string; full_test_name?: string;
  oecd_iso_ref?: string; test_type?: string; endpoint?: string; endpoint_outcome?: string;
  sop?: string; test_start_date?: string; test_end_date?: string;
  lead_scientists?: Scientist[]; assay_scientists?: Scientist[];
}
interface MaterialData {
  material_label?: string; material_identifier?: string; erm_id?: string; material_name?: string;
  core_chemistry?: string; cas_no?: string; cas_for_core?: string; material_supplier?: string;
  material_state?: string; batch?: string; vial?: string; preparation_date?: string;
  stock_concentration?: string; molar_concentration?: string; particles_in_stock?: string;
}
interface ApplicationData {
  nominal_start_algae_numbers?: number; total_volume_per_replicate?: number;
  concentrations_tested?: string; replicates_per_concentration?: number;
}
interface TestConditionsData {
  culture_medium?: string; light_cycle?: string; light_intensity?: string;
  illumination_direction?: string; temperature?: string; aeration?: string;
  salinity?: string; total_incubation_time?: string;
}
interface AnalysisConditionsData {
  type_of_measurement?: string; measurement_device?: string; chlorophyll_extraction?: string;
  chlorophyll_extraction_protocol?: string; excitation_nm?: number; emission_nm?: number;
  bandwidth_nm?: number; ht_voltage_v?: number; measurement_replicates?: string; timepoints?: (number | string)[];
}
interface CultureConditionsData {
  supplier?: string; culture_medium?: string; nutrients?: string; nutrient_components?: string[];
  light_cycle?: string; light_intensity?: string; illumination_direction?: string;
  temperature?: string; aeration?: string; salinity?: string;
}
interface ReplicationMeta {
  raw_sheet_name?: string; timepoint?: string; file_name?: string; sample_name?: string;
  comment?: string; username?: string; organization?: string; creation_date?: string;
  last_update?: string; model_name?: string; serial_no?: string;
}
interface RawReading {
  no?: string | number; mode?: string; cell_no?: string; sample_name?: string;
  comment?: string; value?: number | null;
}
interface RawDataBlock {
  timepoint?: string; raw_sheet_name?: string; wavelength_header?: string;
  instrument_metadata?: Record<string, any>; reading_count?: number; readings?: RawReading[];
}
interface CalibrationCurve {
  equation?: string | null; slope?: number | null; intercept?: number | null;
  available?: boolean; concentrations?: number[]; replicate_rfu?: number[][];
}
interface ProcessedBlock {
  timepoint?: string; group_labels?: (string | null)[]; rfu_replicates?: (number | null)[][];
  rfu_mean?: (number | null)[]; cells_per_ml?: (number | null)[];
  mean_cells_per_ml?: { control?: number | null; treatment?: number | null };
}
interface ProcessedData {
  available?: boolean; title?: string; subtitle?: string; metric_label?: string;
  calibration_curve?: CalibrationCurve; blocks?: ProcessedBlock[];
}
interface GrowthPoint { time_h?: number; control?: number; treatment?: number; }
interface FinalResults {
  available?: boolean; treatments_label?: string; headers?: string[]; growth_curve?: GrowthPoint[];
  validity?: { text?: string; result?: string; note?: string };
  statistics?: {
    significant_difference_label?: string; significant_difference?: string;
    equality_of_slopes_label?: string; equality_of_slopes?: string;
  };
  ec50?: { label?: string; description?: string; value?: string };
}
interface ParserWarning { toString?: () => string; }

interface AlgaeData {
  test_details: {
    work_package: WorkPackageData;
    material: MaterialData;
    application?: ApplicationData;
    test_conditions?: TestConditionsData;
    analysis_conditions?: AnalysisConditionsData;
    culture_conditions?: CultureConditionsData;
    replications?: ReplicationMeta[];
    parser_warnings?: (string | ParserWarning)[];
  };
  /** New API shape */
  raw_data?: RawDataBlock[];
  /** Old API shape (fallback) */
  replications?: RawDataBlock[];
  processed_data: ProcessedData;
  final_results: FinalResults;
  calibration_curve?: CalibrationCurve;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
const degC = (s?: string) => (s ?? "").replace(/oC/g, "°C");
const dot = (s?: string) => (s ?? "").replace(/,/g, ".");
const fmt = (v: any, d = 2) => {
  if (v == null || v === "") return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(d);
  return String(v);
};
const fmtInt = (v: any) => (typeof v === "number" ? Math.round(v).toLocaleString() : v ?? "");
const csvEsc = (v: string) => `"${v.replace(/"/g, '""')}"`;
function downloadTableCSV(id: string, fn: string) {
  const t = document.getElementById(id);
  if (!t) return;
  let csv = "data:text/csv;charset=utf-8,";
  t.querySelectorAll("tr").forEach((r) => {
    csv += Array.from(r.querySelectorAll("th,td")).map((c) => csvEsc(c.textContent ?? "")).join(",") + "\r\n";
  });
  const a = document.createElement("a");
  a.href = encodeURI(csv);
  a.download = `${fn}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ------------------------------------------------------------------ */
/* Reusable components                                                 */
/* ------------------------------------------------------------------ */
const CollapsibleSection: FC<{ title: string; open?: boolean; children: React.ReactNode }> = ({ title, open: def = true, children }) => {
  const [o, setO] = useState(def);
  return (
    <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
      <button className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition" onClick={() => setO((p) => !p)}>
        <h2 className="text-xl font-bold text-blue-800">{title}</h2>
        {o ? <ChevronUp className="text-gray-400" size={20} /> : <ChevronDown className="text-gray-400" size={20} />}
      </button>
      {o && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
};

const AcceptanceBadge: FC<{ result?: string }> = ({ result }) => {
  if (!result) return null;
  const passed = result.toUpperCase().includes("PASS") || result.toUpperCase() === "YES";
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
      {passed ? <CheckCircle size={14} /> : <XCircle size={14} />}
      {result}
    </span>
  );
};

const KVTable: FC<{ id: string; title: string; rows: { label: string; value: React.ReactNode }[]; dl?: string; children?: React.ReactNode }> = ({ id, title, rows, dl, children }) => {
  const filtered = rows.filter((r) => r.value != null && r.value !== "" && r.value !== "None");
  if (!filtered.length && !children) return null;
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-blue-800">{title}</h2>
        {dl && (
          <button onClick={() => downloadTableCSV(id, dl)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">
            <Download size={16} /><span>Download</span>
          </button>
        )}
      </div>
      {filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table id={id} className="min-w-full bg-white border border-gray-200">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-2 px-4 border text-left">Property</th>
                <th className="py-2 px-4 border text-left">Value</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                  <td className="py-2 px-4 border font-medium">{r.label}</td>
                  <td className="py-2 px-4 border">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {children}
    </div>
  );
};

const ScientistGrid: FC<{ lead?: Scientist[]; assay?: Scientist[] }> = ({ lead, assay }) => {
  const col = (title: string, list?: Scientist[]) => (
    <div className="bg-blue-50 p-4 rounded-md">
      <h4 className="font-semibold text-blue-800 mb-2">{title}</h4>
      {(list ?? []).filter((s) => s.name).map((s, i) => (
        <div key={i} className="text-sm mb-1">
          <span className="font-medium">{s.name}</span>
          {s.email && <span className="text-gray-600"> — {s.email}</span>}
        </div>
      ))}
      {!(list ?? []).some((s) => s.name) && <div className="text-sm text-gray-500">—</div>}
    </div>
  );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {col("Lead Scientist(s)", lead)}
      {col("Assay/Test conducted by", assay)}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Main Component                                                      */
/* ------------------------------------------------------------------ */
const AlgaeDataViewer: FC<PageProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<AlgaeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("test-conditions");
  const [rawIdx, setRawIdx] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        const res = await api.post(
          `/tests/listings`,
          { work_package_name: work_package, element_cms_id: element, test_name: test },
          { signal: ac.signal }
        );
        if (res.status !== 200) throw new Error("Bad response");
        setData(res.data);
      } catch (err: any) {
        if (err.name !== "CanceledError" && err.name !== "AbortError") setError(err?.message ?? "Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [work_package, element, test]);

  /* -------- safe accessors -------- */
  const safeRawBlocks = useMemo<RawDataBlock[]>(
    () => data?.raw_data ?? data?.replications ?? [],
    [data?.raw_data, data?.replications]
  );
  const td = data?.test_details;
  const wp = td?.work_package;
  const mat = td?.material;
  const app = td?.application;
  const tc = td?.test_conditions;
  const ac = td?.analysis_conditions;
  const cc = td?.culture_conditions;
  const repMeta = td?.replications ?? [];
  const warnings = td?.parser_warnings ?? [];
  const proc = data?.processed_data;
  const fr = data?.final_results;
  const calib = data?.calibration_curve ?? proc?.calibration_curve;

  const currentRaw = safeRawBlocks[rawIdx];

  /* -------- growth curve chart data -------- */
  const growthChart = useMemo(() => {
    return (fr?.growth_curve ?? []).map((g) => ({
      time: g.time_h, Control: g.control, Treatment: g.treatment,
    }));
  }, [fr?.growth_curve]);

  /* -------- calibration scatter data -------- */
  const calibChart = useMemo(() => {
    if (!calib?.concentrations?.length || !calib?.replicate_rfu?.length) return [];
    return calib.concentrations.map((conc, ci) => {
      const rfus = calib.replicate_rfu!.map((row) => row[ci]).filter((v): v is number => typeof v === "number");
      const mean = rfus.length ? rfus.reduce((a, b) => a + b, 0) / rfus.length : null;
      return { conc, rfu: mean };
    });
  }, [calib]);

  /* -------- render -------- */
  if (loading) {
    return (
      <div className="bg-white flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }
  if (error || !data || !td) {
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
            {wp?.full_test_name ?? "Algae Growth Inhibition"} Test Data Report
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Parameters</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2"><span className="font-semibold">Work Package:</span> {work_package || "N/A"}</p>
                <p className="mb-2"><span className="font-semibold">CMS Internal Identifier:</span> {element || "N/A"}</p>
                <p><span className="font-semibold">ERM Identifier:</span> {mat?.erm_id ?? "N/A"}</p>
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Information</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2"><span className="font-semibold">Full Test Name:</span> {wp?.full_test_name ?? "N/A"}</p>
                <p className="mb-2"><span className="font-semibold">OECD/ISO Ref:</span> {wp?.oecd_iso_ref ?? "N/A"}</p>
                <p className="mb-2"><span className="font-semibold">Test Type:</span> {wp?.test_type ?? "N/A"}</p>
                <p className="mb-2"><span className="font-semibold">Laboratory Name:</span> {wp?.laboratory_name ?? "N/A"}</p>
                <p className="mb-2"><span className="font-semibold">Endpoint:</span> {wp?.endpoint ?? "N/A"}</p>
                <p className="mb-2"><span className="font-semibold">Endpoint Outcome:</span> {wp?.endpoint_outcome ?? "N/A"}</p>
                <p><span className="font-semibold">SOP:</span> {wp?.sop ?? "N/A"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="w-full mb-8">
          <ul className="relative flex flex-wrap p-1.5 list-none rounded-md bg-slate-100" role="tablist">
            {TABS.map((tab) => (
              <li key={tab.key} className="z-30 flex-auto text-center" role="presentation">
                <button
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  className={`z-30 w-full px-0 py-2 text-sm mb-0 transition-all rounded-md ${
                    activeTab === tab.key ? "bg-blue-600 text-white shadow-md" : "text-slate-600 hover:text-slate-800"
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

      {/* Parser warnings */}
      {activeTab === "test-conditions" && warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-md p-4 mb-6 flex gap-2">
          <AlertTriangle className="text-yellow-600 flex-shrink-0" size={20} />
          <div className="text-sm text-yellow-800">
            <p className="font-semibold mb-1">Parser warnings</p>
            <ul className="list-disc list-inside">
              {warnings.map((w, i) => <li key={i}>{String(w)}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* ============ TEST CONDITIONS ============ */}
      {activeTab === "test-conditions" && (
        <>
          <KVTable id="tbl-material" title="Material Information" dl="Material_Information" rows={[
              { label: "Material label", value: mat?.material_label },
              { label: "CMS Identifier", value: mat?.material_identifier },
              { label: "ERM Identifier", value: mat?.erm_id },
              { label: "Material name", value: mat?.material_name },
              { label: "Core chemistry", value: mat?.core_chemistry },
              { label: "CAS No.", value: mat?.cas_no },
              { label: "CAS for core", value: mat?.cas_for_core },
              { label: "Supplier", value: mat?.material_supplier },
              { label: "Material state", value: mat?.material_state },
              { label: "Batch", value: mat?.batch },
              { label: "Vial", value: mat?.vial },
              { label: "Date of preparation", value: mat?.preparation_date },
              { label: "Stock concentration", value: mat?.stock_concentration },
              { label: "Molar concentration", value: mat?.molar_concentration },
              { label: "Particles in stock", value: mat?.particles_in_stock },
            ]} />

          <KVTable id="tbl-application" title="Application" dl="Application" rows={[
              { label: "Nominal start algae numbers (cells·ml⁻¹)", value: fmtInt(app?.nominal_start_algae_numbers) },
              { label: "Total volume per replicate (ml)", value: fmt(app?.total_volume_per_replicate) },
              { label: "Concentrations tested (mg·l⁻¹)", value: app?.concentrations_tested },
              { label: "Replicates per concentration", value: fmt(app?.replicates_per_concentration) },
            ]} />

          <KVTable id="tbl-testconditions" title="Test Conditions" dl="Test_Conditions" rows={[
              { label: "Culture medium", value: tc?.culture_medium },
              { label: "Light cycle (h)", value: tc?.light_cycle },
              { label: "Light intensity (lux)", value: tc?.light_intensity },
              { label: "Illumination direction", value: tc?.illumination_direction },
              { label: "Temperature (°C)", value: dot(tc?.temperature) },
              { label: "Aeration", value: tc?.aeration },
              { label: "Salinity (ppt)", value: tc?.salinity },
              { label: "Total incubation time (h)", value: tc?.total_incubation_time },
            ]} />

          <KVTable id="tbl-analysis" title="Analysis Conditions" dl="Analysis_Conditions" rows={[
              { label: "Type of measurement", value: ac?.type_of_measurement },
              { label: "Measurement device", value: ac?.measurement_device },
              { label: "Chlorophyll extraction", value: ac?.chlorophyll_extraction },
              { label: "Chlorophyll extraction protocol", value: ac?.chlorophyll_extraction_protocol },
              { label: "Excitation (nm)", value: fmt(ac?.excitation_nm, 1) },
              { label: "Emission (nm)", value: fmt(ac?.emission_nm, 1) },
              { label: "Bandwidth (nm)", value: fmt(ac?.bandwidth_nm, 0) },
              { label: "HT voltage (V)", value: fmt(ac?.ht_voltage_v, 0) },
              { label: "Measurement replicates", value: ac?.measurement_replicates },
              { label: "Timepoints (h)", value: (ac?.timepoints ?? []).join(", ") },
            ]} />

          <KVTable id="tbl-culture" title="Culture Conditions & Test Medium" dl="Culture_Conditions" rows={[
              { label: "Supplier", value: cc?.supplier },
              { label: "Culture medium", value: cc?.culture_medium },
              { label: "Nutrients", value: cc?.nutrients },
              { label: "Light cycle (h)", value: cc?.light_cycle },
              { label: "Light intensity (lux)", value: cc?.light_intensity },
              { label: "Illumination direction", value: cc?.illumination_direction },
              { label: "Temperature (°C)", value: dot(cc?.temperature) },
              { label: "Aeration", value: cc?.aeration },
              { label: "Salinity", value: cc?.salinity },
            ]}>
            {(cc?.nutrient_components ?? []).length > 0 && (
              <div className="mt-4 bg-blue-50 p-4 rounded-md">
                <h4 className="font-semibold text-blue-800 mb-2">Nutrient / Vitamin components</h4>
                <div className="flex flex-wrap gap-2">
                  {cc!.nutrient_components!.map((n, i) => (
                    <span key={i} className="bg-white border border-blue-200 rounded px-2 py-1 text-sm">{n}</span>
                  ))}
                </div>
              </div>
            )}
          </KVTable>

          {repMeta.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-blue-800">Replication Metadata</h2>
                <button onClick={() => downloadTableCSV("tbl-repmeta", "Replication_Metadata")} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">
                  <Download size={16} /><span>Download</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table id="tbl-repmeta" className="min-w-full bg-white border border-gray-200 text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-3 border text-left">Timepoint</th>
                      <th className="py-2 px-3 border text-left">Sample</th>
                      <th className="py-2 px-3 border text-left">Instrument</th>
                      <th className="py-2 px-3 border text-left">Serial No.</th>
                      <th className="py-2 px-3 border text-left">Creation date</th>
                      <th className="py-2 px-3 border text-left">Operator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repMeta.map((r, i) => (
                      <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                        <td className="py-2 px-3 border font-medium">{r.timepoint}</td>
                        <td className="py-2 px-3 border">{r.sample_name}</td>
                        <td className="py-2 px-3 border">{r.model_name}</td>
                        <td className="py-2 px-3 border">{r.serial_no}</td>
                        <td className="py-2 px-3 border">{r.creation_date}</td>
                        <td className="py-2 px-3 border">{r.username}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-blue-800 mb-4">Scientists Information</h2>
            <ScientistGrid lead={wp?.lead_scientists} assay={wp?.assay_scientists} />
          </div>
        </>
      )}

      {/* ============ RAW DATA ============ */}
      {activeTab === "raw-data" && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          {safeRawBlocks.length === 0 ? (
            <p className="text-gray-500">No raw data available.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <label className="text-sm font-medium">Timepoint:</label>
                <select
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm"
                  value={rawIdx}
                  onChange={(e) => setRawIdx(Number(e.target.value))}
                >
                  {safeRawBlocks.map((b, i) => (
                    <option key={i} value={i}>{b.timepoint ?? b.raw_sheet_name ?? `Block ${i + 1}`}</option>
                  ))}
                </select>
                {currentRaw?.wavelength_header && (
                  <span className="text-sm text-gray-500">λ: {currentRaw.wavelength_header}</span>
                )}
              </div>

              {/* Chart */}
              {currentRaw?.readings?.some((r) => r.value != null) && (
                <div className="mb-6">
                  <h3 className="text-md font-semibold mb-3">Fluorescence readings</h3>
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart
                      data={(currentRaw.readings ?? []).map((r) => ({ name: String(r.no), value: r.value, sample: r.sample_name }))}
                      margin={{ top: 15, right: 30, left: 20, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" label={{ value: "Reading No.", position: "insideBottom", offset: -10 }} />
                      <YAxis label={{ value: "RFU", angle: -90, position: "insideLeft" }} />
                      <Tooltip content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white border border-gray-300 rounded shadow-md p-3 text-sm">
                            <p className="font-semibold">Reading {d.name}{d.sample ? ` (${d.sample})` : ""}</p>
                            <p>RFU: {fmt(d.value, 4)}</p>
                          </div>
                        );
                      }} />
                      <Bar dataKey="value" fill={COLORS[0]} name="RFU" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Table */}
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-md font-semibold">Readings</h3>
                <button onClick={() => downloadTableCSV("tbl-raw", `raw_${currentRaw?.timepoint ?? rawIdx}`)} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition text-sm">
                  <Download size={14} /><span>CSV</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table id="tbl-raw" className="min-w-full bg-white border border-gray-200 text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-3 border text-left">No.</th>
                      <th className="py-2 px-3 border text-left">Mode</th>
                      <th className="py-2 px-3 border text-left">Sample</th>
                      <th className="py-2 px-3 border text-left">Comment</th>
                      <th className="py-2 px-3 border text-right">{currentRaw?.wavelength_header ?? "Value"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(currentRaw?.readings ?? []).map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                        <td className="py-2 px-3 border">{r.no}</td>
                        <td className="py-2 px-3 border">{r.mode}</td>
                        <td className="py-2 px-3 border">{r.sample_name}</td>
                        <td className="py-2 px-3 border">{r.comment}</td>
                        <td className="py-2 px-3 border text-right">{fmt(r.value, 4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Instrument metadata */}
              {currentRaw?.instrument_metadata && Object.keys(currentRaw.instrument_metadata).length > 0 && (
                <div className="mt-6">
                  <CollapsibleSection title="Instrument Metadata" open={false}>
                    <div className="flex justify-end mb-3">
                      <button onClick={() => downloadTableCSV("tbl-instrument", `instrument_${currentRaw?.timepoint ?? rawIdx}`)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm">
                        <Download size={14} /><span>Download</span>
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table id="tbl-instrument" className="min-w-full bg-white border border-gray-200">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="py-2 px-4 border text-left">Property</th>
                            <th className="py-2 px-4 border text-left">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(currentRaw.instrument_metadata)
                            .filter(([, v]) => v != null && v !== "")
                            .map(([k, v], i) => (
                              <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                                <td className="py-2 px-4 border font-medium">{k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</td>
                                <td className="py-2 px-4 border">{String(v)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </CollapsibleSection>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ============ PROCESSED DATA ============ */}
      {activeTab === "processed-data" && (
        <>
          {proc?.calibration_curve?.equation && (
            <div className="bg-blue-50 p-4 rounded-md mb-6">
              <span className="font-semibold text-blue-800">Calibration curve: </span>
              <span className="font-mono">{proc.calibration_curve.equation}</span>
              {proc.calibration_curve.slope != null && (
                <span className="text-sm text-gray-600 ml-3">
                  (slope {fmt(proc.calibration_curve.slope, 1)}, intercept {fmt(proc.calibration_curve.intercept, 1)})
                </span>
              )}
            </div>
          )}

          {(proc?.blocks ?? []).map((b, bi) => (
            <CollapsibleSection key={bi} title={`Timepoint ${b.timepoint}`} open={bi === 0}>
              {/* Cells/mL chart */}
              {b.cells_per_ml?.some((v) => v != null) && (
                <div className="mb-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={(b.group_labels ?? []).map((lbl, i) => ({
                        group: lbl ?? `G${i + 1}`,
                        cells: b.cells_per_ml?.[i] ?? null,
                      }))}
                      margin={{ top: 15, right: 30, left: 30, bottom: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="group" angle={-20} textAnchor="end" height={60} />
                      <YAxis label={{ value: "cells/mL", angle: -90, position: "insideLeft" }} />
                      <Tooltip formatter={(v: any) => fmtInt(v)} />
                      <Bar dataKey="cells" name="cells/mL" fill={COLORS[0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Analysis table */}
              <div className="flex justify-end mb-2">
                <button onClick={() => downloadTableCSV(`tbl-proc-${bi}`, `processed_${b.timepoint}`)} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition text-sm">
                  <Download size={14} /><span>CSV</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table id={`tbl-proc-${bi}`} className="min-w-full bg-white border border-gray-200 text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-3 border text-left">Metric</th>
                      {(b.group_labels ?? []).map((lbl, i) => (
                        <th key={i} className="py-2 px-3 border text-right">{lbl}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(b.rfu_replicates ?? []).map((rep, ri) => (
                      <tr key={`rep-${ri}`} className={ri % 2 === 0 ? "bg-gray-50" : ""}>
                        <td className="py-2 px-3 border font-medium">RFU rep {ri + 1}</td>
                        {rep.map((v, ci) => <td key={ci} className="py-2 px-3 border text-right">{fmt(v, 4)}</td>)}
                      </tr>
                    ))}
                    {b.rfu_mean && (
                      <tr className="bg-blue-50 font-semibold">
                        <td className="py-2 px-3 border">RFU (mean)</td>
                        {b.rfu_mean.map((v, ci) => <td key={ci} className="py-2 px-3 border text-right">{fmt(v, 4)}</td>)}
                      </tr>
                    )}
                    {b.cells_per_ml && (
                      <tr>
                        <td className="py-2 px-3 border font-medium">cells/mL</td>
                        {b.cells_per_ml.map((v, ci) => <td key={ci} className="py-2 px-3 border text-right">{fmtInt(v)}</td>)}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mean cells summary */}
              {(b.mean_cells_per_ml?.control != null || b.mean_cells_per_ml?.treatment != null) && (
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="bg-green-50 p-4 rounded-md">
                    <p className="text-sm text-gray-600">Mean control (cells/mL)</p>
                    <p className="text-lg font-bold text-green-800">{fmtInt(b.mean_cells_per_ml?.control)}</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-md">
                    <p className="text-sm text-gray-600">Mean treatment (cells/mL)</p>
                    <p className="text-lg font-bold text-blue-800">{fmtInt(b.mean_cells_per_ml?.treatment)}</p>
                  </div>
                </div>
              )}
            </CollapsibleSection>
          ))}

          {/* Calibration curve chart */}
          {calibChart.length > 0 && (
            <CollapsibleSection title="Calibration Curve" open={false}>
              {calib?.equation && <p className="font-mono text-sm mb-3">{calib.equation}</p>}
              <ResponsiveContainer width="100%" height={320}>
                <ScatterChart margin={{ top: 15, right: 30, left: 40, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="conc" name="cells/mL" label={{ value: "cells/mL", position: "insideBottom", offset: -15 }} />
                  <YAxis type="number" dataKey="rfu" name="RFU" label={{ value: "RFU (mean)", angle: -90, position: "insideLeft" }} />
                  <Tooltip formatter={(v: any) => fmt(v, 3)} />
                  <Scatter data={calibChart} fill={COLORS[0]} />
                </ScatterChart>
              </ResponsiveContainer>
            </CollapsibleSection>
          )}
        </>
      )}

      {/* ============ FINAL RESULTS ============ */}
      {activeTab === "results" && (
        <>
          {fr?.validity?.result && (
            <div className={`mb-6 p-4 rounded-md border ${fr.validity.result.toUpperCase().includes("PASS") ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"}`}>
              <div className="flex items-center gap-2">
                {fr.validity.result.toUpperCase().includes("PASS") ? <CheckCircle size={20} className="text-green-600" /> : <XCircle size={20} className="text-red-600" />}
                <span className={`font-semibold ${fr.validity.result.toUpperCase().includes("PASS") ? "text-green-800" : "text-red-800"}`}>
                  {fr.validity.text ?? "Validity of the test"}: {fr.validity.result}
                </span>
              </div>
              {fr.validity.note && <p className="text-sm text-gray-600 mt-1 ml-7">{fr.validity.note}</p>}
            </div>
          )}

          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h3 className="text-md font-semibold mb-1">Growth over time</h3>
            {fr?.treatments_label && <p className="text-sm text-gray-500 mb-3">{fr.treatments_label}</p>}
            {growthChart.length > 0 && (
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={growthChart} margin={{ top: 15, right: 30, left: 40, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" label={{ value: "Time (h)", position: "insideBottom", offset: -12 }} />
                  <YAxis label={{ value: "cells/mL", angle: -90, position: "insideLeft" }} />
                  <Tooltip formatter={(v: any) => fmtInt(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="Control" stroke={COLORS[2]} strokeWidth={2} dot />
                  <Line type="monotone" dataKey="Treatment" stroke={COLORS[0]} strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            )}

            <div className="flex justify-end mt-4 mb-2">
              <button onClick={() => downloadTableCSV("tbl-final", "final_results")} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition text-sm">
                <Download size={14} /><span>CSV</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table id="tbl-final" className="min-w-full bg-white border border-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-2 px-3 border text-left">Time (h)</th>
                    <th className="py-2 px-3 border text-right">Control (cells/mL)</th>
                    <th className="py-2 px-3 border text-right">Treatment (cells/mL)</th>
                  </tr>
                </thead>
                <tbody>
                  {(fr?.growth_curve ?? []).map((g, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                      <td className="py-2 px-3 border font-medium">{g.time_h}</td>
                      <td className="py-2 px-3 border text-right">{fmtInt(g.control)}</td>
                      <td className="py-2 px-3 border text-right">{fmtInt(g.treatment)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Statistics */}
          {(fr?.statistics?.significant_difference || fr?.ec50?.value) && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h3 className="text-md font-semibold mb-4">Statistical analysis</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fr?.statistics?.significant_difference && (
                  <div className="bg-blue-50 p-4 rounded-md">
                    <p className="text-sm text-gray-600 mb-1">{fr.statistics.significant_difference_label ?? "Significant difference to control?"}</p>
                    <AcceptanceBadge result={fr.statistics.significant_difference} />
                    {fr.statistics.equality_of_slopes && (
                      <p className="text-sm text-gray-600 mt-2">
                        {fr.statistics.equality_of_slopes_label ?? "Equality of Slopes"}: <span className="font-medium">{dot(fr.statistics.equality_of_slopes)}</span>
                      </p>
                    )}
                  </div>
                )}
                {fr?.ec50?.value && (
                  <div className="bg-blue-50 p-4 rounded-md">
                    <p className="text-sm text-gray-600 mb-1">{fr.ec50.label ?? "Calculated EC50"}</p>
                    <p className="text-lg font-bold text-blue-800">{fr.ec50.value}</p>
                    {fr.ec50.description && <p className="text-xs text-gray-500 mt-1">{fr.ec50.description}</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
};

export default AlgaeDataViewer;