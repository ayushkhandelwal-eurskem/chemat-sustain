"use client";
import React, { FC, useEffect, useState, useMemo, useCallback } from "react";
import { api } from "@/lib/axios";
import { Download, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,  ResponsiveContainer } from "recharts";

/* ================================================================ Types ================================================================ */
interface PageProps { work_package: string; element: string; test: string; file?: string; }
interface Scientist { name: string | null; email: string | null; }
interface WorkPackageData { wp_name: string | null; partner: string | null; laboratory_name: string | null; full_test_name: string | null; test_acronym: string | null; test_type: string | null; endpoint: string | null; endpoint_outcome: string | null; sop: string | null; path: string | null; lead_scientists: Scientist[]; assay_scientists: Scientist[]; }
interface MaterialData { material_identifier: string | null; erm_id: string | null; material_name: string | null; core_chemistry: string | null; cas_no: string | null; cas_for_core: string | null; material_supplier: string | null; catalog_number: string | null; material_state: string | null; batch: string | null; vial: string | null; preparation_date: string | null; molar_concentration: string | null; particles_stock: string | null; }
interface DispersionData { dispersion_protocol: string | null; dispersion_technique: string | null; dispersion_medium: string | null; sonicator_type: string | null; power_w: string | null; sonication_time_s: string | null; tip_thickness_mm: string | null; tip_composition: string | null; bath_volume_dm3: string | null; sample_volume: string | null; final_concentration: string | null; additional_info: string | null; }
interface SampleMass { label: string; value: string | null; notes?: string; }
interface InstrumentationData { instrument_model: string | null; crucible_type: string | null; replication_count: number | string | null; replicate_labels: string[]; sample_masses: SampleMass[]; protective_atmosphere: string | null; temperature_range: string | null; heating_speed: string | null; }
interface ReplicationMetadata { test_identifier_number: string | null; test_start_date: string | null; test_end_date: string | null; replicate_label: string | null; raw_sheet_name: string | null; processed_sheet_name: string | null; }
interface TGADataPoint { time_min: number | null; temperature_c: number | null; mass_pct: number | null; dtg_pct_per_min: number | null; }
interface TGARawDataBlock { metric_name: string | null; raw_sheet_name: string | null; run_label: string | null; time_unit: string | null; temperature_unit: string | null; mass_pct_unit: string | null; dtg_unit: string | null; point_count: number | null; min_time_min: number | null; max_time_min: number | null; min_temperature_c: number | null; max_temperature_c: number | null; min_mass_pct: number | null; max_mass_pct: number | null; min_dtg: number | null; max_dtg: number | null; data_points: TGADataPoint[]; }
interface TGAProcessedReplicateRow { replicate_label: string | null; values: Record<string, number | null>; }
interface TGAProcessedDataBlock { headers: string[]; replicates: TGAProcessedReplicateRow[]; mean_row: TGAProcessedReplicateRow | null; std_dev_row: TGAProcessedReplicateRow | null; legend: Record<string, string>; }
interface TGAFinalResultEntry { metric_name: string | null; value: number | string | null; std_dev: number | string | null; std_dev_unit: string | null; }
interface ParserWarning { type?: string; note?: string; }
interface TGAData {
  test_details: { work_package: WorkPackageData; material: MaterialData; cell_line: Record<string, never>; dispersion: DispersionData; instrumentation: InstrumentationData; };
  replications: ReplicationMetadata[];
  raw_data: TGARawDataBlock[];
  processed_data: { available: boolean; blocks: TGAProcessedDataBlock[]; };
  final_results: TGAFinalResultEntry[];
  statistical_analysis: { available: boolean; notes: string; };
  parser_warnings?: ParserWarning[];
}

type TabKey = "test-conditions" | "raw-data" | "processed-data" | "results";
const TABS: { key: TabKey; label: string }[] = [
  { key: "test-conditions", label: "Test Conditions" }, { key: "raw-data", label: "Raw Data" },
  { key: "processed-data", label: "Processed Data" }, { key: "results", label: "Final Results" },
];
const MASS_COLORS = ["#c08020", "#dc2626", "#d4a017", "#16a34a", "#8b5cf6", "#ec4899"];
const DTG_COLORS = ["#2563eb", "#16a34a", "#7c3aed", "#0891b2", "#ea580c", "#be185d"];

const degC = (s: string) => s.replace(/oC/g, "°C");
const fmt = (v: any, d = 4) => { if (v == null || v === "") return ""; if (typeof v === "number") return v.toFixed(d); return String(v); };
const csvEsc = (v: string) => `"${v.replace(/"/g, '""')}"`;
function dlCSV(id: string, fn: string) { const t = document.getElementById(id); if (!t) return; let csv = "data:text/csv;charset=utf-8,"; t.querySelectorAll("tr").forEach(r => { csv += Array.from(r.querySelectorAll("th,td")).map(c => csvEsc(c.textContent ?? "")).join(",") + "\r\n"; }); const a = document.createElement("a"); a.href = encodeURI(csv); a.download = `${fn}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); }

/* ================================================================ UI Blocks ================================================================ */
const Collapse: FC<{ title: string; open?: boolean; children: React.ReactNode }> = ({ title, open: def = true, children }) => {
  const [o, setO] = useState(def);
  return (<div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden"><button className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition" onClick={() => setO(p => !p)}><h2 className="text-xl font-bold text-blue-800">{title}</h2>{o ? <ChevronUp className="text-gray-400" size={20} /> : <ChevronDown className="text-gray-400" size={20} />}</button>{o && <div className="px-6 pb-6">{children}</div>}</div>);
};
const KV: FC<{ id: string; rows: { label: string; value: React.ReactNode }[]; dl?: string }> = ({ id, rows, dl }) => (
  <>{dl && <div className="flex justify-end mb-3"><button onClick={() => dlCSV(id, dl)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>Download</span></button></div>}<div className="overflow-x-auto"><table id={id} className="min-w-full bg-white border border-gray-200"><thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Property</th><th className="py-2 px-4 border text-left">Value</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-4 border font-medium">{r.label}</td><td className="py-2 px-4 border">{r.value ?? ""}</td></tr>)}</tbody></table></div></>
);

/* ================================================================ Chart Data ================================================================ */

/**
 * Build per-run chart data. Each run gets its OWN data array — no sparse nulls.
 * This is identical to how DSC (which works) structures its data.
 */
function buildPerRunData(
  rawBlocks: TGARawDataBlock[],
  runIndices: number[],
  xAxis: "temperature" | "time",
  yField: "mass_pct" | "dtg_pct_per_min"
): Record<string, any>[] {
  const useTemp = xAxis === "temperature";
  const rows: Record<string, any>[] = [];
  for (const idx of runIndices) {
    const b = rawBlocks[idx];
    if (!b?.data_points?.length) continue;
    for (const p of b.data_points) {
      const xVal = useTemp ? p.temperature_c : p.time_min;
      const yVal = p[yField];
      if (xVal == null || yVal == null) continue;
      const row: Record<string, any> = { x_value: xVal, temperature: p.temperature_c ?? 0, time: p.time_min ?? 0 };
      row[`run_${idx}`] = yVal;
      rows.push(row);
    }
  }
  rows.sort((a, b) => a.x_value - b.x_value);
  return rows;
}

/** Single-axis TGA chart — NO yAxisId, structurally identical to DSC (which works) */
const TGASingleChart: FC<{
  rawBlocks: TGARawDataBlock[];
  runIndices: number[];
  chartXAxis: "temperature" | "time";
  yField: "mass_pct" | "dtg_pct_per_min";
  yLabel: string;
  colors: string[];
  namePrefix: string;
  height?: number;
}> = ({ rawBlocks, runIndices, chartXAxis, yField, yLabel, colors, namePrefix, height = 400 }) => {
  const chartData = useMemo(
    () => buildPerRunData(rawBlocks, runIndices, chartXAxis, yField),
    [rawBlocks, runIndices, chartXAxis, yField]
  );

  if (!chartData.length) return <p className="text-center text-gray-500 py-4">No chart data available.</p>;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="x_value" type="number" domain={["dataMin", "dataMax"]} tickCount={12}
          label={{ value: chartXAxis === "temperature" ? "Temperature [°C]" : "Time [min]", position: "insideBottom", offset: -10 }} />
        <YAxis label={{ value: yLabel, angle: -90, position: "insideLeft" }} />
        <Tooltip content={({ payload }) => {
          if (!payload?.length) return null;
          const d = payload[0].payload;
          return (<div className="bg-white border border-gray-300 p-3 rounded shadow-lg text-sm">
            <p><span className="font-semibold">Temp:</span> {fmt(d.temperature, 1)} °C</p>
            <p><span className="font-semibold">Time:</span> {fmt(d.time, 3)} min</p>
            {payload.filter(p => p.value != null).map((p, i) => <p key={i} style={{ color: p.color }}><span className="font-semibold">{p.name}:</span> {fmt(p.value as number, 4)}</p>)}
          </div>);
        }} />
        {runIndices.map(i => {
          const b = rawBlocks[i]; if (!b) return null;
          return <Line key={i} dataKey={`run_${i}`} name={`${namePrefix}_${b.run_label}`} stroke={colors[i % colors.length]} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />;
        })}
      </LineChart>
    </ResponsiveContainer>
  );
};

/** Composite TGA chart: Mass chart + optional DTG chart stacked vertically */
const TGAOverlayChart: FC<{
  rawBlocks: TGARawDataBlock[];
  runIndices: number[];
  chartXAxis: "temperature" | "time";
  showDTG: boolean;
  height?: number;
}> = ({ rawBlocks, runIndices, chartXAxis, showDTG, height = 480 }) => (
  <div>
    <TGASingleChart rawBlocks={rawBlocks} runIndices={runIndices} chartXAxis={chartXAxis}
      yField="mass_pct" yLabel="TG [%]" colors={MASS_COLORS} namePrefix="Mass" height={showDTG ? Math.round(height * 0.6) : height} />
    {showDTG && (
      <TGASingleChart rawBlocks={rawBlocks} runIndices={runIndices} chartXAxis={chartXAxis}
        yField="dtg_pct_per_min" yLabel="DTG [%/min]" colors={DTG_COLORS} namePrefix="DTG" height={Math.round(height * 0.4)} />
    )}
  </div>
);

/* ================================================================ Main ================================================================ */
const TGADataViewer: FC<PageProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<TGAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("test-conditions");
  const [chartXAxis, setChartXAxis] = useState<"temperature" | "time">("temperature");
  const [showDTG, setShowDTG] = useState(true);
  const [selectedRuns, setSelectedRuns] = useState<number[]>([]);
  const [tableRunIdx, setTableRunIdx] = useState(0);

  useEffect(() => { const ac = new AbortController(); (async () => { try { setLoading(true); const res = await api.post(`/tests/listings`, { work_package_name: work_package, element_cms_id: element, test_name: test }, { signal: ac.signal }); if (res.status !== 200) throw new Error("Bad"); setData(res.data); } catch (err: any) { if (err.name !== "CanceledError" && err.name !== "AbortError") setError("Failed to load TGA data."); } finally { setLoading(false); } })(); return () => ac.abort(); }, [work_package, element, test]);

  const safeRaw: TGARawDataBlock[] = useMemo(() => Array.isArray(data?.raw_data) ? data.raw_data : [], [data?.raw_data]);
  const safeBlocks: TGAProcessedDataBlock[] = useMemo(() => data?.processed_data?.blocks ?? [], [data?.processed_data]);
  const safeFR: TGAFinalResultEntry[] = useMemo(() => Array.isArray(data?.final_results) ? data.final_results : [], [data?.final_results]);

  // All run indices — stable array
  const allIndices = useMemo(() => safeRaw.map((_, i) => i), [safeRaw.length]);

  // Initialize selected runs to all when data loads
  useEffect(() => { if (safeRaw.length) setSelectedRuns(safeRaw.map((_, i) => i)); }, [safeRaw.length]);

  const toggleRun = useCallback((idx: number) => {
    setSelectedRuns(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx].sort());
  }, []);

  // Active indices for the raw data chart (fallback to all if none selected)
  const activeIndices = selectedRuns.length > 0 ? selectedRuns : allIndices;

  if (loading) return <div className="bg-white flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" /></div>;
  if (error || !data) return <div className="flex items-center justify-center min-h-screen"><div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"><p>{error || "No data."}</p></div></div>;

  const td = data.test_details, wp = td.work_package, mat = td.material, disp = td.dispersion, inst = td.instrumentation;
  const repMeta = data.replications ?? [], warnings = data.parser_warnings ?? [];

  return (
    <div className="bg-gray-50 min-h-screen py-8 text-black">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-4">TGA Test Data Report</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><h2 className="text-lg font-semibold mb-3">Test Parameters</h2><div className="bg-blue-50 p-4 rounded-md"><p className="mb-2"><span className="font-semibold">Work Package:</span> {wp.wp_name || work_package}</p><p className="mb-2"><span className="font-semibold">CMS Identifier:</span> {mat.material_identifier ?? element}</p><p className="mb-2"><span className="font-semibold">Partner:</span> {wp.partner ?? ""}</p><p><span className="font-semibold">Material:</span> {mat.material_name ?? ""}</p></div></div>
            <div><h2 className="text-lg font-semibold mb-3">Test Information</h2><div className="bg-blue-50 p-4 rounded-md"><p className="mb-2"><span className="font-semibold">Full Name:</span> {wp.full_test_name ?? ""}</p><p className="mb-2"><span className="font-semibold">Acronym:</span> {wp.test_acronym ?? ""}</p><p className="mb-2"><span className="font-semibold">Endpoint:</span> {wp.endpoint ?? ""}</p><p><span className="font-semibold">Outcome:</span> {wp.endpoint_outcome ?? ""}</p></div></div>
          </div>
          {warnings.length > 0 && <div className="mt-4 bg-yellow-50 border border-yellow-300 rounded-md p-3"><div className="flex items-center gap-2 mb-2"><AlertTriangle size={16} className="text-yellow-600" /><span className="font-semibold text-yellow-800 text-sm">Warnings ({warnings.length})</span></div><ul className="text-sm text-yellow-700 space-y-1">{warnings.map((w, i) => <li key={i}>{w.note || w.type}</li>)}</ul></div>}
        </div>

        <div className="w-full mb-8"><ul className="relative flex flex-wrap p-1.5 list-none rounded-md bg-slate-100" role="tablist">{TABS.map(tab => <li key={tab.key} className="z-30 flex-auto text-center" role="presentation"><button role="tab" aria-selected={activeTab === tab.key} className={`z-30 w-full px-0 py-2 text-sm mb-0 transition-all rounded-md ${activeTab === tab.key ? "bg-blue-600 text-white shadow-md" : "text-slate-600 hover:text-slate-800"}`} onClick={() => setActiveTab(tab.key)}>{tab.label}</button></li>)}</ul></div>

        {/* ===== Test Conditions ===== */}
        {activeTab === "test-conditions" && (<>
          <Collapse title="Material Information"><KV id="matTbl" dl="TGA_Material" rows={[{ label: "CMS Identifier", value: mat.material_identifier ?? element }, { label: "ERM Identifier", value: mat.erm_id }, { label: "Material Name", value: mat.material_name }, { label: "Core Chemistry", value: mat.core_chemistry }, { label: "CAS No", value: mat.cas_no }, { label: "Material Supplier", value: mat.material_supplier }, { label: "Catalog Number", value: mat.catalog_number }, { label: "Material State", value: mat.material_state }, { label: "Batch", value: mat.batch }, { label: "Preparation Date", value: mat.preparation_date }]} /></Collapse>
          <Collapse title="Sample Preparation"><KV id="dispTbl" dl="TGA_SamplePrep" rows={[{ label: "Dispersion Protocol", value: disp.dispersion_protocol }, { label: "Dispersion Technique", value: disp.dispersion_technique }, { label: "Dispersion Medium", value: disp.dispersion_medium }, { label: "Sonicator Type", value: disp.sonicator_type }, { label: "Power (W)", value: disp.power_w }, { label: "Sonication Time (s)", value: disp.sonication_time_s }, { label: "Bath Volume (dm³)", value: disp.bath_volume_dm3 }, { label: "Final Concentration", value: disp.final_concentration }, { label: "Additional Info", value: disp.additional_info }]} /></Collapse>
          <Collapse title="Instrumentation">
            <KV id="instTbl" dl="TGA_Instrumentation" rows={[{ label: "Instrument Model", value: inst.instrument_model }, { label: "Crucible Type", value: inst.crucible_type }, { label: "Replication Count", value: inst.replication_count }, { label: "Protective Atmosphere", value: inst.protective_atmosphere }, { label: "Temperature Range", value: inst.temperature_range }, { label: "Heating Speed", value: inst.heating_speed }]} />
            {inst.sample_masses?.length > 0 && <div className="mt-4"><h4 className="text-md font-semibold mb-2">Sample Masses</h4><table className="min-w-full bg-white border border-gray-200 text-sm"><thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Replicate</th><th className="py-2 px-4 border text-left">Mass</th><th className="py-2 px-4 border text-left">Notes</th></tr></thead><tbody>{inst.sample_masses.map((s, i) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-4 border">{s.label}</td><td className="py-2 px-4 border">{s.value ?? ""}</td><td className="py-2 px-4 border text-sm text-gray-500">{s.notes ?? ""}</td></tr>)}</tbody></table></div>}
          </Collapse>
          <Collapse title="Replication Metadata"><div className="overflow-x-auto"><table id="repTbl" className="min-w-full bg-white border border-gray-200"><thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Test ID</th><th className="py-2 px-4 border text-left">Start</th><th className="py-2 px-4 border text-left">End</th><th className="py-2 px-4 border text-left">Raw Sheet</th></tr></thead><tbody>{repMeta.length ? repMeta.map((r, i) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-4 border">{r.test_identifier_number}</td><td className="py-2 px-4 border">{r.test_start_date}</td><td className="py-2 px-4 border">{r.test_end_date}</td><td className="py-2 px-4 border">{r.raw_sheet_name}</td></tr>) : <tr><td colSpan={4} className="py-2 px-4 border text-center">None</td></tr>}</tbody></table></div></Collapse>
          <Collapse title="Scientists"><div className="grid grid-cols-1 md:grid-cols-2 gap-8">{[{ t: "Lead Scientists", l: wp.lead_scientists }, { t: "Assay Scientists", l: wp.assay_scientists }].map(s => <div key={s.t}><h3 className="text-lg font-semibold mb-3">{s.t}</h3><table className="min-w-full bg-white border border-gray-200"><thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Name</th><th className="py-2 px-4 border text-left">Email</th></tr></thead><tbody>{s.l?.length ? s.l.map((sc, i) => <tr key={i}><td className="py-2 px-4 border">{sc.name}</td><td className="py-2 px-4 border">{sc.email}</td></tr>) : <tr><td colSpan={2} className="py-2 px-4 border text-center">None</td></tr>}</tbody></table></div>)}</div></Collapse>
        </>)}

        {/* ===== Raw Data ===== */}
        {activeTab === "raw-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-blue-800 mb-6">TGA Thermograms</h2>
            {safeRaw.length > 0 ? (<>
              {safeRaw.length > 1 && (
                <div className="flex flex-wrap gap-3 mb-4">
                  {safeRaw.map((b, i) => (
                    <label key={i} className="inline-flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={selectedRuns.includes(i)} onChange={() => toggleRun(i)} className="w-4 h-4 rounded" style={{ accentColor: MASS_COLORS[i % MASS_COLORS.length] }} />
                      <span className="text-sm font-medium" style={{ color: MASS_COLORS[i % MASS_COLORS.length] }}>{b.run_label ?? `Run ${i + 1}`}</span>
                      <span className="text-xs text-gray-400">({b.point_count} pts)</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="mb-4 flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-3"><span className="text-sm font-medium text-gray-700">X-Axis:</span>
                  {(["temperature", "time"] as const).map(v => <label key={v} className="inline-flex items-center gap-1.5 cursor-pointer"><input type="radio" name="xaxis" checked={chartXAxis === v} onChange={() => setChartXAxis(v)} className="w-4 h-4 text-blue-600" /><span className="text-sm text-gray-700">{v === "temperature" ? "Temperature (°C)" : "Time (min)"}</span></label>)}
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showDTG} onChange={e => setShowDTG(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" /><span className="text-sm text-gray-700">Show DTG</span></label>
              </div>
              <div className="mb-8">
                <TGAOverlayChart rawBlocks={safeRaw} runIndices={activeIndices} chartXAxis={chartXAxis} showDTG={showDTG} />
              </div>
              <div className="mt-6">
                <div className="flex justify-between items-center mb-3 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <h4 className="text-md font-semibold">Raw Data Table</h4>
                    {safeRaw.length > 1 && <select value={tableRunIdx} onChange={e => setTableRunIdx(Number(e.target.value))} className="bg-gray-50 border border-gray-300 text-sm rounded-lg p-2">{safeRaw.map((b, i) => <option key={i} value={i}>{b.run_label ?? `Run ${i + 1}`} ({b.point_count} pts)</option>)}</select>}
                  </div>
                  <button onClick={() => dlCSV("rawTbl", `TGA_Raw_${safeRaw[tableRunIdx]?.run_label}`)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>Download</span></button>
                </div>
                <div className="overflow-x-auto"><table id="rawTbl" className="min-w-full bg-white border border-gray-200 text-sm"><thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-right">Time (min)</th><th className="py-2 px-3 border text-right">Temp (°C)</th><th className="py-2 px-3 border text-right">Mass (%)</th><th className="py-2 px-3 border text-right">DTG (%/min)</th></tr></thead>
                  <tbody>{safeRaw[tableRunIdx]?.data_points.map((p, i) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border text-right">{fmt(p.time_min, 4)}</td><td className="py-2 px-3 border text-right">{fmt(p.temperature_c, 2)}</td><td className="py-2 px-3 border text-right">{fmt(p.mass_pct, 5)}</td><td className="py-2 px-3 border text-right">{fmt(p.dtg_pct_per_min, 5)}</td></tr>)}</tbody>
                </table></div>
              </div>
            </>) : <p className="text-center text-gray-500">No raw data.</p>}
          </div>
        )}

        {/* ===== Processed Data ===== */}
        {activeTab === "processed-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-blue-800 mb-6">Processed Data</h2>
            {safeRaw.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4">Graphical Results — TGA Analysis {safeRaw.length > 1 ? `R1–R${safeRaw.length}` : ""}</h3>
                <TGAOverlayChart rawBlocks={safeRaw} runIndices={allIndices} chartXAxis="temperature" showDTG={true} height={450} />
              </div>
            )}
            {safeBlocks.length > 0 ? safeBlocks.map((blk, bi) => (
              <div key={bi} className="mb-8">
                <div className="flex justify-between items-center mb-3"><h3 className="text-lg font-semibold">Decomposition Stages</h3><button onClick={() => dlCSV(`procTbl${bi}`, `TGA_Processed_${bi + 1}`)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>Download</span></button></div>
                <div className="overflow-x-auto">
                  <table id={`procTbl${bi}`} className="min-w-full bg-white border border-gray-200 text-sm">
                    <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Replicate</th>{blk.headers.map((h, hi) => <th key={hi} className="py-2 px-3 border text-right">{degC(h)}</th>)}</tr></thead>
                    <tbody>
                      {blk.replicates.map((rep, ri) => <tr key={ri} className={ri % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border font-medium">{rep.replicate_label}</td>{blk.headers.map((h, hi) => <td key={hi} className="py-2 px-3 border text-right">{rep.values[h] != null ? fmt(rep.values[h]!, 2) : ""}</td>)}</tr>)}
                      {blk.mean_row && <tr className="bg-blue-50 font-semibold"><td className="py-2 px-3 border">Mean (x̄)</td>{blk.headers.map((h, hi) => <td key={hi} className="py-2 px-3 border text-right">{blk.mean_row!.values[h] != null ? fmt(blk.mean_row!.values[h]!, 2) : ""}</td>)}</tr>}
                      {blk.std_dev_row && <tr className="bg-blue-50"><td className="py-2 px-3 border font-semibold">SD (δ)</td>{blk.headers.map((h, hi) => <td key={hi} className="py-2 px-3 border text-right">{blk.std_dev_row!.values[h] != null ? fmt(blk.std_dev_row!.values[h]!, 2) : ""}</td>)}</tr>}
                    </tbody>
                  </table>
                </div>
                {Object.keys(blk.legend).length > 0 && <div className="mt-3 text-sm text-gray-500">{Object.entries(blk.legend).map(([k, v]) => <span key={k} className="mr-4"><span className="font-medium">{k}:</span> {v}</span>)}</div>}
              </div>
            )) : !safeRaw.length && <p className="text-center text-gray-500">No processed data.</p>}
          </div>
        )}

        {/* ===== Final Results ===== */}
        {activeTab === "results" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-blue-800">TGA Final Results</h2><button onClick={() => dlCSV("frTbl", "TGA_FinalResults")} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"><Download size={16} /><span>Download</span></button></div>
            {safeFR.length > 0 ? (<>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {safeFR.map((fr, i) => { const has = fr.value != null; return (
                  <div key={i} className={`border rounded-lg p-5 ${has ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
                    <p className={`text-sm font-medium mb-2 ${has ? "text-blue-600" : "text-gray-500"}`}>{degC(fr.metric_name ?? "")}</p>
                    <p className={`text-2xl font-bold ${has ? "text-blue-800" : "text-gray-400"}`}>{fr.value != null ? String(fr.value) : "N/A"}</p>
                    {fr.std_dev != null && <p className="text-sm text-gray-500 mt-1">± {fr.std_dev} {degC(fr.std_dev_unit ?? "")}</p>}
                  </div>
                ); })}
              </div>
              <div className="overflow-x-auto"><table id="frTbl" className="min-w-full bg-white border border-gray-200"><thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Metric</th><th className="py-2 px-4 border text-right">Value</th><th className="py-2 px-4 border text-right">Std. Dev.</th></tr></thead><tbody>{safeFR.map((fr, i) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-4 border font-medium">{degC(fr.metric_name ?? "")}</td><td className="py-2 px-4 border text-right">{fr.value != null ? String(fr.value) : ""}</td><td className="py-2 px-4 border text-right">{fr.std_dev != null ? `${fr.std_dev} ${degC(fr.std_dev_unit ?? "")}` : ""}</td></tr>)}</tbody></table></div>
            </>) : <p className="text-center text-gray-500">No final results.</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default TGADataViewer;