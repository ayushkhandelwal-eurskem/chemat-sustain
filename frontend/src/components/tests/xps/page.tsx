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
} from "recharts";

/* ============================ Types ============================ */
/* Aligned 1:1 with actual XPS API response                       */
/* =============================================================== */

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
  xray_source: string | null;
  analyser: string | null;
  pass_energy: string | null;
  take_off_angle: string | null;
  spot_size: string | null;
  charge_neutralizer: string | null;
  vacuum: string | null;
  notes_a: string | null;
  notes_b: string | null;
  notes_c: string | null;
}

interface XPSSpectrumPoint {
  binding_energy_ev: number | null;
  intensity_counts_per_s: number | null;
}

interface XPSRawDataBlock {
  metric_name: string | null;
  spectrum_label: string | null;
  raw_sheet_name: string | null;
  processed_sheet_name: string | null;
  point_count: number | null;
  binding_energy_unit: string | null;
  intensity_unit: string | null;
  min_binding_energy_ev: number | null;
  max_binding_energy_ev: number | null;
  min_intensity_counts_per_s: number | null;
  max_intensity_counts_per_s: number | null;
  spectrum_points: XPSSpectrumPoint[];
  assay_notes: string[];
  acquisition_mode: string | null;
  test_identifier: string | null;
}

interface XPSProcessedSpectrumBlock {
  metric_name: string | null;
  spectrum_label: string | null;
  processed_sheet_name: string | null;
  processed_sheet_has_numeric_data: boolean | null;
  extracted_title: string | null;
  point_count_from_raw: number | null;
  intensity_min: number | null;
  intensity_max: number | null;
  identifier: string | null;
}

interface ProcessedDataResponse {
  spectra: XPSProcessedSpectrumBlock[];
  processed_sheet_count: number;
  processed_numeric_data_available: boolean;
}

interface XPSElectronicProperty {
  region_label: string | null;
  atomic_percent: number | null;
}

interface XPSFinalResultRow {
  sample_identifier: string | null;
  result_type: string | null;
  spot_label: string | null;
  electronic_properties: XPSElectronicProperty[];
}

interface XPSData {
  test_details: {
    work_package: WorkPackageData;
    material: MaterialData;
    sample_preparation: SamplePreparationData;
    instrumentation: InstrumentationData;
  };
  raw_data: XPSRawDataBlock[];
  processed_data: ProcessedDataResponse;
  final_results: XPSFinalResultRow[];
  statistical_analysis: {
    available?: boolean;
    notes?: string;
  } | null;
}

/* ============================ Helpers ============================ */

type TabKey = "test-conditions" | "raw-data" | "processed-data" | "results";

const TABS: { key: TabKey; label: string }[] = [
  { key: "test-conditions", label: "Test Conditions" },
  { key: "raw-data", label: "Raw Data" },
  { key: "processed-data", label: "Processed Data" },
  { key: "results", label: "Final Results" },
];

const fmt = (v: any, digits = 2) => {
  if (v === null || v === undefined || v === "") return "N/A";
  if (typeof v === "number") return v.toFixed(digits);
  return String(v);
};

const downsampleSpectrumPoints = (
  points: XPSSpectrumPoint[] | undefined,
  maxPoints = 800
) => {
  if (!points?.length) return [];
  const valid = points
    .filter((p) => p.binding_energy_ev != null && p.intensity_counts_per_s != null)
    .map((p) => ({ x: p.binding_energy_ev as number, y: p.intensity_counts_per_s as number }));

  if (valid.length <= maxPoints) return valid;

  const step = Math.ceil(valid.length / maxPoints);
  const sampled: { x: number; y: number }[] = [];
  for (let i = 0; i < valid.length; i += step) sampled.push(valid[i]);
  return sampled;
};

/* ============================ Component ============================ */

const XPSDataViewer: FC<PageProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<XPSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("test-conditions");
  const [selectedRun, setSelectedRun] = useState(0);

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
          console.error("Error fetching XPS data:", err);
          setError("Failed to load XPS data. Please try again later.");
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [work_package, element, test]);

  const downloadTable = (tableId: string, filename: string) => {
    const table = document.getElementById(tableId);
    if (!table) return;

    const rows = table.querySelectorAll("tr");
    let csv = "data:text/csv;charset=utf-8,";

    rows.forEach((row) => {
      const cells = row.querySelectorAll("th, td");
      csv +=
        Array.from(cells)
          .map((c) => `"${(c.textContent ?? "").replace(/"/g, '""')}"`)
          .join(",") + "\r\n";
    });

    const a = document.createElement("a");
    a.href = encodeURI(csv);
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadSpectrumCSV = (runIndex: number) => {
    const run = safeRawData[runIndex];
    if (!run?.spectrum_points?.length) return;

    let csv = "data:text/csv;charset=utf-8,";
    csv += `Binding Energy (${run.binding_energy_unit ?? "eV"}),Intensity (${run.intensity_unit ?? "counts/s"})\r\n`;

    run.spectrum_points.forEach((pt) => {
      csv += `${pt.binding_energy_ev ?? ""},${pt.intensity_counts_per_s ?? ""}\r\n`;
    });

    const a = document.createElement("a");
    a.href = encodeURI(csv);
    a.download = `XPS_${run.metric_name ?? `Run_${runIndex + 1}`}_Spectrum.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const safeRawData = useMemo(
    () => (Array.isArray(data?.raw_data) ? data.raw_data : []),
    [data?.raw_data]
  );

  const safeFinalResults = useMemo(
    () => (Array.isArray(data?.final_results) ? data.final_results : []),
    [data?.final_results]
  );

  const currentRawBlock = useMemo(() => {
    if (!safeRawData.length) return null;
    return safeRawData[selectedRun] || safeRawData[0];
  }, [safeRawData, selectedRun]);

  const currentSpectrumChartData = useMemo(
    () => downsampleSpectrumPoints(currentRawBlock?.spectrum_points),
    [currentRawBlock]
  );

  const atomicPercentageRows = useMemo(() => {
    return safeFinalResults.filter(
      (row) =>
        (row?.spot_label ?? "").trim().toLowerCase() !== "core level" &&
        Array.isArray(row?.electronic_properties) &&
        row.electronic_properties.length > 1
    );
  }, [safeFinalResults]);

  const coreLevelBindingRows = useMemo(() => {
    const dividerIndex = safeFinalResults.findIndex(
      (row) => (row?.spot_label ?? "").trim().toLowerCase() === "core level"
    );

    if (dividerIndex >= 0) {
      return safeFinalResults.filter(
        (row, index) =>
          index > dividerIndex &&
          Array.isArray(row?.electronic_properties) &&
          row.electronic_properties.length >= 1
      );
    }

    return safeFinalResults.filter(
      (row) =>
        Array.isArray(row?.electronic_properties) &&
        row.electronic_properties.length === 1
    );
  }, [safeFinalResults]);

  const finalResultsSampleIdentifier = useMemo(() => {
    return safeFinalResults[0]?.sample_identifier ?? "N/A";
  }, [safeFinalResults]);

  const finalResultsType = useMemo(() => {
    return safeFinalResults[0]?.result_type ?? "N/A";
  }, [safeFinalResults]);

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
                  <span className="font-semibold">ERM Identifier:</span>{" "}
                  {data?.test_details?.material?.erm_id ?? "N/A"}
                </p>
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Information</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2">
                  <span className="font-semibold">Full Test Name:</span>{" "}
                  {data?.test_details?.work_package?.full_test_name ?? "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Test Acronym:</span>{" "}
                  {data?.test_details?.work_package?.test_acronym ?? "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Test Type:</span>{" "}
                  {data?.test_details?.work_package?.test_type ?? "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Endpoint:</span>{" "}
                  {data?.test_details?.work_package?.endpoint ?? "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Endpoint Outcome:</span>{" "}
                  {data?.test_details?.work_package?.endpoint_outcome ?? "N/A"}
                </p>
                <p>
                  <span className="font-semibold">SOP:</span>{" "}
                  {data?.test_details?.work_package?.sop ?? "N/A"}
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
                    <tr><td className="py-2 px-4 border font-medium">X-Ray Source</td><td className="py-2 px-4 border">{data?.test_details?.instrumentation?.xray_source ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Analyser</td><td className="py-2 px-4 border">{data?.test_details?.instrumentation?.analyser ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Pass Energy</td><td className="py-2 px-4 border">{data?.test_details?.instrumentation?.pass_energy ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Take-off Angle</td><td className="py-2 px-4 border">{data?.test_details?.instrumentation?.take_off_angle ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Spot Size</td><td className="py-2 px-4 border">{data?.test_details?.instrumentation?.spot_size ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Charge Neutralizer</td><td className="py-2 px-4 border">{data?.test_details?.instrumentation?.charge_neutralizer ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Vacuum</td><td className="py-2 px-4 border">{data?.test_details?.instrumentation?.vacuum ?? "N/A"}</td></tr>
                    {data?.test_details?.instrumentation?.notes_a && (
                      <tr><td className="py-2 px-4 border font-medium">Notes (A)</td><td className="py-2 px-4 border">{data.test_details.instrumentation.notes_a}</td></tr>
                    )}
                    {data?.test_details?.instrumentation?.notes_b && (
                      <tr><td className="py-2 px-4 border font-medium">Notes (B)</td><td className="py-2 px-4 border">{data.test_details.instrumentation.notes_b}</td></tr>
                    )}
                    {data?.test_details?.instrumentation?.notes_c && (
                      <tr><td className="py-2 px-4 border font-medium">Notes (C)</td><td className="py-2 px-4 border">{data.test_details.instrumentation.notes_c}</td></tr>
                    )}
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
                        data.test_details.work_package.lead_scientists.map((s, i) => (
                          <tr key={i}>
                            <td className="py-2 px-4 border">{s.name ?? "N/A"}</td>
                            <td className="py-2 px-4 border">{s.email ?? "N/A"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={2} className="py-2 px-4 border text-center">No lead scientists available</td></tr>
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
                        data.test_details.work_package.assay_scientists.map((s, i) => (
                          <tr key={i}>
                            <td className="py-2 px-4 border">{s.name ?? "N/A"}</td>
                            <td className="py-2 px-4 border">{s.email ?? "N/A"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={2} className="py-2 px-4 border text-center">No assay scientists available</td></tr>
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
                <span>Download Full CSV</span>
              </button>
            </div>

            {safeRawData.length > 0 ? (
              <>
                <div className="mb-6">
                  <label htmlFor="xps-run-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Select Spectrum:
                  </label>
                  <select
                    id="xps-run-select"
                    value={selectedRun}
                    onChange={(e) => setSelectedRun(Number(e.target.value))}
                    className="w-full md:w-1/2 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
                  >
                    {safeRawData.map((block, index) => (
                      <option key={index} value={index}>
                        {block.metric_name ?? `Spectrum ${index + 1}`} — {block.spectrum_label ?? ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="overflow-x-auto">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-md font-medium">
                      Spectrum Points (First 200 of {currentRawBlock?.point_count ?? 0})
                    </h4>
                    <button
                      onClick={() =>
                        downloadTable(
                          "xpsRawTable",
                          `XPS_${currentRawBlock?.metric_name ?? "Spectrum"}_Points`
                        )
                      }
                      className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition"
                    >
                      <Download size={14} />
                      <span>Download Table</span>
                    </button>
                  </div>
                  <table id="xpsRawTable" className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">
                          Binding Energy ({currentRawBlock?.binding_energy_unit ?? "eV"})
                        </th>
                        <th className="py-2 px-4 border text-left">
                          Intensity ({currentRawBlock?.intensity_unit ?? "counts/s"})
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentRawBlock?.spectrum_points?.length ? (
                        currentRawBlock.spectrum_points.slice(0, 200).map((pt, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                            <td className="py-2 px-4 border">
                              {pt.binding_energy_ev != null ? Number(pt.binding_energy_ev).toFixed(4) : "-"}
                            </td>
                            <td className="py-2 px-4 border">
                              {pt.intensity_counts_per_s != null
                                ? Number(pt.intensity_counts_per_s).toFixed(4)
                                : "-"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={2} className="py-2 px-4 border text-center">No raw spectrum data available</td></tr>
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

            {safeRawData.length > 0 ? (
              <>
                <div className="mb-6">
                  <label htmlFor="xps-processed-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Select Spectrum:
                  </label>
                  <select
                    id="xps-processed-select"
                    value={selectedRun}
                    onChange={(e) => setSelectedRun(Number(e.target.value))}
                    className="w-full md:w-1/2 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
                  >
                    {safeRawData.map((block, index) => (
                      <option key={index} value={index}>
                        {block.metric_name ?? `Spectrum ${index + 1}`} — {block.spectrum_label ?? ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-3">
                    XPS Spectrum — {currentRawBlock?.metric_name ?? ""}
                  </h3>
                  {currentSpectrumChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={420}>
                      <LineChart data={currentSpectrumChartData} margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          type="number"
                          dataKey="x"
                          name="Binding Energy"
                          reversed
                          label={{
                            value: `Binding Energy (${currentRawBlock?.binding_energy_unit ?? "eV"})`,
                            position: "insideBottomRight",
                            offset: -10,
                          }}
                        />
                        <YAxis
                          type="number"
                          dataKey="y"
                          name="Intensity"
                          label={{
                            value: `Intensity (${currentRawBlock?.intensity_unit ?? "counts/s"})`,
                            angle: -90,
                            position: "insideLeft",
                          }}
                        />
                        <Tooltip
                          formatter={(v: any) => [fmt(v, 3), "Intensity"]}
                          labelFormatter={(l) => `BE: ${fmt(l, 3)} eV`}
                        />
                        <Line
                          type="monotone"
                          dataKey="y"
                          stroke="#2563eb"
                          strokeWidth={1.5}
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-gray-500">No spectrum data to chart.</p>
                  )}
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
                onClick={() => downloadTable("xpsAtomicPercentagesTable", "XPS_Results_Atomic_Percentages")}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Surface Atomic Percentages</h3>
              <div className="overflow-x-auto">
                <table id="xpsAtomicPercentagesTable" className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Spot</th>
                      <th className="py-2 px-4 border text-left">C</th>
                      <th className="py-2 px-4 border text-left">O</th>
                      <th className="py-2 px-4 border text-left">Na</th>
                      <th className="py-2 px-4 border text-left">Au</th>
                      <th className="py-2 px-4 border text-left">Si</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atomicPercentageRows.length > 0 ? (
                      atomicPercentageRows.map((row, index) => {
                        const valueMap = (row.electronic_properties ?? []).reduce<Record<string, number | null>>(
                          (acc, item) => {
                            const key = item?.region_label ?? "";
                            if (key) acc[key] = item?.atomic_percent ?? null;
                            return acc;
                          },
                          {}
                        );

                        return (
                          <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                            <td className="py-2 px-4 border">{row.spot_label ?? "N/A"}</td>
                            <td className="py-2 px-4 border">{fmt(valueMap["C"], 2)}</td>
                            <td className="py-2 px-4 border">{fmt(valueMap["O"], 2)}</td>
                            <td className="py-2 px-4 border">{fmt(valueMap["Na"], 2)}</td>
                            <td className="py-2 px-4 border">{fmt(valueMap["Au"], 2)}</td>
                            <td className="py-2 px-4 border">{fmt(valueMap["Si"], 2)}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-2 px-4 border text-center">
                          No atomic percentage data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Core Level Binding Energies</h3>
              <div className="overflow-x-auto">
                <table id="xpsCoreLevelBindingsTable" className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Core Level</th>
                      <th className="py-2 px-4 border text-left">BE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coreLevelBindingRows.length > 0 ? (
                      coreLevelBindingRows.map((row, index) => {
                        const beValue = row.electronic_properties?.[0]?.atomic_percent ?? null;

                        return (
                          <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                            <td className="py-2 px-4 border">{row.spot_label ?? "N/A"}</td>
                            <td className="py-2 px-4 border">{fmt(beValue, 2)}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={2} className="py-2 px-4 border text-center">
                          No core level binding data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default XPSDataViewer;