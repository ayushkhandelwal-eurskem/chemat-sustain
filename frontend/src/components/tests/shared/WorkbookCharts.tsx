"use client";
import { Bar, BarChart, CartesianGrid, ErrorBar, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface WorkbookChart {
  id: string; title: string; kind: "bar" | "line"; sheet: string;
  categories: string[];
  series: { name: string; values: (number | null)[]; errors: [number, number][] | null }[];
  x_title: string; y_title: string; y_min: number | null; y_max: number | null;
}
const COLORS = ["#2563eb", "#ea580c", "#16a34a", "#9333ea", "#0891b2", "#db2777"];

export default function WorkbookCharts({ charts }: { charts: WorkbookChart[] }) {
  if (!charts.length) return null;
  return <section className="space-y-6 min-w-0">
    <h3 className="text-xl font-bold text-blue-800">Workbook graphs</h3>
    <p className="text-sm text-gray-600">Native Excel graphs rendered from workbook-reported values. Error bars retain the workbook’s direction and values; styling may differ from Excel.</p>
    {charts.map(chart => {
      const data = chart.categories.map((category, index) => Object.fromEntries([
        ["category", category], ...chart.series.flatMap((series, i) => [[`series${i}`, series.values[index]], [`error${i}`, series.errors?.[index]]]),
      ]));
      const contents = [
        <CartesianGrid key="grid" strokeDasharray="3 3" />,
        <XAxis key="x" dataKey="category" interval={0} height={85} tick={{ fontSize: 11 }} label={chart.x_title ? { value: chart.x_title, position: "insideBottom", offset: 0 } : undefined} />,
        <YAxis key="y" domain={[chart.y_min ?? "auto", chart.y_max ?? "auto"]} label={chart.y_title ? { value: chart.y_title, angle: -90, position: "insideLeft" } : undefined} />,
        <Tooltip key="tooltip" />,
        <Legend key="legend" />,
        ...chart.series.map((series, i) => chart.kind === "bar" ?
          <Bar key={i} dataKey={`series${i}`} name={series.name} fill={COLORS[i % COLORS.length]} isAnimationActive={false}>
            {series.errors && <ErrorBar dataKey={`error${i}`} direction="y" width={4} stroke="#374151" />}
          </Bar> :
          <Line key={i} type="linear" dataKey={`series${i}`} name={series.name} stroke={COLORS[i % COLORS.length]} connectNulls={false} isAnimationActive={false}>
            {series.errors && <ErrorBar dataKey={`error${i}`} direction="y" width={4} stroke="#374151" />}
          </Line>),
      ];
      return <section key={chart.id} className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
        <h4 className="text-lg font-semibold text-blue-800">{chart.title}</h4>
        <div className="w-full min-w-0" role="img" aria-label={`${chart.title}: ${chart.series.map(series => series.name).join(", ")}`}>
          <ResponsiveContainer width="100%" height={430}>
            {chart.kind === "bar" ? <BarChart data={data} margin={{ top: 20, right: 20, bottom: 10, left: 25 }}>{contents}</BarChart> : <LineChart data={data} margin={{ top: 20, right: 20, bottom: 10, left: 25 }}>{contents}</LineChart>}
          </ResponsiveContainer>
        </div>
        <details><summary className="cursor-pointer text-sm text-blue-700">Graph values</summary>
          <div className="overflow-x-auto"><table className="w-full border border-gray-200 text-sm"><thead><tr><th className="border p-2">Treatment</th>{chart.series.map((series, i) => <th key={i} className="border p-2">{series.name}{series.errors ? " (lower / upper error)" : ""}</th>)}</tr></thead>
            <tbody>{chart.categories.map((category, index) => <tr key={index}><td className="border p-2">{category}</td>{chart.series.map((series, i) => <td key={i} className="border p-2">{series.values[index] ?? "—"}{series.errors ? ` (${series.errors[index][0]} / ${series.errors[index][1]})` : ""}</td>)}</tr>)}</tbody>
          </table></div>
        </details>
      </section>;
    })}
  </section>;
}