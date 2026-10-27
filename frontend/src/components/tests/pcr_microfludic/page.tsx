"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ErrorBar, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/axios";

interface CellAssayViewerProps {
  work_package: string;
  element: string;
  test: string;
  file: string;
}

type Scalar = string | number | boolean | null;
interface SourceCell { column: string; coordinate: string; value: Scalar; formula?: string }
interface SourceTable {
  sheet_name: string;
  rows: { row: number; cells: SourceCell[] }[];
  merged_ranges: string[];
}
interface Measurement {
  endpoint: string;
  treatment: string;
  value: Scalar;
  unit: string;
  source_cell: string;
  replication?: string | null;
  sd?: number | null;
  gate?: string | null;
}
interface DataBlock {
  replication: string;
  source: SourceTable;
  measurements?: Measurement[];
  records?: Record<string, Scalar>[];
}
interface AssayData {
  test_details?: {
    work_package?: { full_test_name?: string; wp_name?: string; partner?: string; test_type?: string; endpoint?: string; endpoint_outcome?: string };
    material?: { material_identifier?: string; material_name?: string };
    parser_warnings?: string[];
    experimental_sections?: { title: string; fields: { key: string; label: string; values: Scalar[] }[] }[];
    source?: SourceTable;
  } | null;
  raw_data?: DataBlock[] | null;
  replications?: DataBlock[] | null;
  processed_data?: { blocks?: DataBlock[] } | null;
  final_results?: { measurements?: Measurement[]; source?: SourceTable } | null;
  statistical_analysis?: { available?: boolean; source?: SourceTable } | null;
}

function downloadCsv(name: string, rows: Scalar[][]) {
  const escape = (value: Scalar) => {
    const text = String(value ?? "");
    // Spreadsheet downloads must not execute user-provided labels as formulas.
    const safe = /^[=+@\-]/.test(text) && typeof value !== "number" ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const url = URL.createObjectURL(new Blob(["\ufeff", rows.map(row => row.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function SourceGrid({ source }: { source?: SourceTable }) {
  const [page, setPage] = useState(0);
  const columns = useMemo(() => Array.from(new Set(source?.rows.flatMap(row => row.cells.map(cell => cell.column)) ?? []))
    .sort((a, b) => a.length - b.length || a.localeCompare(b)), [source]);
  if (!source?.rows.length) return <p className="p-4 text-gray-500">No source data available.</p>;
  const pages = Math.ceil(source.rows.length / 50);
  const safePage = Math.min(page, pages - 1);
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-semibold text-blue-800">{source.sheet_name}</h3>
      <button className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm" onClick={() => downloadCsv(source.sheet_name,
        [["Excel row", ...columns], ...source.rows.map(row => [row.row, ...columns.map(col => row.cells.find(cell => cell.column === col)?.value ?? null)])])}>
        <Download size={16} /> Download complete sheet CSV
      </button>
    </div>
    <p className="text-sm text-gray-500">Original workbook coordinates and cached formula results. Hover a formula cell to inspect its formula. Blank cells are not zero.</p>
    <div className="max-h-[600px] overflow-auto rounded border">
      <table className="min-w-full bg-white border border-gray-200"><thead className="sticky top-0 bg-gray-100"><tr><th className="py-2 px-4 border">Row</th>{columns.map(col => <th className="py-2 px-4 border" key={col}>{col}</th>)}</tr></thead>
        <tbody>{source.rows.slice(safePage * 50, (safePage + 1) * 50).map(row => <tr className="odd:bg-gray-50" key={row.row}>
          <th className="py-2 px-4 border font-medium">{row.row}</th>{columns.map(col => {
            const cell = row.cells.find(item => item.column === col);
            return <td className="min-w-24 max-w-xl whitespace-pre-wrap break-words py-2 px-4 border" key={col} title={cell?.formula ?? cell?.coordinate}>{String(cell?.value ?? "—")}</td>;
          })}</tr>)}</tbody>
      </table>
    </div>
    <div className="flex items-center gap-3 text-sm"><button className="bg-gray-50 border border-gray-300 text-sm rounded-lg px-3 py-2 disabled:opacity-40" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
      <span>Page {safePage + 1} of {pages} · {source.rows.length} nonempty rows</span>
      <button className="bg-gray-50 border border-gray-300 text-sm rounded-lg px-3 py-2 disabled:opacity-40" disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)}>Next</button></div>
  </section>;
}

function Measurements({ values }: { values: Measurement[] }) {
  const [endpoint, setEndpoint] = useState("");
  const endpoints = Array.from(new Set(values.map(value => value.endpoint)));
  const selected = endpoints.includes(endpoint) ? endpoint : endpoints[0];
  const visible = values.filter(value => value.endpoint === selected);
  const summaries = visible.filter(value => !value.replication);
  const chartData = (summaries.length ? summaries : visible).filter(value => typeof value.value === "number")
    .map(value => ({ ...value, label: value.replication ? `${value.treatment} · ${value.replication}` : value.treatment }));
  if (!values.length) return null;
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center gap-3"><label className="font-medium" htmlFor="assay-endpoint">Scientific endpoint</label>
      <select id="assay-endpoint" className="max-w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5" value={selected} onChange={event => setEndpoint(event.target.value)}>{endpoints.map(value => <option key={value}>{value}</option>)}</select>
      <button className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm" onClick={() => downloadCsv("measurements", [
        ["Endpoint", "Treatment", "Replication", "Value", "Unit", "SD (as reported)", "Gate", "Source cell"],
        ...values.map(value => [value.endpoint, value.treatment, value.replication ?? null, value.value, value.unit, value.sd ?? null, value.gate ?? null, value.source_cell]),
      ])}><Download size={16} /> All measurements CSV</button></div>
    <p className="text-sm text-gray-600">{visible[0]?.unit}. Error bars show workbook-reported SD where available; no values are recalculated.</p>
    {chartData.length > 0 && chartData.length <= 100 && <div className="h-80 w-full"><ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 55, left: 10 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" angle={-15} textAnchor="end" height={70} /><YAxis /><Tooltip />
        <Bar dataKey="value" name={visible[0]?.unit} fill="#3b82f6"><ErrorBar dataKey="sd" width={5} stroke="#1e293b" /></Bar>
      </BarChart></ResponsiveContainer></div>}
    <div className="overflow-auto"><table className="min-w-full bg-white border border-gray-200"><thead className="bg-gray-100"><tr>{["Treatment", "Replication", "Value", "SD", "Gate", "Source"].map(label => <th className="py-2 px-4 border" key={label}>{label}</th>)}</tr></thead>
      <tbody>{visible.slice(0, 200).map((value, index) => <tr className="border-t" key={`${value.source_cell}-${index}`}>
        <td className="py-2 px-4 border">{value.treatment}</td><td className="py-2 px-4 border">{value.replication ?? "Summary"}</td><td className="py-2 px-4 border">{String(value.value ?? "—")}</td><td className="py-2 px-4 border">{value.sd ?? "—"}</td><td className="py-2 px-4 border">{value.gate ?? "—"}</td><td className="py-2 px-4 border">{value.source_cell}</td>
      </tr>)}</tbody></table></div>
    {visible.length > 200 && <p className="text-sm text-gray-600">Showing 200 of {visible.length} measurements. Download the complete dataset above.</p>}
  </section>;
}

function ReplicateBlocks({ blocks }: { blocks: DataBlock[] }) {
  const [replication, setReplication] = useState("");
  const block = blocks.find(item => item.replication === replication) ?? blocks[0];
  if (!block) return <p className="p-4 text-gray-500">No replicate data available.</p>;
  return <div className="space-y-6"><label className="flex flex-wrap items-center gap-3 font-medium">Replication
    <select className="max-w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5" value={block.replication} onChange={event => setReplication(event.target.value)}>{blocks.map(item => <option key={item.replication}>{item.replication}</option>)}</select></label>
    <Measurements key={block.replication} values={block.measurements ?? []} />
    {!!block.records?.length && <div className="space-y-3"><p className="text-sm text-gray-600">{block.records.length} cytometry records, including population gates, counts, %Total, %Gated and channel statistics. Complete values and original export labels are below.</p>
      <button className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm" onClick={() => {
        const records = block.records ?? [];
        const columns = Array.from(new Set(records.flatMap(record => Object.keys(record))));
        downloadCsv(`${block.replication}_cytometry`, [columns, ...records.map(record => columns.map(column => record[column] ?? null))]);
      }}><Download size={16} /> Complete cytometry records CSV</button></div>}
    <SourceGrid key={block.source.sheet_name} source={block.source} /></div>;
}

export default function PCRMicrofludicDataViewer({ work_package, element, test }: CellAssayViewerProps) {
  const title = "PCR Microfluidic (PCR-Microfludic)";
  const [data, setData] = useState<AssayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("conditions");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    api.post<AssayData>("/tests/listings", { work_package_name: work_package, element_cms_id: element, test_name: test }, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setData(response.data); })
      .catch(() => { if (!controller.signal.aborted) setError(`Failed to load ${test} data. Please try again.`); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [work_package, element, test]);
  const safeRawBlocks = useMemo(() => data?.raw_data ?? data?.replications ?? [], [data?.raw_data, data?.replications]);
  const tabs = [{ key: "conditions", label: "Test Conditions" }, { key: "raw", label: "Raw Data" }, { key: "processed", label: "Processed Data" }, { key: "final", label: "Final Results" },
    ...(data?.statistical_analysis?.available ? [{ key: "statistics", label: "Statistical Analysis" }] : [])];
  const currentTab = tabs.some(tab => tab.key === activeTab) ? activeTab : "conditions";
  if (loading) return <div role="status" aria-label={`Loading ${title}`} className="bg-white flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" /></div>;
  if (error) return <div role="alert" className="flex items-center justify-center min-h-screen bg-white"><div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div></div>;
  if (!data) return <div className="bg-gray-50 min-h-screen p-12 text-center text-black">No test data available.</div>;
  const wp = data.test_details?.work_package;
  const material = data.test_details?.material;
  const reportTitle = tabs.find(tab => tab.key === currentTab)?.label;

  return (
    <div className="bg-gray-50 min-h-screen py-8 text-black">
      <div className="container mx-auto px-4">
        <header className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-4">{title} Data Report</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Parameters</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2"><span className="font-semibold">Work Package:</span> {wp?.wp_name ?? work_package}</p>
                <p className="mb-2"><span className="font-semibold">CMS Identifier:</span> {material?.material_identifier ?? element}</p>
                <p className="mb-2"><span className="font-semibold">Partner:</span> {wp?.partner ?? "N/A"}</p>
                <p><span className="font-semibold">Material:</span> {material?.material_name ?? "N/A"}</p>
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Information</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2"><span className="font-semibold">Full Name:</span> {wp?.full_test_name ?? test}</p>
                <p className="mb-2"><span className="font-semibold">Type:</span> {wp?.test_type ?? "N/A"}</p>
                <p className="mb-2"><span className="font-semibold">Endpoint:</span> {wp?.endpoint ?? "N/A"}</p>
                <p><span className="font-semibold">Outcome Metric:</span> {wp?.endpoint_outcome ?? "N/A"}</p>
              </div>
            </div>
          </div>
        </header>

        {!!data.test_details?.parser_warnings?.length && <details className="mb-8 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <summary className="cursor-pointer font-semibold">Workbook quality warnings ({data.test_details.parser_warnings.length})</summary>
          <ul className="mt-2 list-inside list-disc text-sm">{data.test_details.parser_warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        </details>}

        <nav className="w-full mb-8" aria-label="Test data sections">
          <ul className="relative flex flex-wrap p-1.5 list-none rounded-md bg-slate-100" role="tablist">
            {tabs.map(tab => <li key={tab.key} className="flex-auto text-center" role="presentation">
              <button id={`assay-tab-${tab.key}`} role="tab" aria-selected={currentTab === tab.key} aria-controls="assay-panel"
                className={`w-full px-4 py-2 text-sm transition-all rounded-md ${currentTab === tab.key ? "bg-blue-600 text-white shadow-md" : "text-slate-600 hover:text-slate-800"}`}
                onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
            </li>)}
          </ul>
        </nav>

        <div id="assay-panel" role="tabpanel" aria-labelledby={`assay-tab-${currentTab}`}>
          {currentTab === "conditions" ? <>
            {data.test_details?.experimental_sections?.map((section, index) => <details key={`${section.title}-${index}`} className="group bg-white rounded-lg shadow-md mb-6 overflow-hidden" open>
              <summary className="flex cursor-pointer list-none items-center justify-between p-5 hover:bg-gray-50 transition">
                <h2 className="text-xl font-bold text-blue-800">{section.title}</h2>
                <ChevronDown className="text-gray-400 group-open:rotate-180 transition-transform" size={20} />
              </summary>
              <div className="px-6 pb-6 overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                  <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Property</th><th className="py-2 px-4 border text-left">Value</th></tr></thead>
                  <tbody>{section.fields.map((field, fieldIndex) => <tr key={`${field.key}-${fieldIndex}`} className={fieldIndex % 2 === 0 ? "bg-gray-50" : ""}>
                    <td className="py-2 px-4 border font-medium">{field.label}</td>
                    <td className="py-2 px-4 border whitespace-pre-wrap break-words">{field.values.map(value => String(value ?? "—")).join(" · ")}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </details>)}
            <details className="bg-white rounded-lg shadow-md p-6 mb-8">
              <summary className="mb-4 cursor-pointer text-xl font-bold text-blue-800">Complete Conditions Source</summary>
              <SourceGrid source={data.test_details?.source} />
            </details>
          </> : <section className="bg-white rounded-lg shadow-md p-6 mb-8 space-y-6 min-w-0">
            <h2 className="text-xl font-bold text-blue-800">{reportTitle}</h2>
            {currentTab === "raw" && <ReplicateBlocks blocks={Array.isArray(safeRawBlocks) ? safeRawBlocks : []} />}
            {currentTab === "processed" && <ReplicateBlocks blocks={data.processed_data?.blocks ?? []} />}
            {currentTab === "final" && <><Measurements values={data.final_results?.measurements ?? []} /><SourceGrid source={data.final_results?.source} /></>}
            {currentTab === "statistics" && <><p className="text-sm text-gray-600">Workbook-reported ANOVA, significance levels and post-hoc comparisons, including original endpoint headings and group mappings.</p><SourceGrid source={data.statistical_analysis?.source} /></>}
          </section>}
        </div>
      </div>
    </div>
  );
}
