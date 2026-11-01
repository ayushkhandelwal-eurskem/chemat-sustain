"use client";

import { useMemo } from "react";
import type { ComponentType } from "react";
import { groupFlowRecords, groupMeasurements, groupStatistics, scientificContext } from "@/lib/scientificRecognition";
import type { Category, Measurement, Scalar, SourceTable } from "@/lib/scientificRecognition";
import { resolveScientificImages } from "@/lib/images/testImageConfig";
import type { TestType } from "@/lib/images/testImageConfig";
import UniversalImagesTab from "./UniversalImagesTab";

interface Props {
  category: Category;
  values?: Measurement[];
  records?: Record<string, Scalar>[];
  source?: SourceTable;
  conditions?: SourceTable;
  finalValues?: Measurement[];
  SourceGrid: ComponentType<{ source?: SourceTable }>;
  downloadCsv: (name: string, rows: Scalar[][]) => void;
}

/** Reuses the current tables/expanders; recognition changes content only. */
export default function ScientificDataGroups({ category, values = [], records = [], source, conditions, finalValues = [], SourceGrid, downloadCsv }: Props) {
  const context = useMemo(() => scientificContext(conditions, finalValues), [conditions, finalValues]);
  const groups = useMemo(() => category === "statistics"
    ? groupStatistics(source, [...new Set(finalValues.map(v => v.endpoint))])
    : records.length ? groupFlowRecords(records, source ?? { sheet_name: "Unknown source", rows: [], merged_ranges: [] }, context)
      : groupMeasurements(values, category, context), [category, values, records, source, context, finalValues]);
  return <>
    {context.normalization.length > 0 && category !== "statistics" && <p className="text-sm text-gray-600">Reference-gene mapping (reported): {context.normalization.map(n => `${n.target} → ${n.reference}`).join("; ")}. Values are not recalculated.</p>}
    {groups.map(group => <details key={group.id} className="space-y-3" open>
      <summary className="mb-4 cursor-pointer text-xl font-bold text-blue-800">{group.title}</summary>
      {group.source ? <SourceGrid source={group.source} /> : <>
        <button className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm" onClick={() => downloadCsv(group.title, [group.columns, ...group.rows])}>Download CSV</button>
        <table className="w-full table-fixed bg-white border border-gray-200 [&_th]:break-words [&_td]:break-words">
          <thead className="bg-gray-100"><tr>{group.columns.map(c => <th key={c} className="py-2 px-4 border">{c}</th>)}</tr></thead>
          <tbody>{group.rows.map((row, index) => <tr className="odd:bg-gray-50" key={index}>{row.map((value, i) => <td className="py-2 px-4 border" key={i}>{value == null ? "—" : String(value)}</td>)}</tr>)}</tbody>
        </table>
      </>}
    </details>)}
    {!groups.length && <p className="p-4 text-gray-500">No structured measurements recognized. All original values remain in the source below.</p>}
    {category !== "statistics" && source && <details className="space-y-3">
      <summary className="mb-4 cursor-pointer text-xl font-bold text-blue-800">Supporting metadata, calculations and unclassified source values</summary>
      <SourceGrid source={source} />
    </details>}
  </>;
}

export function ScientificImages({ workPackage, element, test, category, sources }: {
  workPackage: string; element: string; test: string; category: Category; sources: SourceTable[];
}) {
  const images = [...new Map(sources.flatMap(source => resolveScientificImages(workPackage, element, test, category, source)).map(image => [image.id, image])).values()];
  if (!images.length) return null;
  return <UniversalImagesTab workPackage={workPackage} element={element} testType={test as TestType} apiImages={images} />;
}