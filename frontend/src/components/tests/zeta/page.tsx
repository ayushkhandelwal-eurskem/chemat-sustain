"use client";
import React, { FC, useEffect, useState } from "react";
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

// Interfaces
interface PageProps {
  work_package: string;
  element: string;
  test: string;
  file: string;
}

interface Scientist {
  name: string | null;
  email: string | null;
}

interface WorkPackageData {
  wp_name: string | null;
  partner: string | null;
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
  core_chemistry: string | null;
  material_name: string | null;
  material_state: string | null;
  cas: string | null;
  casforcore: string | null;
  batch: string | null;
  preparation_date: string | null;
  particles_stock: string | null;
  molar_concentration: string | null;
}

interface SamplePreparationData {
  dispersion_protocol: string | null;
  dispersion_technique: string | null;
  dispersion_medium: string | null;
  sonicator_type: string | null;
  power: string | null;
  sonication_time: string | null;
  tip_thickness: string | null;
  tip_composition: string | null;
  ultrasonic_bath_size: string | null;
  sample_volume: string | null;
  final_concentration: string | null;
  additional_info: string | null;
}

interface ZetaInstrumentationData {
  instrument_specs: string | null;
  cell_model: string | null;
  temperature: string | null;
  thermal_equilibrium_time: string | null;
  replication: number | null;
  approximation: string | null;
  henry_factor: number | null;
  adjustment_mode: string | null;
  max_voltage: string | null;
  quality: string | null;
  max_number_of_runs: number | null;
  refractive_index_medium: number | null;
  viscosity_medium: string | null;
  relative_permittivity_medium: number | null;
}

interface ReplicationData {
  test_identifier_number: string | null;
  test_start_date: string | null;
  test_end_date: string | null;
}

interface ZetaRawPhase {
  time: number | null;
  phase_measured: number | null;
  phase_fitted: number | null;
  voltage: number | null;
}

interface ZetaRawIntensity {
  time: number | null;
  monitor: number | null;
  detector: number | null;
}

interface ZetaRawParameters {
  processed_runs: number | null;
  filter_optical_density: number | null;
  mean_intensity: number | null;
  adjusted_voltage: number | null;
  transmittance: number | null;
}

interface ZetaRawData {
  run_number: number;
  phase_data: ZetaRawPhase[];
  intensity_data: ZetaRawIntensity[];
  parameters: ZetaRawParameters;
}

interface ZetaDistribution {
  zeta_mv: number | null;
  frequency: number | null;
}

interface ZetaProcessedResults {
  mean_zeta: number | null;
  std_dev: number | null;
  peak_max: number | null;
  mobility: number | null;
  conductivity: number | null;
}

interface ZetaProcessedData {
  run_number: number;
  distribution: ZetaDistribution[];
  results: ZetaProcessedResults;
}

interface ZetaFinalResults {
  mean_zeta: number | null;
  pooled_std_zeta: number | null;
  std_between_zeta: number | null;
  mobility: number | null;
  std_between_mobility: number | null;
  conductivity: number | null;
  std_between_conductivity: number | null;
}

interface ZetaData {
  test_details: {
    work_package: WorkPackageData;
    material: MaterialData;
    sample_preparation: SamplePreparationData;
    instrumentation: ZetaInstrumentationData;
  };
  replication: ReplicationData;
  raw_data: ZetaRawData[];
  processed_data: ZetaProcessedData[];
  final_results: ZetaFinalResults;
}

const ZetaDataViewer: FC<PageProps> = ({ work_package, element, test, file }) => {
  const [data, setData] = useState<ZetaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("test-conditions");
  const [selectedRun, setSelectedRun] = useState(0);

  // Fetch data
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
        const result = response.data;
        console.log("Fetched Zeta data:", result);
        setData(result);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load Zeta data. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [work_package, element, test, file]);

  const downloadTable = (tableId: string, filename: string) => {
    const table = document.getElementById(tableId);
    if (!table) return;

    const rows = table.querySelectorAll("tr");
    let csvContent = "data:text/csv;charset=utf-8,";

    rows.forEach((row) => {
      const cells = row.querySelectorAll("th, td");
      const rowData = Array.from(cells)
        .map((cell) => `"${cell.textContent?.trim() || ""}"`)
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

  return (
    <div className="bg-gray-50 min-h-screen py-8 text-black">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-4">
            Zeta Potential Test Data Report
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Parameters</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2">
                  <span className="font-semibold">Work Package:</span>{" "}
                  {work_package || "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">CMS Internal Identifier:</span> {element || "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">ERM Identifier:</span>{" "}
                  {data.test_details.material.erm_id || "N/A"}
                </p>
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Information</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2">
                  <span className="font-semibold">Full Test Name:</span>{" "}
                  {data.test_details.work_package.full_test_name || "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Test Acronym:</span>{" "}
                  {data.test_details.work_package.test_acronym || "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Test Type:</span>{" "}
                  {data.test_details.work_package.test_type || "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Endpoint:</span>{" "}
                  {data.test_details.work_package.endpoint || "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Endpoint Outcome:</span>{" "}
                  {data.test_details.work_package.endpoint_outcome || "N/A"}
                </p>
                <p>
                  <span className="font-semibold">SOP:</span>{" "}
                  {data.test_details.work_package.sop || "N/A"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="w-full mb-8">
          <ul
            className="relative flex flex-wrap p-1.5 list-none rounded-md bg-slate-100"
            role="list"
          >
            {["test-conditions", "raw-data", "processed-data", "results"].map(
              (tab) => (
                <li key={tab} className="z-30 flex-auto text-center">
                  <a
                    className={`z-30 flex items-center justify-center w-full px-0 py-2 text-sm mb-0 transition-all ease-in-out border-0 rounded-md cursor-pointer ${activeTab === tab
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-slate-600 bg-inherit"
                      }`}
                    onClick={() => setActiveTab(tab)}
                    role="tab"
                    aria-selected={activeTab === tab}
                  >
                    {tab === "test-conditions"
                      ? "Test Conditions"
                      : tab === "raw-data"
                        ? "Raw Data"
                        : tab === "processed-data"
                          ? "Processed Data"
                          : "Final Results"}
                  </a>
                </li>
              )
            )}
          </ul>
        </div>

        {/* Test Conditions Tab */}
        {activeTab === "test-conditions" && (
          <>
            {/* Material Information */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-blue-800">
                  Material Information
                </h2>
                <button
                  onClick={() => downloadTable("materialTable", "Material_Info")}
                  className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  <Download size={16} />
                  <span>Download</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table
                  id="materialTable"
                  className="min-w-full bg-white border border-gray-200"
                >
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Property</th>
                      <th className="py-2 px-4 border text-left">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2 px-4 border font-medium">CMS Internal Identifier</td>
                      <td className="py-2 px-4 border">{element}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">ERM Identifier</td>
                      <td className="py-2 px-4 border">{data.test_details.material.erm_id}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Material Name</td>
                      <td className="py-2 px-4 border">{data.test_details.material.material_name}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Core Chemistry</td>
                      <td className="py-2 px-4 border">{data.test_details.material.core_chemistry}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Material State</td>
                      <td className="py-2 px-4 border">{data.test_details.material.material_state}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">CAS No</td>
                      <td className="py-2 px-4 border">{data.test_details.material.cas}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">CAS for Core</td>
                      <td className="py-2 px-4 border">{data.test_details.material.casforcore}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Batch</td>
                      <td className="py-2 px-4 border">{data.test_details.material.batch}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Batch Preparation Date</td>
                      <td className="py-2 px-4 border">
                        {String(data?.test_details?.material?.preparation_date ?? "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Molar Concentration</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.material.molar_concentration || "N/A"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sample Preparation */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-blue-800">
                  Sample Preparation
                </h2>
                <button
                  onClick={() =>
                    downloadTable("samplePrepTable", "Sample_Preparation")
                  }
                  className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  <Download size={16} />
                  <span>Download</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table
                  id="samplePrepTable"
                  className="min-w-full bg-white border border-gray-200"
                >
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Property</th>
                      <th className="py-2 px-4 border text-left">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Dispersion protocol used</td>
                      <td className="py-2 px-4 border">{data.test_details.sample_preparation.dispersion_protocol}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Dispersion technique used</td>
                      <td className="py-2 px-4 border">{data.test_details.sample_preparation.dispersion_technique}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Dispersion/Dilution medium</td>
                      <td className="py-2 px-4 border">{data.test_details.sample_preparation.dispersion_medium}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Sonicator type</td>
                      <td className="py-2 px-4 border">{data.test_details.sample_preparation.sonicator_type}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Power(W)</td>
                      <td className="py-2 px-4 border">{data.test_details.sample_preparation.power}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Sonication time(secs)</td>
                      <td className="py-2 px-4 border">{data.test_details.sample_preparation.sonication_time}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Tip thickness(mm)</td>
                      <td className="py-2 px-4 border">{data.test_details.sample_preparation.tip_thickness}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Tip composition</td>
                      <td className="py-2 px-4 border">{data.test_details.sample_preparation.tip_composition}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Size of ultrasonic bath/water volume (dm3)</td>
                      <td className="py-2 px-4 border">{data.test_details.sample_preparation.ultrasonic_bath_size}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Sample volume</td>
                      <td className="py-2 px-4 border">{data.test_details.sample_preparation.sample_volume}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Final sample concentration (mg/L or ppm)</td>
                      <td className="py-2 px-4 border">{data.test_details.sample_preparation.final_concentration}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Additional information</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.sample_preparation.additional_info || "N/A"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Instrumentation */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-blue-800">
                  Instrumentation
                </h2>
                <button
                  onClick={() =>
                    downloadTable("instrumentationTable", "Instrumentation")
                  }
                  className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  <Download size={16} />
                  <span>Download</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table
                  id="instrumentationTable"
                  className="min-w-full bg-white border border-gray-200"
                >
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Property</th>
                      <th className="py-2 px-4 border text-left">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Zeta Instrument Specifications</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.instrument_specs || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Cell Model</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.cell_model || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Temperature</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.temperature || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Thermal Equilibrium Time</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.thermal_equilibrium_time || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Replication</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.replication ?? "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Approximation</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.approximation || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Henry Factor</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.henry_factor?.toFixed(4) ?? "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Adjustment Mode</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.adjustment_mode || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Max. Voltage</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.max_voltage || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Quality</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.quality || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Max Number of Runs</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.max_number_of_runs ?? "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Refractive Index of the Medium</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.refractive_index_medium?.toFixed(4) ?? "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Viscosity of the Medium</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.viscosity_medium || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Relative Permittivity of the Medium</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.relative_permittivity_medium?.toFixed(4) ?? "N/A"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Scientists Information */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-blue-800">
                  Scientists Information
                </h2>
                <button
                  onClick={() =>
                    downloadTable("scientistsTable", "Scientists_Info")
                  }
                  className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  <Download size={16} />
                  <span>Download</span>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-semibold mb-3">
                    Lead Scientists
                  </h3>
                  <table
                    id="scientistsTable"
                    className="min-w-full bg-white border border-gray-200"
                  >
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Name</th>
                        <th className="py-2 px-4 border text-left">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.test_details.work_package.lead_scientists.length > 0 ? (
                        data.test_details.work_package.lead_scientists.map((scientist, index) => (
                          <tr key={index}>
                            <td className="py-2 px-4 border">{scientist.name ?? "N/A"}</td>
                            <td className="py-2 px-4 border">{scientist.email ?? "N/A"}</td>
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
                  <h3 className="text-lg font-semibold mb-3">
                    Assay Scientists
                  </h3>
                  <table className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Name</th>
                        <th className="py-2 px-4 border text-left">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.test_details.work_package.assay_scientists.length > 0 ? (
                        data.test_details.work_package.assay_scientists.map((scientist, index) => (
                          <tr key={index}>
                            <td className="py-2 px-4 border">{scientist.name ?? "N/A"}</td>
                            <td className="py-2 px-4 border">{scientist.email ?? "N/A"}</td>
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
            </div>
          </>
        )}

        {/* Raw Data Tab */}
        {activeTab === "raw-data" && data.raw_data && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">Raw Data</h2>
              <button
                onClick={() =>
                  downloadTable("rawDataTable", `Run_${selectedRun + 1}_correlation_data`)
                }
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            <div className="mb-6">
              <label
                htmlFor="run-select"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Select Run:
              </label>
              <select
                id="run-select"
                value={selectedRun}
                onChange={(e) => setSelectedRun(Number(e.target.value))}
                className="w-full md:w-1/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
              >
                {data.raw_data.map((run, index) => (
                  <option key={index} value={index}>
                    Run {run.run_number || "N/A"}
                  </option>
                ))}
              </select>
            </div>

            {/* Phase Plot */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Phase Plot - Run {selectedRun + 1}</h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart
                  data={data.raw_data[selectedRun]?.phase_data || []}
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="time"
                    label={{ value: "Time [s]", position: "insideBottom", offset: -10 }}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    yAxisId="left"
                    label={{ value: "Phase [rad]", angle: -90, position: "insideLeft", offset: -10 }}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    label={{ value: "Voltage [V]", angle: 90, position: "insideRight", offset: 10 }}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: number) => value.toFixed(4)}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="phase_measured"
                    stroke="#8884d8"
                    name="Measured"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="phase_fitted"
                    stroke="#82ca9d"
                    name="Fitted"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="voltage"
                    stroke="#ffc658"
                    name="Voltage"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Intensity Traces Plot */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Intensity Traces - Run {selectedRun + 1}</h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart
                  data={data.raw_data[selectedRun]?.intensity_data || []}
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="time"
                    label={{ value: "Time [s]", position: "insideBottom", offset: -10 }}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    yAxisId="left"
                    label={{ value: "Monitor [a.u.]", angle: -90, position: "insideLeft", offset: -10 }}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    label={{ value: "Detector [kcps]", angle: 90, position: "insideRight", offset: 10 }}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: number) => value.toFixed(1)}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="monitor"
                    stroke="#8884d8"
                    name="Monitor"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="detector"
                    stroke="#82ca9d"
                    name="Detector"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Raw Parameters Table */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Raw Parameters - Run {selectedRun + 1}</h3>
              <table className="min-w-full bg-white border border-gray-200">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-2 px-4 border text-left">Parameter</th>
                    <th className="py-2 px-4 border text-left">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 px-4 border">Processed Runs</td>
                    <td className="py-2 px-4 border">{data.raw_data[selectedRun]?.parameters.processed_runs ?? "N/A"}</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="py-2 px-4 border">Filter Optical Density</td>
                    <td className="py-2 px-4 border">{data.raw_data[selectedRun]?.parameters.filter_optical_density?.toFixed(4) ?? "N/A"}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-4 border">Mean Intensity [kcounts/s]</td>
                    <td className="py-2 px-4 border">{data.raw_data[selectedRun]?.parameters.mean_intensity?.toFixed(4) ?? "N/A"}</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="py-2 px-4 border">Adjusted Voltage [V]</td>
                    <td className="py-2 px-4 border">{data.raw_data[selectedRun]?.parameters.adjusted_voltage?.toFixed(1) ?? "N/A"}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-4 border">Transmittance [%]</td>
                    <td className="py-2 px-4 border">{data.raw_data[selectedRun]?.parameters.transmittance?.toFixed(4) ?? "N/A"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Raw Phase Table */}
            <div className="overflow-x-auto mb-8">
              <h3 className="text-lg font-semibold mb-3">Raw Phase Data - Run {selectedRun + 1}</h3>
              <table id={`rawPhaseTable${selectedRun}`} className="min-w-full bg-white border border-gray-200">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-2 px-4 border text-left">Time [s]</th>
                    <th className="py-2 px-4 border text-left">Phase Measured [rad]</th>
                    <th className="py-2 px-4 border text-left">Phase Fitted [rad]</th>
                    <th className="py-2 px-4 border text-left">Voltage [V]</th>
                  </tr>
                </thead>
                <tbody>
                  {data.raw_data[selectedRun]?.phase_data?.length > 0 ? (
                    data.raw_data[selectedRun].phase_data.map((phase, index) => (
                      <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                        <td className="py-2 px-4 border">{phase.time?.toFixed(4) ?? "-"}</td>
                        <td className="py-2 px-4 border">{phase.phase_measured?.toFixed(4) ?? "-"}</td>
                        <td className="py-2 px-4 border">{phase.phase_fitted?.toFixed(4) ?? "-"}</td>
                        <td className="py-2 px-4 border">{phase.voltage?.toFixed(4) ?? "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-2 px-4 border text-center">
                        No phase data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Raw Intensity Table */}
            <div className="overflow-x-auto">
              <h3 className="text-lg font-semibold mb-3">Raw Intensity Data - Run {selectedRun + 1}</h3>
              <table className="min-w-full bg-white border border-gray-200">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-2 px-4 border text-left">Time [s]</th>
                    <th className="py-2 px-4 border text-left">Monitor [a.u.]</th>
                    <th className="py-2 px-4 border text-left">Detector [kcps]</th>
                  </tr>
                </thead>
                <tbody>
                  {data.raw_data[selectedRun]?.intensity_data?.length > 0 ? (
                    data.raw_data[selectedRun].intensity_data.map((intensity, index) => (
                      <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                        <td className="py-2 px-4 border">{intensity.time?.toFixed(4) ?? "-"}</td>
                        <td className="py-2 px-4 border">{intensity.monitor ?? "-"}</td>
                        <td className="py-2 px-4 border">{intensity.detector ?? "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-2 px-4 border text-center">
                        No intensity data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Processed Data Tab */}
        {activeTab === "processed-data" && data.processed_data && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">Processed Data</h2>
              <button
                onClick={() =>
                  downloadTable("rawDataTable", `Run_${selectedRun + 1}_correlation_data`)
                }
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            <div className="mb-6">
              <label
                htmlFor="run-select"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Select Run:
              </label>
              <select
                id="run-select"
                value={selectedRun}
                onChange={(e) => setSelectedRun(Number(e.target.value))}
                className="w-full md:w-1/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
              >
                {data.raw_data.map((run, index) => (
                  <option key={index} value={index}>
                    Run {run.run_number || "N/A"}
                  </option>
                ))}
              </select>
            </div>

            {/* Zeta Potential Distribution Plot */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Zeta Potential Distribution - Run {selectedRun + 1}</h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart
                  data={data.processed_data[selectedRun]?.distribution }
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="zeta_mv"
                    label={{ value: "Zeta Potential [mV]", position: "insideBottom", offset: -10 }}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    label={{ value: "Relative Frequency [%]", angle: -90, position: "insideLeft", offset: -10 }}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: number) => value.toFixed(4)}
                    labelFormatter={(label: number) => `Zeta: ${label.toFixed(4)} mV`}
                  />
                  <Line
                    type="monotone"
                    dataKey="frequency"
                    stroke="#82ca9d"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Processed Results Table */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Processed Results - Run {selectedRun + 1}</h3>
              <table className="min-w-full bg-white border border-gray-200">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-2 px-4 border text-left">Metric</th>
                    <th className="py-2 px-4 border text-left">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 px-4 border">Mean Zeta Potential [mV]</td>
                    <td className="py-2 px-4 border">{data.processed_data[selectedRun]?.results.mean_zeta?.toFixed(4) ?? "N/A"}</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="py-2 px-4 border">Standard Deviation [mV]</td>
                    <td className="py-2 px-4 border">{data.processed_data[selectedRun]?.results.std_dev?.toFixed(4) ?? "N/A"}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-4 border">Zeta Potential Peak Max [mV]</td>
                    <td className="py-2 px-4 border">{data.processed_data[selectedRun]?.results.peak_max?.toFixed(4) ?? "N/A"}</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="py-2 px-4 border">Electrophoretic Mobility [μm·cm/Vs]</td>
                    <td className="py-2 px-4 border">{data.processed_data[selectedRun]?.results.mobility?.toFixed(4) ?? "N/A"}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-4 border">Conductivity [mS/cm]</td>
                    <td className="py-2 px-4 border">{data.processed_data[selectedRun]?.results.conductivity?.toFixed(4) ?? "N/A"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Distribution Table */}
            <div className="overflow-x-auto">
              <h3 className="text-lg font-semibold mb-3">Zeta Potential Distribution - Run {selectedRun + 1}</h3>
              <table id={`processedDataTable${selectedRun}`} className="min-w-full bg-white border border-gray-200">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-2 px-4 border text-left">Zeta Potential [mV]</th>
                    <th className="py-2 px-4 border text-left">Relative Frequency [%]</th>
                  </tr>
                </thead>
                <tbody>
                  {data.processed_data[selectedRun]?.distribution?.length > 0 ? (
                    data.processed_data[selectedRun].distribution.map((dist, index) => (
                      <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                        <td className="py-2 px-4 border">{dist.zeta_mv?.toFixed(4) ?? "-"}</td>
                        <td className="py-2 px-4 border">{dist.frequency?.toFixed(4) ?? "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="py-2 px-4 border text-center">
                        No distribution data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Results Tab */}
        {activeTab === "results" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">Zeta Potential Results</h2>
              <button
                onClick={() => downloadTable("resultsTable", "Zeta_Results")}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            {/* Final Results */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Final Results</h3>
              <div className="overflow-x-auto">
                <table id="resultsTable" className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Metric</th>
                      <th className="py-2 px-4 border text-left">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2 px-4 border">Mean Zeta Potential [mV]</td>
                      <td className="py-2 px-4 border">{data.final_results.mean_zeta?.toFixed(4) ?? "N/A"}</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="py-2 px-4 border">Pooled Standard Deviation Mean Zeta Potential [mV]</td>
                      <td className="py-2 px-4 border">{data.final_results.pooled_std_zeta?.toFixed(4) ?? "N/A"}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border">Standard Deviation Between Measurements Mean Zeta Potential [mV]</td>
                      <td className="py-2 px-4 border">{data.final_results.std_between_zeta?.toFixed(4) ?? "N/A"}</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="py-2 px-4 border">Electrophoretic Mobility [μm·cm/Vs]</td>
                      <td className="py-2 px-4 border">{data.final_results.mobility?.toFixed(4) ?? "N/A"}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border">Standard Deviation Between Measurements Electrophoretic Mobility [μm·cm/Vs]</td>
                      <td className="py-2 px-4 border">{data.final_results.std_between_mobility?.toFixed(4) ?? "N/A"}</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="py-2 px-4 border">Conductivity [mS/cm]</td>
                      <td className="py-2 px-4 border">{data.final_results.conductivity?.toFixed(4) ?? "N/A"}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border">Standard Deviation Between Measurements Conductivity [mS/cm]</td>
                      <td className="py-2 px-4 border">{data.final_results.std_between_conductivity?.toFixed(4) ?? "N/A"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Per Run Results */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Per Run Results</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Run</th>
                      <th className="py-2 px-4 border text-left">Mean Zeta [mV]</th>
                      <th className="py-2 px-4 border text-left">Std Dev [mV]</th>
                      <th className="py-2 px-4 border text-left">Peak Max [mV]</th>
                      <th className="py-2 px-4 border text-left">Mobility [μm·cm/Vs]</th>
                      <th className="py-2 px-4 border text-left">Conductivity [mS/cm]</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.processed_data?.length > 0 ? (
                      data.processed_data.map((proc, index) => (
                        <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                          <td className="py-2 px-4 border">{proc.run_number}</td>
                          <td className="py-2 px-4 border">{proc.results.mean_zeta?.toFixed(4) ?? "N/A"}</td>
                          <td className="py-2 px-4 border">{proc.results.std_dev?.toFixed(4) ?? "N/A"}</td>
                          <td className="py-2 px-4 border">{proc.results.peak_max?.toFixed(4) ?? "N/A"}</td>
                          <td className="py-2 px-4 border">{proc.results.mobility?.toFixed(4) ?? "N/A"}</td>
                          <td className="py-2 px-4 border">{proc.results.conductivity?.toFixed(4) ?? "N/A"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-2 px-4 border text-center">
                          No per run results available
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

export default ZetaDataViewer;