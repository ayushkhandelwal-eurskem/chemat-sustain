"use client";
import { useState } from "react";
import { annexinAcceptance, annexinFinalTables, annexinSampleTables, annexinStatisticsTables } from "@/lib/annexinWorkbook";
import type { WorkbookTable } from "@/lib/annexinWorkbook";
import type { Measurement, Scalar, SourceTable } from "@/lib/scientificRecognition";
import type { ComponentType } from "react";
import TestImageGallery from "@/components/tests/shared/TestImageGallery";

type Download = (name:string, rows:Scalar[][])=>void;
function WorkbookTableView({table,downloadCsv}: {table:WorkbookTable;downloadCsv:Download}) {
  if (!table.rows.length) return null;
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold text-blue-800">{table.title}</h3><button className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm" onClick={()=>downloadCsv(table.title,[table.columns,...table.rows])}>Download CSV</button></div>
    <table className="w-full table-fixed bg-white border border-gray-200 [&_th]:break-words [&_td]:break-words"><thead className="bg-gray-100"><tr>{table.columns.map((c,i)=><th key={i} className="py-2 px-4 border">{c}</th>)}</tr></thead><tbody>{table.rows.map((row,i)=><tr key={i} className="odd:bg-gray-50">{row.map((value,j)=><td key={j} className="py-2 px-4 border">{value==null?"—":String(value)}</td>)}</tr>)}</tbody></table>
  </section>;
}
function Source({source,SourceGrid}:{source?:SourceTable;SourceGrid:ComponentType<{source?:SourceTable}>}) {
  return source ? <details className="space-y-3"><summary className="mb-4 cursor-pointer text-xl font-bold text-blue-800">Original workbook / technical details</summary><SourceGrid source={source}/></details>:null;
}

export function AnnexinReplicates({blocks, SourceGrid,downloadCsv}:{blocks:{replication:string;records?:Record<string,Scalar>[];source:SourceTable}[];SourceGrid:ComponentType<{source?:SourceTable}>;downloadCsv:Download}) {
  const [selected,setSelected]=useState("");
  const block=blocks.find(b=>b.replication===selected)??blocks[0];
  if (!block) return <p className="p-4 text-gray-500">No replicate data available.</p>;
  return <div className="space-y-6"><label className="flex flex-wrap items-center gap-3 font-medium">Replication<select className="max-w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5" value={block.replication} onChange={e=>setSelected(e.target.value)}>{blocks.map(b=><option key={b.replication}>{b.replication}</option>)}</select></label>
    {annexinSampleTables(block.records??[]).map(t=><WorkbookTableView key={t.title} table={t} downloadCsv={downloadCsv}/>)}
    <Source source={block.source} SourceGrid={SourceGrid}/>
  </div>;
}

export function AnnexinFinal({values,source,SourceGrid,downloadCsv,workPackage,element,test}:{values:Measurement[];source?:SourceTable;SourceGrid:ComponentType<{source?:SourceTable}>;downloadCsv:Download;workPackage:string;element:string;test:string}) {
  const tables=annexinFinalTables(values), acceptance=annexinAcceptance(source);
  return <div className="space-y-6"><p className="text-sm text-gray-600">% of cell population — workbook-reported values.</p>
    {tables.map(t=><section key={t.title} className="space-y-6"><WorkbookTableView table={t} downloadCsv={downloadCsv}/>{!t.title.startsWith("Table Mean/SD")&&<TestImageGallery workPackage={workPackage} element={element} test={test} category="final" replication={t.title}/>}</section>)}
    {acceptance&&<WorkbookTableView table={acceptance} downloadCsv={downloadCsv}/>}
    <TestImageGallery workPackage={workPackage} element={element} test={test} category="final" unassignedOnly />
    {!tables.length&&<p className="text-gray-500">No final measurements available.</p>}
    <Source source={source} SourceGrid={SourceGrid}/>
  </div>;
}

export function AnnexinStatistics({source,endpoints,SourceGrid,downloadCsv}:{source?:SourceTable;endpoints:string[];SourceGrid:ComponentType<{source?:SourceTable}>;downloadCsv:Download}) {
  const tables=annexinStatisticsTables(source,endpoints);
  return <div className="space-y-6">{tables.map((table,i)=><WorkbookTableView key={i} table={table} downloadCsv={downloadCsv}/>)}<Source source={source} SourceGrid={SourceGrid}/></div>;
}