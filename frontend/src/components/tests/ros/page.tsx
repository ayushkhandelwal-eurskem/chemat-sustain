"use client";
import React, { FC, useEffect, useState, useMemo } from "react";
import { api } from "@/lib/axios";
import { Download, ChevronDown, ChevronUp, CheckCircle, XCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ErrorBar } from "recharts";

/* ------------------------------------------------------------------ */
/* Types & helpers                                                     */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* Reusable components                                                 */
/* ------------------------------------------------------------------ */
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
  return (
    <div className={`my-4 p-4 rounded-md border ${passed ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"}`}>
      <div className="flex items-center gap-2">
        {passed ? <CheckCircle size={20} className="text-green-600" /> : <XCircle size={20} className="text-red-600" />}
        <span className={`font-semibold ${passed ? "text-green-800" : "text-red-800"}`}>{text ?? "Acceptance criteria"}: {result}</span>
      </div>
    </div>
  );
};

/* Generic section table renderer */
const SectionTable: FC<{ id: string; section: any; title: string; isCv?: boolean; isPct?: boolean; dl?: string }> = ({ id, section, title, isCv, isPct, dl }) => {
  if (!section?.rows?.length) return null;
  const headers = section.headers ?? [];
  const fmtVal = (val: any, label: string) => {
    if (val == null) return "";
    if (isCv && label === "CV") return fmt(val.toFixed(2));
    if (isPct && typeof val === "number") return fmt(val * 100, 2) + "%";
    return fmt(val, 2);
  };
  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-md font-semibold">{title}</h3>
        {dl && <button onClick={() => dlCSV(id, dl)} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>CSV</span></button>}
      </div>
      <div className="overflow-x-auto"><table id={id} className="min-w-full bg-white border border-gray-200 text-sm">
        <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Row</th>{headers.map((h: string, i: number) => <th key={i} className="py-2 px-3 border text-right">{dot(h)}</th>)}</tr></thead>
        <tbody>{section.rows.map((row: any, ri: number) => {
          const isHL = row.label === "Mean" || row.label === "MEAN" || row.label === "CV";
          return (<tr key={ri} className={isHL ? "bg-blue-50 font-semibold" : ri % 2 === 0 ? "bg-gray-50" : ""}>
            <td className="py-2 px-3 border font-medium">{row.label}</td>
            {headers.map((h: string, hi: number) => <td key={hi} className="py-2 px-3 border text-right">{fmtVal(row.values[h], row.label)}</td>)}
          </tr>);
        })}</tbody>
      </table></div>
    </div>
  );
};

/* Bar chart with error bars */
const FluorBarChart: FC<{ data: any[]; xLabel: string; yLabel: string; title: string; suffix?: string }> = ({ data, xLabel, yLabel, title, suffix = "" }) => {
  if (!data?.length) return null;
  return (
    <div className="mb-8">
      <h3 className="text-md font-semibold mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={data} margin={{ top: 15, right: 30, left: 20, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="group" label={{ value: xLabel, position: "insideBottom", offset: -15 }} />
          <YAxis label={{ value: yLabel, angle: -90, position: "insideLeft" }} />
          <Tooltip content={({ active, payload, label }: any) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload;
            return (<div className="bg-white border border-gray-300 rounded shadow-md p-3 text-sm"><p className="font-semibold mb-1">{label}</p><p>Mean: {fmt(d?.mean, 2)}{suffix}</p><p className="text-red-600">SD: {fmt(d?.sd, 4)}{suffix}</p></div>);
          }} />
          <Bar dataKey="mean" fill="#2563eb" name="Mean"><ErrorBar dataKey="sd" width={4} strokeWidth={2} stroke="#dc2626" /></Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/* Build chart data from a section */
function buildChartData(section: any, isPct = false): any[] {
  if (!section?.rows?.length) return [];
  const meanRow = section.rows.find((r: any) => r.label === "Mean" || r.label === "MEAN");
  const sdIdx = meanRow ? section.rows.indexOf(meanRow) + 1 : -1;
  const sdRow = sdIdx >= 0 && sdIdx < section.rows.length && section.rows[sdIdx].label === "SD" ? section.rows[sdIdx] : null;
  if (!meanRow) return [];
  const mul = isPct ? 100 : 1;
  return (section.headers ?? []).map((h: string) => ({ group: dot(h), mean: (meanRow.values[h] ?? 0) * mul, sd: (sdRow?.values[h] ?? 0) * mul }));
}

/* ------------------------------------------------------------------ */
/* Main Component                                                      */
/* ------------------------------------------------------------------ */
const ROSDataViewer: FC<PageProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("test-conditions");
  const [rawRunIdx, setRawRunIdx] = useState(0);
  const [procRunIdx, setProcRunIdx] = useState(0);

  useEffect(() => { const ac = new AbortController(); (async () => { try { setLoading(true); const res = await api.post(`/tests/listings`, { work_package_name: work_package, element_cms_id: element, test_name: test }, { signal: ac.signal }); if (res.status !== 200) throw new Error("Bad"); setData(res.data); } catch (err: any) { if (err.name !== "CanceledError" && err.name !== "AbortError") setError("Failed to load ROS data."); } finally { setLoading(false); } })(); return () => ac.abort(); }, [work_package, element, test]);

  const safeRaw = useMemo(() => Array.isArray(data?.raw_data) ? data.raw_data : [], [data?.raw_data]);
  const safeProc = useMemo(() => Array.isArray(data?.processed_data) ? data.processed_data : [], [data?.processed_data]);
  const fr = data?.final_results ?? {};
  const sa = data?.statistical_analysis ?? {};

  if (loading) return <div className="bg-white flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" /></div>;
  if (error || !data) return <div className="flex items-center justify-center min-h-screen"><div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"><p>{error || "No data."}</p></div></div>;

  const td = data.test_details ?? {}, wp = td.work_package ?? {}, mat = td.material ?? {}, cl = td.cell_line ?? {}, disp = td.dispersion ?? {}, treat = td.treatment ?? {};

  return (
    <div className="bg-gray-50 min-h-screen py-8 text-black">
      <div className="container mx-auto px-4">
        {/* ===== HEADER ===== */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-4">ROS Test Data Report</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><h2 className="text-lg font-semibold mb-3">Test Parameters</h2><div className="bg-blue-50 p-4 rounded-md"><p className="mb-2"><span className="font-semibold">Work Package:</span> {wp.wp_name}</p><p className="mb-2"><span className="font-semibold">CMS Identifier:</span> {mat.material_identifier}</p><p className="mb-2"><span className="font-semibold">Partner:</span> {wp.partner}</p><p><span className="font-semibold">Material:</span> {mat.material_name}</p></div></div>
            <div><h2 className="text-lg font-semibold mb-3">Test Information</h2><div className="bg-blue-50 p-4 rounded-md"><p className="mb-2"><span className="font-semibold">Full Name:</span> {wp.full_test_name}</p><p className="mb-2"><span className="font-semibold">Acronym:</span> {wp.test_acronym}</p><p className="mb-2"><span className="font-semibold">Endpoint:</span> {wp.endpoint}</p><p><span className="font-semibold">Outcome:</span> {wp.endpoint_outcome}</p></div></div>
          </div>
        </div>

        {/* ===== TABS ===== */}
        <div className="w-full mb-8"><ul className="relative flex flex-wrap p-1.5 list-none rounded-md bg-slate-100" role="tablist">{TABS.map(tab => <li key={tab.key} className="z-30 flex-auto text-center" role="presentation"><button role="tab" aria-selected={activeTab === tab.key} className={`z-30 w-full px-0 py-2 text-sm mb-0 transition-all rounded-md ${activeTab === tab.key ? "bg-blue-600 text-white shadow-md" : "text-slate-600 hover:text-slate-800"}`} onClick={() => setActiveTab(tab.key)}>{tab.label}</button></li>)}</ul></div>

        {/* ================================================================== */}
        {/* TEST CONDITIONS                                                     */}
        {/* ================================================================== */}
        {activeTab === "test-conditions" && (<>
          <Collapse title="Material Information"><KV id="matTbl" dl="ROS_Material" rows={[
            { label: "CMS Identifier", value: mat.material_identifier }, { label: "ERM Identifier", value: mat.erm_id },
            { label: "Material Name", value: mat.material_name }, { label: "Core Chemistry", value: mat.core_chemistry },
            { label: "CAS No", value: mat.cas_no }, { label: "CAS for Core", value: mat.cas_for_core },
            { label: "Material Supplier", value: mat.material_supplier }, { label: "Material State", value: mat.material_state },
            { label: "Batch", value: mat.batch }, { label: "Vial", value: mat.vial }, { label: "Size", value: mat.size },
            { label: "Preparation Date", value: mat.preparation_date }, { label: "Endotoxin", value: mat.endotoxin },
            { label: "Stock Concentration", value: mat.stock_concentration }, { label: "Molecular Weight", value: mat.molecular_weight },
            { label: "Particles in Stock", value: mat.particles_in_stock },
          ]} /></Collapse>
          <Collapse title="Cell Line"><KV id="cellTbl" dl="ROS_CellLine" rows={[
            { label: "Cell Type", value: cl.cell_type }, { label: "Short Name", value: cl.cell_line_short },
            { label: "Supplier", value: cl.supplier }, { label: "Passage Numbers", value: cl.passage_numbers?.join(", ") },
            { label: "Plate Details", value: cl.plate_details }, { label: "Cells Per Well", value: cl.cells_per_well },
            { label: "Volume Per Well", value: cl.volume_per_well }, { label: "Medium", value: cl.medium },
            { label: "Serum", value: cl.serum }, { label: "Growth Medium", value: cl.complete_growth_medium },
            { label: "Culture Conditions", value: degC(cl.culture_conditions ?? "") },
            { label: "Solvent for DA-DCF", value: cl.solvent_for_dcf }, { label: "Incubation Time (DCF)", value: cl.incubation_time_dcf },
            { label: "Volume of Solvent", value: cl.volume_of_solvent },
          ]} /></Collapse>
          <Collapse title="Treatment Concentrations">
            <div className="overflow-x-auto mb-4"><table className="min-w-full bg-white border border-gray-200 text-sm">
              <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Label</th><th className="py-2 px-4 border text-right">μg/mL</th><th className="py-2 px-4 border text-right">particles ×10¹²/mL</th></tr></thead>
              <tbody>{treat.concentrations?.map((c: any, i: number) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-4 border font-medium">{c.label}</td><td className="py-2 px-4 border text-right">{fmt(c.ug_ml)}</td><td className="py-2 px-4 border text-right">{fmt(c.particles_x10_12_ml)}</td></tr>)}</tbody>
            </table></div>
            <KV id="treatKV" rows={[
              { label: "Plate Series", value: treat.plate_series?.join(", ") },
              { label: "Positive Control", value: treat.positive_control_desc }, { label: "Negative Control", value: treat.negative_control_desc },
              { label: "Number of Experiments", value: treat.num_experiments },
            ]} />
          </Collapse>
          <Collapse title="Dispersion"><KV id="dispTbl" rows={[
            { label: "Protocol", value: disp.dispersion_protocol }, { label: "Technique", value: disp.dispersion_technique },
            { label: "Agent", value: disp.dispersion_agent }, { label: "Agent Concentration", value: disp.agent_concentration },
            { label: "Additives", value: disp.additives }, { label: "Dispersed in Medium", value: disp.dispersed_in_medium },
            ...(disp.aids ? Object.entries(disp.aids).map(([k, v]: any) => ({ label: k, value: v })) : []),
          ]} /></Collapse>
          <Collapse title="Scientists"><KV id="sciTbl" rows={[
            ...(wp.lead_scientists ?? []).map((s: any) => ({ label: `Lead Scientist`, value: `${s.name}${s.email ? ` (${s.email})` : ""}` })),
            ...(wp.assay_scientists ?? []).map((s: any) => ({ label: `Assay Conducted By`, value: `${s.name}${s.email ? ` (${s.email})` : ""}` })),
          ]} /></Collapse>
        </>)}

        {/* ================================================================== */}
        {/* RAW DATA                                                            */}
        {/* ================================================================== */}
        {activeTab === "raw-data" && safeRaw.length > 0 && (() => { const blk = safeRaw[rawRunIdx]; return (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
              <h2 className="text-xl font-bold text-blue-800">Raw Fluorescence Readings</h2>
              <div className="flex items-center gap-3">
                {safeRaw.length > 1 && <select value={rawRunIdx} onChange={e => setRawRunIdx(Number(e.target.value))} className="bg-gray-50 border border-gray-300 text-sm rounded-lg p-2">{safeRaw.map((b: any, i: number) => <option key={i} value={i}>{b.run_label}</option>)}</select>}
                <button onClick={() => dlCSV("rawTbl", `ROS_Raw_${blk.run_label}`)} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>Download</span></button>
              </div>
            </div>

            {blk.fluorescein_label && <p className="text-sm text-gray-600 mb-2"><span className="font-semibold">{blk.fluorescein_label}</span> — Count: {fmt(blk.fluorescein_count, 0)}</p>}

            {/* Readings table: grouped by readings 1/2/3 */}
            <div className="overflow-x-auto mb-6"><table id="rawTbl" className="min-w-full bg-white border border-gray-200 text-sm">
              <thead>
                <tr className="bg-gray-200"><th className="py-1 px-3 border" colSpan={2}></th><th className="py-1 px-3 border text-center" colSpan={2}>Reading 1</th><th className="py-1 px-3 border text-center" colSpan={2}>Reading 2</th><th className="py-1 px-3 border text-center" colSpan={2}>Reading 3</th></tr>
                <tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Well</th><th className="py-2 px-3 border text-left">Type</th><th className="py-2 px-3 border text-right">Time</th><th className="py-2 px-3 border text-right">Fluorescein</th><th className="py-2 px-3 border text-right">Time</th><th className="py-2 px-3 border text-right">Fluorescein</th><th className="py-2 px-3 border text-right">Time</th><th className="py-2 px-3 border text-right">Fluorescein</th></tr>
              </thead>
              <tbody>{blk.readings?.map((r: any, i: number) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border">{r.well}</td><td className="py-2 px-3 border">{r.type}</td><td className="py-2 px-3 border text-right">{r.time_r1}</td><td className="py-2 px-3 border text-right">{fmt(r.fluorescein_r1, 0)}</td><td className="py-2 px-3 border text-right">{r.time_r2}</td><td className="py-2 px-3 border text-right">{fmt(r.fluorescein_r2, 0)}</td><td className="py-2 px-3 border text-right">{r.time_r3}</td><td className="py-2 px-3 border text-right">{fmt(r.fluorescein_r3, 0)}</td></tr>)}</tbody>
            </table></div>

            {/* Plate Details */}
            {blk.plate_metadata?.length > 0 && (
              <Collapse title="Plate Details" open={false}>
                <div className="overflow-x-auto"><table className="min-w-full bg-white border border-gray-200 text-sm">
                  <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Reading</th><th className="py-2 px-3 border text-right">Plate</th><th className="py-2 px-3 border text-right">Repeat</th><th className="py-2 px-3 border text-right">End Time</th><th className="py-2 px-3 border text-right">Start Temp</th><th className="py-2 px-3 border text-right">End Temp</th><th className="py-2 px-3 border text-left">BarCode</th></tr></thead>
                  <tbody>{blk.plate_metadata.map((pm: any, i: number) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border font-medium">{pm.reading}</td><td className="py-2 px-3 border text-right">{fmt(pm.plate, 0)}</td><td className="py-2 px-3 border text-right">{fmt(pm.repeat, 0)}</td><td className="py-2 px-3 border text-right">{pm.end_time}</td><td className="py-2 px-3 border text-right">{fmt(pm.start_temp, 1)}</td><td className="py-2 px-3 border text-right">{fmt(pm.end_temp, 1)}</td><td className="py-2 px-3 border">{pm.barcode}</td></tr>)}</tbody>
                </table></div>
              </Collapse>
            )}

            {/* Protocol description - only once */}
            {rawRunIdx === 0 && blk.protocol_description?.length > 0 && (
              <Collapse title="Protocol Description" open={false}>
                <div className="bg-gray-50 p-4 rounded-md font-mono text-xs leading-relaxed max-h-80 overflow-y-auto">{blk.protocol_description.map((line: string, i: number) => <p key={i}>{line}</p>)}</div>
              </Collapse>
            )}
          </div>
        ); })()}

        {/* ================================================================== */}
        {/* PROCESSED DATA                                                      */}
        {/* ================================================================== */}
        {activeTab === "processed-data" && safeProc.length > 0 && (() => { const blk = safeProc[procRunIdx]; const chartData = blk.group_headers?.map((h: string) => ({ group: dot(h.split("-")[0]), mean: blk.mean?.[h] ?? 0, sd: blk.sd?.[h] ?? 0 })) ?? []; return (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
              <h2 className="text-xl font-bold text-blue-800">{blk.title ?? "Fluorescence level as an indicator of ROS production"}</h2>
              {safeProc.length > 1 && <select value={procRunIdx} onChange={e => setProcRunIdx(Number(e.target.value))} className="bg-gray-50 border border-gray-300 text-sm rounded-lg p-2">{safeProc.map((b: any, i: number) => <option key={i} value={i}>{b.experiment_label ?? b.run_label}</option>)}</select>}
            </div>

            {/* Measurement table */}
            <div className="flex justify-end mb-2"><button onClick={() => dlCSV("procTbl", `ROS_Proc_${blk.run_label}`)} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>CSV</span></button></div>
            <div className="overflow-x-auto mb-4"><table id="procTbl" className="min-w-full bg-white border border-gray-200 text-sm">
              <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Metric</th>{blk.group_headers?.map((h: string, i: number) => <th key={i} className="py-2 px-3 border text-right">{dot(h)}</th>)}</tr></thead>
              <tbody>
                {blk.raw_values?.map((rv: any, ri: number) => <tr key={`rv${ri}`} className={ri % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border">Measurement {ri + 1}</td>{blk.group_headers?.map((h: string, hi: number) => <td key={hi} className="py-2 px-3 border text-right">{fmt(rv[h], 0)}</td>)}</tr>)}
                <tr className="bg-blue-50 font-semibold"><td className="py-2 px-3 border">Mean</td>{blk.group_headers?.map((h: string, i: number) => <td key={i} className="py-2 px-3 border text-right">{fmt(blk.mean?.[h], 2)}</td>)}</tr>
                <tr><td className="py-2 px-3 border">SD</td>{blk.group_headers?.map((h: string, i: number) => <td key={i} className="py-2 px-3 border text-right">{fmt(blk.sd?.[h], 2)}</td>)}</tr>
                <tr><td className="py-2 px-3 border">CV</td>{blk.group_headers?.map((h: string, i: number) => <td key={i} className="py-2 px-3 border text-right">{blk.cv?.[h] != null ? fmt(blk.cv[h] * 100, 2) + "%" : ""}</td>)}</tr>
              </tbody>
            </table></div>

            {/* Acceptance */}
            <AcceptanceBanner text={blk.acceptance_text} result={blk.acceptance_result} />

            {/* Chart */}
            {chartData.length > 0 && (
              <FluorBarChart data={chartData} xLabel="Treatment Group" yLabel="Fluorescence (Counts)" title={`${blk.experiment_label ?? blk.run_label} — Mean Fluorescence ± SD`} />
            )}
          </div>
        ); })()}

        {/* ================================================================== */}
        {/* FINAL RESULTS                                                       */}
        {/* ================================================================== */}
        {activeTab === "results" && fr.available && (<>
          {/* 1. Fluorescence ug/mL */}
          <Collapse title="Fluorescence Level (μg/mL)">
            <SectionTable id="frFluorUg" section={fr.fluorescence_ugml} title="Fluorescence level as an indicator of ROS production" isCv dl="FR_Fluor_ugml" />
            <AcceptanceBanner text={fr.fluorescence_ugml_acceptance?.text} result={fr.fluorescence_ugml_acceptance?.result} />
          </Collapse>

          {/* 2. Reverse */}
          <Collapse title="Reverse — Fluorescence Level (μg/mL)">
            <SectionTable id="frReverse" section={fr.reverse_ugml} title="Reverse Fluorescence level as an indicator of ROS production" isCv dl="FR_Reverse" />
            <AcceptanceBanner text={fr.reverse_ugml_acceptance?.text} result={fr.reverse_ugml_acceptance?.result} />
          </Collapse>

          {/* 3. Fluorescence ug/mL chart */}
          <Collapse title="Fluorescence Level Chart (μg/mL)">
            <SectionTable id="frFluorUgChart" section={fr.fluorescence_ugml_chart} title={`Fluorescence (${fr.fluorescence_ugml_chart?.unit_label ?? "μg/mL"})`} dl="FR_FluorChart_ugml" />
            <FluorBarChart data={buildChartData(fr.fluorescence_ugml_chart)} xLabel="NPs Concentration (μg/mL)" yLabel="Level of Fluorescence" title="Fluorescence — μg/mL Concentrations" />
          </Collapse>

          {/* 4. Fluorescence particles chart */}
          <Collapse title="Fluorescence Level Chart (particles)">
            <SectionTable id="frFluorPart" section={fr.fluorescence_particles_chart} title={`Fluorescence (${fr.fluorescence_particles_chart?.unit_label ?? "particles"})`} dl="FR_FluorChart_particles" />
            <FluorBarChart data={buildChartData(fr.fluorescence_particles_chart)} xLabel="NPs Concentration (particles ×10¹²/mL)" yLabel="Level of Fluorescence" title="Fluorescence — Particle Concentrations" />
          </Collapse>

          {/* 5. Percentage ug/mL */}
          <Collapse title="Percentage Relative to NC (μg/mL)">
            <SectionTable id="frPctUg" section={fr.percentage_ugml} title={`% Relative to NC (${fr.percentage_ugml?.unit_label ?? "μg/mL"})`} isPct dl="FR_Pct_ugml" />
            <FluorBarChart data={buildChartData(fr.percentage_ugml, true)} xLabel="NPs Concentration (μg/mL)" yLabel="% NC" title="% Relative to Negative Control — μg/mL" suffix="%" />
          </Collapse>

          {/* 6. Percentage particles */}
          <Collapse title="Percentage Relative to NC (particles)">
            <SectionTable id="frPctPart" section={fr.percentage_particles} title={`% Relative to NC (${fr.percentage_particles?.unit_label ?? "particles"})`} isPct dl="FR_Pct_particles" />
            <FluorBarChart data={buildChartData(fr.percentage_particles, true)} xLabel="NPs Concentration (particles ×10¹²/mL)" yLabel="% NC" title="% Relative to Negative Control — Particles" suffix="%" />
          </Collapse>

          {/* 7. Data Summary */}
          {fr.data_summary?.rows?.length > 0 && (
            <Collapse title="Data Summary">
              <div className="flex justify-end mb-2"><button onClick={() => dlCSV("frSummary", "FR_DataSummary")} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition text-sm"><Download size={14} /><span>CSV</span></button></div>
              <div className="overflow-x-auto"><table id="frSummary" className="min-w-full bg-white border border-gray-200 text-sm">
                <thead><tr className="bg-gray-100">{fr.data_summary.headers.map((h: string, i: number) => <th key={i} className="py-2 px-3 border text-right">{h}</th>)}</tr></thead>
                <tbody>{fr.data_summary.rows.map((row: any, ri: number) => <tr key={ri} className={ri % 2 === 0 ? "bg-gray-50" : ""}>{fr.data_summary.headers.map((h: string, hi: number) => {
                  const v = row[h];
                  const isPctCol = h.toLowerCase().includes("% nc") || h.toLowerCase().includes("relative to nc");
                  const isConcCol = h.toLowerCase().includes("ug/ml") || h.toLowerCase().includes("particles");
                  let display: string;
                  if (v == null || v === "") { display = ""; }
                  else if (typeof v === "string") { display = v; }
                  else if (isPctCol) { display = fmt(v * 100, 2) + "%"; }
                  else if (isConcCol) { display = fmt(v, 2); }
                  else { display = fmt(v, 2); }
                  return <td key={hi} className="py-2 px-3 border text-right">{display}</td>;
                })}</tr>)}</tbody>
              </table></div>
            </Collapse>
          )}
        </>)}

        {/* ================================================================== */}
        {/* STATISTICAL ANALYSIS                                                */}
        {/* ================================================================== */}
        {activeTab === "statistics" && sa.available && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-blue-800 mb-6">Statistical Analysis — One-Way ANOVA</h2>

            {/* Groups summary */}
            {sa.groups_summary?.length > 0 && (<>
              <h3 className="text-md font-semibold mb-3">Groups Summary</h3>
              <div className="overflow-x-auto mb-6"><table className="min-w-full bg-white border border-gray-200 text-sm">
                <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Group</th><th className="py-2 px-3 border text-right">Count</th><th className="py-2 px-3 border text-right">Sum</th><th className="py-2 px-3 border text-right">Mean</th><th className="py-2 px-3 border text-right">Variance</th></tr></thead>
                <tbody>{sa.groups_summary.map((g: any, i: number) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border font-medium">{g.group}</td><td className="py-2 px-3 border text-right">{fmt(g.count, 0)}</td><td className="py-2 px-3 border text-right">{fmt(g.sum, 2)}</td><td className="py-2 px-3 border text-right">{fmt(g.mean, 2)}</td><td className="py-2 px-3 border text-right">{fmt(g.variance, 2)}</td></tr>)}</tbody>
              </table></div>
            </>)}

            {/* ANOVA table */}
            {sa.anova_table?.length > 0 && (<>
              <h3 className="text-md font-semibold mb-3">ANOVA Table</h3>
              <div className="overflow-x-auto mb-6"><table className="min-w-full bg-white border border-gray-200 text-sm">
                <thead><tr className="bg-gray-100"><th className="py-2 px-3 border text-left">Source</th><th className="py-2 px-3 border text-right">SS</th><th className="py-2 px-3 border text-right">df</th><th className="py-2 px-3 border text-right">MS</th><th className="py-2 px-3 border text-right">F</th><th className="py-2 px-3 border text-right">p-value</th><th className="py-2 px-3 border text-right">F crit</th></tr></thead>
                <tbody>
                  {sa.anova_table.map((row: any, i: number) => <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}><td className="py-2 px-3 border font-medium">{row.source}</td><td className="py-2 px-3 border text-right">{fmt(row.ss, 2)}</td><td className="py-2 px-3 border text-right">{fmt(row.df, 0)}</td><td className="py-2 px-3 border text-right">{fmt(row.ms, 2)}</td><td className="py-2 px-3 border text-right">{fmt(row.f_stat, 4)}</td><td className="py-2 px-3 border text-right">{row.p_value != null ? row.p_value.toExponential(4) : ""}</td><td className="py-2 px-3 border text-right">{fmt(row.f_crit, 4)}</td></tr>)}
                  {sa.total_ss != null && <tr className="font-semibold bg-blue-50"><td className="py-2 px-3 border">Total</td><td className="py-2 px-3 border text-right">{fmt(sa.total_ss, 2)}</td><td className="py-2 px-3 border text-right">{fmt(sa.total_df, 0)}</td><td className="py-2 px-3 border" colSpan={4}></td></tr>}
                </tbody>
              </table></div>
            </>)}

            {/* p-value significance */}
            <div className={`p-4 rounded-md border ${sa.is_significant === "YES" ? "bg-green-50 border-green-300" : "bg-yellow-50 border-yellow-300"}`}>
              <p className="font-semibold">Is p-Value significant? Alpha = {sa.alpha ?? 0.05}</p>
              <p className={`text-lg font-bold mt-1 ${sa.is_significant === "YES" ? "text-green-700" : "text-yellow-700"}`}>{sa.is_significant ?? "Unknown"}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ROSDataViewer;