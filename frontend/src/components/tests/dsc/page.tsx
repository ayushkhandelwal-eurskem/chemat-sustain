"use client";
import React, { FC, useEffect, useState, useMemo, useCallback } from "react";
import { api } from "@/lib/axios";
import {
  Download, ChevronDown, ChevronUp, AlertTriangle, Droplets, Flame, Thermometer,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,  ResponsiveContainer,
} from "recharts";

/* ================================================================ Types ================================================================ */
interface PageProps { work_package: string; element: string; test: string; file?: string; }
interface Scientist { name: string | null; email: string | null; }
interface WorkPackageData { wp_name: string | null; partner: string | null; laboratory_name: string | null; full_test_name: string | null; test_acronym: string | null; test_type: string | null; endpoint: string | null; endpoint_outcome: string | null; sop: string | null; path: string | null; lead_scientists: Scientist[]; assay_scientists: Scientist[]; }
interface MaterialData { material_identifier: string | null; erm_id: string | null; material_name: string | null; core_chemistry: string | null; cas_no: string | null; cas_for_core: string | null; material_supplier: string | null; catalog_number: string | null; material_state: string | null; batch: string | null; vial: string | null; preparation_date: string | null; molar_concentration: string | null; particles_stock: string | null; }
interface DispersionData { dispersion_protocol: string | null; dispersion_technique: string | null; dispersion_medium: string | null; sonicator_type: string | null; power_w: string | null; sonication_time_s: string | null; tip_thickness_mm: string | null; tip_composition: string | null; bath_volume_dm3: string | null; sample_volume: string | null; final_concentration: string | null; additional_info: string | null; }
interface SampleMass { label: string; value: string | null; notes?: string; }
interface InstrumentationData { instrument_model: string | null; crucible_type: string | null; replication_count: number | string | null; replicate_labels: string[]; sample_masses: SampleMass[]; protective_atmosphere: string | null; temperature_range: string | null; heating_speed: string | null; }
interface ReplicationMetadata { test_identifier_number: string | null; test_start_date: string | null; test_end_date: string | null; replicate_label: string | null; raw_sheet_name: string | null; processed_sheet_name: string | null; }
interface DSCDataPoint { time_min: number | null; temperature_c: number | null; heat_flow_mw_per_mg: number | null; sensitivity_uv_per_mw: number | null; }
interface DSCRawDataBlock { metric_name: string | null; raw_sheet_name: string | null; run_label: string | null; time_unit: string | null; temperature_unit: string | null; heat_flow_unit: string | null; sensitivity_unit: string | null; point_count: number | null; min_time_min: number | null; max_time_min: number | null; min_temperature_c: number | null; max_temperature_c: number | null; min_heat_flow: number | null; max_heat_flow: number | null; data_points: DSCDataPoint[]; }
interface DSCProcessedReplicateRow { replicate_label: string | null; values: Record<string, number | null>; }
interface DSCProcessedDataBlock { headers: string[]; replicates: DSCProcessedReplicateRow[]; mean_row: DSCProcessedReplicateRow | null; std_dev_row: DSCProcessedReplicateRow | null; legend: Record<string, string>; }
interface DSCFinalResultEntry { metric_name: string | null; value: number | string | null; std_dev: number | string | null; std_dev_unit: string | null; character: string | null; }
interface ParserWarning { type?: string; note?: string; }
interface DSCData {
  test_details: { work_package: WorkPackageData; material: MaterialData; cell_line: Record<string, never>; dispersion: DispersionData; instrumentation: InstrumentationData; };
  replications: ReplicationMetadata[];
  raw_data: DSCRawDataBlock[];
  processed_data: { available: boolean; blocks: DSCProcessedDataBlock[]; };
  final_results: DSCFinalResultEntry[];
  statistical_analysis: { available: boolean; notes: string; };
  parser_warnings?: ParserWarning[];
}

type TabKey = "test-conditions" | "raw-data" | "processed-data" | "results";
const TABS: { key: TabKey; label: string }[] = [
  { key: "test-conditions", label: "Test Conditions" }, { key: "raw-data", label: "Raw Data" },
  { key: "processed-data", label: "Processed Data" }, { key: "results", label: "Final Results" },
];
const RUN_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

/* ================================================================ Helpers ================================================================ */
const degC = (s: string) => s.replace(/oC/g, "°C");
const fmt = (v: any, d = 4) => { if (v == null || v === "") return ""; if (typeof v === "number") return v.toFixed(d); return String(v); };
const csvEsc = (v: string) => `"${v.replace(/"/g, '""')}"`;
function dlCSV(id: string, fn: string) { const t = document.getElementById(id); if (!t) return; let csv = "data:text/csv;charset=utf-8,"; t.querySelectorAll("tr").forEach(r => { csv += Array.from(r.querySelectorAll("th,td")).map(c => csvEsc(c.textContent ?? "")).join(",") + "\r\n"; }); const a = document.createElement("a"); a.href = encodeURI(csv); a.download = `${fn}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); }

/**
 * Build chart data from multiple DSC runs — NO LTTB, NO unified x-axis merge.
 * Each run's data points create their own rows with only that run's column populated.
 * Recharts connectNulls draws each run as a continuous line through its own points.
 */
function buildDSCChartData(
  rawBlocks: DSCRawDataBlock[],
  runIndices: number[],
  xAxis: "temperature" | "time"
): Record<string, any>[] {
  const useTemp = xAxis === "temperature";
  const allPoints: { x: number; runIdx: number; hf: number; time: number; temp: number }[] = [];

  for (const idx of runIndices) {
    const b = rawBlocks[idx];
    if (!b?.data_points?.length) continue;
    for (const p of b.data_points) {
      const xVal = useTemp ? p.temperature_c : p.time_min;
      if (xVal == null || p.heat_flow_mw_per_mg == null) continue;
      allPoints.push({ x: xVal, runIdx: idx, hf: p.heat_flow_mw_per_mg, time: p.time_min ?? 0, temp: p.temperature_c ?? 0 });
    }
  }

  allPoints.sort((a, b) => a.x - b.x);

  return allPoints.map(pt => {
    const row: Record<string, any> = { x_value: pt.x, temperature: pt.temp, time: pt.time };
    row[`run_${pt.runIdx}`] = pt.hf;
    return row;
  });
}

/* ================================================================ UI Blocks ================================================================ */
const Collapse: FC<{ title: string; open?: boolean; children: React.ReactNode }> = ({ title, open: def = true, children }) => {
  const [o, setO] = useState(def);
  return (<div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden"><button className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition" onClick={() => setO(p => !p)}><h2 className="text-xl font-bold text-blue-800">{title}</h2>{o ? <ChevronUp className="text-gray-400" size={20} /> : <ChevronDown className="text-gray-400" size={20} />}</button>{o && <div className="px-6 pb-6">{children}</div>}</div>);
};
const KV: FC<{ id: string; rows: { label: string; value: React.ReactNode }[]; dl?: string }> = ({ id, rows, dl }) => (
  <>{dl && <div className="flex justify-end mb-3"><button onClick={() => dlCSV(id, dl)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>Download</span></button></div>}<div className="overflow-x-auto"><table id={id} className="min-w-full bg-white border border-gray-200"><thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Property</th><th className="py-2 px-4 border text-left">Value</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-4 border font-medium">{r.label}</td><td className="py-2 px-4 border">{r.value ?? ""}</td></tr>)}</tbody></table></div></>
);
const EventIcon: FC<{ c: string | null }> = ({ c }) => { const s = (c ?? "").toLowerCase(); if (s.includes("endo")) return <Droplets size={20} className="text-blue-500" />; if (s.includes("exo")) return <Flame size={20} className="text-red-500" />; return <Thermometer size={20} className="text-gray-500" />; };

/** Reusable DSC overlay chart */
const DSCOverlayChart: FC<{
  rawBlocks: DSCRawDataBlock[];
  runIndices: number[];
  chartXAxis: "temperature" | "time";
  height?: number;
}> = ({ rawBlocks, runIndices, chartXAxis, height = 480 }) => {
  const chartData = useMemo(
    () => buildDSCChartData(rawBlocks, runIndices, chartXAxis),
    [rawBlocks, runIndices, chartXAxis]
  );

  if (!chartData.length) return <p className="text-center text-gray-500 py-8">No chart data available.</p>;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="x_value" type="number" domain={["dataMin", "dataMax"]} tickCount={15}
          label={{ value: chartXAxis === "temperature" ? "Temperature [°C]" : "Time [min]", position: "insideBottom", offset: -10 }} />
        <YAxis label={{ value: `DSC [${rawBlocks[0]?.heat_flow_unit ?? "mW/mg"}]`, angle: -90, position: "insideLeft" }} />
        <Tooltip content={({ payload }) => {
          if (!payload?.length) return null; const d = payload[0].payload;
          return (<div className="bg-white border border-gray-300 p-3 rounded shadow-lg text-sm">
            <p><span className="font-semibold">Temp:</span> {fmt(d.temperature, 1)} °C</p>
            <p><span className="font-semibold">Time:</span> {fmt(d.time, 3)} min</p>
            {payload.filter(p => p.value != null).map((p, i) => <p key={i} style={{ color: p.color }}><span className="font-semibold">{p.name}:</span> {fmt(p.value as number, 4)}</p>)}
          </div>);
        }} />
        {runIndices.map(i => {
          const b = rawBlocks[i]; if (!b) return null;
          return <Line key={i} dataKey={`run_${i}`} name={b.run_label ?? `Run ${i + 1}`} stroke={RUN_COLORS[i % RUN_COLORS.length]} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />;
        })}
      </LineChart>
    </ResponsiveContainer>
  );
};

/* ================================================================ Main ================================================================ */
const DSCDataViewer: FC<PageProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<DSCData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("test-conditions");
  const [chartXAxis, setChartXAxis] = useState<"temperature" | "time">("temperature");
  const [selectedRuns, setSelectedRuns] = useState<number[]>([]);
  const [tableRunIdx, setTableRunIdx] = useState(0);

  useEffect(() => { const ac = new AbortController(); (async () => { try { setLoading(true); const res = await api.post(`/tests/listings`, { work_package_name: work_package, element_cms_id: element, test_name: test }, { signal: ac.signal }); if (res.status !== 200) throw new Error("Bad response"); setData(res.data); } catch (err: any) { if (err.name !== "CanceledError" && err.name !== "AbortError") setError("Failed to load DSC data."); } finally { setLoading(false); } })(); return () => ac.abort(); }, [work_package, element, test]);

  const safeRaw: DSCRawDataBlock[] = useMemo(() => Array.isArray(data?.raw_data) ? data.raw_data : [], [data?.raw_data]);
  const safeBlocks: DSCProcessedDataBlock[] = useMemo(() => data?.processed_data?.blocks ?? [], [data?.processed_data]);
  const safeFR: DSCFinalResultEntry[] = useMemo(() => Array.isArray(data?.final_results) ? data.final_results : [], [data?.final_results]);

  const allIndices = useMemo(() => safeRaw.map((_, i) => i), [safeRaw.length]);
  useEffect(() => { if (safeRaw.length) setSelectedRuns(safeRaw.map((_, i) => i)); }, [safeRaw.length]);

  const toggleRun = useCallback((idx: number) => {
    setSelectedRuns(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx].sort());
  }, []);

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
          <h1 className="text-2xl font-bold text-blue-800 mb-4">DSC Test Data Report</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><h2 className="text-lg font-semibold mb-3">Test Parameters</h2><div className="bg-blue-50 p-4 rounded-md"><p className="mb-2"><span className="font-semibold">Work Package:</span> {wp.wp_name || work_package}</p><p className="mb-2"><span className="font-semibold">CMS Identifier:</span> {mat.material_identifier ?? element}</p><p className="mb-2"><span className="font-semibold">ERM Identifier:</span> {mat.erm_id ?? "N/A"}</p><p className="mb-2"><span className="font-semibold">Partner:</span> {wp.partner ?? ""}</p><p><span className="font-semibold">Material:</span> {mat.material_name ?? ""}</p></div></div>
            <div><h2 className="text-lg font-semibold mb-3">Test Information</h2><div className="bg-blue-50 p-4 rounded-md"><p className="mb-2"><span className="font-semibold">Full Name:</span> {wp.full_test_name ?? ""}</p><p className="mb-2"><span className="font-semibold">Acronym:</span> {wp.test_acronym ?? ""}</p><p className="mb-2"><span className="font-semibold">Type:</span> {wp.test_type ?? ""}</p><p className="mb-2"><span className="font-semibold">Endpoint:</span> {wp.endpoint ?? ""}</p><p><span className="font-semibold">Outcome:</span> {wp.endpoint_outcome ?? ""}</p></div></div>
          </div>
          {warnings.length > 0 && <div className="mt-4 bg-yellow-50 border border-yellow-300 rounded-md p-3"><div className="flex items-center gap-2 mb-2"><AlertTriangle size={16} className="text-yellow-600" /><span className="font-semibold text-yellow-800 text-sm">Warnings ({warnings.length})</span></div><ul className="text-sm text-yellow-700 space-y-1">{warnings.map((w, i) => <li key={i}>{w.note || w.type}</li>)}</ul></div>}
        </div>

        <div className="w-full mb-8"><ul className="relative flex flex-wrap p-1.5 list-none rounded-md bg-slate-100" role="tablist">{TABS.map(tab => <li key={tab.key} className="z-30 flex-auto text-center" role="presentation"><button role="tab" aria-selected={activeTab === tab.key} className={`z-30 w-full px-0 py-2 text-sm mb-0 transition-all rounded-md ${activeTab === tab.key ? "bg-blue-600 text-white shadow-md" : "text-slate-600 hover:text-slate-800"}`} onClick={() => setActiveTab(tab.key)}>{tab.label}</button></li>)}</ul></div>

        {/* ===== Test Conditions ===== */}
        {activeTab === "test-conditions" && (<>
          <Collapse title="Material Information"><KV id="matTbl" dl="DSC_Material" rows={[{ label: "CMS Identifier", value: mat.material_identifier ?? element }, { label: "ERM Identifier", value: mat.erm_id }, { label: "Material Name", value: mat.material_name }, { label: "Core Chemistry", value: mat.core_chemistry }, { label: "CAS No", value: mat.cas_no }, { label: "CAS for Core", value: mat.cas_for_core }, { label: "Material Supplier", value: mat.material_supplier }, { label: "Catalog Number", value: mat.catalog_number }, { label: "Material State", value: mat.material_state }, { label: "Batch", value: mat.batch }, { label: "Preparation Date", value: mat.preparation_date }]} /></Collapse>
          <Collapse title="Sample Preparation"><KV id="dispTbl" dl="DSC_SamplePrep" rows={[{ label: "Dispersion Protocol", value: disp.dispersion_protocol }, { label: "Dispersion Technique", value: disp.dispersion_technique }, { label: "Dispersion Medium", value: disp.dispersion_medium }, { label: "Sonicator Type", value: disp.sonicator_type }, { label: "Power (W)", value: disp.power_w }, { label: "Sonication Time (s)", value: disp.sonication_time_s }, { label: "Bath Volume (dm³)", value: disp.bath_volume_dm3 }, { label: "Sample Volume", value: disp.sample_volume }, { label: "Final Concentration", value: disp.final_concentration }, { label: "Additional Info", value: disp.additional_info }]} /></Collapse>
          <Collapse title="Instrumentation">
            <KV id="instTbl" dl="DSC_Instrumentation" rows={[{ label: "Instrument Model", value: inst.instrument_model }, { label: "Crucible Type", value: inst.crucible_type }, { label: "Replication Count", value: inst.replication_count }, { label: "Protective Atmosphere", value: inst.protective_atmosphere }, { label: "Temperature Range", value: inst.temperature_range }, { label: "Heating Speed", value: inst.heating_speed }]} />
            {inst.sample_masses?.length > 0 && <div className="mt-4"><h4 className="text-md font-semibold mb-2">Sample Masses</h4><table className="min-w-full bg-white border border-gray-200 text-sm"><thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Replicate</th><th className="py-2 px-4 border text-left">Mass</th><th className="py-2 px-4 border text-left">Notes</th></tr></thead><tbody>{inst.sample_masses.map((s, i) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-4 border">{s.label}</td><td className="py-2 px-4 border">{s.value ?? ""}</td><td className="py-2 px-4 border text-sm text-gray-500">{s.notes ?? ""}</td></tr>)}</tbody></table></div>}
          </Collapse>
          <Collapse title="Replication Metadata"><div className="overflow-x-auto"><table id="repTbl" className="min-w-full bg-white border border-gray-200"><thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Test ID</th><th className="py-2 px-4 border text-left">Start</th><th className="py-2 px-4 border text-left">End</th><th className="py-2 px-4 border text-left">Raw Sheet</th></tr></thead><tbody>{repMeta.length ? repMeta.map((r, i) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-4 border">{r.test_identifier_number}</td><td className="py-2 px-4 border">{r.test_start_date}</td><td className="py-2 px-4 border">{r.test_end_date}</td><td className="py-2 px-4 border">{r.raw_sheet_name}</td></tr>) : <tr><td colSpan={4} className="py-2 px-4 border text-center">None</td></tr>}</tbody></table></div></Collapse>
          <Collapse title="Scientists"><div className="grid grid-cols-1 md:grid-cols-2 gap-8">{[{ t: "Lead Scientists", l: wp.lead_scientists }, { t: "Assay Scientists", l: wp.assay_scientists }].map(s => <div key={s.t}><h3 className="text-lg font-semibold mb-3">{s.t}</h3><table className="min-w-full bg-white border border-gray-200"><thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Name</th><th className="py-2 px-4 border text-left">Email</th></tr></thead><tbody>{s.l?.length ? s.l.map((sc, i) => <tr key={i}><td className="py-2 px-4 border">{sc.name}</td><td className="py-2 px-4 border">{sc.email}</td></tr>) : <tr><td colSpan={2} className="py-2 px-4 border text-center">None</td></tr>}</tbody></table></div>)}</div></Collapse>
        </>)}

        {/* ===== Raw Data ===== */}
        {activeTab === "raw-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-blue-800 mb-6">DSC Thermograms</h2>
            {safeRaw.length > 0 ? (<>
              {safeRaw.length > 1 && (
                <div className="flex flex-wrap gap-3 mb-4">
                  {safeRaw.map((b, i) => (
                    <label key={i} className="inline-flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={selectedRuns.includes(i)} onChange={() => toggleRun(i)} className="w-4 h-4 rounded" style={{ accentColor: RUN_COLORS[i % RUN_COLORS.length] }} />
                      <span className="text-sm font-medium" style={{ color: RUN_COLORS[i % RUN_COLORS.length] }}>{b.run_label ?? `Run ${i + 1}`}</span>
                      <span className="text-xs text-gray-400">({b.point_count} pts)</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="mb-4 flex items-center gap-4">
                <span className="text-sm font-medium text-gray-700">X-Axis:</span>
                {(["temperature", "time"] as const).map(v => (
                  <label key={v} className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="xaxis" checked={chartXAxis === v} onChange={() => setChartXAxis(v)} className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-gray-700">{v === "temperature" ? "Temperature (°C)" : "Time (min)"}</span>
                  </label>
                ))}
              </div>
              <div className="mb-8">
                <DSCOverlayChart rawBlocks={safeRaw} runIndices={activeIndices} chartXAxis={chartXAxis} />
              </div>
              {(() => { const block = safeRaw[tableRunIdx]; if (!block) return null; return (
                <div className="mt-6">
                  <div className="flex justify-between items-center mb-3 flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <h4 className="text-md font-semibold">Raw Data Table</h4>
                      {safeRaw.length > 1 && <select value={tableRunIdx} onChange={e => setTableRunIdx(Number(e.target.value))} className="bg-gray-50 border border-gray-300 text-sm rounded-lg p-2">{safeRaw.map((b, i) => <option key={i} value={i}>{b.run_label ?? `Run ${i + 1}`} ({b.point_count} pts)</option>)}</select>}
                    </div>
                    <button onClick={() => dlCSV("rawTbl", `DSC_Raw_${block.run_label}`)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>Download</span></button>
                  </div>
                  <div className="overflow-x-auto"><table id="rawTbl" className="min-w-full bg-white border border-gray-200 text-sm"><thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-right">Time (min)</th><th className="py-2 px-3 border text-right">Temp (°C)</th><th className="py-2 px-3 border text-right">Heat Flow ({block.heat_flow_unit})</th>{block.data_points[0]?.sensitivity_uv_per_mw != null && <th className="py-2 px-3 border text-right">Sensitivity ({block.sensitivity_unit})</th>}</tr></thead><tbody>{block.data_points.map((p, pi) => <tr key={pi} className={pi % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border text-right">{fmt(p.time_min, 4)}</td><td className="py-2 px-3 border text-right">{fmt(p.temperature_c, 1)}</td><td className="py-2 px-3 border text-right">{fmt(p.heat_flow_mw_per_mg, 6)}</td>{p.sensitivity_uv_per_mw != null && <td className="py-2 px-3 border text-right">{fmt(p.sensitivity_uv_per_mw, 5)}</td>}</tr>)}</tbody></table></div>
                </div>
              ); })()}
            </>) : <p className="text-center text-gray-500">No raw data available.</p>}
          </div>
        )}

        {/* ===== Processed Data ===== */}
        {activeTab === "processed-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-blue-800 mb-6">Processed Data</h2>
            {safeRaw.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4">Graphical Results — DSC Analysis {safeRaw.length > 1 ? `R1–R${safeRaw.length}` : ""}</h3>
                <DSCOverlayChart rawBlocks={safeRaw} runIndices={allIndices} chartXAxis="temperature" height={450} />
              </div>
            )}
            {safeBlocks.length > 0 ? safeBlocks.map((blk, bi) => (
              <div key={bi} className="mb-8">
                <div className="flex justify-between items-center mb-3"><h3 className="text-lg font-semibold">Thermal Events</h3><button onClick={() => dlCSV(`procTbl${bi}`, `DSC_Processed_${bi + 1}`)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>Download</span></button></div>
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
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-blue-800">DSC Final Results</h2><button onClick={() => dlCSV("frTbl", "DSC_FinalResults")} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"><Download size={16} /><span>Download</span></button></div>
            {safeFR.length > 0 ? (<>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {safeFR.map((ev, i) => {
                  const isEndo = (ev.character ?? "").toLowerCase().includes("endo");
                  const isExo = (ev.character ?? "").toLowerCase().includes("exo");
                  const bg = isEndo ? "bg-blue-50 border-blue-200" : isExo ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200";
                  const tc = isEndo ? "text-blue-800" : isExo ? "text-red-800" : "text-gray-800";
                  const sc = isEndo ? "text-blue-600" : isExo ? "text-red-600" : "text-gray-600";
                  return (
                    <div key={i} className={`border rounded-lg p-5 ${bg}`}>
                      <div className="flex items-center gap-2 mb-3"><EventIcon c={ev.character} /><p className={`text-sm font-semibold ${sc}`}>{degC(ev.metric_name ?? "")}</p></div>
                      <p className={`text-2xl font-bold ${tc}`}>{ev.value != null ? String(ev.value) : "N/A"}</p>
                      {ev.std_dev != null && <p className="text-sm text-gray-500 mt-1">± {ev.std_dev} {degC(ev.std_dev_unit ?? "")}</p>}
                      {ev.character && <p className={`text-xs mt-2 capitalize ${sc}`}>{ev.character}</p>}
                    </div>
                  );
                })}
              </div>
              <div className="overflow-x-auto"><table id="frTbl" className="min-w-full bg-white border border-gray-200"><thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Metric</th><th className="py-2 px-4 border text-right">Value</th><th className="py-2 px-4 border text-right">Std. Dev.</th><th className="py-2 px-4 border text-left">Character</th></tr></thead><tbody>{safeFR.map((fr, i) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-4 border font-medium">{degC(fr.metric_name ?? "")}</td><td className="py-2 px-4 border text-right">{fr.value != null ? String(fr.value) : ""}</td><td className="py-2 px-4 border text-right">{fr.std_dev != null ? `${fr.std_dev} ${degC(fr.std_dev_unit ?? "")}` : ""}</td><td className="py-2 px-4 border capitalize">{fr.character ?? ""}</td></tr>)}</tbody></table></div>
            </>) : <p className="text-center text-gray-500">No final results.</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default DSCDataViewer;