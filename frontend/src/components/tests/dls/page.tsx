"use client";
import React, { FC, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/axios";
import { Download } from "lucide-react";
import {
  ScatterChart,
  Scatter,
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

interface CorrelationData {
  time_us: number[];
  correlation_coefficient: number[];
}

interface SizeDistributionData {
  size_nm: number[];
  mean_intensity_percent: number[];
}

interface ReplicationData {
  test_identifier_number: string;
  test_start_date: string | null;
  test_end_date: string | null;
}

interface RunMetrics {
  z_ave_hydrodynamic_diameter: number | null;
  pdi: number | null;
  peak_1_diameter: number | null;
  peak_1_std_dev: number | null;
  peak_1_intensity: number | null;
  peak_2_diameter: number | null;
  peak_2_std_dev: number | null;
  peak_2_intensity: number | null;
  peak_3_diameter: number | null;
  peak_3_std_dev: number | null;
  peak_3_intensity: number | null;
  derived_count_rate: number | null;
}

interface ProcessedData {
  run_number: number;
  size_distribution: SizeDistributionData;
  metrics: RunMetrics;
}

interface DLSData {
  test_details: {
    work_package: {
      wp_name: string | null;
      partner: string | null;
      full_test_name: string | null;
      test_acronym: string | null;
      test_type: string | null;
      endpoint: string | null;
      sop: string | null;
      path: string | null;
      lead_scientists: { name: string | null; email: string | null }[];
      assay_scientists: { name: string | null; email: string | null }[];
    };
    material: {
      material_identifier: string | null;
      erm_id: string | null;
      core_chemistry: string | null;
      material_name: string | null;
      material_state: string | null;
      batch: string | null;
      preparation_date: string | null;
      particles_stock: string | null;
      molar_concentration: string | null;
    };
    sample_preparation: {
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
    };
    instrumentation: {
      instrument_model: string | null;
      cell_model: string | null;
      temperature: string | null;
      thermal_equilibrium_time: string | null;
      number_of_runs: number | null;
      sub_runs: string | null;
      delay_between_runs: string | null;
      run_duration: string | null;
      laser_focus_position: string | null;
      scattering_angle: string | null;
      data_analysis_model: string | null;
      laser_attenuation: string | null;
      refractive_index_nm: number | null;
      absorption_index_nm: number | null;
      refractive_index_medium: number | null;
      viscosity_medium: string | null;
    };
  };
  raw_data: {
    run_number: number;
    replication: ReplicationData;
    correlation_data: CorrelationData;
    processed_data: ProcessedData;
  }[];
  processed_data: ProcessedData[];
  final_results: {
    z_ave_hydrodynamic_diameter: number | null;
    uncertainty_hydrodynamic_diameter: number | null;
    pdi: number | null;
    uncertainty_pdi: number | null;
    mean_peak_1_diameter: number | null;
    pooled_std_dev_peak_1: number | null;
    std_dev_between_measurements_peak_1: number | null;
    mean_peak_1_intensity: number | null;
    mean_peak_2_diameter: number | null;
    pooled_std_dev_peak_2: number | null;
    std_dev_between_measurements_peak_2: number | null;
    mean_peak_2_intensity: number | null;
    mean_peak_3_diameter: number | null;
    pooled_std_dev_peak_3: number | null;
    std_dev_between_measurements_peak_3: number | null;
    mean_peak_3_intensity: number | null;
    derived_count_rate: number | null;
    statistic_table: {
      size_nm: number;
      mean_intensity_percent: number;
      std_dev: number;
    }[];
  };
}

type Point = { x: number; y: number };

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

function mapRunToPoints(run: DLSData["raw_data"][0]): {
  correlationPoints: Point[];
  sizeDistributionPoints: Point[];
} {
  const corr = run?.correlation_data ?? { time_us: [], correlation_coefficient: [] };
  const correlationPoints: Point[] =
    Array.isArray(corr.time_us) && Array.isArray(corr.correlation_coefficient)
      ? corr.time_us.map((t, i) => ({
        x: t,
        y: corr.correlation_coefficient[i] ?? 0,
      }))
      : [];

  const sd = run?.processed_data?.size_distribution ?? { size_nm: [], mean_intensity_percent: [] };
  const sizeDistributionPoints: Point[] =
    Array.isArray(sd.size_nm) && Array.isArray(sd.mean_intensity_percent)
      ? sd.size_nm.map((s, i) => ({
        x: s,
        y: sd.mean_intensity_percent[i] ?? 0,
      }))
      : [];

  return { correlationPoints, sizeDistributionPoints };
}

const DLSDataViewer: FC<PageProps> = ({ work_package, element, test, file }) => {
  const [data, setData] = useState<DLSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("test-conditions");
  const [selectedRun, setSelectedRun] = useState(0);
  const [correlationPoints, setCorrelationPoints] = useState<Point[]>([]);
  const [sizeDistributionPoints, setSizeDistributionPoints] = useState<Point[]>([]);

  // Fetch data and initialize plots
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
        console.log("Fetched DLS data:", result);
        setData(result);

        if (result?.raw_data?.length > 0) {
          const { correlationPoints, sizeDistributionPoints } = mapRunToPoints(
            result.raw_data[0]
          );
          setCorrelationPoints(correlationPoints);
          setSizeDistributionPoints(sizeDistributionPoints);
        } else {
          console.warn("No raw data available, setting empty points");
          setCorrelationPoints([]);
          setSizeDistributionPoints([]);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load DLS data. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [work_package, element, test, file]);

  // Update plots when selected run changes
  useEffect(() => {
    if (!data?.raw_data?.length) {
      setCorrelationPoints([]);
      setSizeDistributionPoints([]);
      return;
    }
    const run = data.raw_data[selectedRun] || data.raw_data[0];
    const { correlationPoints, sizeDistributionPoints } = mapRunToPoints(run);
    setCorrelationPoints(correlationPoints);
    setSizeDistributionPoints(sizeDistributionPoints);
  }, [selectedRun, data]);

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
            DLS Test Data Report
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
                  <span className="font-semibold">Element:</span> {element || "N/A"}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Test:</span> {test || "N/A"}
                </p>
                <p>
                  <span className="font-semibold">File:</span> {file || "N/A"}
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
                  <span className="font-semibold">ERM Identifier:</span>{" "}
                  {data.test_details.material.erm_id || "N/A"}
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
                    {Object.entries(data.test_details.material).map(([key, value]) => (
                      <tr key={key}>
                        <td className="py-2 px-4 border font-medium">
                          {key
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase())}
                        </td>
                        <td className="py-2 px-4 border">
                          {key === "preparation_date" && value
                            ? new Date(value).toLocaleDateString()
                            : value || "N/A"}
                        </td>
                      </tr>
                    ))}
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
                    {Object.entries(data.test_details.sample_preparation).map(([key, value]) => (
                      <tr key={key}>
                        <td className="py-2 px-4 border font-medium">
                          {key
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase())}
                        </td>
                        <td className="py-2 px-4 border">{value || "N/A"}</td>
                      </tr>
                    ))}
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
                    {Object.entries(data.test_details.instrumentation).map(([key, value]) => (
                      <tr key={key}>
                        <td className="py-2 px-4 border font-medium">
                          {key
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase())}
                        </td>
                        <td className="py-2 px-4 border">{value ?? "N/A"}</td>
                      </tr>
                    ))}
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

            {data.raw_data.length > 0 ? (
              <>
                <div className="mb-6">
                  <label
                    htmlFor="run-select"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Select Replication:
                  </label>
                  <select
                    id="run-select"
                    value={selectedRun}
                    onChange={(e) => setSelectedRun(Number(e.target.value))}
                    className="w-full md:w-1/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
                  >
                    {data.raw_data.map((run, index) => (
                      <option key={index} value={index}>
                        Replication {run.run_number || "N/A"}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Correlation Function Plot */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-3">
                    Correlation Function
                  </h3>
                  <ResponsiveContainer width="100%" height={400}>
                    <ScatterChart
                      margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                    >
                      <CartesianGrid />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Time (μs)"
                        label={{
                          value: "Time (μs)",
                          position: "insideBottomRight",
                          offset: -10,
                        }}
                        domain={["auto", "auto"]}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="Correlation Coefficient"
                        label={{
                          value: "Correlation Coefficient",
                          angle: -90,
                          position: "insideLeft",
                        }}
                        domain={[0, 1]}
                      />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                      <Scatter
                        name="Correlation"
                        data={correlationPoints}
                        fill="#8884d8"
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>

                {/* Raw Data Table */}
                <div className="overflow-x-auto">
                  <table
                    id="rawDataTable"
                    className="min-w-full bg-white border border-gray-200"
                  >
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Time (μs)</th>
                        <th className="py-2 px-4 border text-left">
                          Correlation Coefficient
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.raw_data[selectedRun]?.correlation_data?.time_us?.length > 0 ? (
                        data.raw_data[selectedRun].correlation_data.time_us.map(
                          (time, index) => (
                            <tr
                              key={index}
                              className={index % 2 === 0 ? "bg-gray-50" : ""}
                            >
                              <td className="py-2 px-4 border">
                                {time?.toFixed(2) ?? "-"}
                              </td>
                              <td className="py-2 px-4 border">
                                {data.raw_data[selectedRun].correlation_data
                                  .correlation_coefficient[index]?.toFixed(4) ?? "-"}
                              </td>
                            </tr>
                          )
                        )
                      ) : (
                        <tr>
                          <td colSpan={2} className="py-2 px-4 border text-center">
                            No correlation data available
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-center text-gray-600">
                No raw data available
              </div>
            )}
          </div>
        )}

        {/* Processed Data Tab */}
        {activeTab === "processed-data" && data.processed_data && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">Processed Data</h2>
              <button
                onClick={() =>
                  downloadTable(
                    "processedDataTable",
                    `Run_${selectedRun + 1}_Processed_Data`
                  )
                }
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            {data.processed_data.length > 0 ? (
              <>
                <div className="mb-6">
                  <label
                    htmlFor="run-select-processed"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Select Run:
                  </label>
                  <select
                    id="run-select-processed"
                    value={selectedRun}
                    onChange={(e) => setSelectedRun(Number(e.target.value))}
                    className="w-full md:w-1/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
                  >
                    {data.processed_data.map((run, index) => (
                      <option key={index} value={index}>
                        Run {run.run_number}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Run Metrics */}
                <div className="mb-6 bg-blue-50 p-4 rounded-md">
                  <h3 className="text-lg font-semibold mb-3">
                    Results for Run {data.processed_data[selectedRun]?.run_number}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="font-semibold">Z-Average Diameter:</p>
                      <p>
                        {data.processed_data[selectedRun]?.metrics?.z_ave_hydrodynamic_diameter?.toFixed(2) ?? "N/A"} nm
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold">PDI:</p>
                      <p>
                        {data.processed_data[selectedRun]?.metrics?.pdi?.toFixed(3) ?? "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold">Derived Count Rate:</p>
                      <p>
                        {data.processed_data[selectedRun]?.metrics?.derived_count_rate?.toFixed(2) ?? "N/A"} kcps
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold">Peak 1 Diameter by Intensity:</p>
                      <p>
                        {data.processed_data[selectedRun]?.metrics?.peak_1_diameter?.toFixed(2) ?? "N/A"} nm
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold">Standard Deviation Peak 1:</p>
                      <p>
                        {data.processed_data[selectedRun]?.metrics?.peak_1_std_dev?.toFixed(2) ?? "N/A"} nm
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold">Peak 1 Relative Intensity:</p>
                      <p>
                        {data.processed_data[selectedRun]?.metrics?.peak_1_intensity?.toFixed(2) ?? "N/A"} %
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold">Peak 2 Diameter by Intensity:</p>
                      <p>
                        {data.processed_data[selectedRun]?.metrics?.peak_2_diameter?.toFixed(2) ?? "N/A"} nm
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold">Standard Deviation Peak 2:</p>
                      <p>
                        {data.processed_data[selectedRun]?.metrics?.peak_2_std_dev?.toFixed(2) ?? "N/A"} nm
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold">Peak 2 Relative Intensity:</p>
                      <p>
                        {data.processed_data[selectedRun]?.metrics?.peak_2_intensity?.toFixed(2) ?? "N/A"} %
                      </p>
                    </div>
                  </div>
                </div>

                {/* Size Distribution Plot */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-3">Size Distribution</h3>
                  <ResponsiveContainer width="100%" height={400}>
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Size (nm)"
                        label={{
                          value: "Size (nm)",
                          position: "insideBottomRight",
                          offset: -10,
                        }}
                        domain={["auto", "auto"]}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="Intensity (%)"
                        label={{
                          value: "Intensity (%)",
                          angle: -90,
                          position: "insideLeft",
                        }}
                        domain={[0, "auto"]}
                      />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                      <Scatter
                        name="Size Distribution"
                        data={
                          data.processed_data[selectedRun]?.size_distribution?.size_nm?.map(
                            (size, i) => ({
                              x: size,
                              y: data.processed_data[selectedRun]?.size_distribution?.mean_intensity_percent[i] ?? 0,
                            })
                          ) ?? []
                        }
                        fill="#82ca9d"
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>

                {/* Size Distribution Table */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-3">
                    Size Distribution Data
                  </h3>
                  <div className="overflow-x-auto">
                    <table
                      id="processedDataTable"
                      className="min-w-full bg-white border border-gray-200"
                    >
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="py-2 px-4 border text-left">Size (nm)</th>
                          <th className="py-2 px-4 border text-left">Intensity (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.processed_data[selectedRun]?.size_distribution?.size_nm?.length > 0 ? (
                          data.processed_data[selectedRun].size_distribution.size_nm.map(
                            (size, index) => (
                              <tr
                                key={index}
                                className={index % 2 === 0 ? "bg-gray-50" : ""}
                              >
                                <td className="py-2 px-4 border">
                                  {size?.toFixed(2) ?? "-"}
                                </td>
                                <td className="py-2 px-4 border">
                                  {data.processed_data[selectedRun].size_distribution
                                    .mean_intensity_percent[index]?.toFixed(2) ?? "-"}
                                </td>
                              </tr>
                            )
                          )
                        ) : (
                          <tr>
                            <td colSpan={2} className="py-2 px-4 border text-center">
                              No size distribution data available
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-gray-600">
                No processed data available
              </div>
            )}
          </div>
        )}


        {/* Results Tab */}
        {activeTab === "results" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">DLS Results</h2>
              <button
                onClick={() => downloadTable("resultsTable", "DLS_Results")}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            {/* Summary Metrics */}
            <div className="mb-6 bg-blue-50 p-4 rounded-md">
              <h3 className="text-lg font-semibold mb-3">Final Results</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="font-semibold">Z-Average Diameter:</p>
                  <p>
                    {data.final_results.z_ave_hydrodynamic_diameter?.toFixed(2) ?? "N/A"} ±{" "}
                    {data.final_results.uncertainty_hydrodynamic_diameter?.toFixed(2) ?? "N/A"} nm
                  </p>
                </div>
                <div>
                  <p className="font-semibold">PDI:</p>
                  <p>
                    {data.final_results.pdi?.toFixed(3) ?? "N/A"} ±{" "}
                    {data.final_results.uncertainty_pdi?.toFixed(3) ?? "N/A"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Derived Count Rate:</p>
                  <p>{data.final_results.derived_count_rate?.toFixed(2) ?? "N/A"} kcps</p>
                </div>
                <div>
                  <p className="font-semibold">Mean Peak 1 Diameter by Intensity:</p>
                  <p>{data.final_results.mean_peak_1_diameter?.toFixed(2) ?? "N/A"} nm</p>
                </div>
                <div>
                  <p className="font-semibold">Pooled Standard Deviation Peak 1:</p>
                  <p>{data.final_results.pooled_std_dev_peak_1?.toFixed(2) ?? "N/A"} nm</p>
                </div>
                <div>
                  <p className="font-semibold">Standard Deviation Between Measurements Peak 1:</p>
                  <p>{data.final_results.std_dev_between_measurements_peak_1?.toFixed(2) ?? "N/A"} nm</p>
                </div>
                <div>
                  <p className="font-semibold">Mean Peak 1 Relative Intensity:</p>
                  <p>{data.final_results.mean_peak_1_intensity?.toFixed(2) ?? "N/A"} %</p>
                </div>
                <div>
                  <p className="font-semibold">Mean Peak 2 Diameter by Intensity:</p>
                  <p>{data.final_results.mean_peak_2_diameter?.toFixed(2) ?? "N/A"} nm</p>
                </div>
                <div>
                  <p className="font-semibold">Pooled Standard Deviation Peak 2:</p>
                  <p>{data.final_results.pooled_std_dev_peak_2?.toFixed(2) ?? "N/A"} nm</p>
                </div>
                <div>
                  <p className="font-semibold">Standard Deviation Between Measurements Peak 2:</p>
                  <p>{data.final_results.std_dev_between_measurements_peak_2?.toFixed(2) ?? "N/A"} nm</p>
                </div>
                <div>
                  <p className="font-semibold">Mean Peak 2 Relative Intensity:</p>
                  <p>{data.final_results.mean_peak_2_intensity?.toFixed(2) ?? "N/A"} %</p>
                </div>
              </div>
            </div>

            {/* Statistic Table */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Statistic Table</h3>
              <div className="overflow-x-auto">
                <table id="resultsTable" className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Size (nm)</th>
                      <th className="py-2 px-4 border text-left">Mean Intensity (%)</th>
                      <th className="py-2 px-4 border text-left">Std Dev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.final_results.statistic_table?.length > 0 ? (
                      data.final_results.statistic_table.map((row, index) => (
                        <tr
                          key={index}
                          className={index % 2 === 0 ? "bg-gray-50" : ""}
                        >
                          <td className="py-2 px-4 border">
                            {row.size_nm.toFixed(2)}
                          </td>
                          <td className="py-2 px-4 border">
                            {row.mean_intensity_percent.toFixed(2)}
                          </td>
                          <td className="py-2 px-4 border">
                            {row.std_dev.toFixed(2)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="py-2 px-4 border text-center">
                          No statistic table data available
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

export default DLSDataViewer;