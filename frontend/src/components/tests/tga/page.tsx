"use client";
import React, { FC, useEffect, useState, useMemo, useCallback } from "react";
import { api } from "@/lib/axios";
import {
  Download,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

/* ================================================================
   Types — mapped from TGA parser (backend field names)
   ================================================================ */

interface PageProps {
  work_package: string;
  element: string;
  test: string;
  file?: string;
}

interface Scientist { name: string | null; email: string | null; }

interface WorkPackageData {
  wp_name: string | null; partner: string | null; laboratory_name: string | null;
  full_test_name: string | null; test_acronym: string | null; test_type: string | null;
  endpoint: string | null; endpoint_outcome: string | null; sop: string | null;
  path: string | null; lead_scientists: Scientist[]; assay_scientists: Scientist[];
}

interface MaterialData {
  material_identifier: string | null; erm_id: string | null; material_name: string | null;
  core_chemistry: string | null; cas_no: string | null; cas_for_core: string | null;
  material_supplier: string | null; catalog_number: string | null; material_state: string | null;
  batch: string | null; vial: string | null; preparation_date: string | null;
  molar_concentration: string | null; particles_stock: string | null;
}

interface DispersionData {
  dispersion_protocol: string | null; dispersion_technique: string | null;
  dispersion_medium: string | null; sonicator_type: string | null;
  power_w: string | null; sonication_time_s: string | null;
  tip_thickness_mm: string | null; tip_composition: string | null;
  bath_volume_dm3: string | null; sample_volume: string | null;
  final_concentration: string | null; additional_info: string | null;
}

interface SampleMass { label: string; value: string | null; }

interface InstrumentationData {
  instrument_model: string | null; crucible_type: string | null;
  replication_count: number | string | null; replicate_labels: string[];
  sample_masses: SampleMass[]; protective_atmosphere: string | null;
  temperature_range: string | null; heating_speed: string | null;
}

interface ReplicationMetadata {
  test_identifier_number: string | null; test_start_date: string | null;
  test_end_date: string | null; replicate_label: string | null;
  raw_sheet_name: string | null; processed_sheet_name: string | null;
}

interface TGADataPoint {
  time_min: number | null; temperature_c: number | null;
  mass_mg: number | null; dtg_pct_per_min: number | null; mass_pct: number | null;
}

interface TGARawDataBlock {
  metric_name: string | null; raw_sheet_name: string | null;
  time_unit: string | null; temperature_unit: string | null;
  mass_unit: string | null; dtg_unit: string | null; mass_pct_unit: string | null;
  point_count: number | null;
  min_time_min: number | null; max_time_min: number | null;
  min_temperature_c: number | null; max_temperature_c: number | null;
  min_mass_pct: number | null; max_mass_pct: number | null;
  min_dtg: number | null; max_dtg: number | null;
  data_points: TGADataPoint[];
}

interface TGADecompositionStage {
  replicate_label: string | null; t_start_c: number | null;
  t_end_c: number | null; t_peak_c: number | null;
  mass_loss_pct: number | null; mass_loss_at_final_temp_pct: number | null;
}

interface TGAFinalResultEntry {
  metric_name: string | null;
  value: number | string | null;
  std_dev_pct: number | string | null;
}

interface ParserWarning { type?: string; sheet?: string; note?: string; }

interface TGAData {
  test_details: {
    work_package: WorkPackageData; material: MaterialData;
    cell_line: Record<string, never>; dispersion: DispersionData;
    instrumentation: InstrumentationData;
  };
  replications: ReplicationMetadata[];
  raw_data: TGARawDataBlock[];
  processed_data: { available: boolean; stages: TGADecompositionStage[]; notes?: string; };
  final_results: TGAFinalResultEntry[];
  statistical_analysis: { available: boolean; notes: string; };
  parser_warnings?: ParserWarning[];
}

/* ================================================================ */

type TabKey = "test-conditions" | "raw-data" | "processed-data" | "results";
const TABS: { key: TabKey; label: string }[] = [
  { key: "test-conditions", label: "Test Conditions" },
  { key: "raw-data", label: "Raw Data" },
  { key: "processed-data", label: "Processed Data" },
  { key: "results", label: "Final Results" },
];

/* ================================================================
   Helpers
   ================================================================ */

const fmt = (v: any, d = 4) => {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return v.toFixed(d);
  return String(v);
};

const csvEscape = (v: string) => `"${v.replace(/"/g, '""')}"`;

function downloadTableCSV(tableId: string, filename: string) {
  const table = document.getElementById(tableId);
  if (!table) return;
  let csv = "data:text/csv;charset=utf-8,";
  table.querySelectorAll("tr").forEach((row) => {
    csv += Array.from(row.querySelectorAll("th, td")).map((c) => csvEscape(c.textContent ?? "")).join(",") + "\r\n";
  });
  const a = document.createElement("a");
  a.href = encodeURI(csv); a.download = `${filename}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function lttb(data: { x: number; y: number }[], threshold: number) {
  const n = data.length;
  if (threshold >= n || threshold === 0) return data;
  const sampled: typeof data = [];
  let a = 0;
  const bs = (n - 2) / (threshold - 2);
  sampled.push(data[a]);
  for (let i = 0; i < threshold - 2; i++) {
    const s = Math.floor((i + 1) * bs) + 1;
    const e = Math.min(Math.floor((i + 2) * bs) + 1, n);
    let ax = 0, ay = 0; const l = Math.max(1, e - s);
    for (let j = s; j < e; j++) { ax += data[j].x; ay += data[j].y; }
    ax /= l; ay /= l;
    let mA = -1, nA = s;
    for (let j = s; j < e; j++) {
      const ar = Math.abs((data[a].x - ax) * (data[j].y - data[a].y) - (data[a].x - data[j].x) * (ay - data[a].y)) * 0.5;
      if (ar > mA) { mA = ar; nA = j; }
    }
    sampled.push(data[nA]); a = nA;
  }
  sampled.push(data[n - 1]);
  return sampled;
}

/* ================================================================
   Shared UI Components
   ================================================================ */

const CollapsibleSection: FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({ title, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
      <button className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition" onClick={() => setOpen((p) => !p)}>
        <h2 className="text-xl font-bold text-blue-800">{title}</h2>
        {open ? <ChevronUp className="text-gray-400" size={20} /> : <ChevronDown className="text-gray-400" size={20} />}
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
};

const KVTable: FC<{ id: string; rows: { label: string; value: React.ReactNode }[]; downloadFilename?: string }> = ({ id, rows, downloadFilename }) => (
  <>
    {downloadFilename && (
      <div className="flex justify-end mb-3">
        <button onClick={() => downloadTableCSV(id, downloadFilename)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm">
          <Download size={14} /><span>Download</span>
        </button>
      </div>
    )}
    <div className="overflow-x-auto">
      <table id={id} className="min-w-full bg-white border border-gray-200">
        <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Property</th><th className="py-2 px-4 border text-left">Value</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
              <td className="py-2 px-4 border font-medium">{r.label}</td>
              <td className="py-2 px-4 border">{r.value ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

/* ================================================================
   Main Component
   ================================================================ */

const TGADataViewer: FC<PageProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<TGAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("test-conditions");
  const [selectedRawBlock, setSelectedRawBlock] = useState(0);
  const [chartXAxis, setChartXAxis] = useState<"temperature" | "time">("temperature");
  const [showDTG, setShowDTG] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        const res = await api.post(`/tests/listings`, { work_package_name: work_package, element_cms_id: element, test_name: test }, { signal: ac.signal });
        if (res.status !== 200) throw new Error("Network response was not ok");
        setData(res.data);
      } catch (err: any) {
        if (err.name !== "CanceledError" && err.name !== "AbortError") { console.error(err); setError("Failed to load TGA data."); }
      } finally { setLoading(false); }
    })();
    return () => ac.abort();
  }, [work_package, element, test]);

  /* ---- Derived ---- */
  const safeRaw: TGARawDataBlock[] = useMemo(() => Array.isArray(data?.raw_data) ? data.raw_data : [], [data?.raw_data]);
  const safeStages: TGADecompositionStage[] = useMemo(() => data?.processed_data?.stages ?? [], [data?.processed_data]);
  const safeFR: TGAFinalResultEntry[] = useMemo(() => Array.isArray(data?.final_results) ? data.final_results : [], [data?.final_results]);

  const chartData = useMemo(() => {
    const block = safeRaw[selectedRawBlock];
    if (!block?.data_points?.length) return [];
    const useTemp = chartXAxis === "temperature";

    const raw = block.data_points
      .filter((p) => p.mass_pct != null && (useTemp ? p.temperature_c != null : p.time_min != null))
      .map((p) => ({ x: (useTemp ? p.temperature_c : p.time_min) as number, mass_pct: p.mass_pct as number, dtg: p.dtg_pct_per_min, temp: p.temperature_c, time: p.time_min }))
      .sort((a, b) => a.x - b.x);

    const target = Math.min(1200, raw.length);
    const sampled = lttb(raw.map((p) => ({ x: p.x, y: p.mass_pct })), target);
    const xSet = new Set(sampled.map((p) => p.x));
    return raw.filter((p) => xSet.has(p.x)).map((p) => ({ x_value: p.x, mass_pct: p.mass_pct, dtg: p.dtg, temperature: p.temp, time: p.time }));
  }, [safeRaw, selectedRawBlock, chartXAxis]);

  /** Reference lines from decomposition stages */
  const stageLines = useMemo(() => {
    if (chartXAxis !== "temperature") return [];
    return safeStages.filter((s) => s.t_start_c != null).map((s) => ({
      start: s.t_start_c as number, end: s.t_end_c, peak: s.t_peak_c, label: s.replicate_label ?? "Stage",
    }));
  }, [safeStages, chartXAxis]);

  /* ---- Render ---- */
  if (loading) return <div className="bg-white flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" /></div>;
  if (error || !data) return <div className="flex items-center justify-center min-h-screen"><div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"><p>{error || "No data available."}</p></div></div>;

  const td = data.test_details;
  const wp = td.work_package, mat = td.material, disp = td.dispersion, inst = td.instrumentation;
  const repMeta = data.replications ?? [];
  const warnings = data.parser_warnings ?? [];

  return (
    <div className="bg-gray-50 min-h-screen py-8 text-black">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-4">TGA Test Data Report</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Parameters</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2"><span className="font-semibold">Work Package:</span> {wp.wp_name || work_package}</p>
                <p className="mb-2"><span className="font-semibold">CMS Identifier:</span> {mat.material_identifier ?? element}</p>
                <p className="mb-2"><span className="font-semibold">ERM Identifier:</span> {mat.erm_id ?? "N/A"}</p>
                <p className="mb-2"><span className="font-semibold">Partner:</span> {wp.partner ?? ""}</p>
                <p><span className="font-semibold">Material:</span> {mat.material_name ?? ""}</p>
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Information</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2"><span className="font-semibold">Full Name:</span> {wp.full_test_name ?? ""}</p>
                <p className="mb-2"><span className="font-semibold">Acronym:</span> {wp.test_acronym ?? ""}</p>
                <p className="mb-2"><span className="font-semibold">Type:</span> {wp.test_type ?? ""}</p>
                <p className="mb-2"><span className="font-semibold">Endpoint:</span> {wp.endpoint ?? ""}</p>
                <p><span className="font-semibold">Outcome Metric:</span> {wp.endpoint_outcome ?? ""}</p>
              </div>
            </div>
          </div>
          {warnings.length > 0 && (
            <div className="mt-4 bg-yellow-50 border border-yellow-300 rounded-md p-3">
              <div className="flex items-center gap-2 mb-2"><AlertTriangle size={16} className="text-yellow-600" /><span className="font-semibold text-yellow-800 text-sm">Parser Warnings ({warnings.length})</span></div>
              <ul className="text-sm text-yellow-700 space-y-1">{warnings.map((w, i) => <li key={i}>{w.note || w.type || "Warning"}</li>)}</ul>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="w-full mb-8">
          <ul className="relative flex flex-wrap p-1.5 list-none rounded-md bg-slate-100" role="tablist">
            {TABS.map((tab) => (
              <li key={tab.key} className="z-30 flex-auto text-center" role="presentation">
                <button role="tab" aria-selected={activeTab === tab.key} className={`z-30 w-full px-0 py-2 text-sm mb-0 transition-all rounded-md ${activeTab === tab.key ? "bg-blue-600 text-white shadow-md" : "text-slate-600 hover:text-slate-800"}`} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
              </li>
            ))}
          </ul>
        </div>

        {/* ======== Test Conditions ======== */}
        {activeTab === "test-conditions" && (
          <>
            <CollapsibleSection title="Material Information">
              <KVTable id="materialTable" downloadFilename="TGA_Material" rows={[
                { label: "CMS Internal Identifier", value: mat.material_identifier ?? element },
                { label: "ERM Identifier", value: mat.erm_id ?? "" }, { label: "Material Name", value: mat.material_name ?? "" },
                { label: "Core Chemistry", value: mat.core_chemistry ?? "" }, { label: "CAS No", value: mat.cas_no ?? "" },
                { label: "CAS for Core", value: mat.cas_for_core ?? "" }, { label: "Material Supplier", value: mat.material_supplier ?? "" },
                { label: "Catalog Number", value: mat.catalog_number ?? "" }, { label: "Material State", value: mat.material_state ?? "" },
                { label: "Batch", value: mat.batch ?? "" }, { label: "Preparation Date", value: mat.preparation_date ?? "" },
              ]} />
            </CollapsibleSection>
            <CollapsibleSection title="Sample Preparation">
              <KVTable id="dispTable" downloadFilename="TGA_SamplePrep" rows={[
                { label: "Dispersion Protocol", value: disp.dispersion_protocol ?? "" }, { label: "Dispersion Technique", value: disp.dispersion_technique ?? "" },
                { label: "Dispersion Medium", value: disp.dispersion_medium ?? "" }, { label: "Sonicator Type", value: disp.sonicator_type ?? "" },
                { label: "Power (W)", value: disp.power_w ?? "" }, { label: "Sonication Time (s)", value: disp.sonication_time_s ?? "" },
                { label: "Tip Thickness (mm)", value: disp.tip_thickness_mm ?? "" }, { label: "Tip Composition", value: disp.tip_composition ?? "" },
                { label: "Ultrasonic Bath Volume (dm³)", value: disp.bath_volume_dm3 ?? "" }, { label: "Sample Volume", value: disp.sample_volume ?? "" },
                { label: "Final Concentration (mg/L)", value: disp.final_concentration ?? "" }, { label: "Additional Info", value: disp.additional_info ?? "" },
              ]} />
            </CollapsibleSection>
            <CollapsibleSection title="Instrumentation">
              <KVTable id="instTable" downloadFilename="TGA_Instrumentation" rows={[
                { label: "Instrument Model", value: inst.instrument_model ?? "" }, { label: "Crucible Type", value: inst.crucible_type ?? "" },
                { label: "Replication Count", value: inst.replication_count ?? "" }, { label: "Protective Atmosphere", value: inst.protective_atmosphere ?? "" },
                { label: "Temperature Range", value: inst.temperature_range ?? "" }, { label: "Heating Speed", value: inst.heating_speed ?? "" },
              ]} />
              {inst.sample_masses?.some((s) => s.value) && (
                <div className="mt-4">
                  <h4 className="text-md font-semibold mb-2">Sample Masses</h4>
                  <table className="min-w-full bg-white border border-gray-200 text-sm">
                    <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Replicate</th><th className="py-2 px-4 border text-left">Mass</th></tr></thead>
                    <tbody>{inst.sample_masses.map((s, i) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-4 border">{s.label}</td><td className="py-2 px-4 border">{s.value ?? ""}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </CollapsibleSection>
            <CollapsibleSection title="Replication Metadata">
              <div className="overflow-x-auto">
                <table id="repMetaTable" className="min-w-full bg-white border border-gray-200">
                  <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Test ID</th><th className="py-2 px-4 border text-left">Start</th><th className="py-2 px-4 border text-left">End</th><th className="py-2 px-4 border text-left">Label</th><th className="py-2 px-4 border text-left">Raw Sheet</th><th className="py-2 px-4 border text-left">Processed Sheet</th></tr></thead>
                  <tbody>{repMeta.length ? repMeta.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-4 border">{r.test_identifier_number ?? ""}</td><td className="py-2 px-4 border">{r.test_start_date ?? ""}</td><td className="py-2 px-4 border">{r.test_end_date ?? ""}</td><td className="py-2 px-4 border">{r.replicate_label ?? ""}</td><td className="py-2 px-4 border">{r.raw_sheet_name ?? ""}</td><td className="py-2 px-4 border">{r.processed_sheet_name ?? ""}</td></tr>
                  )) : <tr><td colSpan={6} className="py-2 px-4 border text-center">No metadata</td></tr>}</tbody>
                </table>
              </div>
            </CollapsibleSection>
            <CollapsibleSection title="Scientists">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {[{ title: "Lead Scientists", list: wp.lead_scientists }, { title: "Assay Scientists", list: wp.assay_scientists }].map((sec) => (
                  <div key={sec.title}>
                    <h3 className="text-lg font-semibold mb-3">{sec.title}</h3>
                    <table className="min-w-full bg-white border border-gray-200"><thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Name</th><th className="py-2 px-4 border text-left">Email</th></tr></thead>
                      <tbody>{sec.list?.length ? sec.list.map((s, i) => <tr key={i}><td className="py-2 px-4 border">{s.name ?? ""}</td><td className="py-2 px-4 border">{s.email ?? ""}</td></tr>) : <tr><td colSpan={2} className="py-2 px-4 border text-center">None</td></tr>}</tbody>
                    </table>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </>
        )}

        {/* ======== Raw Data ======== */}
        {activeTab === "raw-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">TGA Thermogram</h2>
              <button onClick={() => downloadTableCSV("rawTable", `TGA_Raw_${selectedRawBlock + 1}`)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"><Download size={16} /><span>Download</span></button>
            </div>

            {safeRaw.length > 0 ? (
              <>
                {safeRaw.length > 1 && (
                  <div className="mb-6"><label className="block text-sm font-medium text-gray-700 mb-2">Select Block:</label>
                    <select value={selectedRawBlock} onChange={(e) => setSelectedRawBlock(Number(e.target.value))} className="w-full md:w-2/3 bg-gray-50 border border-gray-300 text-sm rounded-lg p-2.5">
                      {safeRaw.map((b, i) => <option key={i} value={i}>{b.metric_name || `Block ${i + 1}`}</option>)}
                    </select>
                  </div>
                )}

                {/* Badges */}
                {(() => { const b = safeRaw[selectedRawBlock]; return (
                  <div className="flex flex-wrap gap-3 mb-6">
                    <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-3 py-1.5 rounded-full">{b.point_count} data points</span>
                    <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-3 py-1.5 rounded-full">Temp: {fmt(b.min_temperature_c, 0)}° – {fmt(b.max_temperature_c, 0)}°C</span>
                    <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-3 py-1.5 rounded-full">Mass: {fmt(b.min_mass_pct, 1)} – {fmt(b.max_mass_pct, 1)}%</span>
                  </div>
                ); })()}

                {/* Controls */}
                <div className="mb-4 flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">X-Axis:</span>
                    {(["temperature", "time"] as const).map((v) => (
                      <label key={v} className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="xaxis" checked={chartXAxis === v} onChange={() => setChartXAxis(v)} className="w-4 h-4 text-blue-600" />
                        <span className="text-sm text-gray-700 capitalize">{v === "temperature" ? "Temperature (°C)" : "Time (min)"}</span>
                      </label>
                    ))}
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={showDTG} onChange={(e) => setShowDTG(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                    <span className="text-sm text-gray-700">Show DTG curve</span>
                  </label>
                </div>

                {/* Chart */}
                {chartData.length > 0 && (
                  <div className="mb-8">
                    <ResponsiveContainer width="100%" height={480}>
                      <LineChart data={chartData} margin={{ top: 20, right: 60, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="x_value" type="number" domain={["dataMin", "dataMax"]} tickCount={15}
                          label={{ value: chartXAxis === "temperature" ? "Temperature (°C)" : "Time (min)", position: "insideBottom", offset: -5 }} />
                        <YAxis yAxisId="mass" label={{ value: "Mass (%)", angle: -90, position: "insideLeft" }} />
                        {showDTG && <YAxis yAxisId="dtg" orientation="right" label={{ value: "DTG (%/min)", angle: 90, position: "insideRight" }} />}
                        <Tooltip content={({ payload }) => {
                          if (!payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-gray-300 p-3 rounded shadow-lg text-sm">
                              <p><span className="font-semibold">Temp:</span> {fmt(d.temperature, 1)} °C</p>
                              <p><span className="font-semibold">Time:</span> {fmt(d.time, 3)} min</p>
                              <p><span className="font-semibold">Mass:</span> {fmt(d.mass_pct, 2)} %</p>
                              {d.dtg != null && <p><span className="font-semibold">DTG:</span> {fmt(d.dtg, 4)} %/min</p>}
                            </div>
                          );
                        }} />
                        {showDTG && <Legend />}

                        {stageLines.map((sl, i) => (
                          <React.Fragment key={i}>
                            <ReferenceLine yAxisId="mass" x={sl.start} stroke="#ef4444" strokeDasharray="4 4" />
                            {sl.end != null && <ReferenceLine yAxisId="mass" x={sl.end} stroke="#f97316" strokeDasharray="4 4" />}
                            {sl.peak != null && <ReferenceLine yAxisId="mass" x={sl.peak} stroke="#8b5cf6" strokeDasharray="2 2" />}
                          </React.Fragment>
                        ))}

                        <Line yAxisId="mass" dataKey="mass_pct" name="Mass (%)" stroke="#2563eb" dot={false} strokeWidth={2} isAnimationActive={false} legendType="none" />
                        {showDTG && <Line yAxisId="dtg" dataKey="dtg" name="DTG (%/min)" stroke="#dc2626" dot={false} strokeWidth={1.5} opacity={0.7} isAnimationActive={false} />}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Table preview */}
                <h4 className="text-md font-semibold mb-3">Raw Data Preview (First 100 of {safeRaw[selectedRawBlock].point_count})</h4>
                <div className="overflow-x-auto">
                  <table id="rawTable" className="min-w-full bg-white border border-gray-200 text-sm">
                    <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-right">Time (min)</th><th className="py-2 px-3 border text-right">Temp (°C)</th><th className="py-2 px-3 border text-right">Mass (mg)</th><th className="py-2 px-3 border text-right">DTG (%/min)</th><th className="py-2 px-3 border text-right">Mass (%)</th></tr></thead>
                    <tbody>
                      {safeRaw[selectedRawBlock].data_points.slice(0, 100).map((p, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                          <td className="py-2 px-3 border text-right">{fmt(p.time_min, 3)}</td>
                          <td className="py-2 px-3 border text-right">{fmt(p.temperature_c, 2)}</td>
                          <td className="py-2 px-3 border text-right">{fmt(p.mass_mg, 6)}</td>
                          <td className="py-2 px-3 border text-right">{fmt(p.dtg_pct_per_min, 5)}</td>
                          <td className="py-2 px-3 border text-right">{fmt(p.mass_pct, 4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <p className="text-center text-gray-500">No raw data available.</p>}
          </div>
        )}

        {/* ======== Processed Data ======== */}
        {activeTab === "processed-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">Decomposition Stages</h2>
              <button onClick={() => downloadTableCSV("stagesTable", "TGA_Stages")} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"><Download size={16} /><span>Download</span></button>
            </div>

            {safeStages.length > 0 ? (
              <>
                {/* Stage cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                  {safeStages.map((s, i) => (
                    <div key={i} className="bg-orange-50 border border-orange-200 rounded-lg p-5">
                      <p className="text-sm font-semibold text-orange-700 mb-3">{s.replicate_label ?? `Stage ${i + 1}`}</p>
                      <div className="space-y-1.5 text-sm">
                        <p><span className="text-gray-500">T Start:</span> <span className="font-medium">{s.t_start_c != null ? `${s.t_start_c} °C` : "N/A"}</span></p>
                        <p><span className="text-gray-500">T End:</span> <span className="font-medium">{s.t_end_c != null ? `${s.t_end_c} °C` : "N/A"}</span></p>
                        <p><span className="text-gray-500">T Peak:</span> <span className="font-medium">{s.t_peak_c != null ? `${s.t_peak_c} °C` : "N/A"}</span></p>
                        <p><span className="text-gray-500">Mass Loss:</span> <span className="font-semibold text-orange-800">{s.mass_loss_pct != null ? `${s.mass_loss_pct}%` : "N/A"}</span></p>
                        <p><span className="text-gray-500">Loss at Final T:</span> <span className="font-semibold text-orange-800">{s.mass_loss_at_final_temp_pct != null ? `${s.mass_loss_at_final_temp_pct}%` : "N/A"}</span></p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table id="stagesTable" className="min-w-full bg-white border border-gray-200">
                    <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Replicate</th><th className="py-2 px-4 border text-right">T Start (°C)</th><th className="py-2 px-4 border text-right">T End (°C)</th><th className="py-2 px-4 border text-right">T Peak (°C)</th><th className="py-2 px-4 border text-right">Mass Loss (%)</th><th className="py-2 px-4 border text-right">Loss at Final T (%)</th></tr></thead>
                    <tbody>{safeStages.map((s, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                        <td className="py-2 px-4 border font-medium">{s.replicate_label ?? ""}</td>
                        <td className="py-2 px-4 border text-right">{s.t_start_c ?? ""}</td>
                        <td className="py-2 px-4 border text-right">{s.t_end_c ?? ""}</td>
                        <td className="py-2 px-4 border text-right">{s.t_peak_c ?? ""}</td>
                        <td className="py-2 px-4 border text-right">{s.mass_loss_pct ?? ""}</td>
                        <td className="py-2 px-4 border text-right">{s.mass_loss_at_final_temp_pct ?? ""}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </>
            ) : <p className="text-center text-gray-500">No processed data available.</p>}
          </div>
        )}

        {/* ======== Final Results ======== */}
        {activeTab === "results" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">TGA Final Results</h2>
              <button onClick={() => downloadTableCSV("frTable", "TGA_FinalResults")} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"><Download size={16} /><span>Download</span></button>
            </div>

            {safeFR.length > 0 ? (
              <>
                {/* Result cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                  {safeFR.map((fr, i) => {
                    const hasValue = fr.value != null;
                    return (
                      <div key={i} className={`border rounded-lg p-5 ${hasValue ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
                        <p className={`text-sm font-medium mb-2 ${hasValue ? "text-blue-600" : "text-gray-500"}`}>{fr.metric_name ?? `Metric ${i + 1}`}</p>
                        <p className={`text-2xl font-bold ${hasValue ? "text-blue-800" : "text-gray-400"}`}>{fr.value != null ? String(fr.value) : "N/A"}</p>
                        {fr.std_dev_pct != null && <p className="text-xs text-gray-500 mt-1">SD: {fr.std_dev_pct}%</p>}
                      </div>
                    );
                  })}
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table id="frTable" className="min-w-full bg-white border border-gray-200">
                    <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Metric</th><th className="py-2 px-4 border text-right">Value</th><th className="py-2 px-4 border text-right">Std. Dev. (%)</th></tr></thead>
                    <tbody>{safeFR.map((fr, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                        <td className="py-2 px-4 border font-medium">{fr.metric_name ?? ""}</td>
                        <td className="py-2 px-4 border text-right">{fr.value != null ? String(fr.value) : ""}</td>
                        <td className="py-2 px-4 border text-right">{fr.std_dev_pct != null ? String(fr.std_dev_pct) : ""}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </>
            ) : <p className="text-center text-gray-500">No final results available.</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default TGADataViewer;