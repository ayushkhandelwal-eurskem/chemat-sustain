"use client";
import React, { FC, useEffect, useState, useMemo } from "react";
import { api } from "@/lib/axios";
import { Download, ChevronDown, ChevronUp, CheckCircle, XCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ErrorBar } from "recharts";

interface PageProps { work_package: string; element: string; test: string; file?: string; }
type TabKey = "test-conditions" | "raw-data" | "processed-data" | "results" | "statistics";
const TABS: { key: TabKey; label: string }[] = [
  { key: "test-conditions", label: "Test Conditions" }, { key: "raw-data", label: "Raw Data" },
  { key: "processed-data", label: "Processed Data" }, { key: "results", label: "Final Results" },
  { key: "statistics", label: "Statistical Analysis" },
];
const degC = (s: string) => (s ?? "").replace(/oC/g, "°C");
const dot = (s: string) => (s ?? "").replace(/,/g, ".");
const fmt = (v: any, d = 2) => { if (v == null || v === "") return ""; if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(d); return String(v); };
const csvEsc = (v: string) => `"${v.replace(/"/g, '""')}"`;
function dlCSV(id: string, fn: string) { const t = document.getElementById(id); if (!t) return; let csv = "data:text/csv;charset=utf-8,"; t.querySelectorAll("tr").forEach(r => { csv += Array.from(r.querySelectorAll("th,td")).map(c => csvEsc(c.textContent ?? "")).join(",") + "\r\n"; }); const a = document.createElement("a"); a.href = encodeURI(csv); a.download = `${fn}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); }

const Collapse: FC<{ title: string; open?: boolean; children: React.ReactNode }> = ({ title, open: def = true, children }) => {
  const [o, setO] = useState(def);
  return (<div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden"><button className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition" onClick={() => setO(p => !p)}><h2 className="text-xl font-bold text-blue-800">{title}</h2>{o ? <ChevronUp className="text-gray-400" size={20} /> : <ChevronDown className="text-gray-400" size={20} />}</button>{o && <div className="px-6 pb-6">{children}</div>}</div>);
};
const KV: FC<{ id: string; rows: { label: string; value: React.ReactNode }[]; dl?: string }> = ({ id, rows, dl }) => (
  <>{dl && <div className="flex justify-end mb-3"><button onClick={() => dlCSV(id, dl)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>Download</span></button></div>}<div className="overflow-x-auto"><table id={id} className="min-w-full bg-white border border-gray-200"><thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Property</th><th className="py-2 px-4 border text-left">Value</th></tr></thead><tbody>{rows.filter(r => r.value != null && r.value !== "" && r.value !== "None").map((r, i) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-4 border font-medium">{r.label}</td><td className="py-2 px-4 border">{r.value}</td></tr>)}</tbody></table></div></>
);
const AcceptanceBanner: FC<{ text?: string; result?: string }> = ({ text, result }) => {
  if (!result) return null;
  const passed = result.toUpperCase() === "PASSED";
  const failed = result.toUpperCase() === "FAILED";
  return (
    <div className={`my-4 p-4 rounded-md border ${passed ? "bg-green-50 border-green-300" : failed ? "bg-red-50 border-red-300" : "bg-yellow-50 border-yellow-300"}`}>
      <div className="flex items-center gap-2">
        {passed ? <CheckCircle size={20} className="text-green-600" /> : <XCircle size={20} className="text-red-600" />}
        <span className={`font-semibold ${passed ? "text-green-800" : failed ? "text-red-800" : "text-yellow-800"}`}>{text ?? "Acceptance criteria"}: {result}</span>
      </div>
    </div>
  );
};

/* RICC Section */
const RICCSection: FC<{ ricc_data: any; ricc_results?: any; ricc_acceptance?: any; ricc_formula?: string }> = ({ ricc_data, ricc_results, ricc_acceptance, ricc_formula }) => {
  if (!ricc_data || Object.keys(ricc_data).length === 0) return null;
  return (
    <Collapse title="Relative Increase in Cell Counts (RICC)" open={false}>
      {ricc_formula && <p className="text-sm text-gray-600 mb-3 font-mono bg-gray-50 p-2 rounded">{ricc_formula}</p>}
      <div className="overflow-x-auto mb-4"><table className="min-w-full bg-white border border-gray-200 text-sm">
        <thead><tr className="bg-gray-100">{Object.keys(ricc_data).map((k, i) => <th key={i} className="py-2 px-3 border text-right">{k}</th>)}</tr></thead>
        <tbody><tr>{Object.values(ricc_data).map((v: any, i) => <td key={i} className="py-2 px-3 border text-right">{fmt(v, 0)}</td>)}</tr></tbody>
      </table></div>
      {ricc_results && Object.keys(ricc_results).length > 0 && (
        <div className="overflow-x-auto mb-4"><table className="min-w-full bg-white border border-gray-200 text-sm">
          <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Concentration</th><th className="py-2 px-3 border text-right">RICC (%)</th></tr></thead>
          <tbody>{Object.entries(ricc_results).map(([k, v]: any, i) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border font-medium">{k}</td><td className="py-2 px-3 border text-right">{fmt(v, 2)}%</td></tr>)}</tbody>
        </table></div>
      )}
      <AcceptanceBanner text={ricc_acceptance?.text} result={ricc_acceptance?.result} />
    </Collapse>
  );
};

const MNTDataViewer: FC<PageProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("test-conditions");
  const [rawRunIdx, setRawRunIdx] = useState(0);
  const [procRunIdx, setProcRunIdx] = useState(0);

  useEffect(() => { const ac = new AbortController(); (async () => { try { setLoading(true); const res = await api.post(`/tests/listings`, { work_package_name: work_package, element_cms_id: element, test_name: test }, { signal: ac.signal }); if (res.status !== 200) throw new Error("Bad"); setData(res.data); } catch (err: any) { if (err.name !== "CanceledError" && err.name !== "AbortError") setError("Failed to load MNT data."); } finally { setLoading(false); } })(); return () => ac.abort(); }, [work_package, element, test]);

  const safeRaw = useMemo(() => Array.isArray(data?.raw_data) ? data.raw_data : [], [data?.raw_data]);
  const safeProc = useMemo(() => Array.isArray(data?.processed_data) ? data.processed_data : [], [data?.processed_data]);
  const fr = data?.final_results ?? {};
  const sa = data?.statistical_analysis ?? {};
  const repMeta = data?.replications ?? [];

  if (loading) return <div className="bg-white flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" /></div>;
  if (error || !data) return <div className="flex items-center justify-center min-h-screen"><div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"><p>{error || "No data."}</p></div></div>;

  const td = data.test_details ?? {}, wp = td.work_package ?? {}, mat = td.material ?? {}, cl = td.cell_line ?? {}, disp = td.dispersion ?? {}, treat = td.treatment ?? {};

  return (
    <div className="bg-gray-50 min-h-screen py-8 text-black">
      <div className="container mx-auto px-4">
        {/* HEADER */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-4">Micronucleus Test (MNT) Data Report</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><h2 className="text-lg font-semibold mb-3">Test Parameters</h2><div className="bg-blue-50 p-4 rounded-md"><p className="mb-2"><span className="font-semibold">Work Package:</span> {wp.wp_name}</p><p className="mb-2"><span className="font-semibold">CMS Identifier:</span> {mat.material_identifier}</p><p className="mb-2"><span className="font-semibold">Partner:</span> {wp.partner}</p><p><span className="font-semibold">Material:</span> {mat.material_name}</p></div></div>
            <div><h2 className="text-lg font-semibold mb-3">Test Information</h2><div className="bg-blue-50 p-4 rounded-md"><p className="mb-2"><span className="font-semibold">Full Name:</span> {wp.full_test_name}</p><p className="mb-2"><span className="font-semibold">Type:</span> {wp.test_type}</p><p className="mb-2"><span className="font-semibold">Endpoint:</span> {wp.endpoint}</p><p><span className="font-semibold">Outcome Metric:</span> {wp.endpoint_outcome}</p></div></div>
          </div>
        </div>

        {/* TABS */}
        <div className="w-full mb-8"><ul className="relative flex flex-wrap p-1.5 list-none rounded-md bg-slate-100" role="tablist">{TABS.map(tab => <li key={tab.key} className="z-30 flex-auto text-center" role="presentation"><button role="tab" aria-selected={activeTab === tab.key} className={`z-30 w-full px-0 py-2 text-sm mb-0 transition-all rounded-md ${activeTab === tab.key ? "bg-blue-600 text-white shadow-md" : "text-slate-600 hover:text-slate-800"}`} onClick={() => setActiveTab(tab.key)}>{tab.label}</button></li>)}</ul></div>

        {/* ===== TEST CONDITIONS ===== */}
        {activeTab === "test-conditions" && (<>
          <Collapse title="Material Information"><KV id="matTbl" dl="MNT_Material" rows={[
            { label: "CMS Identifier", value: mat.material_identifier }, { label: "ERM Identifier", value: mat.erm_id }, { label: "Material Name", value: mat.material_name }, { label: "Core Chemistry", value: mat.core_chemistry }, { label: "CAS No", value: mat.cas_no }, { label: "CAS for Core", value: mat.cas_for_core }, { label: "Material Supplier", value: mat.material_supplier }, { label: "Material State", value: mat.material_state }, { label: "Batch", value: mat.batch }, { label: "Vial", value: mat.vial }, { label: "Preparation Date", value: mat.preparation_date }, { label: "Endotoxin", value: mat.endotoxin }, { label: "Molecular Weight", value: mat.molecular_weight },
          ]} /></Collapse>
          <Collapse title="Cell Line"><KV id="cellTbl" dl="MNT_CellLine" rows={[
            { label: "Cell Type", value: cl.cell_type }, { label: "Short Name", value: cl.cell_line_short }, { label: "Supplier", value: cl.supplier }, { label: "Passage Numbers", value: cl.passage_numbers?.join(", ") }, { label: "Plate Details", value: cl.plate_details }, { label: "Cells Per Well", value: cl.cells_per_well }, { label: "Volume Per Well", value: cl.volume_per_well }, { label: "Medium", value: cl.medium }, { label: "Serum", value: cl.serum }, { label: "Serum Heat Inactivated", value: cl.serum_heat_inactivated }, { label: "Antibiotics", value: cl.antibiotics }, { label: "Growth Medium", value: cl.complete_growth_medium }, { label: "Culture Conditions", value: degC(cl.culture_conditions ?? "") },
          ]} /></Collapse>
          <Collapse title="Treatment Concentrations">
            <div className="overflow-x-auto mb-4"><table className="min-w-full bg-white border border-gray-200 text-sm">
              <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Label</th><th className="py-2 px-4 border text-right">μg/mL</th></tr></thead>
              <tbody>{treat.concentrations?.map((c: any, i: number) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-4 border font-medium">{c.label}</td><td className="py-2 px-4 border text-right">{fmt(c.ug_ml)}</td></tr>)}</tbody>
            </table></div>
            <KV id="treatKV" rows={[
              { label: "Plate Series", value: treat.plate_series?.join(" → ") }, { label: "Positive Control", value: treat.positive_control_desc }, { label: "Negative Control", value: treat.negative_control_desc }, { label: "Number of Experiments", value: treat.num_experiments },
            ]} />
          </Collapse>
          <Collapse title="Dispersion"><KV id="dispTbl" rows={[
            { label: "Protocol", value: disp.dispersion_protocol }, { label: "Technique", value: disp.dispersion_technique }, { label: "Agent", value: disp.dispersion_agent }, { label: "Additives", value: disp.additives }, { label: "Dispersed in Medium", value: disp.dispersed_in_medium }, ...(disp.aids ? Object.entries(disp.aids).map(([k, v]: any) => ({ label: k, value: v })) : []), { label: "Time Duration", value: disp.time_duration },
          ]} /></Collapse>
          <Collapse title="Replication Metadata"><div className="overflow-x-auto"><table className="min-w-full bg-white border border-gray-200 text-sm">
            <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Test ID</th><th className="py-2 px-4 border text-left">Start</th><th className="py-2 px-4 border text-left">End</th><th className="py-2 px-4 border text-left">Replicate</th></tr></thead>
            <tbody>{repMeta.map((r: any, i: number) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-4 border">{r.test_identifier_number}</td><td className="py-2 px-4 border">{r.test_start_date}</td><td className="py-2 px-4 border">{r.test_end_date}</td><td className="py-2 px-4 border">{r.replicate_label}</td></tr>)}</tbody>
          </table></div></Collapse>
          <Collapse title="Scientists"><KV id="sciTbl" rows={[
            ...(wp.lead_scientists ?? []).map((s: any) => ({ label: "Lead Scientist", value: `${s.name}${s.email ? ` (${s.email})` : ""}` })),
            ...(wp.assay_scientists ?? []).map((s: any) => ({ label: "Assay Conducted By", value: `${s.name}${s.email ? ` (${s.email})` : ""}` })),
          ]} /></Collapse>
        </>)}

        {/* ===== RAW DATA ===== */}
        {activeTab === "raw-data" && safeRaw.length > 0 && (() => { const blk = safeRaw[rawRunIdx]; const groups = blk.group_labels ?? []; return (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
              <h2 className="text-xl font-bold text-blue-800">Raw Data — Nuclei &amp; Micronuclei Counts</h2>
              <div className="flex items-center gap-3">
                {safeRaw.length > 1 && <select value={rawRunIdx} onChange={e => setRawRunIdx(Number(e.target.value))} className="bg-gray-50 border border-gray-300 text-sm rounded-lg p-2">{safeRaw.map((b: any, i: number) => <option key={i} value={i}>{b.experiment_label ?? b.run_label}</option>)}</select>}
                <button onClick={() => dlCSV("rawTbl", `MNT_Raw_${blk.run_label}`)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>Download</span></button>
              </div>
            </div>
            <div className="overflow-x-auto mb-6"><table id="rawTbl" className="min-w-full bg-white border border-gray-200 text-xs">
              <thead>
                <tr className="bg-gray-200"><th className="py-1 px-2 border" rowSpan={2}>Field</th>{groups.map((g: string, i: number) => <th key={i} className="py-1 px-2 border text-center" colSpan={2}>{dot(g)}</th>)}</tr>
                <tr className="bg-gray-100">{groups.map((_: string, i: number) => <React.Fragment key={i}><th className="py-1 px-2 border text-right">N</th><th className="py-1 px-2 border text-right">μN</th></React.Fragment>)}</tr>
              </thead>
              <tbody>
                {blk.fields?.map((f: any, fi: number) => (
                  <tr key={fi} className={fi % 2 === 0 ? "bg-gray-50" : ""}>
                    <td className="py-1 px-2 border font-medium text-center">{f.field}</td>
                    {groups.map((g: string, gi: number) => <React.Fragment key={gi}><td className="py-1 px-2 border text-right">{fmt(f[`${g}_N`], 0)}</td><td className="py-1 px-2 border text-right">{fmt(f[`${g}_uN`], 0)}</td></React.Fragment>)}
                  </tr>
                ))}
                <tr className="bg-blue-50 font-semibold"><td className="py-1 px-2 border text-center">{blk.summary_label}</td>{groups.map((g: string, gi: number) => <React.Fragment key={gi}><td className="py-1 px-2 border text-right">{fmt(blk.summary?.[`${g}_N`], 2)}</td><td className="py-1 px-2 border text-right">{fmt(blk.summary?.[`${g}_uN`], 2)}</td></React.Fragment>)}</tr>
                <tr><td className="py-1 px-2 border text-center font-medium">SD</td>{groups.map((g: string, gi: number) => <React.Fragment key={gi}><td className="py-1 px-2 border text-right">{fmt(blk.sds?.[`${g}_N`], 2)}</td><td className="py-1 px-2 border text-right">{fmt(blk.sds?.[`${g}_uN`], 2)}</td></React.Fragment>)}</tr>
              </tbody>
            </table></div>
            <RICCSection ricc_data={blk.ricc_data} />
          </div>
        ); })()}

        {/* ===== PROCESSED DATA ===== */}
        {activeTab === "processed-data" && safeProc.length > 0 && (() => { const blk = safeProc[procRunIdx]; const groups = blk.group_labels ?? []; return (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
              <h2 className="text-xl font-bold text-blue-800">Processed Data — %μN/N per Field</h2>
              <div className="flex items-center gap-3">
                {safeProc.length > 1 && <select value={procRunIdx} onChange={e => setProcRunIdx(Number(e.target.value))} className="bg-gray-50 border border-gray-300 text-sm rounded-lg p-2">{safeProc.map((b: any, i: number) => <option key={i} value={i}>{b.run_label}</option>)}</select>}
                <button onClick={() => dlCSV("procTbl", `MNT_Proc_${blk.run_label}`)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>Download</span></button>
              </div>
            </div>
            <div className="overflow-x-auto mb-4"><table id="procTbl" className="min-w-full bg-white border border-gray-200 text-xs">
              <thead>
                <tr className="bg-gray-200"><th className="py-1 px-2 border" rowSpan={2}>Field</th>{groups.map((g: string, i: number) => <th key={i} className="py-1 px-2 border text-center" colSpan={3}>{dot(g)}</th>)}</tr>
                <tr className="bg-gray-100">{groups.map((_: string, i: number) => <React.Fragment key={i}><th className="py-1 px-2 border text-right">N</th><th className="py-1 px-2 border text-right">μN</th><th className="py-1 px-2 border text-right">%μN/N</th></React.Fragment>)}</tr>
              </thead>
              <tbody>
                {blk.fields?.map((f: any, fi: number) => (
                  <tr key={fi} className={fi % 2 === 0 ? "bg-gray-50" : ""}>
                    <td className="py-1 px-2 border font-medium text-center">{f.field}</td>
                    {groups.map((g: string, gi: number) => <React.Fragment key={gi}><td className="py-1 px-2 border text-right">{fmt(f[`${g}_N`], 0)}</td><td className="py-1 px-2 border text-right">{fmt(f[`${g}_uN`], 0)}</td><td className="py-1 px-2 border text-right">{fmt(f[`${g}_%uN/N`], 4)}</td></React.Fragment>)}
                  </tr>
                ))}
                <tr className="bg-blue-50 font-semibold"><td className="py-1 px-2 border text-center">Avg</td>{groups.map((g: string, gi: number) => <React.Fragment key={gi}><td className="py-1 px-2 border text-right">{fmt(blk.avg?.[`${g}_N`], 2)}</td><td className="py-1 px-2 border text-right">{fmt(blk.avg?.[`${g}_uN`], 2)}</td><td className="py-1 px-2 border text-right">{fmt(blk.avg?.[`${g}_%uN/N`], 4)}</td></React.Fragment>)}</tr>
                <tr><td className="py-1 px-2 border text-center font-medium">SD</td>{groups.map((g: string, gi: number) => <React.Fragment key={gi}><td className="py-1 px-2 border text-right">{fmt(blk.sd?.[`${g}_N`], 2)}</td><td className="py-1 px-2 border text-right">{fmt(blk.sd?.[`${g}_uN`], 2)}</td><td className="py-1 px-2 border text-right">{fmt(blk.sd?.[`${g}_%uN/N`], 4)}</td></React.Fragment>)}</tr>
              </tbody>
            </table></div>
            <AcceptanceBanner text={blk.acceptance_1?.text} result={blk.acceptance_1?.result} />
            <AcceptanceBanner text={blk.acceptance_2?.text} result={blk.acceptance_2?.result} />

            {/* Chart 1: N, uN, %uN/N grouped bar */}
            {(() => { const chartData = groups.map((g: string) => ({ group: dot(g), N: blk.avg?.[`${g}_N`] ?? 0, N_sd: blk.sd?.[`${g}_N`] ?? 0, uN: blk.avg?.[`${g}_uN`] ?? 0, uN_sd: blk.sd?.[`${g}_uN`] ?? 0, pct: blk.avg?.[`${g}_%uN/N`] ?? 0, pct_sd: blk.sd?.[`${g}_%uN/N`] ?? 0 })); return chartData.length > 0 && (
              <div className="mb-6">
                <h3 className="text-md font-semibold mb-3">N, μN, %μN/N by Group</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={chartData} margin={{ top: 15, right: 30, left: 20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="group" /><YAxis />
                    <Tooltip content={({ active, payload, label }: any) => { if (!active || !payload?.length) return null; return (<div className="bg-white border border-gray-300 rounded shadow-md p-3 text-sm"><p className="font-semibold mb-1">{label}</p>{payload.map((p: any, i: number) => <p key={i} style={{ color: p.color }}>{p.name}: {fmt(p.value, 2)} (SD: {fmt(p.payload[`${p.dataKey}_sd`], 2)})</p>)}</div>); }} />
                    <Bar dataKey="N" fill="#e5e7eb" name="N"><ErrorBar dataKey="N_sd" width={3} strokeWidth={1.5} stroke="#666" /></Bar>
                    <Bar dataKey="uN" fill="#9ca3af" name="μN"><ErrorBar dataKey="uN_sd" width={3} strokeWidth={1.5} stroke="#666" /></Bar>
                    <Bar dataKey="pct" fill="#86efac" name="%μN/N"><ErrorBar dataKey="pct_sd" width={3} strokeWidth={1.5} stroke="#666" /></Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ); })()}

            {/* Chart 2: uN, %uN/N only (zoomed) */}
            {(() => { const chartData2 = groups.map((g: string) => ({ group: dot(g), uN: blk.avg?.[`${g}_uN`] ?? 0, uN_sd: blk.sd?.[`${g}_uN`] ?? 0, pct: blk.avg?.[`${g}_%uN/N`] ?? 0, pct_sd: blk.sd?.[`${g}_%uN/N`] ?? 0 })); return chartData2.length > 0 && (
              <div className="mb-6">
                <h3 className="text-md font-semibold mb-3">μN and %μN/N by Group (Zoomed)</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={chartData2} margin={{ top: 15, right: 30, left: 20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="group" /><YAxis />
                    <Tooltip content={({ active, payload, label }: any) => { if (!active || !payload?.length) return null; return (<div className="bg-white border border-gray-300 rounded shadow-md p-3 text-sm"><p className="font-semibold mb-1">{label}</p>{payload.map((p: any, i: number) => <p key={i} style={{ color: p.color }}>{p.name}: {fmt(p.value, 4)} (SD: {fmt(p.payload[`${p.dataKey}_sd`], 4)})</p>)}</div>); }} />
                    <Bar dataKey="uN" fill="#9ca3af" name="μN"><ErrorBar dataKey="uN_sd" width={3} strokeWidth={1.5} stroke="#666" /></Bar>
                    <Bar dataKey="pct" fill="#86efac" name="%μN/N"><ErrorBar dataKey="pct_sd" width={3} strokeWidth={1.5} stroke="#666" /></Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ); })()}

            {/* Pairwise Comparisons */}
            {blk.pairwise?.length > 0 && (
              <Collapse title="Pairwise Comparisons" open={false}>
                {blk.pairwise_alpha && <p className="text-sm text-gray-600 mb-3">Bonferroni corrected α = {blk.pairwise_alpha}</p>}
                <div className="overflow-x-auto"><table className="min-w-full bg-white border border-gray-200 text-sm">
                  <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Group 1</th><th className="py-2 px-3 border text-left">Group 2</th><th className="py-2 px-3 border text-right">P-value</th><th className="py-2 px-3 border text-center">Significant?</th></tr></thead>
                  <tbody>{blk.pairwise.map((pw: any, i: number) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border">{pw.group_1}</td><td className="py-2 px-3 border">{pw.group_2}</td><td className="py-2 px-3 border text-right">{pw.p_value != null ? pw.p_value.toExponential(4) : ""}</td><td className={`py-2 px-3 border text-center font-semibold ${pw.significant === "YES" ? "text-green-600" : "text-gray-500"}`}>{pw.significant}</td></tr>)}</tbody>
                </table></div>
              </Collapse>
            )}

            <RICCSection ricc_data={blk.ricc_data} ricc_results={blk.ricc_results} ricc_acceptance={blk.ricc_acceptance} ricc_formula={blk.ricc_formula} />
          </div>
        ); })()}

        {/* ===== FINAL RESULTS ===== */}
        {activeTab === "results" && fr.available && (<>
          <Collapse title="Per-Experiment Results">
            {fr.experiments?.map((exp: any, ei: number) => {
              const groups = fr.group_labels ?? [];
              return (
                <div key={ei} className="mb-6">
                  <h3 className="text-md font-semibold mb-2">{exp.label}</h3>
                  <div className="overflow-x-auto"><table className="min-w-full bg-white border border-gray-200 text-sm">
                    <thead>
                      <tr className="bg-gray-200"><th className="py-1 px-2 border" rowSpan={2}>Metric</th>{groups.map((g: string, i: number) => <th key={i} className="py-1 px-2 border text-center" colSpan={3}>{g}</th>)}</tr>
                      <tr className="bg-gray-100">{groups.map((_: string, i: number) => <React.Fragment key={i}><th className="py-1 px-2 border text-right">N</th><th className="py-1 px-2 border text-right">μN</th><th className="py-1 px-2 border text-right">%μN/N</th></React.Fragment>)}</tr>
                    </thead>
                    <tbody>
                      <tr className="bg-blue-50"><td className="py-1 px-2 border font-medium">Mean</td>{groups.map((g: string, gi: number) => <React.Fragment key={gi}><td className="py-1 px-2 border text-right">{fmt(exp.mean?.[`${g}_N`], 2)}</td><td className="py-1 px-2 border text-right">{fmt(exp.mean?.[`${g}_uN`], 2)}</td><td className="py-1 px-2 border text-right">{fmt(exp.mean?.[`${g}_%uN/N`], 4)}</td></React.Fragment>)}</tr>
                      <tr><td className="py-1 px-2 border font-medium">Σ</td>{groups.map((g: string, gi: number) => <React.Fragment key={gi}><td className="py-1 px-2 border text-right">{fmt(exp.sum?.[`${g}_N`], 0)}</td><td className="py-1 px-2 border text-right">{fmt(exp.sum?.[`${g}_uN`], 0)}</td><td className="py-1 px-2 border"></td></React.Fragment>)}</tr>
                    </tbody>
                  </table></div>
                </div>
              );
            })}
            {/* Overall Mean + SD */}
            <div className="mb-6">
              <h3 className="text-md font-semibold mb-2">Overall Mean &amp; SD</h3>
              <div className="overflow-x-auto"><table className="min-w-full bg-white border border-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-200"><th className="py-1 px-2 border" rowSpan={2}></th>{(fr.group_labels ?? []).map((g: string, i: number) => <th key={i} className="py-1 px-2 border text-center" colSpan={3}>{g}</th>)}</tr>
                  <tr className="bg-gray-100">{(fr.group_labels ?? []).map((_: string, i: number) => <React.Fragment key={i}><th className="py-1 px-2 border text-right">N</th><th className="py-1 px-2 border text-right">μN</th><th className="py-1 px-2 border text-right">%μN/N</th></React.Fragment>)}</tr>
                </thead>
                <tbody>
                  <tr className="bg-blue-50 font-semibold"><td className="py-1 px-2 border">Mean</td>{(fr.group_labels ?? []).map((g: string, gi: number) => <React.Fragment key={gi}><td className="py-1 px-2 border text-right">{fmt(fr.overall_mean?.[`${g}_N`], 2)}</td><td className="py-1 px-2 border text-right">{fmt(fr.overall_mean?.[`${g}_uN`], 2)}</td><td className="py-1 px-2 border text-right">{fmt(fr.overall_mean?.[`${g}_%uN/N`], 4)}</td></React.Fragment>)}</tr>
                  <tr><td className="py-1 px-2 border">SD</td>{(fr.group_labels ?? []).map((g: string, gi: number) => <React.Fragment key={gi}><td className="py-1 px-2 border text-right">{fmt(fr.overall_sd?.[`${g}_N`], 2)}</td><td className="py-1 px-2 border text-right">{fmt(fr.overall_sd?.[`${g}_uN`], 2)}</td><td className="py-1 px-2 border text-right">{fmt(fr.overall_sd?.[`${g}_%uN/N`], 4)}</td></React.Fragment>)}</tr>
                </tbody>
              </table></div>
            </div>

            {/* Final Results Chart 1: N, uN, %uN/N */}
            {(() => { const grps = fr.group_labels ?? []; const cd = grps.map((g: string) => ({ group: g, N: fr.overall_mean?.[`${g}_N`] ?? 0, N_sd: fr.overall_sd?.[`${g}_N`] ?? 0, uN: fr.overall_mean?.[`${g}_uN`] ?? 0, uN_sd: fr.overall_sd?.[`${g}_uN`] ?? 0, pct: fr.overall_mean?.[`${g}_%uN/N`] ?? 0, pct_sd: fr.overall_sd?.[`${g}_%uN/N`] ?? 0, isNC: g === "KN" || g === "NC", isPC: g === "KP" || g.startsWith("PC") })); return cd.length > 0 && (
              <div className="mb-6">
                <h3 className="text-md font-semibold mb-3">Overall: N, μN, %μN/N by Group</h3>
                <ResponsiveContainer width="100%" height={380}>
                  <BarChart data={cd} margin={{ top: 15, right: 30, left: 20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="group" /><YAxis />
                    <Tooltip content={({ active, payload, label }: any) => { if (!active || !payload?.length) return null; return (<div className="bg-white border border-gray-300 rounded shadow-md p-3 text-sm"><p className="font-semibold mb-1">{label}</p>{payload.map((p: any, i: number) => <p key={i} style={{ color: p.color }}>{p.name}: {fmt(p.value, 2)} (SD: {fmt(p.payload[`${p.dataKey}_sd`], 2)})</p>)}</div>); }} />
                    <Bar dataKey="N" fill="#e5e7eb" name="N"><ErrorBar dataKey="N_sd" width={3} strokeWidth={1.5} stroke="#666" /></Bar>
                    <Bar dataKey="uN" fill="#9ca3af" name="μN"><ErrorBar dataKey="uN_sd" width={3} strokeWidth={1.5} stroke="#666" /></Bar>
                    <Bar dataKey="pct" fill="#86efac" name="%μN/N"><ErrorBar dataKey="pct_sd" width={3} strokeWidth={1.5} stroke="#666" /></Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ); })()}

            {/* Final Results Chart 2: uN, %uN/N only (zoomed) */}
            {(() => { const grps = fr.group_labels ?? []; const cd2 = grps.map((g: string) => ({ group: g, uN: fr.overall_mean?.[`${g}_uN`] ?? 0, uN_sd: fr.overall_sd?.[`${g}_uN`] ?? 0, pct: fr.overall_mean?.[`${g}_%uN/N`] ?? 0, pct_sd: fr.overall_sd?.[`${g}_%uN/N`] ?? 0 })); return cd2.length > 0 && (
              <div className="mb-6">
                <h3 className="text-md font-semibold mb-3">Overall: μN and %μN/N by Group (Zoomed)</h3>
                <ResponsiveContainer width="100%" height={380}>
                  <BarChart data={cd2} margin={{ top: 15, right: 30, left: 20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="group" /><YAxis />
                    <Tooltip content={({ active, payload, label }: any) => { if (!active || !payload?.length) return null; return (<div className="bg-white border border-gray-300 rounded shadow-md p-3 text-sm"><p className="font-semibold mb-1">{label}</p>{payload.map((p: any, i: number) => <p key={i} style={{ color: p.color }}>{p.name}: {fmt(p.value, 4)} (SD: {fmt(p.payload[`${p.dataKey}_sd`], 4)})</p>)}</div>); }} />
                    <Bar dataKey="uN" fill="#9ca3af" name="μN"><ErrorBar dataKey="uN_sd" width={3} strokeWidth={1.5} stroke="#666" /></Bar>
                    <Bar dataKey="pct" fill="#86efac" name="%μN/N"><ErrorBar dataKey="pct_sd" width={3} strokeWidth={1.5} stroke="#666" /></Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ); })()}
          </Collapse>

          {/* Summary Table */}
          <Collapse title="Summary of Results">
            <div className="flex justify-end mb-2"><button onClick={() => dlCSV("frSummary", "MNT_Summary")} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>CSV</span></button></div>
            <div className="overflow-x-auto mb-4"><table id="frSummary" className="min-w-full bg-white border border-gray-200 text-sm">
              <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Group</th><th className="py-2 px-3 border text-right">Conc (μg/mL)</th><th className="py-2 px-3 border text-right">Conc (particles)</th><th className="py-2 px-3 border text-right">%μN/N</th><th className="py-2 px-3 border text-right">SD</th></tr></thead>
              <tbody>{fr.summary?.map((row: any, i: number) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border font-medium">{row.label}</td><td className="py-2 px-3 border text-right">{row.conc_ug}</td><td className="py-2 px-3 border text-right">{row.conc_part}</td><td className="py-2 px-3 border text-right">{fmt(row.pct_uN_N, 4)}</td><td className="py-2 px-3 border text-right">{fmt(row.sd, 4)}</td></tr>)}</tbody>
            </table></div>

            {/* Bar chart of %uN/N */}
            {fr.summary?.length > 0 && (
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={fr.summary.map((s: any) => ({ group: s.label, mean: s.pct_uN_N ?? 0, sd: s.sd ?? 0 }))} margin={{ top: 15, right: 30, left: 20, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="group" label={{ value: "Treatment Group", position: "insideBottom", offset: -15 }} />
                  <YAxis label={{ value: "%μN/N", angle: -90, position: "insideLeft" }} />
                  <Tooltip content={({ active, payload, label }: any) => { if (!active || !payload?.length) return null; const d = payload[0]?.payload; return (<div className="bg-white border border-gray-300 rounded shadow-md p-3 text-sm"><p className="font-semibold mb-1">{label}</p><p>%μN/N: {fmt(d?.mean, 4)}</p><p className="text-red-600">SD: {fmt(d?.sd, 4)}</p></div>); }} />
                  <Bar dataKey="mean" fill="#2563eb" name="%μN/N"><ErrorBar dataKey="sd" width={4} strokeWidth={2} stroke="#dc2626" /></Bar>
                </BarChart>
              </ResponsiveContainer>
            )}

            <AcceptanceBanner text={fr.acceptance_1?.text} result={fr.acceptance_1?.result} />
            <AcceptanceBanner text={fr.acceptance_2?.text} result={fr.acceptance_2?.result} />
          </Collapse>
        </>)}

        {/* ===== STATISTICAL ANALYSIS ===== */}
        {activeTab === "statistics" && sa.available && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-blue-800 mb-6">Statistical Analysis</h2>

            {/* Experiment %uN/N data */}
            {sa.experiment_data?.length > 0 && (<>
              <h3 className="text-md font-semibold mb-3">%μN/N by Experiment</h3>
              <div className="overflow-x-auto mb-6"><table className="min-w-full bg-white border border-gray-200 text-sm">
                <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Experiment</th>{sa.group_headers?.map((h: string, i: number) => <th key={i} className="py-2 px-3 border text-right">{h}</th>)}</tr></thead>
                <tbody>{sa.experiment_data.map((ed: any, i: number) => <tr key={i} className={ed.label === "mean value" ? "bg-blue-50 font-semibold" : i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border font-medium">{ed.label}</td>{sa.group_headers?.map((h: string, hi: number) => <td key={hi} className="py-2 px-3 border text-right">{fmt(ed.values?.[h], 4)}</td>)}</tr>)}</tbody>
              </table></div>
            </>)}

            {/* ANOVA Summary */}
            {sa.anova_summary?.length > 0 && (<>
              <h3 className="text-md font-semibold mb-3">{sa.anova_summary_label ?? "ANOVA Summary"}</h3>
              <div className="overflow-x-auto mb-6"><table className="min-w-full bg-white border border-gray-200 text-sm">
                <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Grupy</th><th className="py-2 px-3 border text-right">Licznik</th><th className="py-2 px-3 border text-right">Suma</th><th className="py-2 px-3 border text-right">Średnia</th><th className="py-2 px-3 border text-right">Wariancja</th></tr></thead>
                <tbody>{sa.anova_summary.map((g: any, i: number) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border font-medium">{g.group}</td><td className="py-2 px-3 border text-right">{fmt(g.count, 0)}</td><td className="py-2 px-3 border text-right">{fmt(g.sum, 4)}</td><td className="py-2 px-3 border text-right">{fmt(g.mean, 4)}</td><td className="py-2 px-3 border text-right">{fmt(g.variance, 4)}</td></tr>)}</tbody>
              </table></div>
            </>)}

            {/* ANOVA Table */}
            {sa.anova_table?.length > 0 && (<>
              <h3 className="text-md font-semibold mb-3">{sa.anova_table_label ?? "ANOVA Table"}</h3>
              <div className="overflow-x-auto mb-6"><table className="min-w-full bg-white border border-gray-200 text-sm">
                <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Źródło wariancji</th><th className="py-2 px-3 border text-right">SS</th><th className="py-2 px-3 border text-right">df</th><th className="py-2 px-3 border text-right">MS</th><th className="py-2 px-3 border text-right">F</th><th className="py-2 px-3 border text-right">Wartość-p</th><th className="py-2 px-3 border text-right">Test F</th></tr></thead>
                <tbody>
                  {sa.anova_table.map((row: any, i: number) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border font-medium">{row.source}</td><td className="py-2 px-3 border text-right">{fmt(row.ss, 4)}</td><td className="py-2 px-3 border text-right">{fmt(row.df, 0)}</td><td className="py-2 px-3 border text-right">{fmt(row.ms, 4)}</td><td className="py-2 px-3 border text-right">{fmt(row.f_stat, 4)}</td><td className="py-2 px-3 border text-right">{row.p_value != null ? row.p_value.toExponential(4) : ""}</td><td className="py-2 px-3 border text-right">{fmt(row.f_crit, 4)}</td></tr>)}
                  {sa.total_ss != null && <tr className="font-semibold bg-blue-50"><td className="py-2 px-3 border">Razem</td><td className="py-2 px-3 border text-right">{fmt(sa.total_ss, 4)}</td><td className="py-2 px-3 border text-right">{fmt(sa.total_df, 0)}</td><td className="py-2 px-3 border" colSpan={4}></td></tr>}
                </tbody>
              </table></div>
            </>)}

            {/* p-value significance */}
            <div className={`p-4 rounded-md border mb-6 ${sa.is_significant === "YES" ? "bg-green-50 border-green-300" : "bg-yellow-50 border-yellow-300"}`}>
              <p className="font-semibold">is p-Value significant? Alpha = {sa.alpha ?? 0.05}</p>
              <p className={`text-lg font-bold mt-1 ${sa.is_significant === "YES" ? "text-green-700" : "text-yellow-700"}`}>{sa.is_significant ?? "Unknown"}</p>
            </div>

            {/* Post-hoc Pairwise */}
            {sa.posthoc?.length > 0 && (<>
              <h3 className="text-md font-semibold mb-3">Post-hoc Multiple Comparisons (Bonferroni corrected)</h3>
              <div className="overflow-x-auto mb-4"><table className="min-w-full bg-white border border-gray-200 text-sm">
                <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Groups</th><th className="py-2 px-3 border text-right">P-value (T-test)</th><th className="py-2 px-3 border text-center">Significant?</th></tr></thead>
                <tbody>{sa.posthoc.map((ph: any, i: number) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border font-medium">{ph.comparison}</td><td className="py-2 px-3 border text-right">{ph.p_value != null ? ph.p_value.toExponential(4) : ""}</td><td className={`py-2 px-3 border text-center font-semibold ${ph.significant === "YES" ? "text-green-600" : "text-gray-600"}`}>{ph.significant}</td></tr>)}</tbody>
              </table></div>
              {sa.posthoc_alpha && <p className="text-sm text-gray-600 mb-2">ANOVA α = {sa.posthoc_alpha.anova}, Bonferroni corrected α = {sa.posthoc_alpha.bonferroni}</p>}
              <AcceptanceBanner text={sa.posthoc_acceptance?.text} result={sa.posthoc_acceptance?.result} />
            </>)}
          </div>
        )}
      </div>
    </div>
  );
};

export default MNTDataViewer;