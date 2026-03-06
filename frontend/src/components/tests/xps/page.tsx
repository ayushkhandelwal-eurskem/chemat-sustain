"use client";
import React, { FC, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/axios";
import { Download } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
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
  stock_concentration: string | null;
  molecular_weight: string | null;
  particles_stock: string | null;
}

interface SamplePreparationData {
  dispersion_protocol: string | null;
  dispersion_technique: string | null;
  dispersion_agent: string | null;
  additives: string | null;
  dispersed_in_culture_medium: string | null;
  aids_used_to_disperse: string | null;
  sonication_bath: string | null;
  sonication_tip: string | null;
  time_duration: string | null;
  rcf: number | string | null;
  deposition: string | null;
}

interface InstrumentationData {
  photon: string | null;
  analyser: string | null;
  pass_energy: string | null;
  bias: number | string | null;
  slit: string | null;
}

interface RawSpectrum {
  sheet_name: string | null;
  test_identifier: string | null;
  core_level_label: string | null;
  acquisition_pass_energy: string | null;
  acquisition_step: string | null;
  data_points: number;
  binding_energies: number[];
  intensities: number[];
}

interface ProcessedDataSheet {
  sheet_name: string;
  identifier: string | null;
  has_data: boolean;
}

interface AtomicPercentageRow {
  spot_label: string | null;
  elements: Record<string, number>;
}

interface CoreLevelBinding {
  core_level: string | null;
  binding_energy: number | null;
}

interface FinalResults {
  material_id: string | null;
  result_type: string | null;
  atomic_percentages: AtomicPercentageRow[];
  core_level_bindings: CoreLevelBinding[];
}

interface XPSData {
  test_name: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  work_package_name: string;
  element_cms_id: string;
  file_path: string | null;

  test_details: {
    work_package: WorkPackageData;
    material: MaterialData;
    sample_preparation: SamplePreparationData;
    instrumentation: InstrumentationData;
  };

  raw_data: RawSpectrum[];
  processed_data: ProcessedDataSheet[];
  final_results: FinalResults | null;
  statistical_analysis: {
    available?: boolean;
    notes?: string;
  } | null;

  release_test_details?: boolean;
  release_raw_data?: boolean;
  release_processed_data?: boolean;
  release_final_results?: boolean;
  release_statistical_analysis?: boolean;
}

/* ============================ Helpers ============================ */

type TabKey = "test-conditions" | "raw-data" | "processed-data" | "results";

const TABS: { key: TabKey; label: string }[] = [
  { key: "test-conditions", label: "Test Conditions" },
  { key: "raw-data", label: "Raw Data" },
  { key: "processed-data", label: "Processed Data" },
  { key: "results", label: "Final Results" },
];

const COLORS = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#9333ea",
  "#dc2626",
  "#0891b2",
  "#7c3aed",
  "#0f766e",
];

const fmt = (v: any, digits = 2) => {
  if (v === null || v === undefined || v === "") return "N/A";
  if (typeof v === "number") return v.toFixed(digits);
  return String(v);
};

const downsampleSpectrum = (spectrum: RawSpectrum | null, maxPoints = 600) => {
  if (!spectrum || !Array.isArray(spectrum.binding_energies) || !Array.isArray(spectrum.intensities)) {
    return [];
  }

  const points = spectrum.binding_energies.map((x, i) => ({
    x,
    y: spectrum.intensities[i] ?? null,
  }));

  if (points.length <= maxPoints) {
    return points.filter((p) => p.x != null && p.y != null);
  }

  const step = Math.ceil(points.length / maxPoints);
  const sampled: { x: number; y: number | null }[] = [];

  for (let i = 0; i < points.length; i += step) {
    sampled.push(points[i]);
  }

  return sampled.filter((p) => p.x != null && p.y != null);
};

const getRunLabel = (index: number) => `Run ${index + 1}`;

/* ============================ Component ============================ */

const XPSDataViewer: FC<PageProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<XPSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("test-conditions");
  const [selectedRun, setSelectedRun] = useState(0);
  const [selectedAtomicSpot, setSelectedAtomicSpot] = useState(0);

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
        console.error("Error fetching XPS data:", err);
        setError("Failed to load XPS data. Please try again later.");
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

  const downloadSpectrumCSV = (runIndex: number) => {
    const run = data?.raw_data?.[runIndex];
    if (!run) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Binding Energy (eV),Intensity\r\n";

    run.binding_energies.forEach((be, i) => {
      csvContent += `${be ?? ""},${run.intensities?.[i] ?? ""}\r\n`;
    });

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `XPS_${getRunLabel(runIndex)}_Spectrum.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentRawRun = useMemo(() => {
    const rows = data?.raw_data ?? [];
    return rows[selectedRun] || rows[0] || null;
  }, [data?.raw_data, selectedRun]);

  const currentProcessedRun = useMemo(() => {
    const rows = data?.processed_data ?? [];
    return rows[selectedRun] || rows[0] || null;
  }, [data?.processed_data, selectedRun]);

  const currentSpectrumChartData = useMemo(() => {
    return downsampleSpectrum(currentRawRun);
  }, [currentRawRun]);

  const atomicPercentageRows = data?.final_results?.atomic_percentages ?? [];
  const coreLevelBindingRows = data?.final_results?.core_level_bindings ?? [];

  const currentAtomicSpot = useMemo(() => {
    return atomicPercentageRows[selectedAtomicSpot] || atomicPercentageRows[0] || null;
  }, [atomicPercentageRows, selectedAtomicSpot]);

  const atomicPercentChartData = useMemo(() => {
    if (!currentAtomicSpot?.elements) return [];
    return Object.entries(currentAtomicSpot.elements).map(([elementName, value]) => ({
      element: elementName,
      atomic_percent: typeof value === "number" ? value : Number(value) || 0,
    }));
  }, [currentAtomicSpot]);

  const coreLevelBindingChartData = useMemo(() => {
    return coreLevelBindingRows
      .filter((row) => row.binding_energy !== null && row.binding_energy !== undefined)
      .map((row) => ({
        core_level: row.core_level || "Unknown",
        binding_energy: Number(row.binding_energy) || 0,
      }));
  }, [coreLevelBindingRows]);

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

  const runOptionsCount = Math.max(data?.raw_data?.length || 0, data?.processed_data?.length || 0);

  return (
    <div className="bg-gray-50 min-h-screen py-8 text-black">
      <div className="container mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-4">XPS Test Data Report</h1>
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
                  onClick={() => downloadTable("xpsMaterialTable", "XPS_Material_Info")}
                  className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  <Download size={16} />
                  <span>Download</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table id="xpsMaterialTable" className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Property</th>
                      <th className="py-2 px-4 border text-left">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td className="py-2 px-4 border font-medium">CMS Internal Identifier</td><td className="py-2 px-4 border">{element}</td></tr>
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
                    <tr><td className="py-2 px-4 border font-medium">Stock Concentration</td><td className="py-2 px-4 border">{data?.test_details?.material?.stock_concentration ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Molecular Weight</td><td className="py-2 px-4 border">{data?.test_details?.material?.molecular_weight ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Particles in Stock</td><td className="py-2 px-4 border">{data?.test_details?.material?.particles_stock ?? "N/A"}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-blue-800">Sample Preparation</h2>
                <button
                  onClick={() => downloadTable("xpsSamplePrepTable", "XPS_Sample_Preparation")}
                  className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  <Download size={16} />
                  <span>Download</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table id="xpsSamplePrepTable" className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Property</th>
                      <th className="py-2 px-4 border text-left">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td className="py-2 px-4 border font-medium">Dispersion Protocol</td><td className="py-2 px-4 border">{data?.test_details?.sample_preparation?.dispersion_protocol ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Dispersion Technique</td><td className="py-2 px-4 border">{data?.test_details?.sample_preparation?.dispersion_technique ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Dispersion Agent</td><td className="py-2 px-4 border">{data?.test_details?.sample_preparation?.dispersion_agent ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Additives</td><td className="py-2 px-4 border">{data?.test_details?.sample_preparation?.additives ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Dispersed in Culture Medium</td><td className="py-2 px-4 border">{data?.test_details?.sample_preparation?.dispersed_in_culture_medium ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Aids Used to Disperse</td><td className="py-2 px-4 border">{data?.test_details?.sample_preparation?.aids_used_to_disperse ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Sonication Bath</td><td className="py-2 px-4 border">{data?.test_details?.sample_preparation?.sonication_bath ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Sonication Tip</td><td className="py-2 px-4 border">{data?.test_details?.sample_preparation?.sonication_tip ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Time / Duration</td><td className="py-2 px-4 border">{data?.test_details?.sample_preparation?.time_duration ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">RCF</td><td className="py-2 px-4 border">{fmt(data?.test_details?.sample_preparation?.rcf)}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Deposition</td><td className="py-2 px-4 border">{data?.test_details?.sample_preparation?.deposition ?? "N/A"}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-blue-800">Instrumentation</h2>
                <button
                  onClick={() => downloadTable("xpsInstrumentationTable", "XPS_Instrumentation")}
                  className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  <Download size={16} />
                  <span>Download</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table id="xpsInstrumentationTable" className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Property</th>
                      <th className="py-2 px-4 border text-left">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td className="py-2 px-4 border font-medium">Photon</td><td className="py-2 px-4 border">{data?.test_details?.instrumentation?.photon ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Analyser</td><td className="py-2 px-4 border">{data?.test_details?.instrumentation?.analyser ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Pass Energy</td><td className="py-2 px-4 border">{data?.test_details?.instrumentation?.pass_energy ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Bias</td><td className="py-2 px-4 border">{fmt(data?.test_details?.instrumentation?.bias)}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Slit</td><td className="py-2 px-4 border">{data?.test_details?.instrumentation?.slit ?? "N/A"}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-blue-800">Scientists Information</h2>
                <button
                  onClick={() => downloadTable("xpsScientistsTable", "XPS_Scientists_Info")}
                  className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  <Download size={16} />
                  <span>Download</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Lead Scientists</h3>
                  <table id="xpsScientistsTable" className="min-w-full bg-white border border-gray-200">
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
              <button
                onClick={() => downloadSpectrumCSV(selectedRun)}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            {runOptionsCount > 0 ? (
              <>
                <div className="mb-6">
                  <label htmlFor="xps-run-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Select Run:
                  </label>
                  <select
                    id="xps-run-select"
                    value={selectedRun}
                    onChange={(e) => setSelectedRun(Number(e.target.value))}
                    className="w-full md:w-1/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
                  >
                    {Array.from({ length: runOptionsCount }).map((_, index) => (
                      <option key={index} value={index}>
                        {getRunLabel(index)} - {data?.raw_data?.[index]?.core_level_label ?? "Spectrum"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-6 bg-blue-50 p-4 rounded-md">
                  <h3 className="text-lg font-semibold mb-3">Results for {getRunLabel(selectedRun)}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><p className="font-semibold">Sheet Name:</p><p>{currentRawRun?.sheet_name ?? "N/A"}</p></div>
                    <div><p className="font-semibold">Test Identifier:</p><p>{currentRawRun?.test_identifier ?? "N/A"}</p></div>
                    <div><p className="font-semibold">Core Level Label:</p><p>{currentRawRun?.core_level_label ?? "N/A"}</p></div>
                    <div><p className="font-semibold">Pass Energy:</p><p>{currentRawRun?.acquisition_pass_energy ?? "N/A"}</p></div>
                    <div><p className="font-semibold">Step:</p><p>{currentRawRun?.acquisition_step ?? "N/A"}</p></div>
                    <div><p className="font-semibold">Data Points:</p><p>{currentRawRun?.data_points ?? "N/A"}</p></div>
                    <div>
                      <p className="font-semibold">Binding Energy Range:</p>
                      <p>
                        {currentRawRun?.binding_energies?.length
                          ? `${fmt(Math.min(...currentRawRun.binding_energies), 3)} - ${fmt(Math.max(...currentRawRun.binding_energies), 3)} eV`
                          : "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold">Intensity Range:</p>
                      <p>
                        {currentRawRun?.intensities?.length
                          ? `${fmt(Math.min(...currentRawRun.intensities), 3)} - ${fmt(Math.max(...currentRawRun.intensities), 3)}`
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-3">XPS Spectrum</h3>
                  <ResponsiveContainer width="100%" height={420}>
                    <LineChart data={currentSpectrumChartData} margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Binding Energy"
                        reversed
                        label={{
                          value: "Binding Energy (eV)",
                          position: "insideBottomRight",
                          offset: -10,
                        }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="Intensity"
                        label={{
                          value: "Intensity",
                          angle: -90,
                          position: "insideLeft",
                        }}
                      />
                      <Tooltip
                        formatter={(value: any) => [fmt(value, 3), "Intensity"]}
                        labelFormatter={(label) => `BE: ${fmt(label, 3)}`}
                      />
                      <Line type="monotone" dataKey="y" stroke="#2563eb" strokeWidth={1.5} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto">
                  <table id="xpsRawTable" className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Binding Energy (eV)</th>
                        <th className="py-2 px-4 border text-left">Intensity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentRawRun?.binding_energies?.length ? (
                        currentRawRun.binding_energies.slice(0, 200).map((be, index) => (
                          <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                            <td className="py-2 px-4 border">{be != null ? Number(be).toFixed(4) : "-"}</td>
                            <td className="py-2 px-4 border">
                              {currentRawRun?.intensities?.[index] != null ? Number(currentRawRun.intensities[index]).toFixed(4) : "-"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={2} className="py-2 px-4 border text-center">No raw spectrum data available</td>
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
              <button
                onClick={() => downloadTable("xpsProcessedTable", `XPS_${getRunLabel(selectedRun)}_Processed_Data`)}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            {(data?.processed_data?.length ?? 0) > 0 ? (
              <>
                <div className="mb-6">
                  <label htmlFor="xps-run-select-processed" className="block text-sm font-medium text-gray-700 mb-2">
                    Select Run:
                  </label>
                  <select
                    id="xps-run-select-processed"
                    value={selectedRun}
                    onChange={(e) => setSelectedRun(Number(e.target.value))}
                    className="w-full md:w-1/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
                  >
                    {data.processed_data.map((run, index) => (
                      <option key={index} value={index}>
                        {getRunLabel(index)} - {run.identifier ?? run.sheet_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-6 bg-blue-50 p-4 rounded-md">
                  <h3 className="text-lg font-semibold mb-3">Results for {getRunLabel(selectedRun)}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><p className="font-semibold">Sheet Name:</p><p>{currentProcessedRun?.sheet_name ?? "N/A"}</p></div>
                    <div><p className="font-semibold">Identifier:</p><p>{currentProcessedRun?.identifier ?? "N/A"}</p></div>
                    <div><p className="font-semibold">Has Data:</p><p>{currentProcessedRun?.has_data ? "Yes" : "No"}</p></div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table id="xpsProcessedTable" className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Sheet Name</th>
                        <th className="py-2 px-4 border text-left">Identifier</th>
                        <th className="py-2 px-4 border text-left">Has Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.processed_data.map((run, index) => (
                        <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                          <td className="py-2 px-4 border">{run.sheet_name ?? "N/A"}</td>
                          <td className="py-2 px-4 border">{run.identifier ?? "N/A"}</td>
                          <td className="py-2 px-4 border">{run.has_data ? "Yes" : "No"}</td>
                        </tr>
                      ))}
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
              <h2 className="text-xl font-bold text-blue-800">XPS Results</h2>
              <button
                onClick={() => downloadTable("xpsAtomicPercentagesTable", "XPS_Results")}
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
                <div><p className="font-semibold">Result Type:</p><p>{data?.final_results?.result_type ?? "N/A"}</p></div>
                <div><p className="font-semibold">Statistical Analysis Available:</p><p>{data?.statistical_analysis ? "Yes" : "No"}</p></div>
              </div>
            </div>

            {atomicPercentageRows.length > 0 && (
              <>
                <div className="mb-6">
                  <label htmlFor="xps-spot-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Select Spot:
                  </label>
                  <select
                    id="xps-spot-select"
                    value={selectedAtomicSpot}
                    onChange={(e) => setSelectedAtomicSpot(Number(e.target.value))}
                    className="w-full md:w-1/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
                  >
                    {atomicPercentageRows.map((row, index) => (
                      <option key={index} value={index}>
                        {row.spot_label ?? `Spot ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-3">Atomic Percentages</h3>
                  <div className="overflow-x-auto">
                    <table id="xpsAtomicPercentagesTable" className="min-w-full bg-white border border-gray-200">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="py-2 px-4 border text-left">Element</th>
                          <th className="py-2 px-4 border text-left">Atomic %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentAtomicSpot?.elements ? (
                          Object.entries(currentAtomicSpot.elements).map(([key, value], index) => (
                            <tr key={key} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                              <td className="py-2 px-4 border">{key}</td>
                              <td className="py-2 px-4 border">{fmt(value, 4)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={2} className="py-2 px-4 border text-center">No atomic percentages available</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {atomicPercentChartData.length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold mb-3">
                      Atomic Percentage by Element ({currentAtomicSpot?.spot_label ?? "Selected Spot"})
                    </h3>
                    <ResponsiveContainer width="100%" height={380}>
                      <BarChart data={atomicPercentChartData} margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="element"
                          label={{
                            value: "Element",
                            position: "insideBottomRight",
                            offset: -10,
                          }}
                        />
                        <YAxis
                          label={{
                            value: "Atomic %",
                            angle: -90,
                            position: "insideLeft",
                          }}
                        />
                        <Tooltip formatter={(value: any) => fmt(value, 4)} />
                        <Bar dataKey="atomic_percent">
                          {atomicPercentChartData.map((_, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}

            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Core Level Binding Energies</h3>
              <div className="overflow-x-auto">
                <table id="xpsCoreLevelBindingsTable" className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Core Level</th>
                      <th className="py-2 px-4 border text-left">Binding Energy (eV)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coreLevelBindingRows.length > 0 ? (
                      coreLevelBindingRows.map((row, index) => (
                        <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                          <td className="py-2 px-4 border">{row.core_level ?? "N/A"}</td>
                          <td className="py-2 px-4 border">{fmt(row.binding_energy, 3)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="py-2 px-4 border text-center">No core level binding data available</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {coreLevelBindingChartData.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-3">Binding Energy by Core Level</h3>
                <ResponsiveContainer width="100%" height={420}>
                  <BarChart data={coreLevelBindingChartData} margin={{ top: 20, right: 20, bottom: 90, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="core_level" angle={-30} textAnchor="end" interval={0} height={100} />
                    <YAxis
                      label={{
                        value: "Binding Energy (eV)",
                        angle: -90,
                        position: "insideLeft",
                      }}
                    />
                    <Tooltip formatter={(value: any) => fmt(value, 3)} />
                    <Bar dataKey="binding_energy">
                      {coreLevelBindingChartData.map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {data?.statistical_analysis?.notes && (
              <div className="bg-blue-50 p-4 rounded-md">
                <h3 className="text-lg font-semibold mb-3">Statistical Analysis</h3>
                <p>{data.statistical_analysis.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default XPSDataViewer;