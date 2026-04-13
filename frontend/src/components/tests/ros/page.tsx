"use client";
import React, { FC, useEffect, useState, useMemo } from "react";
import { api } from "@/lib/axios";
import { Download, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ErrorBar } from "recharts";

interface PageProps { work_package: string; element: string; test: string; file?: string; }

type TabKey = "test-conditions" | "raw-data" | "processed-data" | "results";
const TABS: { key: TabKey; label: string }[] = [
  { key: "test-conditions", label: "Test Conditions" }, { key: "raw-data", label: "Raw Data" },
  { key: "processed-data", label: "Processed Data" }, { key: "results", label: "Final Results" },
];
const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#8b5cf6", "#ec4899"];

const degC = (s: string) => s.replace(/oC/g, "°C");
const fmt = (v: any, d = 2) => { if (v == null || v === "") return ""; if (typeof v === "number") return v.toFixed(d); return String(v); };
const csvEsc = (v: string) => `"${v.replace(/"/g, '""')}"`;
function dlCSV(id: string, fn: string) { const t = document.getElementById(id); if (!t) return; let csv = "data:text/csv;charset=utf-8,"; t.querySelectorAll("tr").forEach(r => { csv += Array.from(r.querySelectorAll("th,td")).map(c => csvEsc(c.textContent ?? "")).join(",") + "\r\n"; }); const a = document.createElement("a"); a.href = encodeURI(csv); a.download = `${fn}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); }

const Collapse: FC<{ title: string; open?: boolean; children: React.ReactNode }> = ({ title, open: def = true, children }) => {
  const [o, setO] = useState(def);
  return (<div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden"><button className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition" onClick={() => setO(p => !p)}><h2 className="text-xl font-bold text-blue-800">{title}</h2>{o ? <ChevronUp className="text-gray-400" size={20} /> : <ChevronDown className="text-gray-400" size={20} />}</button>{o && <div className="px-6 pb-6">{children}</div>}</div>);
};
const KV: FC<{ id: string; rows: { label: string; value: React.ReactNode }[]; dl?: string }> = ({ id, rows, dl }) => (
  <>{dl && <div className="flex justify-end mb-3"><button onClick={() => dlCSV(id, dl)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>Download</span></button></div>}<div className="overflow-x-auto"><table id={id} className="min-w-full bg-white border border-gray-200"><thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Property</th><th className="py-2 px-4 border text-left">Value</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-4 border font-medium">{r.label}</td><td className="py-2 px-4 border">{r.value ?? ""}</td></tr>)}</tbody></table></div></>
);

const ROSDataViewer: FC<PageProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("test-conditions");
  const [tableRunIdx, setTableRunIdx] = useState(0);

  useEffect(() => { const ac = new AbortController(); (async () => { try { setLoading(true); const res = await api.post(`/tests/listings`, { work_package_name: work_package, element_cms_id: element, test_name: test }, { signal: ac.signal }); if (res.status !== 200) throw new Error("Bad"); setData(res.data); } catch (err: any) { if (err.name !== "CanceledError" && err.name !== "AbortError") setError("Failed to load ROS data."); } finally { setLoading(false); } })(); return () => ac.abort(); }, [work_package, element, test]);

  const safeRaw = useMemo(() => Array.isArray(data?.raw_data) ? data.raw_data : [], [data?.raw_data]);
  const safeProc = useMemo(() => Array.isArray(data?.processed_data) ? data.processed_data : [], [data?.processed_data]);
  const fr = data?.final_results ?? {};
  const sa = data?.statistical_analysis ?? {};
  const repMeta = data?.replications ?? [];

  // Build chart data from final results
  const chartData = useMemo(() => {
    if (!fr?.experiments?.length) return [];
    const meanRow = fr.experiments.find((e: any) => e.label === "Mean");
    const sdRow = fr.experiments.find((e: any) => e.label === "SD" && fr.experiments.indexOf(e) > (fr.experiments.indexOf(meanRow) ?? 0));
    if (!meanRow) return [];
    const groups = fr.group_headers?.filter((g: string) => g !== "μg/mL") ?? [];
    return groups.map((g: string) => ({
      group: g, mean: meanRow.values[g] ?? 0, sd: sdRow?.values[g] ?? 0,
    }));
  }, [fr]);

  if (loading) return <div className="bg-white flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" /></div>;
  if (error || !data) return <div className="flex items-center justify-center min-h-screen"><div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"><p>{error || "No data."}</p></div></div>;

  const td = data.test_details ?? {}, wp = td.work_package ?? {}, mat = td.material ?? {}, cl = td.cell_line ?? {}, disp = td.dispersion ?? {}, treat = td.treatment ?? {}, inst = td.instrumentation ?? {};

  return (
    <div className="bg-gray-50 min-h-screen py-8 text-black">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-4">ROS Test Data Report</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><h2 className="text-lg font-semibold mb-3">Test Parameters</h2><div className="bg-blue-50 p-4 rounded-md"><p className="mb-2"><span className="font-semibold">Work Package:</span> {wp.wp_name || work_package}</p><p className="mb-2"><span className="font-semibold">CMS Identifier:</span> {mat.material_identifier ?? element}</p><p className="mb-2"><span className="font-semibold">Partner:</span> {wp.partner ?? ""}</p><p><span className="font-semibold">Material:</span> {mat.material_name ?? ""}</p></div></div>
            <div><h2 className="text-lg font-semibold mb-3">Test Information</h2><div className="bg-blue-50 p-4 rounded-md"><p className="mb-2"><span className="font-semibold">Full Name:</span> {wp.full_test_name ?? ""}</p><p className="mb-2"><span className="font-semibold">Acronym:</span> {wp.test_acronym ?? ""}</p><p className="mb-2"><span className="font-semibold">Endpoint:</span> {wp.endpoint ?? ""}</p><p><span className="font-semibold">Outcome:</span> {wp.endpoint_outcome ?? ""}</p></div></div>
          </div>
        </div>

        <div className="w-full mb-8"><ul className="relative flex flex-wrap p-1.5 list-none rounded-md bg-slate-100" role="tablist">{TABS.map(tab => <li key={tab.key} className="z-30 flex-auto text-center" role="presentation"><button role="tab" aria-selected={activeTab === tab.key} className={`z-30 w-full px-0 py-2 text-sm mb-0 transition-all rounded-md ${activeTab === tab.key ? "bg-blue-600 text-white shadow-md" : "text-slate-600 hover:text-slate-800"}`} onClick={() => setActiveTab(tab.key)}>{tab.label}</button></li>)}</ul></div>

        {/* ===== Test Conditions ===== */}
        {activeTab === "test-conditions" && (<>
          <Collapse title="Material Information"><KV id="matTbl" dl="ROS_Material" rows={[{ label: "CMS Identifier", value: mat.material_identifier }, { label: "ERM Identifier", value: mat.erm_id }, { label: "Material Name", value: mat.material_name }, { label: "Core Chemistry", value: mat.core_chemistry }, { label: "CAS No", value: mat.cas_no }, { label: "Material Supplier", value: mat.material_supplier }, { label: "Material State", value: mat.material_state }, { label: "Batch", value: mat.batch }, { label: "Size", value: mat.size }, { label: "Preparation Date", value: mat.preparation_date }]} /></Collapse>
          <Collapse title="Cell Line"><KV id="cellTbl" dl="ROS_CellLine" rows={[{ label: "Cell Type", value: cl.cell_type }, { label: "Short Name", value: cl.cell_line_short }, { label: "Supplier", value: cl.supplier }, { label: "Passage Numbers", value: cl.passage_numbers?.join(", ") }, { label: "Plate Details", value: cl.plate_details }, { label: "Cells Per Well", value: cl.cells_per_well }, { label: "Volume Per Well", value: cl.volume_per_well }, { label: "Medium", value: cl.medium }, { label: "Serum", value: cl.serum }, { label: "Growth Medium", value: cl.complete_growth_medium }, { label: "Culture Conditions", value: degC(cl.culture_conditions ?? "") }]} /></Collapse>
          <Collapse title="Treatment"><KV id="treatTbl" dl="ROS_Treatment" rows={[{ label: "Time Unit", value: treat.time_unit }, { label: "Time Points", value: treat.time_points?.join(", ") }, { label: "Concentration Unit", value: treat.concentration_unit }, { label: "Plate Series", value: treat.plate_series?.join(" → ") }, { label: "Positive Control", value: treat.positive_control }, { label: "Negative Control", value: treat.negative_control }, { label: "Number of Experiments", value: treat.num_experiments }]} /></Collapse>
          <Collapse title="Dispersion"><KV id="dispTbl" dl="ROS_Dispersion" rows={[{ label: "Protocol", value: disp.dispersion_protocol }, { label: "Technique", value: disp.dispersion_technique }, { label: "Dispersion Agent", value: disp.dispersion_agent }, { label: "Dispersed in Medium", value: disp.dispersed_in_medium }, { label: "Aids Used", value: disp.aids_used }]} /></Collapse>
          <Collapse title="Replication Metadata"><div className="overflow-x-auto"><table id="repTbl" className="min-w-full bg-white border border-gray-200"><thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Test ID</th><th className="py-2 px-4 border text-left">Start</th><th className="py-2 px-4 border text-left">End</th><th className="py-2 px-4 border text-left">Replicate</th></tr></thead><tbody>{repMeta.length ? repMeta.map((r: any, i: number) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-4 border">{r.test_identifier_number}</td><td className="py-2 px-4 border">{r.test_start_date}</td><td className="py-2 px-4 border">{r.test_end_date}</td><td className="py-2 px-4 border">{r.replicate_label}</td></tr>) : <tr><td colSpan={4} className="py-2 px-4 border text-center">None</td></tr>}</tbody></table></div></Collapse>
        </>)}

        {/* ===== Raw Data ===== */}
        {activeTab === "raw-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-blue-800 mb-6">Fluorescence Readings</h2>
            {safeRaw.length > 0 ? (<>
              <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <h4 className="text-md font-semibold">Raw Data Table</h4>
                  {safeRaw.length > 1 && <select value={tableRunIdx} onChange={e => setTableRunIdx(Number(e.target.value))} className="bg-gray-50 border border-gray-300 text-sm rounded-lg p-2">{safeRaw.map((b: any, i: number) => <option key={i} value={i}>{b.run_label} ({b.reading_count} readings)</option>)}</select>}
                </div>
                <button onClick={() => dlCSV("rawTbl", `ROS_Raw_${safeRaw[tableRunIdx]?.run_label}`)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>Download</span></button>
              </div>
              <div className="overflow-x-auto"><table id="rawTbl" className="min-w-full bg-white border border-gray-200 text-sm"><thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Well</th><th className="py-2 px-3 border text-left">Type</th><th className="py-2 px-3 border text-right">Reading 1</th><th className="py-2 px-3 border text-right">Reading 2</th><th className="py-2 px-3 border text-right">Mean</th></tr></thead>
                <tbody>{safeRaw[tableRunIdx]?.readings?.map((r: any, i: number) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border">{r.well}</td><td className="py-2 px-3 border">{r.type}</td><td className="py-2 px-3 border text-right">{fmt(r.reading_1, 0)}</td><td className="py-2 px-3 border text-right">{fmt(r.reading_2, 0)}</td><td className="py-2 px-3 border text-right font-medium">{fmt(r.mean, 1)}</td></tr>)}</tbody>
              </table></div>
            </>) : <p className="text-center text-gray-500">No raw data.</p>}
          </div>
        )}

        {/* ===== Processed Data ===== */}
        {activeTab === "processed-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-blue-800 mb-6">Processed Data — Fluorescence by Group</h2>

            {/* Bar chart from final results */}
            {chartData.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4">Mean Fluorescence by Treatment Group (± SD)</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="group" label={{ value: "Treatment Group", position: "insideBottom", offset: -10 }} />
                    <YAxis label={{ value: "Fluorescence (Counts)", angle: -90, position: "insideLeft" }} />
                    <Tooltip formatter={(v: number) => fmt(v, 1)} />
                    <Bar dataKey="mean" fill="#2563eb" name="Mean">
                      <ErrorBar dataKey="sd" width={4} strokeWidth={2} stroke="#dc2626" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Per-replicate tables */}
            {safeProc.map((blk: any, bi: number) => (
              <div key={bi} className="mb-6">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-md font-semibold">{blk.experiment_label ?? blk.run_label} — {blk.acceptance ? <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle size={16} /> {blk.acceptance}</span> : <span className="text-gray-400">No acceptance data</span>}</h3>
                  <button onClick={() => dlCSV(`procTbl${bi}`, `ROS_Proc_${blk.run_label}`)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>Download</span></button>
                </div>
                <div className="overflow-x-auto"><table id={`procTbl${bi}`} className="min-w-full bg-white border border-gray-200 text-sm">
                  <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Metric</th>{blk.group_headers?.map((h: string, hi: number) => <th key={hi} className="py-2 px-3 border text-right">{h}</th>)}</tr></thead>
                  <tbody>
                    <tr className="bg-blue-50 font-semibold"><td className="py-2 px-3 border">Mean</td>{blk.group_headers?.map((h: string, hi: number) => <td key={hi} className="py-2 px-3 border text-right">{fmt(blk.mean?.[h], 1)}</td>)}</tr>
                    <tr><td className="py-2 px-3 border">SD</td>{blk.group_headers?.map((h: string, hi: number) => <td key={hi} className="py-2 px-3 border text-right">{fmt(blk.sd?.[h], 2)}</td>)}</tr>
                    <tr><td className="py-2 px-3 border">CV</td>{blk.group_headers?.map((h: string, hi: number) => <td key={hi} className="py-2 px-3 border text-right">{blk.cv?.[h] != null ? `${(blk.cv[h] * 100).toFixed(2)}%` : ""}</td>)}</tr>
                  </tbody>
                </table></div>
              </div>
            ))}
          </div>
        )}

        {/* ===== Final Results ===== */}
        {activeTab === "results" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-blue-800">ROS Final Results</h2><button onClick={() => dlCSV("frTbl", "ROS_FinalResults")} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"><Download size={16} /><span>Download</span></button></div>

            {fr.acceptance && <div className={`mb-6 p-4 rounded-md border ${fr.acceptance === "PASSED" ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"}`}><div className="flex items-center gap-2">{fr.acceptance === "PASSED" ? <CheckCircle size={20} className="text-green-600" /> : <XCircle size={20} className="text-red-600" />}<span className={`font-semibold ${fr.acceptance === "PASSED" ? "text-green-800" : "text-red-800"}`}>Acceptance: {fr.acceptance}</span></div><p className="text-sm text-gray-600 mt-1">CV less than 20% across all groups</p></div>}

            {fr.experiments?.length > 0 && (
              <div className="overflow-x-auto"><table id="frTbl" className="min-w-full bg-white border border-gray-200 text-sm">
                <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Row</th>{fr.group_headers?.map((h: string, hi: number) => <th key={hi} className="py-2 px-3 border text-right">{h}</th>)}</tr></thead>
                <tbody>{fr.experiments.map((exp: any, i: number) => {
                  const isHighlight = exp.label === "Mean" || exp.label === "CV";
                  return <tr key={i} className={isHighlight ? "bg-blue-50 font-semibold" : i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border font-medium">{exp.label}</td>{fr.group_headers?.map((h: string, hi: number) => <td key={hi} className="py-2 px-3 border text-right">{exp.label === "CV" && exp.values[h] != null ? `${(exp.values[h] * 100).toFixed(2)}%` : fmt(exp.values[h], 2)}</td>)}</tr>;
                })}</tbody>
              </table></div>
            )}

            {/* ANOVA Summary */}
            {sa.available && sa.groups_summary?.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold mb-4">Statistical Analysis (One-way ANOVA)</h3>
                <div className="overflow-x-auto"><table className="min-w-full bg-white border border-gray-200 text-sm">
                  <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Group</th><th className="py-2 px-3 border text-right">Count</th><th className="py-2 px-3 border text-right">Mean</th><th className="py-2 px-3 border text-right">Variance</th></tr></thead>
                  <tbody>{sa.groups_summary.map((g: any, i: number) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border font-medium">{g.group}</td><td className="py-2 px-3 border text-right">{fmt(g.count, 0)}</td><td className="py-2 px-3 border text-right">{fmt(g.mean, 2)}</td><td className="py-2 px-3 border text-right">{fmt(g.variance, 2)}</td></tr>)}</tbody>
                </table></div>
                {sa.alpha && <p className="mt-3 text-sm text-gray-600">Alpha = {sa.alpha}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ROSDataViewer;