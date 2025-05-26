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

interface RunData {
  run_number: number;
  correlation_data: CorrelationData;
  size_distribution: SizeDistributionData;
  z_ave_hydrodynamic_diameter: number;
  pdi: number;
  peak_1_diameter: number;
  peak_1_std_dev: number;
  peak_1_intensity: number;
  peak_2_diameter: number;
  peak_2_std_dev: number;
  peak_2_intensity: number;
  peak_3_diameter: number;
  peak_3_std_dev: number;
  peak_3_intensity: number;
  derived_count_rate: number;
  test_identifier_number: string;
  test_start_date: string;
  test_end_date: string;
}

interface DLSData {
  work_package: {
    wp_name: string;
    partner: string;
    full_test_name: string;
    test_acronym: string;
    test_type: string;
    endpoint: string;
    sop: string;
    path: string;
    lead_scientists: { name: string; email: string }[];
    assay_scientists: { name: string; email: string }[];
  };
  material: {
    material_identifier: string;
    erm_id: string;
    core_chemistry: string;
    material_state: string;
    batch: string;
    preparation_date: string;
    particles_stock: string;
    molar_concentration: string;
  };
  sample_preparation: {
    dispersion_protocol: string;
    dispersion_technique: string;
    dispersion_medium: string;
    sonicator_type: string;
    power: string;
    sonication_time: string;
    tip_thickness: string;
    tip_composition: string;
    ultrasonic_bath_size: string;
    sample_volume: string;
    final_concentration: string;
    additional_info: string;
  };
  instrumentation: {
    instrument_model: string;
    cell_model: string;
    temperature: string;
    thermal_equilibrium_time: string;
    number_of_runs: number;
    sub_runs: string;
    delay_between_runs: string;
    run_duration: string;
    laser_focus_position: string;
    scattering_angle: string;
    data_analysis_model: string;
    laser_attenuation: string;
    refractive_index_nm: number;
    absorption_index_nm: number;
    refractive_index_medium: number;
    viscosity_medium: string;
  };
  run_data: RunData[];
  results: {
    z_ave_hydrodynamic_diameter: number;
    uncertainty_hydrodynamic_diameter: number;
    pdi: number;
    uncertainty_pdi: number;
    mean_peak_1_diameter: number;
    pooled_std_dev_peak_1: number;
    std_dev_between_measurements_peak_1: number;
    mean_peak_1_intensity: number;
    mean_peak_2_diameter: number;
    pooled_std_dev_peak_2: number;
    std_dev_between_measurements_peak_2: number;
    mean_peak_2_intensity: number;
    mean_peak_3_diameter: number;
    pooled_std_dev_peak_3: number;
    std_dev_between_measurements_peak_3: number;
    mean_peak_3_intensity: number;
    derived_count_rate: number;
    statistic_table: {
      size_nm: number;
      mean_intensity_percent: number;
      std_dev: number;
    }[];
  };
}

type Point = { x: number; y: number };

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

function mapRunToPoints(run: RunData): {
  correlationPoints: Point[];
  sizeDistributionPoints: Point[];
} {
  const corr = run.correlation_data;
  const correlationPoints: Point[] =
    Array.isArray(corr?.time_us) && Array.isArray(corr.correlation_coefficient)
      ? corr.time_us.map((t, i) => ({
        x: t,
        y: corr.correlation_coefficient[i] ?? 0,
      }))
      : [];

  const sd = run.size_distribution;
  const sizeDistributionPoints: Point[] =
    Array.isArray(sd?.size_nm) && Array.isArray(sd.mean_intensity_percent)
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
      setLoading(true);
      try {
        const response = await api.get<DLSData>(
          `/files/${work_package}/${element}/${test}/${file}`
        );
        if (response.status !== 200) {
          throw new Error("Network response was not ok");
        }
        const result = response.data;
        setData(result);

        if (result.run_data.length > 0) {
          const { correlationPoints, sizeDistributionPoints } = mapRunToPoints(
            result.run_data[0]
          );
          setCorrelationPoints(correlationPoints);
          setSizeDistributionPoints(sizeDistributionPoints);
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
    if (!data?.run_data?.length) return;
    const run = data.run_data[selectedRun] || data.run_data[0];
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
                  {work_package}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Element:</span> {element}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Test:</span> {test}
                </p>
                <p>
                  <span className="font-semibold">File:</span> {file}
                </p>
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Information</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2">
                  <span className="font-semibold">Full Test Name:</span>{" "}
                  {data.work_package.full_test_name}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">ERM Identifier:</span>{" "}
                  {data.material.erm_id}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Test Acronym:</span>{" "}
                  {data.work_package.test_acronym}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Test Type:</span>{" "}
                  {data.work_package.test_type}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Endpoint:</span>{" "}
                  {data.work_package.endpoint}
                </p>
                <p>
                  <span className="font-semibold">SOP:</span>{" "}
                  {data.work_package.sop || "N/A"}
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
                    {Object.entries(data.material).map(([key, value]) => (
                      <tr key={key}>
                        <td className="py-2 px-4 border font-medium">
                          {key
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase())}
                        </td>
                        <td className="py-2 px-4 border">
                          {key === "preparation_date"
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
                    {Object.entries(data.sample_preparation).map(([key, value]) => (
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
                    {Object.entries(data.instrumentation).map(([key, value]) => (
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
                      {data.work_package.lead_scientists.map((scientist, index) => (
                        <tr key={index}>
                          <td className="py-2 px-4 border">{scientist.name}</td>
                          <td className="py-2 px-4 border">
                            {scientist.email || "N/A"}
                          </td>
                        </tr>
                      ))}
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
                      {data.work_package.assay_scientists.map((scientist, index) => (
                        <tr key={index}>
                          <td className="py-2 px-4 border">{scientist.name}</td>
                          <td className="py-2 px-4 border">
                            {scientist.email || "N/A"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Raw Data Tab */}
        {activeTab === "raw-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">Raw Data</h2>
              <button
                onClick={() =>
                  downloadTable("rawDataTable", `Run_${selectedRun + 1}_Raw_Data`)
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
                Select Replication:
              </label>
              <select
                id="run-select"
                value={selectedRun}
                onChange={(e) => setSelectedRun(Number(e.target.value))}
                className="w-full md:w-1/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
              >
                {data.run_data.map((run, index) => (
                  <option key={index} value={index}>
                    Replication {run.run_number} - WP2_DLS_1aR{run.run_number}
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
                  {data.run_data[selectedRun].correlation_data.time_us.map(
                    (_, index) => (
                      <tr
                        key={index}
                        className={index % 2 === 0 ? "bg-gray-50" : ""}
                      >
                        <td className="py-2 px-4 border">
                          {data.run_data[selectedRun].correlation_data.time_us[
                            index
                          ]?.toFixed(2) || "-"}
                        </td>
                        <td className="py-2 px-4 border">
                          {data.run_data[selectedRun].correlation_data
                            .correlation_coefficient[index]?.toFixed(4) || "-"}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Processed Data Tab */}
        {activeTab === "processed-data" && (
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

            <div className="mb-6">
              <label
                htmlFor="run-select-processed"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Select Replication:
              </label>
              <select
                id="run-select-processed"
                value={selectedRun}
                onChange={(e) => setSelectedRun(Number(e.target.value))}
                className="w-full md:w-1/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
              >
                {data.run_data.map((run, index) => (
                  <option key={index} value={index}>
                    Replication {run.run_number} - WP2_DLS_1aR{run.run_number}
                  </option>
                ))}
              </select>
            </div>
            {/* Run Metrics */}
            <div className="mb-6 bg-blue-50 p-4 rounded-md">
              <h3 className="text-lg font-semibold mb-3">
                Results {selectedRun + 1}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="font-semibold">Z-Average Diameter:</p>
                  <p>
                    {data.run_data[selectedRun].z_ave_hydrodynamic_diameter?.toFixed(
                      2
                    ) || "N/A"}{" "}
                    nm
                  </p>
                </div>
                <div>
                  <p className="font-semibold">PDI:</p>
                  <p>{data.run_data[selectedRun].pdi?.toFixed(3) || "N/A"}</p>
                </div>
                <div>
                  <p className="font-semibold">Derived Count Rate:</p>
                  <p>
                    {data.run_data[selectedRun].derived_count_rate?.toFixed(2) ||
                      "N/A"}{" "}
                    kcps
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Peak 1 diameter by intensity:</p>
                  <p>
                    {data.run_data[selectedRun].peak_1_diameter?.toFixed(2) ||
                      "N/A"}{" "}
                    nm
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Standard deviation peak 1:</p>
                  <p>
                    {data.run_data[selectedRun].peak_1_std_dev?.toFixed(2) ||
                      "N/A"}{" "}
                    nm
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Peak 1 relative intensity:</p>
                  <p>
                    {data.run_data[selectedRun].peak_1_intensity?.toFixed(2) ||
                      "N/A"}{" "}
                    %
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Peak 2 diameter by intensity:</p>
                  <p>
                    {data.run_data[selectedRun].peak_2_diameter?.toFixed(2) ||
                      "N/A"}{" "}
                    nm
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Standard deviation peak 2:</p>
                  <p>
                    {data.run_data[selectedRun].peak_2_std_dev?.toFixed(2) ||
                      "N/A"}{" "}
                    nm
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Peak 2 relative intensity:</p>
                  <p>
                    {data.run_data[selectedRun].peak_2_intensity?.toFixed(2) ||
                      "N/A"}{" "}
                    %
                  </p>
                </div>
              </div>
            </div>

            {/* Size Distribution Plot */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Size Distribution</h3>
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart
                  margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                >
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
                    data={sizeDistributionPoints}
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
                  id="sizeDistributionTable"
                  className="min-w-full bg-white border border-gray-200"
                >
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Size (nm)</th>
                      <th className="py-2 px-4 border text-left">Intensity (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.run_data[selectedRun].size_distribution.size_nm.map(
                      (size, index) => (
                        <tr
                          key={index}
                          className={index % 2 === 0 ? "bg-gray-50" : ""}
                        >
                          <td className="py-2 px-4 border">
                            {size?.toFixed(2) || "-"}
                          </td>
                          <td className="py-2 px-4 border">
                            {data.run_data[selectedRun].size_distribution
                              .mean_intensity_percent[index]?.toFixed(2) || "-"}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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
                    {data.results.z_ave_hydrodynamic_diameter?.toFixed(2)} ±{" "}
                    {data.results.uncertainty_hydrodynamic_diameter?.toFixed(2)}{" "}
                    nm
                  </p>
                </div>
                <div>
                  <p className="font-semibold">PDI:</p>
                  <p>
                    {data.results.pdi?.toFixed(3)} ±{" "}
                    {data.results.uncertainty_pdi?.toFixed(3)}
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Derived Count Rate:</p>
                  <p>{data.results.derived_count_rate?.toFixed(2)} kcps</p>
                </div>
                <div>
                  <p className="font-semibold">Mean peak 1 diameter by intensity:</p>
                  <p>{data.results.mean_peak_1_diameter?.toFixed(2)} nm</p>
                </div>
                <div>
                  <p className="font-semibold">Pooled standard deviation peak 1:</p>
                  <p>{data.results.pooled_std_dev_peak_1?.toFixed(2)} nm</p>
                </div>
                <div>
                  <p className="font-semibold">Standard deviation between measurements peak 1:</p>
                  <p>{data.results.std_dev_between_measurements_peak_1?.toFixed(
                    2
                  )} kcps</p>
                </div>
                <div>
                  <p className="font-semibold">Mean peak 1 relative intensity:</p>
                  <p>{data.results.mean_peak_1_intensity?.toFixed(2)} %</p>
                </div>
                <div>
                  <p className="font-semibold">Mean peak 2 diameter by intensity:</p>
                  <p>{data.results.mean_peak_2_diameter?.toFixed(2)} nm</p>
                </div>
                <div>
                  <p className="font-semibold">Pooled standard deviation peak 2:</p>
                  <p>{data.results.pooled_std_dev_peak_2?.toFixed(2)} %</p>
                </div>
                <div>
                  <p className="font-semibold">Standard deviation between measurements peak 2:</p>
                  <p>{data.results.std_dev_between_measurements_peak_2?.toFixed(
                    2
                  )}</p>
                </div>
                <div>
                  <p className="font-semibold">Mean peak 2 relative intensity:</p>
                  <p>{data.results.mean_peak_2_intensity?.toFixed(2)} %</p>
                </div>
              </div>
            </div>

            {/* Statistic Table */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Statistic Table</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Size (nm)</th>
                      <th className="py-2 px-4 border text-left">
                        Mean Intensity (%)
                      </th>
                      <th className="py-2 px-4 border text-left">Std Dev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.statistic_table.map((row, index) => (
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
                    ))}
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