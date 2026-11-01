"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ErrorBar, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/axios";
import ScientificDataGroups, { ScientificImages } from "@/components/tests/shared/ScientificDataGroups";
import type { Category } from "@/lib/scientificRecognition";

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
  const columns = useMemo(() => Array.from(new Set(source?.rows.flatMap(row => row.cells.map(cell => cell.column)) ?? []))
    .sort((a, b) => a.length - b.length || a.localeCompare(b)), [source]);
  if (!source?.rows.length) return <p className="p-4 text-gray-500">No source data available.</p>;
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-semibold text-blue-800">{source.sheet_name}</h3>
      <button className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm" onClick={() => downloadCsv(source.sheet_name,
        [["Excel row", ...columns], ...source.rows.map(row => [row.row, ...columns.map(col => row.cells.find(cell => cell.column === col)?.value ?? null)])])}>
        <Download size={16} /> Download complete sheet CSV
      </button>
    </div>
    <p className="text-sm text-gray-500">Original workbook coordinates and cached formula results. Hover a formula cell to inspect its formula. Blank cells are not zero.</p>
    <div className="w-full">
      <table className="w-full table-fixed bg-white border border-gray-200 [&_th]:break-words [&_td]:break-words"><thead className="bg-gray-100"><tr><th className="py-2 px-1 border text-xs">Row</th>{columns.map(col => <th className="py-2 px-1 border text-xs" key={col}>{col}</th>)}</tr></thead>
        <tbody>{source.rows.map(row => <tr className="odd:bg-gray-50" key={row.row}>
          <th className="py-2 px-1 border text-xs font-medium">{row.row}</th>{columns.map(col => {
            const cell = row.cells.find(item => item.column === col);
            return <td className="whitespace-pre-wrap [overflow-wrap:anywhere] py-2 px-1 border text-xs" key={col} title={cell?.formula ?? cell?.coordinate}>{String(cell?.value ?? "—")}</td>;
          })}</tr>)}</tbody>
      </table>
    </div>
    <p className="text-sm text-gray-500">{source.rows.length} nonempty rows · all rows displayed</p>
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
  </section>;
}

function ReplicateBlocks({ blocks, category, conditions, finalValues }: { blocks: DataBlock[]; category: Category; conditions?: SourceTable; finalValues: Measurement[] }) {
  const [replication, setReplication] = useState("");
  const block = blocks.find(item => item.replication === replication) ?? blocks[0];
  if (!block) return <p className="p-4 text-gray-500">No replicate data available.</p>;
  return <div className="space-y-6"><label className="flex flex-wrap items-center gap-3 font-medium">Replication
    <select className="max-w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5" value={block.replication} onChange={event => setReplication(event.target.value)}>{blocks.map(item => <option key={item.replication}>{item.replication}</option>)}</select></label>
    <Measurements key={block.replication} values={block.measurements ?? []} />
    <ScientificDataGroups category={category} values={block.measurements} records={block.records} source={block.source} conditions={conditions} finalValues={finalValues} SourceGrid={SourceGrid} downloadCsv={downloadCsv} /></div>;
}

export default function ANNXDataViewer({ work_package, element, test }: CellAssayViewerProps) {
  const title = "Annexin V/DAPI Apoptosis (ANNX)";
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
            {data.test_details?.experimental_sections?.map((section, index) => <details key={`${section.title}-${index}`} className="group bg-white rounded-lg shadow-md mb-6" open>
              <summary className="flex cursor-pointer list-none items-center justify-between p-5 hover:bg-gray-50 transition">
                <h2 className="text-xl font-bold text-blue-800">{section.title}</h2>
                <ChevronDown className="text-gray-400 group-open:rotate-180 transition-transform" size={20} />
              </summary>
              <div className="px-6 pb-6">
                <table className="w-full table-fixed bg-white border border-gray-200 [&_th]:break-words [&_td]:break-words">
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
            {currentTab === "raw" && <ReplicateBlocks category="raw" conditions={data.test_details?.source} finalValues={data.final_results?.measurements ?? []} blocks={Array.isArray(safeRawBlocks) ? safeRawBlocks : []} />}
            {currentTab === "processed" && <ReplicateBlocks category="processed" conditions={data.test_details?.source} finalValues={data.final_results?.measurements ?? []} blocks={data.processed_data?.blocks ?? []} />}
            {currentTab === "final" && <><Measurements values={data.final_results?.measurements ?? []} /><ScientificDataGroups category="final" values={data.final_results?.measurements} source={data.final_results?.source} conditions={data.test_details?.source} finalValues={data.final_results?.measurements} SourceGrid={SourceGrid} downloadCsv={downloadCsv} /></>}
            {currentTab === "statistics" && <><p className="text-sm text-gray-600">Workbook-reported ANOVA, significance levels and post-hoc comparisons, including original endpoint headings and group mappings.</p><ScientificDataGroups category="statistics" source={data.statistical_analysis?.source} conditions={data.test_details?.source} finalValues={data.final_results?.measurements} SourceGrid={SourceGrid} downloadCsv={downloadCsv} /></>}
            {currentTab !== "conditions" && <ScientificImages workPackage={work_package} element={element} test={test} category={currentTab as Category} sources={currentTab === "raw" ? (Array.isArray(safeRawBlocks) ? safeRawBlocks.map(b => b.source) : []) : currentTab === "processed" ? (data.processed_data?.blocks ?? []).map(b => b.source) : [currentTab === "final" ? data.final_results?.source : data.statistical_analysis?.source].filter((source): source is SourceTable => !!source)} />}
          </section>}
        </div>
      </div>
    </div>
  );
}
