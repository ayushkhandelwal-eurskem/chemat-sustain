"use client";
import React, { FC, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/axios";
import { Download } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
} from "recharts";

/* ============================ Types ============================ */

interface PageProps {
  work_package: string;
  element: string;
  test: string;
  file?: string;
}

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
  endotoxin_absent: string | null;
  stock_concentration: string | null;
  molecular_weight: string | null;
  particles_stock: string | null;
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

interface CellLineData {
  cell_type_specification: string | null;
  cell_line_short_name: string | null;
  supplier: string | null;
  passage_numbers: Record<string, number | string | null> | null;
  plate_details: string | null;
  cells_per_chamber: number | string | null;
  volume_per_chamber: string | null;
  medium: string | null;
  serum: string | null;
  serum_concentration_culture: number | string | null;
  serum_concentration_treatment: number | string | null;
  serum_heat_inactivated: string | null;
  antibiotics: string | null;
  complete_growth_medium: string | null;
  culture_conditions: string | null;
  trypan_blue_solution: string | null;
  incubation_time_tb: string | null;
  volume: string | null;
}

interface TreatmentData {
  timeline: {
    time_point_unit: string | null;
    time_point_labels: string[];
    time_points: (number | string | null)[];
  };
  concentration: {
    unit: string | null;
    labels: string[];
    concentrations_ugml: (number | string | null)[];
    concentrations_particles: (number | string | null)[];
    controls_abbreviation: string | null;
    controls_description: string | null;
    number_of_experiments: string | number | null;
  };
}

interface TBRawReplicate {
  test_identifier_number: string | null;
  replicate_label: string | null;
}

interface TBProcessedReplicate {
  replicate_id: string | null;
  device_label: string | null;
  metric: string | null;
  treatments: Record<string, number>;
}

interface TBFinalResults {
  material_id: string | null;
  assay_name: string | null;
  metric: string | null;
  treatments: string[];
  replicate_data: {
    replicate_id: string;
    values: Record<string, number>;
  }[];
  mean: Record<string, number>;
  sd: Record<string, number>;
}

interface TBStatisticalAnalysis {
  tool?: string | null;
  raw_data?: Record<string, number[]>;
  anova_summary?: {
    f_value?: number | null;
    p_value?: number | null;
    p_value_summary?: string | null;
    significant?: string | null;
    r_squared?: number | null;
  };
  brown_forsythe?: {
    f_dfn_dfd?: string | null;
    p_value?: number | null;
    p_value_summary?: string | null;
    sds_significantly_different?: string | null;
  };
  anova_table?: {
    source: string;
    ss: number | null;
    df: number | null;
    ms: number | null;
    f_dfn_dfd: string | null;
    p_value: string | null;
  }[];
  data_summary?: {
    number_of_treatments?: number;
    number_of_values?: number;
  };
  tukey_comparisons?: {
    comparison: string;
    mean_diff: number | null;
    ci_95: string | null;
    significant: string | null;
    summary: string | null;
    adjusted_p_value: number | null;
  }[];
  tukey_details?: {
    comparison: string;
    mean_1: number | null;
    mean_2: number | null;
    mean_diff: number | null;
    se_of_diff: number | null;
    n1: number | null;
    n2: number | null;
    q: number | null;
    df: number | null;
  }[];
}

interface TBData {
  test_details: {
    work_package: WorkPackageData;
    material: MaterialData;
    dispersion: DispersionData;
    cell_line: CellLineData;
    treatment: TreatmentData;
  };
  raw_data: TBRawReplicate[];
  processed_data: TBProcessedReplicate[];
  final_results: TBFinalResults;
  statistical_analysis: TBStatisticalAnalysis | null;
}

/* ============================ Helpers ============================ */

type TabKey = "test-conditions" | "raw-data" | "processed-data" | "results";

const TABS: { key: TabKey; label: string }[] = [
  { key: "test-conditions", label: "Test Conditions" },
  { key: "raw-data", label: "Raw Data" },
  { key: "processed-data", label: "Processed Data" },
  { key: "results", label: "Final Results" },
];

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#9333ea", "#dc2626", "#0891b2"];

const fmt = (v: any, digits = 2) => {
  if (v === null || v === undefined || v === "") return "N/A";
  if (typeof v === "number") return v.toFixed(digits);
  return String(v);
};

const fmtPassageNumbers = (
  value: Record<string, number | string | null> | (number | string | null)[] | string | null | undefined
) => {
  if (value === null || value === undefined || value === "") return "N/A";

  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ") || "N/A";
  }

  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}: ${v}`);
    return entries.join(", ") || "N/A";
  }

  return String(value);
};

const getRunLabel = (index: number) => `Run ${index + 1}`;

/* ============================ Component ============================ */

const TBDataViewer: FC<PageProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<TBData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("test-conditions");
  const [selectedRun, setSelectedRun] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await api.post(`/tests/listings`, {
          work_package_name: work_package,
          element_cms_id: element,
          test_name: test,
        });

        if (response.status !== 200) {
          throw new Error("Network response was not ok");
        }

        setData(response.data);
      } catch (err) {
        console.error("Error fetching TB data:", err);
        setError("Failed to load TB data. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [work_package, element, test]);

  const downloadTable = (tableId: string, filename: string) => {
    const table = document.getElementById(tableId);
    if (!table) return;

    const rows = table.querySelectorAll("tr");
    let csvContent = "data:text/csv;charset=utf-8,";

    rows.forEach((row) => {
      const cells = row.querySelectorAll("th, td");
      const rowData = Array.from(cells)
        .map((cell) => `"${cell.textContent?.trim().replace(/"/g, '""') || ""}"`)
        .join(",");
      csvContent += rowData + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentRawRun = useMemo(() => {
    if (!data?.raw_data?.length) return null;
    return data.raw_data[selectedRun] || data.raw_data[0];
  }, [data?.raw_data, selectedRun]);

  const currentProcessedRun = useMemo(() => {
    if (!data?.processed_data?.length) return null;
    return data.processed_data[selectedRun] || data.processed_data[0];
  }, [data?.processed_data, selectedRun]);

  const rawBarChartData = useMemo(() => {
    if (!data?.processed_data?.[selectedRun]?.treatments) return [];
    return Object.entries(data.processed_data[selectedRun].treatments).map(([treatment, value]) => ({
      chamber: treatment,
      value,
    }));
  }, [data?.processed_data, selectedRun]);

  const processedLineChartData = useMemo(() => {
    if (!currentProcessedRun?.treatments) return [];
    return Object.entries(currentProcessedRun.treatments).map(([condition, value]) => ({
      condition,
      value,
    }));
  }, [currentProcessedRun]);

  const finalMeanChartData = useMemo(() => {
    if (!data?.final_results?.mean) return [];
    return Object.entries(data.final_results.mean).map(([condition, mean]) => ({
      condition,
      mean,
      sd: data?.final_results?.sd?.[condition] ?? 0,
    }));
  }, [data?.final_results]);

  if (loading) {
    return (
      <div className="bg-white flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
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

  const runOptionsCount = Math.max(
    data.raw_data?.length || 0,
    data.processed_data?.length || 0
  );

  return (
    <div className="bg-gray-50 min-h-screen py-8 text-black">
      <div className="container mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-4">TB Test Data Report</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Parameters</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2">
                  <span className="font-semibold">Work Package:</span> {work_package || "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">CMS Internal Identifier:</span> {element || "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">ERM Identifier:</span> {data?.test_details?.material?.erm_id ?? "N/A"}
                </p>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-3">Test Information</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2">
                  <span className="font-semibold">Full Test Name:</span> {data?.test_details?.work_package?.full_test_name ?? "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Test Acronym:</span> {data?.test_details?.work_package?.test_acronym ?? "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Test Type:</span> {data?.test_details?.work_package?.test_type ?? "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Endpoint:</span> {data?.test_details?.work_package?.endpoint ?? "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Endpoint Outcome:</span> {data?.test_details?.work_package?.endpoint_outcome ?? "N/A"}
                </p>
                <p>
                  <span className="font-semibold">SOP:</span> {data?.test_details?.work_package?.sop ?? "N/A"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full mb-8">
          <ul className="relative flex flex-wrap p-1.5 list-none rounded-md bg-slate-100" role="tablist">
            {TABS.map((tab) => (
              <li key={tab.key} className="z-30 flex-auto text-center">
                <button
                  className={`z-30 flex items-center justify-center w-full px-0 py-2 text-sm mb-0 transition-all ease-in-out border-0 rounded-md cursor-pointer ${
                    activeTab === tab.key ? "bg-blue-600 text-white shadow-md" : "text-slate-600 bg-inherit"
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                >
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {activeTab === "test-conditions" && (
          <>
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-blue-800">Material Information</h2>
                <button
                  onClick={() => downloadTable("tbMaterialTable", "TB_Material_Info")}
                  className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  <Download size={16} />
                  <span>Download</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table id="tbMaterialTable" className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Property</th>
                      <th className="py-2 px-4 border text-left">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td className="py-2 px-4 border font-medium">Material Identifier</td><td className="py-2 px-4 border">{data?.test_details?.material?.material_identifier ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">ERM Identifier</td><td className="py-2 px-4 border">{data?.test_details?.material?.erm_id ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Material Name</td><td className="py-2 px-4 border">{data?.test_details?.material?.material_name ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Core Chemistry</td><td className="py-2 px-4 border">{data?.test_details?.material?.core_chemistry ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">CAS No</td><td className="py-2 px-4 border">{data?.test_details?.material?.cas_no ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">CAS for Core</td><td className="py-2 px-4 border">{data?.test_details?.material?.cas_for_core ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Supplier</td><td className="py-2 px-4 border">{data?.test_details?.material?.material_supplier ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Material State</td><td className="py-2 px-4 border">{data?.test_details?.material?.material_state ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Batch</td><td className="py-2 px-4 border">{data?.test_details?.material?.batch ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Vial</td><td className="py-2 px-4 border">{data?.test_details?.material?.vial ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Preparation Date</td><td className="py-2 px-4 border">{data?.test_details?.material?.preparation_date ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Endotoxin Status</td><td className="py-2 px-4 border">{data?.test_details?.material?.endotoxin_absent ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Stock Concentration</td><td className="py-2 px-4 border">{data?.test_details?.material?.stock_concentration ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Molecular Weight</td><td className="py-2 px-4 border">{data?.test_details?.material?.molecular_weight ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Particles in Stock</td><td className="py-2 px-4 border">{data?.test_details?.material?.particles_stock ?? "N/A"}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-xl font-bold text-blue-800 mb-4">Dispersion</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                  <tbody>
                    <tr><td className="py-2 px-4 border font-medium">Dispersion Protocol</td><td className="py-2 px-4 border">{data?.test_details?.dispersion?.dispersion_protocol ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Dispersion Technique</td><td className="py-2 px-4 border">{data?.test_details?.dispersion?.dispersion_technique ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Dispersion Agent</td><td className="py-2 px-4 border">{data?.test_details?.dispersion?.dispersion_agent ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Dispersion Agent Concentration</td><td className="py-2 px-4 border">{data?.test_details?.dispersion?.dispersion_agent_concentration ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Additives</td><td className="py-2 px-4 border">{data?.test_details?.dispersion?.additives ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Dispersed in Culture Medium</td><td className="py-2 px-4 border">{data?.test_details?.dispersion?.dispersed_in_culture_medium ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Aids Used to Disperse</td><td className="py-2 px-4 border">{data?.test_details?.dispersion?.aids_used_to_disperse ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Sonication Bath</td><td className="py-2 px-4 border">{data?.test_details?.dispersion?.sonication_bath ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Sonication Tip</td><td className="py-2 px-4 border">{data?.test_details?.dispersion?.sonication_tip ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Time / Duration</td><td className="py-2 px-4 border">{data?.test_details?.dispersion?.time_duration ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Energy</td><td className="py-2 px-4 border">{data?.test_details?.dispersion?.energy ?? "N/A"}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-xl font-bold text-blue-800 mb-4">Cell Line Details</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                  <tbody>
                    <tr><td className="py-2 px-4 border font-medium">Cell Type</td><td className="py-2 px-4 border">{data?.test_details?.cell_line?.cell_type_specification ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Cell Line Short Name</td><td className="py-2 px-4 border">{data?.test_details?.cell_line?.cell_line_short_name ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Supplier</td><td className="py-2 px-4 border">{data?.test_details?.cell_line?.supplier ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Passage Numbers</td><td className="py-2 px-4 border">{fmtPassageNumbers(data?.test_details?.cell_line?.passage_numbers)}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Plate Details</td><td className="py-2 px-4 border">{data?.test_details?.cell_line?.plate_details ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Cells per Chamber</td><td className="py-2 px-4 border">{fmt(data?.test_details?.cell_line?.cells_per_chamber)}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Volume per Chamber</td><td className="py-2 px-4 border">{data?.test_details?.cell_line?.volume_per_chamber ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Medium</td><td className="py-2 px-4 border">{data?.test_details?.cell_line?.medium ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Serum</td><td className="py-2 px-4 border">{data?.test_details?.cell_line?.serum ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Serum Concentration (Culture)</td><td className="py-2 px-4 border">{fmt(data?.test_details?.cell_line?.serum_concentration_culture)}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Serum Concentration (Treatment)</td><td className="py-2 px-4 border">{fmt(data?.test_details?.cell_line?.serum_concentration_treatment)}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Heat Inactivated</td><td className="py-2 px-4 border">{data?.test_details?.cell_line?.serum_heat_inactivated ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Antibiotics</td><td className="py-2 px-4 border">{data?.test_details?.cell_line?.antibiotics ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Complete Growth Medium</td><td className="py-2 px-4 border">{data?.test_details?.cell_line?.complete_growth_medium ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Culture Conditions</td><td className="py-2 px-4 border">{data?.test_details?.cell_line?.culture_conditions ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Trypan Blue Solution</td><td className="py-2 px-4 border">{data?.test_details?.cell_line?.trypan_blue_solution ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Incubation Time TB</td><td className="py-2 px-4 border">{data?.test_details?.cell_line?.incubation_time_tb ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Volume</td><td className="py-2 px-4 border">{data?.test_details?.cell_line?.volume ?? "N/A"}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-xl font-bold text-blue-800 mb-4">Treatment</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                  <tbody>
                    <tr><td className="py-2 px-4 border font-medium">Time Point Unit</td><td className="py-2 px-4 border">{data?.test_details?.treatment?.timeline?.time_point_unit ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Time Point Labels</td><td className="py-2 px-4 border">{data?.test_details?.treatment?.timeline?.time_point_labels?.join(", ") || "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Time Points</td><td className="py-2 px-4 border">{data?.test_details?.treatment?.timeline?.time_points?.filter((v) => v !== null && v !== undefined && v !== "").join(", ") || "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Concentration Unit</td><td className="py-2 px-4 border">{data?.test_details?.treatment?.concentration?.unit ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Concentration Labels</td><td className="py-2 px-4 border">{data?.test_details?.treatment?.concentration?.labels?.join(", ") || "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Concentrations (μg/mL)</td><td className="py-2 px-4 border">{data?.test_details?.treatment?.concentration?.concentrations_ugml?.filter((v) => v !== null && v !== undefined && v !== "").join(", ") || "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Concentrations (Particles)</td><td className="py-2 px-4 border">{data?.test_details?.treatment?.concentration?.concentrations_particles?.filter((v) => v !== null && v !== undefined && v !== "").join(", ") || "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Control Abbreviation</td><td className="py-2 px-4 border">{data?.test_details?.treatment?.concentration?.controls_abbreviation ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Control Description</td><td className="py-2 px-4 border">{data?.test_details?.treatment?.concentration?.controls_description ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Number of Experiments</td><td className="py-2 px-4 border">{fmt(data?.test_details?.treatment?.concentration?.number_of_experiments)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Lead Scientists</h3>
                  <table className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Name</th>
                        <th className="py-2 px-4 border text-left">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.test_details?.work_package?.lead_scientists?.length ?? 0) > 0 ? (
                        data.test_details.work_package.lead_scientists.map((scientist, index) => (
                          <tr key={index}>
                            <td className="py-2 px-4 border">{scientist.name ?? "N/A"}</td>
                            <td className="py-2 px-4 border">{scientist.email ?? "N/A"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={2} className="py-2 px-4 border text-center">No lead scientists available</td>
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
                      {(data?.test_details?.work_package?.assay_scientists?.length ?? 0) > 0 ? (
                        data.test_details.work_package.assay_scientists.map((scientist, index) => (
                          <tr key={index}>
                            <td className="py-2 px-4 border">{scientist.name ?? "N/A"}</td>
                            <td className="py-2 px-4 border">{scientist.email ?? "N/A"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={2} className="py-2 px-4 border text-center">No assay scientists available</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "raw-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">Raw Data</h2>
            </div>

            {runOptionsCount > 0 ? (
              <>
                <div className="mb-6">
                  <label htmlFor="tb-run-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Select Run:
                  </label>
                  <select
                    id="tb-run-select"
                    value={selectedRun}
                    onChange={(e) => setSelectedRun(Number(e.target.value))}
                    className="w-full md:w-1/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5"
                  >
                    {Array.from({ length: runOptionsCount }).map((_, index) => (
                      <option key={index} value={index}>
                        {getRunLabel(index)} - {data?.raw_data?.[index]?.test_identifier_number ?? "Replicate"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-6 bg-blue-50 p-4 rounded-md">
                  <h3 className="text-lg font-semibold mb-3">Run Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><p className="font-semibold">Test Identifier:</p><p>{currentRawRun?.test_identifier_number ?? "N/A"}</p></div>
                    <div><p className="font-semibold">Replicate Label:</p><p>{currentRawRun?.replicate_label ?? "N/A"}</p></div>
                    <div><p className="font-semibold">Processed Metric:</p><p>{data?.processed_data?.[selectedRun]?.metric ?? "N/A"}</p></div>
                  </div>
                </div>

                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-3">% Cell Death by Treatment</h3>
                  <ResponsiveContainer width="100%" height={380}>
                    <BarChart data={rawBarChartData} margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="chamber" />
                      <YAxis
                        label={{
                          value: "% Cell Death",
                          angle: -90,
                          position: "insideLeft",
                        }}
                      />
                      <Tooltip formatter={(value: any) => fmt(value, 2)} />
                      <Bar dataKey="value">
                        {rawBarChartData.map((_, index) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto">
                  <table id="tbRawTable" className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Treatment</th>
                        <th className="py-2 px-4 border text-left">% Cell Death</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rawBarChartData.length > 0 ? (
                        rawBarChartData.map((row, index) => (
                          <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                            <td className="py-2 px-4 border">{row.chamber}</td>
                            <td className="py-2 px-4 border">{fmt(row.value)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={2} className="py-2 px-4 border text-center">No raw data available</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-center text-gray-600">No raw data available</div>
            )}
          </div>
        )}

        {activeTab === "processed-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">Processed Data</h2>
            </div>

            {(data?.processed_data?.length ?? 0) > 0 ? (
              <>
                <div className="mb-6">
                  <label htmlFor="tb-run-select-processed" className="block text-sm font-medium text-gray-700 mb-2">
                    Select Run:
                  </label>
                  <select
                    id="tb-run-select-processed"
                    value={selectedRun}
                    onChange={(e) => setSelectedRun(Number(e.target.value))}
                    className="w-full md:w-1/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5"
                  >
                    {data.processed_data.map((run, index) => (
                      <option key={index} value={index}>
                        {getRunLabel(index)} - {run.replicate_id ?? `Replicate ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-6 bg-blue-50 p-4 rounded-md">
                  <h3 className="text-lg font-semibold mb-3">Processed Run Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><p className="font-semibold">Replicate ID:</p><p>{currentProcessedRun?.replicate_id ?? "N/A"}</p></div>
                    <div><p className="font-semibold">Device Label:</p><p>{currentProcessedRun?.device_label ?? "N/A"}</p></div>
                    <div><p className="font-semibold">Metric:</p><p>{currentProcessedRun?.metric ?? "N/A"}</p></div>
                  </div>
                </div>

                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-3">Processed Values</h3>
                  <ResponsiveContainer width="100%" height={360}>
                    <LineChart data={processedLineChartData} margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="condition" />
                      <YAxis
                        label={{
                          value: "% Cell Death",
                          angle: -90,
                          position: "insideLeft",
                        }}
                      />
                      <Tooltip formatter={(value: any) => fmt(value, 2)} />
                      <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto">
                  <table id="tbProcessedTable" className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Condition</th>
                        <th className="py-2 px-4 border text-left">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentProcessedRun?.treatments ? (
                        Object.entries(currentProcessedRun.treatments).map(([label, value], index) => (
                          <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                            <td className="py-2 px-4 border">{label}</td>
                            <td className="py-2 px-4 border">{fmt(value)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={2} className="py-2 px-4 border text-center">No processed data available</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-center text-gray-600">No processed data available</div>
            )}
          </div>
        )}

        {activeTab === "results" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">TB Results</h2>
              <button
                onClick={() => downloadTable("tbResultsTable", "TB_Results")}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            <div className="mb-6 bg-blue-50 p-4 rounded-md">
              <h3 className="text-lg font-semibold mb-3">Final Results</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><p className="font-semibold">Material ID:</p><p>{data?.final_results?.material_id ?? "N/A"}</p></div>
                <div><p className="font-semibold">Assay Name:</p><p>{data?.final_results?.assay_name ?? "N/A"}</p></div>
                <div><p className="font-semibold">Metric:</p><p>{data?.final_results?.metric ?? "N/A"}</p></div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Mean % Cell Death by Condition</h3>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={finalMeanChartData} margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="condition" />
                  <YAxis
                    label={{
                      value: "% Cell Death",
                      angle: -90,
                      position: "insideLeft",
                    }}
                  />
                  <Tooltip formatter={(value: any) => fmt(value, 3)} />
                  <Bar dataKey="mean">
                    {finalMeanChartData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto mb-8">
              <table id="tbResultsTable" className="min-w-full bg-white border border-gray-200">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-2 px-4 border text-left">Row</th>
                    {data?.final_results?.treatments?.map((label, idx) => (
                      <th key={idx} className="py-2 px-4 border text-left">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data?.final_results?.replicate_data?.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-gray-50" : ""}>
                      <td className="py-2 px-4 border">{row.replicate_id}</td>
                      {data.final_results.treatments.map((label, j) => (
                        <td key={j} className="py-2 px-4 border">{fmt(row.values?.[label])}</td>
                      ))}
                    </tr>
                  ))}

                  <tr className="bg-blue-50">
                    <td className="py-2 px-4 border font-semibold">Mean</td>
                    {data?.final_results?.treatments?.map((label, idx) => (
                      <td key={idx} className="py-2 px-4 border font-semibold">{fmt(data?.final_results?.mean?.[label], 3)}</td>
                    ))}
                  </tr>

                  <tr className="bg-orange-50">
                    <td className="py-2 px-4 border font-semibold">SD</td>
                    {data?.final_results?.treatments?.map((label, idx) => (
                      <td key={idx} className="py-2 px-4 border font-semibold">{fmt(data?.final_results?.sd?.[label], 3)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {data?.statistical_analysis && (
              <div className="bg-blue-50 p-4 rounded-md">
                <h3 className="text-lg font-semibold mb-3">Statistical Analysis</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p><span className="font-semibold">Tool:</span> {data?.statistical_analysis?.tool ?? "N/A"}</p>
                    <p><span className="font-semibold">ANOVA F value:</span> {fmt(data?.statistical_analysis?.anova_summary?.f_value, 4)}</p>
                    <p><span className="font-semibold">ANOVA P value:</span> {fmt(data?.statistical_analysis?.anova_summary?.p_value, 4)}</p>
                    <p><span className="font-semibold">P value summary:</span> {data?.statistical_analysis?.anova_summary?.p_value_summary ?? "N/A"}</p>
                    <p><span className="font-semibold">Significant:</span> {data?.statistical_analysis?.anova_summary?.significant ?? "N/A"}</p>
                    <p><span className="font-semibold">R squared:</span> {fmt(data?.statistical_analysis?.anova_summary?.r_squared, 4)}</p>
                  </div>
                  <div>
                    <p><span className="font-semibold">Brown-Forsythe F (DFn, DFd):</span> {data?.statistical_analysis?.brown_forsythe?.f_dfn_dfd ?? "N/A"}</p>
                    <p><span className="font-semibold">Brown-Forsythe P value:</span> {fmt(data?.statistical_analysis?.brown_forsythe?.p_value, 4)}</p>
                    <p><span className="font-semibold">P value summary:</span> {data?.statistical_analysis?.brown_forsythe?.p_value_summary ?? "N/A"}</p>
                    <p><span className="font-semibold">SDs significantly different:</span> {data?.statistical_analysis?.brown_forsythe?.sds_significantly_different ?? "N/A"}</p>
                  </div>
                </div>

                {(data?.statistical_analysis?.tukey_comparisons?.length ?? 0) > 0 && (
                  <div className="mt-6">
                    <h4 className="text-md font-semibold mb-3">Tukey Multiple Comparisons</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white border border-gray-200">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="py-2 px-4 border text-left">Comparison</th>
                            <th className="py-2 px-4 border text-left">Mean Diff</th>
                            <th className="py-2 px-4 border text-left">95% CI</th>
                            <th className="py-2 px-4 border text-left">Significant</th>
                            <th className="py-2 px-4 border text-left">Summary</th>
                            <th className="py-2 px-4 border text-left">Adjusted P</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.statistical_analysis.tukey_comparisons!.map((row, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? "bg-gray-50" : ""}>
                              <td className="py-2 px-4 border">{row.comparison}</td>
                              <td className="py-2 px-4 border">{fmt(row.mean_diff, 4)}</td>
                              <td className="py-2 px-4 border">{row.ci_95 ?? "N/A"}</td>
                              <td className="py-2 px-4 border">{row.significant ?? "N/A"}</td>
                              <td className="py-2 px-4 border">{row.summary ?? "N/A"}</td>
                              <td className="py-2 px-4 border">{fmt(row.adjusted_p_value, 4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TBDataViewer;