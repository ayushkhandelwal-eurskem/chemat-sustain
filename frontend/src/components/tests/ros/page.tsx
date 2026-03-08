"use client";
import React, { FC, useEffect, useState, useMemo, useCallback } from "react";
import { api } from "@/lib/axios";
import {
  Download,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/* ================================================================
   Types — mapped directly from ROS parser dataclasses
   ================================================================ */

interface PageProps {
  work_package: string;
  element: string;
  test: string;
  file?: string;
}

// --- Test Details ---
interface Scientist {
  name: string | null;
  email: string | null;
}

interface WorkPackageData {
  wp_name: string | null;
  partner: string | null;
  laboratory_name: string | null;
  full_test_name: string | null;
  test_acronym: string | null;
  test_type: string | null;
  endpoint: string | null;
  endpoint_outcome: string | null;
  sop: string | null;
  path: string | null;
  lead_scientists: Scientist[];
  assay_scientists: Scientist[];
}

interface MaterialData {
  material_identifier: string | null;
  erm_id: string | null;
  material_name: string | null;
  core_chemistry: string | null;
  cas_no: string | null;
  cas_for_core: string | null;
  material_supplier: string | null;
  material_state: string | null;
  batch: string | null;
  vial: string | null;
  preparation_date: string | null;
  size: string | null;
  endotoxin_absent: string | null;
  stock_concentration: string | null;
  molecular_weight: string | null;
  particles_stock: string | null;
}

interface CellLineData {
  cell_type_specification: string | null;
  cell_line_short_name: string | null;
  supplier: string | null;
  passage_numbers: Record<string, number | string | null>;
  plate_details: string | null;
  cells_per_well: number | string | null;
  volume_per_well: string | null;
  medium: string | null;
  serum: string | null;
  serum_concentration_culture: number | string | null;
  serum_concentration_treatment: string | null;
  serum_heat_inactivated: string | null;
  antibiotics: string | null;
  complete_growth_medium: string | null;
  culture_conditions: string | null;
  solvent_for_dcfda: string | null;
  incubation_time_dcfda: string | null;
  volume_of_solvent: string | null;
}

interface DispersionData {
  dispersion_protocol: string | null;
  dispersion_technique: string | null;
  dispersion_agent: string | null;
  dispersion_agent_concentration: string | null;
  additives: string | null;
  dispersed_in_culture_medium: string | null;
  aids_used_to_disperse: string | null;
  sonication_bath: string | null;
  sonication_tip: string | null;
  time_duration: string | null;
  energy: string | null;
}

interface TreatmentTimeline {
  time_point_unit: string | null;
  time_point_labels: string[];
  time_points: (number | string)[];
}

interface TreatmentConcentration {
  unit: string | null;
  labels: string[];
  concentrations_ugml: (number | string)[];
  concentrations_particles: (number | string)[];
  plate_series: string[];
  positive_control_abbr: string | null;
  positive_control_desc: string | null;
  negative_control_abbr: string | null;
  negative_control_desc: string | null;
  number_of_experiments: number | null;
}

interface TreatmentData {
  timeline: TreatmentTimeline;
  concentration: TreatmentConcentration;
}

interface ReplicationMeta {
  test_identifier_number: string | null;
  test_start_date: string | null;
  test_end_date: string | null;
  replicate_label: string | null;
}

interface ParserWarning {
  type?: string;
  row?: number;
  found?: string;
  expected?: string;
  note?: string;
  value?: string;
}

// --- Raw Data ---
interface ROSRawExperiment {
  experiment_label: string | null;
  cytometric_events: number | null;
  concentrations: string[];
  values: (number | null)[];
}

interface ROSRawDataBlock {
  metric_name: string | null;
  concentrations: string[];
  experiments: ROSRawExperiment[];
}

// --- Processed Data ---
interface ROSAnalysisExperiment {
  label: string;
  values: Record<string, number | null>;
}

interface ROSDataAnalysisBlock {
  metric_name: string | null;
  filter_label: string | null;
  concentrations: (number | string)[];
  concentration_unit: string | null;
  experiments: ROSAnalysisExperiment[];
  mean: (number | null)[];
  sd: (number | null)[];
  cv: (number | null)[];
  cv_acceptance: string | null;
  cytometric_events_acceptance: string | null;
}

interface ROSExperiment5Data {
  concentrations: string[];
  values: (number | null)[];
  cytometric_events: (number | null)[];
}

// --- Final Results (Mean Data) ---
interface ROSMeanExperiment {
  label: string;
  values: Record<string, number | null>;
}

interface ROSMeanDataBlock {
  metric_name: string | null;
  concentration_unit: string | null;
  concentrations: (number | string)[];
  experiments: ROSMeanExperiment[];
  mean: (number | null)[];
  sd: (number | null)[];
}

// --- Statistical Analysis ---
interface ANOVASummaryRow {
  grupy: string | null;
  licznik: number | null;
  suma: number | null;
  srednia: number | null;
  wariancja: number | null;
}

interface ANOVATableRow {
  zrodlo_wariancji: string | null;
  ss: number | null;
  df: number | null;
  ms: number | null;
  f_value: number | null;
  p_value: number | null;
  f_critical: number | null;
}

interface ANOVAResult {
  metric_name: string | null;
  summary: ANOVASummaryRow[];
  anova_table: ANOVATableRow[];
  total_ss: number | null;
  total_df: number | null;
  p_value_significant: boolean | null;
  alpha: number | null;
}

interface PostHocComparison {
  groups: string | null;
  p_value: number | null;
  significant: string | null;
}

interface PostHocBlock {
  anova_alpha: number | null;
  bonferroni_alpha: number | null;
  significance_symbol: string | null;
  comparisons: PostHocComparison[];
}

interface PostHocResult {
  metric_name: string | null;
  blocks: PostHocBlock[];
}

// --- Full API Response ---
interface ROSData {
  test_details: {
    work_package: WorkPackageData;
    material: MaterialData;
    cell_line: CellLineData;
    dispersion: DispersionData;
    treatment: TreatmentData;
  };
  replications: ReplicationMeta[];
  raw_data: ROSRawDataBlock[];
  processed_data: {
    fluorescence_sum: ROSDataAnalysisBlock;
    percentage_high_ros: ROSDataAnalysisBlock;
    experiment_5_separate: ROSExperiment5Data;
  };
  final_results: ROSMeanDataBlock[];
  statistical_analysis: {
    fluorescence_sum_anova: ANOVAResult;
    fluorescence_sum_posthoc: PostHocResult;
    percentage_high_ros_anova: ANOVAResult;
    percentage_high_ros_posthoc: PostHocResult;
  };
  parser_warnings?: ParserWarning[];
}

/* ================================================================
   Tab Configuration
   ================================================================ */

type TabKey =
  | "test-conditions"
  | "raw-data"
  | "processed-data"
  | "results"
  | "statistics";

interface TabConfig {
  key: TabKey;
  label: string;
}

const TABS: TabConfig[] = [
  { key: "test-conditions", label: "Test Conditions" },
  { key: "raw-data", label: "Raw Data" },
  { key: "processed-data", label: "Data Analysis" },
  { key: "results", label: "Mean Data" },
  { key: "statistics", label: "Statistical Analysis" },
];

/* ================================================================
   Chart Colors
   ================================================================ */

const COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

/* ================================================================
   Helpers
   ================================================================ */

const fmt = (value: any, digits = 4) => {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value === "number") return value.toFixed(digits);
  return String(value);
};

const fmtShort = (value: any, digits = 2) => {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value === "number") return value.toFixed(digits);
  return String(value);
};

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

function downloadTableCSV(tableId: string, filename: string) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const rows = table.querySelectorAll("tr");
  let csv = "data:text/csv;charset=utf-8,";

  rows.forEach((row) => {
    const cells = row.querySelectorAll("th, td");
    csv +=
      Array.from(cells)
        .map((c) => csvEscape(c.textContent ?? ""))
        .join(",") + "\r\n";
  });

  const a = document.createElement("a");
  a.href = encodeURI(csv);
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ================================================================
   Helper Components
   ================================================================ */

const CollapsibleSection: FC<{
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition"
        onClick={() => setOpen((prev) => !prev)}
      >
        <h2 className="text-xl font-bold text-blue-800">{title}</h2>
        {open ? (
          <ChevronUp className="text-gray-400" size={20} />
        ) : (
          <ChevronDown className="text-gray-400" size={20} />
        )}
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
};

const AcceptanceBadge: FC<{ status: string | null }> = ({ status }) => {
  if (!status) return <span className="text-gray-400">N/A</span>;

  const normalized = status.toUpperCase();
  const passed = normalized === "PASSED" || normalized === "YES";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
        passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
      }`}
    >
      {passed ? <CheckCircle size={14} /> : <XCircle size={14} />}
      {status}
    </span>
  );
};

const KVTable: FC<{
  id: string;
  rows: { label: string; value: React.ReactNode }[];
  downloadFilename?: string;
}> = ({ id, rows, downloadFilename }) => {
  const onDownload = useCallback(() => {
    if (downloadFilename) downloadTableCSV(id, downloadFilename);
  }, [id, downloadFilename]);

  return (
    <>
      {downloadFilename && (
        <div className="flex justify-end mb-3">
          <button
            onClick={onDownload}
            className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"
          >
            <Download size={14} />
            <span>Download</span>
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table id={id} className="min-w-full bg-white border border-gray-200">
          <thead>
            <tr className="bg-gray-100">
              <th className="py-2 px-4 border text-left">Property</th>
              <th className="py-2 px-4 border text-left">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                <td className="py-2 px-4 border font-medium">{row.label}</td>
                <td className="py-2 px-4 border">{row.value ?? "N/A"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

const AnalysisTable: FC<{
  id: string;
  block: ROSDataAnalysisBlock;
  downloadFilename: string;
}> = ({ id, block, downloadFilename }) => {
  return (
    <>
      <div className="flex justify-end mb-3">
        <button
          onClick={() => downloadTableCSV(id, downloadFilename)}
          className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"
        >
          <Download size={14} />
          <span>Download</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table id={id} className="min-w-full bg-white border border-gray-200 text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="py-2 px-3 border text-left">Row</th>
              {block.concentrations.map((c, i) => (
                <th key={i} className="py-2 px-3 border text-center">
                  {String(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.experiments.map((exp, expIndex) => (
              <tr key={expIndex} className={expIndex % 2 === 0 ? "bg-gray-50" : ""}>
                <td className="py-2 px-3 border font-medium">{exp.label}</td>
                {block.concentrations.map((c, ci) => (
                  <td key={ci} className="py-2 px-3 border text-center">
                    {exp.values[String(c)] != null
                      ? Number(exp.values[String(c)]).toFixed(4)
                      : "-"}
                  </td>
                ))}
              </tr>
            ))}

            <tr className="bg-blue-50 font-semibold">
              <td className="py-2 px-3 border">Mean</td>
              {block.mean.map((m, i) => (
                <td key={i} className="py-2 px-3 border text-center">
                  {m != null ? Number(m).toFixed(4) : "-"}
                </td>
              ))}
            </tr>

            <tr className="bg-blue-50">
              <td className="py-2 px-3 border font-semibold">SD</td>
              {block.sd.map((s, i) => (
                <td key={i} className="py-2 px-3 border text-center">
                  {s != null ? Number(s).toFixed(4) : "-"}
                </td>
              ))}
            </tr>

            <tr className="bg-blue-50">
              <td className="py-2 px-3 border font-semibold">CV</td>
              {block.cv.map((c, i) => (
                <td key={i} className="py-2 px-3 border text-center">
                  {c != null ? Number(c).toFixed(4) : "-"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
};

const ANOVASection: FC<{
  anova: ANOVAResult;
  posthoc: PostHocResult | null;
  idPrefix: string;
}> = ({ anova, posthoc, idPrefix }) => {
  return (
    <>
      <CollapsibleSection title={`ANOVA: ${anova.metric_name ?? "Unknown Metric"}`}>
        <div className="mb-4 flex items-center gap-4 flex-wrap">
          <span className="text-sm">
            <span className="font-semibold">p-value Significant:</span>{" "}
            <AcceptanceBadge status={anova.p_value_significant ? "YES" : "NO"} />
          </span>
          <span className="text-sm">
            <span className="font-semibold">Alpha:</span> {anova.alpha ?? "N/A"}
          </span>
        </div>

        <h4 className="text-md font-semibold mb-2">Summary</h4>
        <div className="overflow-x-auto mb-6">
          <table
            id={`${idPrefix}AnovaSummary`}
            className="min-w-full bg-white border border-gray-200 text-sm"
          >
            <thead>
              <tr className="bg-gray-100">
                <th className="py-2 px-3 border text-left">Groups</th>
                <th className="py-2 px-3 border text-right">Count</th>
                <th className="py-2 px-3 border text-right">Sum</th>
                <th className="py-2 px-3 border text-right">Mean</th>
                <th className="py-2 px-3 border text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {anova.summary.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                  <td className="py-2 px-3 border">{row.grupy ?? "-"}</td>
                  <td className="py-2 px-3 border text-right">{row.licznik ?? "-"}</td>
                  <td className="py-2 px-3 border text-right">
                    {row.suma != null ? Number(row.suma).toFixed(4) : "-"}
                  </td>
                  <td className="py-2 px-3 border text-right">
                    {row.srednia != null ? Number(row.srednia).toFixed(4) : "-"}
                  </td>
                  <td className="py-2 px-3 border text-right">
                    {row.wariancja != null ? Number(row.wariancja).toFixed(4) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="text-md font-semibold mb-2">ANOVA Table</h4>
        <div className="overflow-x-auto mb-4">
          <table
            id={`${idPrefix}AnovaTable`}
            className="min-w-full bg-white border border-gray-200 text-sm"
          >
            <thead>
              <tr className="bg-gray-100">
                <th className="py-2 px-3 border text-left">Source</th>
                <th className="py-2 px-3 border text-right">SS</th>
                <th className="py-2 px-3 border text-right">df</th>
                <th className="py-2 px-3 border text-right">MS</th>
                <th className="py-2 px-3 border text-right">F</th>
                <th className="py-2 px-3 border text-right">p-value</th>
                <th className="py-2 px-3 border text-right">F critical</th>
              </tr>
            </thead>
            <tbody>
              {anova.anova_table.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                  <td className="py-2 px-3 border">{row.zrodlo_wariancji ?? "-"}</td>
                  <td className="py-2 px-3 border text-right">
                    {row.ss != null ? Number(row.ss).toFixed(4) : "-"}
                  </td>
                  <td className="py-2 px-3 border text-right">{row.df ?? "-"}</td>
                  <td className="py-2 px-3 border text-right">
                    {row.ms != null ? Number(row.ms).toFixed(4) : "-"}
                  </td>
                  <td className="py-2 px-3 border text-right">
                    {row.f_value != null ? Number(row.f_value).toFixed(4) : "-"}
                  </td>
                  <td className="py-2 px-3 border text-right">
                    {row.p_value != null ? Number(row.p_value).toExponential(4) : "-"}
                  </td>
                  <td className="py-2 px-3 border text-right">
                    {row.f_critical != null ? Number(row.f_critical).toFixed(4) : "-"}
                  </td>
                </tr>
              ))}

              <tr className="bg-blue-50 font-semibold">
                <td className="py-2 px-3 border">Total</td>
                <td className="py-2 px-3 border text-right">
                  {anova.total_ss != null ? Number(anova.total_ss).toFixed(4) : "-"}
                </td>
                <td className="py-2 px-3 border text-right">{anova.total_df ?? "-"}</td>
                <td colSpan={4} className="py-2 px-3 border" />
              </tr>
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      {posthoc && posthoc.blocks.length > 0 && (
        <CollapsibleSection
          title={`Post-Hoc: ${posthoc.metric_name ?? "Unknown Metric"}`}
          defaultOpen={false}
        >
          {posthoc.blocks.map((block, bi) => (
            <div key={bi} className="mb-6">
              <div className="flex items-center gap-4 mb-3 flex-wrap">
                <span className="text-sm">
                  <span className="font-semibold">ANOVA Alpha:</span>{" "}
                  {block.anova_alpha ?? "N/A"}
                </span>
                <span className="text-sm">
                  <span className="font-semibold">Bonferroni Alpha:</span>{" "}
                  {block.bonferroni_alpha ?? "N/A"}
                </span>
                <span className="text-sm">
                  <span className="font-semibold">Significance Symbol:</span>{" "}
                  {block.significance_symbol ?? "N/A"}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table
                  id={`${idPrefix}Posthoc${bi}`}
                  className="min-w-full bg-white border border-gray-200 text-sm"
                >
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-3 border text-left">Comparison</th>
                      <th className="py-2 px-3 border text-right">p-value</th>
                      <th className="py-2 px-3 border text-center">Significant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.comparisons.map((comp, ci) => (
                      <tr key={ci} className={ci % 2 === 0 ? "bg-gray-50" : ""}>
                        <td className="py-2 px-3 border">{comp.groups ?? "-"}</td>
                        <td className="py-2 px-3 border text-right">
                          {comp.p_value != null
                            ? Number(comp.p_value).toExponential(4)
                            : "-"}
                        </td>
                        <td className="py-2 px-3 border text-center">
                          {comp.significant ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                                comp.significant === "*"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {comp.significant}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}
    </>
  );
};

/* ================================================================
   Main Component
   ================================================================ */

const ROSDataViewer: FC<PageProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<ROSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("test-conditions");
  const [selectedRawBlock, setSelectedRawBlock] = useState(0);
  const [selectedMeanBlock, setSelectedMeanBlock] = useState(0);

  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      try {
        setLoading(true);
        const response = await api.post(
          `/tests/listings`,
          {
            work_package_name: work_package,
            element_cms_id: element,
            test_name: test,
          },
          { signal: ac.signal }
        );

        if (response.status !== 200) {
          throw new Error("Network response was not ok");
        }

        setData(response.data);
      } catch (err: any) {
        if (err.name !== "CanceledError" && err.name !== "AbortError") {
          console.error("Error fetching ROS data:", err);
          setError("Failed to load ROS data. Please try again later.");
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [work_package, element, test]);

  const safeRawBlocks: ROSRawDataBlock[] = useMemo(() => {
    return Array.isArray(data?.raw_data) ? data!.raw_data : [];
  }, [data?.raw_data]);

  const safeMeanBlocks: ROSMeanDataBlock[] = useMemo(() => {
    return Array.isArray(data?.final_results) ? data!.final_results : [];
  }, [data?.final_results]);

  const rawChartData = useMemo(() => {
    const block = safeRawBlocks[selectedRawBlock];
    if (!block) return [];

    return block.concentrations.map((conc, ci) => {
      const point: Record<string, any> = { concentration: String(conc) };
      block.experiments.forEach((exp, expIndex) => {
        point[exp.experiment_label ?? `Experiment ${expIndex + 1}`] = exp.values[ci];
      });
      return point;
    });
  }, [safeRawBlocks, selectedRawBlock]);

  const makeAnalysisChartData = useCallback((block?: ROSDataAnalysisBlock) => {
    if (!block) return [];

    return block.concentrations.map((conc, ci) => {
      const point: Record<string, any> = { concentration: String(conc) };
      block.experiments.forEach((exp) => {
        point[exp.label] = exp.values[String(conc)];
      });
      point["Mean"] = block.mean[ci];
      point["SD"] = block.sd[ci];
      return point;
    });
  }, []);

  const fluorescenceChartData = useMemo(
    () => makeAnalysisChartData(data?.processed_data?.fluorescence_sum),
    [data?.processed_data?.fluorescence_sum, makeAnalysisChartData]
  );

  const highROSChartData = useMemo(
    () => makeAnalysisChartData(data?.processed_data?.percentage_high_ros),
    [data?.processed_data?.percentage_high_ros, makeAnalysisChartData]
  );

  const meanChartData = useMemo(() => {
    const block = safeMeanBlocks[selectedMeanBlock];
    if (!block) return [];

    return block.concentrations.map((conc, ci) => {
      const point: Record<string, any> = { concentration: String(conc) };
      block.experiments.forEach((exp) => {
        point[exp.label] = exp.values[String(conc)];
      });
      point["Mean"] = block.mean[ci];
      return point;
    });
  }, [safeMeanBlocks, selectedMeanBlock]);

  if (loading) {
    return (
      <div className="bg-white flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>{error || "No data available."}</p>
        </div>
      </div>
    );
  }

  const td = data.test_details;
  const wp = td.work_package;
  const mat = td.material;
  const cl = td.cell_line;
  const disp = td.dispersion;
  const treat = td.treatment;
  const repMeta = data.replications ?? [];
  const warnings = data.parser_warnings ?? [];

  return (
    <div className="bg-gray-50 min-h-screen py-8 text-black">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-4">ROS Test Data Report</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Parameters</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2">
                  <span className="font-semibold">Work Package:</span>{" "}
                  {wp.wp_name || work_package || "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">CMS Internal Identifier:</span>{" "}
                  {element || "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">ERM Identifier:</span>{" "}
                  {mat.erm_id ?? "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Partner:</span>{" "}
                  {wp.partner ?? "N/A"}
                </p>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-3">Test Information</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2">
                  <span className="font-semibold">Full Test Name:</span>{" "}
                  {wp.full_test_name ?? "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Test Acronym:</span>{" "}
                  {wp.test_acronym ?? "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Test Type:</span>{" "}
                  {wp.test_type ?? "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Endpoint:</span>{" "}
                  {wp.endpoint ?? "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Endpoint Outcome:</span>{" "}
                  {wp.endpoint_outcome ?? "N/A"}
                </p>
                <p>
                  <span className="font-semibold">SOP:</span> {wp.sop ?? "N/A"}
                </p>
              </div>
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="mt-4 bg-yellow-50 border border-yellow-300 rounded-md p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-yellow-600" />
                <span className="font-semibold text-yellow-800 text-sm">
                  Parser Warnings ({warnings.length})
                </span>
              </div>
              <ul className="text-sm text-yellow-700 space-y-1">
                {warnings.map((w, i) => (
                  <li key={i}>
                    {w.row != null ? `Row ${w.row}: ` : ""}
                    {w.note || w.type || "Warning"}
                    {w.found ? (
                      <span>
                        {" "}
                        (found: "{w.found}"
                        {w.expected ? `, expected: "${w.expected}"` : ""})
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="w-full mb-8">
          <ul
            className="relative flex flex-wrap p-1.5 list-none rounded-md bg-slate-100"
            role="tablist"
          >
            {TABS.map((tab) => (
              <li key={tab.key} className="z-30 flex-auto text-center" role="presentation">
                <button
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  className={`z-30 w-full px-0 py-2 text-sm mb-0 transition-all rounded-md ${
                    activeTab === tab.key
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Test Conditions */}
        {activeTab === "test-conditions" && (
          <>
            <CollapsibleSection title="Material Information">
              <KVTable
                id="materialTable"
                downloadFilename="ROS_Material_Info"
                rows={[
                  { label: "CMS Internal Identifier", value: mat.material_identifier ?? element },
                  { label: "ERM Identifier", value: mat.erm_id },
                  { label: "Material Name", value: mat.material_name },
                  { label: "Core Chemistry", value: mat.core_chemistry },
                  { label: "CAS No", value: mat.cas_no },
                  { label: "CAS for Core", value: mat.cas_for_core },
                  { label: "Material Supplier", value: mat.material_supplier },
                  { label: "Material State", value: mat.material_state },
                  { label: "Batch", value: mat.batch },
                  { label: "Vial", value: mat.vial },
                  { label: "Preparation Date", value: mat.preparation_date },
                  { label: "Size", value: mat.size },
                  { label: "Endotoxin Absent", value: mat.endotoxin_absent },
                  { label: "Stock Concentration", value: mat.stock_concentration },
                  { label: "Molecular Weight", value: mat.molecular_weight },
                  { label: "No. of Particles in Stock", value: mat.particles_stock },
                ]}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Cell Line Information">
              <KVTable
                id="cellLineTable"
                downloadFilename="ROS_Cell_Line"
                rows={[
                  { label: "Cell Type Specification", value: cl.cell_type_specification },
                  { label: "Cell Line Short Name", value: cl.cell_line_short_name },
                  { label: "Supplier", value: cl.supplier },
                  { label: "Plate Details", value: cl.plate_details },
                  { label: "Cells per Well", value: cl.cells_per_well },
                  { label: "Volume per Well", value: cl.volume_per_well },
                  { label: "Medium", value: cl.medium },
                  { label: "Serum", value: cl.serum },
                  { label: "Serum Concentration (Culture)", value: cl.serum_concentration_culture },
                  { label: "Serum Concentration (Treatment)", value: cl.serum_concentration_treatment },
                  { label: "Serum Heat Inactivated", value: cl.serum_heat_inactivated },
                  { label: "Antibiotics", value: cl.antibiotics },
                  { label: "Complete Growth Medium", value: cl.complete_growth_medium },
                  { label: "Culture Conditions", value: cl.culture_conditions },
                  { label: "Solvent for DCFDA", value: cl.solvent_for_dcfda },
                  { label: "Incubation Time DCFDA", value: cl.incubation_time_dcfda },
                  { label: "Volume of Solvent", value: cl.volume_of_solvent },
                ]}
              />

              {cl.passage_numbers && Object.keys(cl.passage_numbers).length > 0 && (
                <div className="mt-4">
                  <h4 className="text-md font-semibold mb-2">Passage Numbers</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200">
                      <thead>
                        <tr className="bg-gray-100">
                          {Object.keys(cl.passage_numbers).map((k) => (
                            <th key={k} className="py-2 px-4 border text-left text-sm">
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {Object.values(cl.passage_numbers).map((v, i) => (
                            <td key={i} className="py-2 px-4 border text-sm">
                              {v ?? "N/A"}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Dispersion Data">
              <KVTable
                id="dispersionTable"
                downloadFilename="ROS_Dispersion"
                rows={[
                  { label: "Dispersion Protocol", value: disp.dispersion_protocol },
                  { label: "Dispersion Technique", value: disp.dispersion_technique },
                  { label: "Dispersion Agent", value: disp.dispersion_agent },
                  { label: "Dispersion Agent Concentration", value: disp.dispersion_agent_concentration },
                  { label: "Additives", value: disp.additives },
                  { label: "Dispersed in Culture Medium", value: disp.dispersed_in_culture_medium },
                  { label: "Aids Used to Disperse", value: disp.aids_used_to_disperse },
                  { label: "Sonication Bath", value: disp.sonication_bath },
                  { label: "Sonication Tip", value: disp.sonication_tip },
                  { label: "Time/Duration", value: disp.time_duration },
                  { label: "Energy", value: disp.energy },
                ]}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Treatment Data">
              <h3 className="text-lg font-semibold mb-3">Timeline</h3>
              <div className="overflow-x-auto mb-6">
                <table id="treatmentTimelineTable" className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Time Point Unit</th>
                      {treat.timeline.time_point_labels.map((lbl, i) => (
                        <th key={i} className="py-2 px-4 border text-left">
                          {lbl}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        {treat.timeline.time_point_unit ?? "N/A"}
                      </td>
                      {treat.timeline.time_points.map((tp, i) => (
                        <td key={i} className="py-2 px-4 border">
                          {tp ?? "N/A"}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-lg font-semibold mb-3">Concentrations</h3>
              <div className="overflow-x-auto mb-4">
                <table id="treatmentConcTable" className="min-w-full bg-white border border-gray-200 text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-3 border text-left">Property</th>
                      {treat.concentration.labels.map((lbl, i) => (
                        <th key={i} className="py-2 px-3 border text-center">
                          {lbl}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2 px-3 border font-medium">
                        Concentration ({treat.concentration.unit ?? "µg/mL"})
                      </td>
                      {treat.concentration.concentrations_ugml.map((c, i) => (
                        <td key={i} className="py-2 px-3 border text-center">
                          {c ?? "N/A"}
                        </td>
                      ))}
                    </tr>

                    {treat.concentration.concentrations_particles.length > 0 && (
                      <tr className="bg-gray-50">
                        <td className="py-2 px-3 border font-medium">
                          Concentration (particles)
                        </td>
                        {treat.concentration.concentrations_particles.map((c, i) => (
                          <td key={i} className="py-2 px-3 border text-center">
                            {c ?? "N/A"}
                          </td>
                        ))}
                      </tr>
                    )}

                    {treat.concentration.plate_series.length > 0 && (
                      <tr>
                        <td className="py-2 px-3 border font-medium">Plate Series</td>
                        {treat.concentration.plate_series.map((ps, i) => (
                          <td key={i} className="py-2 px-3 border text-center">
                            {ps ?? "N/A"}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-green-50 p-3 rounded-md">
                  <p className="font-semibold text-green-800 text-sm mb-1">Positive Control</p>
                  <p className="text-sm">
                    {treat.concentration.positive_control_abbr ?? "N/A"} —{" "}
                    {treat.concentration.positive_control_desc ?? "N/A"}
                  </p>
                </div>
                <div className="bg-red-50 p-3 rounded-md">
                  <p className="font-semibold text-red-800 text-sm mb-1">Negative Control</p>
                  <p className="text-sm">
                    {treat.concentration.negative_control_abbr ?? "N/A"} —{" "}
                    {treat.concentration.negative_control_desc ?? "N/A"}
                  </p>
                </div>
              </div>

              <p className="text-sm text-gray-600">
                Number of Experiments: {treat.concentration.number_of_experiments ?? "N/A"}
              </p>
            </CollapsibleSection>

            <CollapsibleSection title="Replication Metadata">
              <div className="flex justify-end mb-3">
                <button
                  onClick={() => downloadTableCSV("replicationMetaTable", "ROS_Replications")}
                  className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"
                >
                  <Download size={14} />
                  <span>Download</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table id="replicationMetaTable" className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Test Identifier</th>
                      <th className="py-2 px-4 border text-left">Start Date</th>
                      <th className="py-2 px-4 border text-left">End Date</th>
                      <th className="py-2 px-4 border text-left">Replicate Label</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repMeta.length ? (
                      repMeta.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                          <td className="py-2 px-4 border">{r.test_identifier_number ?? "N/A"}</td>
                          <td className="py-2 px-4 border">{r.test_start_date ?? "N/A"}</td>
                          <td className="py-2 px-4 border">{r.test_end_date ?? "N/A"}</td>
                          <td className="py-2 px-4 border">{r.replicate_label ?? "N/A"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-2 px-4 border text-center">
                          No replication metadata available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Scientists Information">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Lead Scientists</h3>
                  <table id="scientistsTable" className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Name</th>
                        <th className="py-2 px-4 border text-left">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wp.lead_scientists?.length ? (
                        wp.lead_scientists.map((s, i) => (
                          <tr key={i}>
                            <td className="py-2 px-4 border">{s.name ?? "N/A"}</td>
                            <td className="py-2 px-4 border">{s.email ?? "N/A"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={2} className="py-2 px-4 border text-center">
                            No lead scientists available
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3">Assay Scientists</h3>
                  <table className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Name</th>
                        <th className="py-2 px-4 border text-left">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wp.assay_scientists?.length ? (
                        wp.assay_scientists.map((s, i) => (
                          <tr key={i}>
                            <td className="py-2 px-4 border">{s.name ?? "N/A"}</td>
                            <td className="py-2 px-4 border">{s.email ?? "N/A"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={2} className="py-2 px-4 border text-center">
                            No assay scientists available
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CollapsibleSection>
          </>
        )}

        {/* Raw Data */}
        {activeTab === "raw-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">Raw Data</h2>
              <button
                onClick={() =>
                  downloadTableCSV("rawDataTable", `ROS_Raw_Block_${selectedRawBlock + 1}`)
                }
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            {safeRawBlocks.length > 0 ? (
              <>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Metric Block:
                  </label>
                  <select
                    value={selectedRawBlock}
                    onChange={(e) => setSelectedRawBlock(Number(e.target.value))}
                    className="w-full md:w-2/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
                  >
                    {safeRawBlocks.map((block, index) => (
                      <option key={index} value={index}>
                        {block.metric_name || `Block ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                {rawChartData.length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold mb-3">
                      {safeRawBlocks[selectedRawBlock].metric_name}
                    </h3>
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart
                        data={rawChartData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="concentration" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {safeRawBlocks[selectedRawBlock].experiments.map((exp, i) => (
                          <Bar
                            key={exp.experiment_label ?? i}
                            dataKey={exp.experiment_label ?? `Experiment ${i + 1}`}
                            fill={COLORS[i % COLORS.length]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table id="rawDataTable" className="min-w-full bg-white border border-gray-200 text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-3 border text-left">Experiment</th>
                        <th className="py-2 px-3 border text-left">Events</th>
                        {safeRawBlocks[selectedRawBlock].concentrations.map((c, i) => (
                          <th key={i} className="py-2 px-3 border text-center">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {safeRawBlocks[selectedRawBlock].experiments.map((exp, ei) => (
                        <tr key={ei} className={ei % 2 === 0 ? "bg-gray-50" : ""}>
                          <td className="py-2 px-3 border font-medium">
                            {exp.experiment_label ?? "N/A"}
                          </td>
                          <td className="py-2 px-3 border">{exp.cytometric_events ?? "N/A"}</td>
                          {exp.values.map((v, vi) => (
                            <td key={vi} className="py-2 px-3 border text-center">
                              {v != null ? Number(v).toFixed(4) : "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-center text-gray-500">No raw data available.</p>
            )}
          </div>
        )}

        {/* Processed Data */}
        {activeTab === "processed-data" && (
          <>
            {data.processed_data?.fluorescence_sum && (
              <CollapsibleSection
                title={
                  data.processed_data.fluorescence_sum.metric_name ??
                  "Sum of Percent of Fluorescence"
                }
              >
                <div className="mb-4 flex items-center gap-4 flex-wrap">
                  <span className="text-sm">
                    <span className="font-semibold">Filter:</span>{" "}
                    {data.processed_data.fluorescence_sum.filter_label ?? "N/A"}
                  </span>
                  <span className="text-sm">
                    <span className="font-semibold">CV Acceptance:</span>{" "}
                    <AcceptanceBadge status={data.processed_data.fluorescence_sum.cv_acceptance} />
                  </span>
                  <span className="text-sm">
                    <span className="font-semibold">Cytometric Events:</span>{" "}
                    <AcceptanceBadge
                      status={data.processed_data.fluorescence_sum.cytometric_events_acceptance}
                    />
                  </span>
                </div>

                {fluorescenceChartData.length > 0 && (
                  <div className="mb-6">
                    <ResponsiveContainer width="100%" height={350}>
                      <LineChart
                        data={fluorescenceChartData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="concentration" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {data.processed_data.fluorescence_sum.experiments.map((exp, i) => (
                          <Line
                            key={exp.label}
                            type="monotone"
                            dataKey={exp.label}
                            stroke={COLORS[i % COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        ))}
                        <Line
                          type="monotone"
                          dataKey="Mean"
                          stroke="#000"
                          strokeWidth={3}
                          strokeDasharray="5 5"
                          dot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <AnalysisTable
                  id="fluorescenceSumTable"
                  block={data.processed_data.fluorescence_sum}
                  downloadFilename="ROS_Fluorescence_Sum"
                />
              </CollapsibleSection>
            )}

            {data.processed_data?.percentage_high_ros && (
              <CollapsibleSection
                title={
                  data.processed_data.percentage_high_ros.metric_name ??
                  "Percentage of Cells with High ROS"
                }
              >
                <div className="mb-4 flex items-center gap-4 flex-wrap">
                  <span className="text-sm">
                    <span className="font-semibold">Filter:</span>{" "}
                    {data.processed_data.percentage_high_ros.filter_label ?? "N/A"}
                  </span>
                  <span className="text-sm">
                    <span className="font-semibold">CV Acceptance:</span>{" "}
                    <AcceptanceBadge status={data.processed_data.percentage_high_ros.cv_acceptance} />
                  </span>
                  <span className="text-sm">
                    <span className="font-semibold">Cytometric Events:</span>{" "}
                    <AcceptanceBadge
                      status={data.processed_data.percentage_high_ros.cytometric_events_acceptance}
                    />
                  </span>
                </div>

                {highROSChartData.length > 0 && (
                  <div className="mb-6">
                    <ResponsiveContainer width="100%" height={350}>
                      <LineChart
                        data={highROSChartData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="concentration" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {data.processed_data.percentage_high_ros.experiments.map((exp, i) => (
                          <Line
                            key={exp.label}
                            type="monotone"
                            dataKey={exp.label}
                            stroke={COLORS[i % COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        ))}
                        <Line
                          type="monotone"
                          dataKey="Mean"
                          stroke="#000"
                          strokeWidth={3}
                          strokeDasharray="5 5"
                          dot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <AnalysisTable
                  id="highROSTable"
                  block={data.processed_data.percentage_high_ros}
                  downloadFilename="ROS_High_ROS_Percentage"
                />
              </CollapsibleSection>
            )}

            {data.processed_data?.experiment_5_separate &&
              data.processed_data.experiment_5_separate.concentrations.length > 0 && (
                <CollapsibleSection title="Experiment 5 (Separate)" defaultOpen={false}>
                  <div className="flex justify-end mb-3">
                    <button
                      onClick={() => downloadTableCSV("experiment5Table", "ROS_Experiment_5")}
                      className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"
                    >
                      <Download size={14} />
                      <span>Download</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table id="experiment5Table" className="min-w-full bg-white border border-gray-200 text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="py-2 px-3 border text-left">Concentration</th>
                          <th className="py-2 px-3 border text-left">Value</th>
                          <th className="py-2 px-3 border text-left">Cytometric Events</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.processed_data.experiment_5_separate.concentrations.map((c, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                            <td className="py-2 px-3 border">{c}</td>
                            <td className="py-2 px-3 border">
                              {data.processed_data.experiment_5_separate.values[i] != null
                                ? Number(data.processed_data.experiment_5_separate.values[i]).toFixed(4)
                                : "-"}
                            </td>
                            <td className="py-2 px-3 border">
                              {data.processed_data.experiment_5_separate.cytometric_events[i] ?? "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CollapsibleSection>
              )}
          </>
        )}

        {/* Mean Data */}
        {activeTab === "results" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">Mean Data</h2>
              <button
                onClick={() =>
                  downloadTableCSV("meanDataTable", `ROS_Mean_Block_${selectedMeanBlock + 1}`)
                }
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            {safeMeanBlocks.length > 0 ? (
              <>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Metric:
                  </label>
                  <select
                    value={selectedMeanBlock}
                    onChange={(e) => setSelectedMeanBlock(Number(e.target.value))}
                    className="w-full md:w-2/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
                  >
                    {safeMeanBlocks.map((block, index) => (
                      <option key={index} value={index}>
                        {block.metric_name || `Block ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                {(() => {
                  const block = safeMeanBlocks[selectedMeanBlock];
                  if (!block) return null;

                  return (
                    <>
                      <p className="text-sm text-gray-600 mb-4">
                        <span className="font-semibold">Concentration Unit:</span>{" "}
                        {block.concentration_unit ?? "N/A"}
                      </p>

                      {meanChartData.length > 0 && (
                        <div className="mb-6">
                          <ResponsiveContainer width="100%" height={380}>
                            <LineChart
                              data={meanChartData}
                              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="concentration" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              {block.experiments.map((exp, i) => (
                                <Line
                                  key={exp.label}
                                  type="monotone"
                                  dataKey={exp.label}
                                  stroke={COLORS[i % COLORS.length]}
                                  strokeWidth={2}
                                  dot={{ r: 3 }}
                                />
                              ))}
                              <Line
                                type="monotone"
                                dataKey="Mean"
                                stroke="#000"
                                strokeWidth={3}
                                strokeDasharray="5 5"
                                dot={{ r: 4 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      <div className="overflow-x-auto">
                        <table id="meanDataTable" className="min-w-full bg-white border border-gray-200 text-sm">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="py-2 px-3 border text-left">Row</th>
                              {block.concentrations.map((c, i) => (
                                <th key={i} className="py-2 px-3 border text-center">
                                  {String(c)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {block.experiments.map((exp, ei) => (
                              <tr key={ei} className={ei % 2 === 0 ? "bg-gray-50" : ""}>
                                <td className="py-2 px-3 border font-medium">{exp.label}</td>
                                {block.concentrations.map((c, ci) => (
                                  <td key={ci} className="py-2 px-3 border text-center">
                                    {exp.values[String(c)] != null
                                      ? Number(exp.values[String(c)]).toFixed(4)
                                      : "-"}
                                  </td>
                                ))}
                              </tr>
                            ))}

                            <tr className="bg-blue-50 font-semibold">
                              <td className="py-2 px-3 border">Mean</td>
                              {block.mean.map((m, i) => (
                                <td key={i} className="py-2 px-3 border text-center">
                                  {m != null ? Number(m).toFixed(4) : "-"}
                                </td>
                              ))}
                            </tr>

                            <tr className="bg-blue-50">
                              <td className="py-2 px-3 border font-semibold">SD</td>
                              {block.sd.map((s, i) => (
                                <td key={i} className="py-2 px-3 border text-center">
                                  {s != null ? Number(s).toFixed(4) : "-"}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </>
            ) : (
              <p className="text-center text-gray-500">No mean data available.</p>
            )}
          </div>
        )}

        {/* Statistical Analysis */}
        {activeTab === "statistics" && data.statistical_analysis && (
          <>
            {data.statistical_analysis.fluorescence_sum_anova && (
              <ANOVASection
                anova={data.statistical_analysis.fluorescence_sum_anova}
                posthoc={data.statistical_analysis.fluorescence_sum_posthoc}
                idPrefix="fluor"
              />
            )}

            {data.statistical_analysis.percentage_high_ros_anova && (
              <ANOVASection
                anova={data.statistical_analysis.percentage_high_ros_anova}
                posthoc={data.statistical_analysis.percentage_high_ros_posthoc}
                idPrefix="highros"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ROSDataViewer;