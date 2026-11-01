"use client";
import type { ComponentType } from "react";
import type { Measurement, Scalar, SourceTable } from "@/lib/scientificRecognition";
import type { WorkbookTable } from "@/lib/annexinWorkbook";
import { pcrFinalComparisons, pcrMeasurementTables, pcrStatisticsTables } from "@/lib/pcrWorkbook";

interface Props {
  category: "raw" | "processed" | "final" | "statistics";
  values?: Measurement[]; source?: SourceTable; conditions?: SourceTable; finalValues?: Measurement[];
  SourceGrid: ComponentType<{ source?: SourceTable }>;
  downloadCsv: (name: string, rows: Scalar[][]) => void;
}
export default function PCRWorkbookTables({ category, values = [], source, conditions, finalValues = [], SourceGrid, downloadCsv }: Props) {
  const tables: WorkbookTable[] = category === "statistics" ? pcrStatisticsTables(source, [...new Set(finalValues.map(value => value.endpoint))]) : [
    ...pcrMeasurementTables(values, conditions), ...(category === "final" ? pcrFinalComparisons(source) : []),
  ];
  return <div className="space-y-6">
    <p className="text-sm text-gray-600">Workbook-reported values and labels; no recalculation. Blank or unavailable results are shown as —.</p>
    {category === "final" && source?.rows.flatMap(row => row.cells.filter(cell => /No significant differences versus/i.test(String(cell.value ?? ""))).map(cell => <p key={cell.coordinate} className="rounded-md bg-blue-50 p-4 text-sm text-blue-900">{String(cell.value)}</p>))}
    {tables.map((table, i) => <section key={i} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold text-blue-800">{table.title}</h3><button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm" onClick={() => downloadCsv(table.title, [table.columns, ...table.rows])}>Download CSV</button></div>
      <div className="overflow-x-auto"><table className="min-w-full bg-white border border-gray-200 text-sm"><thead className="bg-gray-100"><tr>{table.columns.map((column, j) => <th key={j} className="py-2 px-3 border text-left">{column}</th>)}</tr></thead><tbody>{table.rows.map((row, j) => <tr key={j} className="odd:bg-gray-50">{row.map((value, k) => <td key={k} className="py-2 px-3 border whitespace-pre-wrap">{value == null ? "—" : String(value)}</td>)}</tr>)}</tbody></table></div>
    </section>)}
    {!tables.length && <p className="text-gray-500">No structured tables recognized. Original workbook data remains available below.</p>}
    {source && <details><summary className="cursor-pointer text-lg font-semibold text-blue-800">Original workbook / technical details</summary><SourceGrid source={source} /></details>}
  </div>;
}