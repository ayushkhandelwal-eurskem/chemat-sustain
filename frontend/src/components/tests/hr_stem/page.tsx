"use client";
import React, { FC, useEffect, useState } from "react";
import dynamic from "next/dynamic";
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
} from "recharts";

// Interfaces
interface PageProps {
  work_package: string;
  element: string;
  test: string;
  file: string;
}

interface ParticleMeasurement {
  feret_min: number | null;
  length: number | null;
  feret_max: number | null;
}

interface ProcessedParticle {
  aspect_ratio: number | null;
  ecd_diameter: number | null;
  radius_ecd: number | null;
  roundness: number | null;
}

interface HistogramBin {
  bin_start: number;
  bin_end: number;
  count: number;
}

interface HistogramData {
  feret_min: HistogramBin[];
  length: HistogramBin[];
  feret_max: HistogramBin[];
}

interface RunMetrics {
  feret_min_mean: number | null;
  feret_min_std: number | null;
  feret_min_median: number | null;
  length_mean: number | null;
  length_std: number | null;
  length_median: number | null;
  feret_max_mean: number | null;
  feret_max_std: number | null;
  feret_max_median: number | null;
  ecd_mean: number | null;
  ecd_std: number | null;
  ecd_median: number | null;
  aspect_ratio_mean: number | null;
  aspect_ratio_std: number | null;
  aspect_ratio_median: number | null;
  roundness_mean: number | null;
  roundness_std: number | null;
  roundness_median: number | null;
  density: number | null;
  volume_np_nm3: number | null;
  volume_np_cm3: number | null;
  mass_np_g: number | null;
  mass_colloid: number | null;
  c_colloid_percent: number | null;
  no_particles_stock: number | null;
}

interface ReplicationData {
  test_identifier_number: string;
  test_start_date: string | null;
  test_end_date: string | null;
}

interface RawData {
  run_number: number;
  particles: ParticleMeasurement[];
}

interface ProcessedData {
  run_number: number;
  processed_particles: ProcessedParticle[];
  metrics: RunMetrics;
  histogram: HistogramData;
  histogram_params?: {
    feret_min?: Record<string, number | null | undefined>;
    length?: Record<string, number | null | undefined>;
    feret_max?: Record<string, number | null | undefined>;
    [key: string]: any;
  };
}

interface StatisticTableEntry {
  metric: string;
  mean: number;
  std_dev: number;
  median: number;
}

interface HRSTEMData {
  test_details: {
    work_package: {
      wp_name: string | null;
      partner: string | null;
      full_test_name: string | null;
      test_acronym: string | null;
      test_type: string | null;
      endpoint: string | null;
      endpoint_outcome: string | null;
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
      cas: string | null;
      casforcore: string | null;
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
      electron_microscope_type: string | null;
      sample_grid: string | null;
      acceleration_voltage: string | null;
      tilt_angle: string | null;
      spot_size: string | null;
      aperture: string | null;
    };
  };
  replication: ReplicationData;
  raw_data: RawData;
  processed_data: ProcessedData;
  final_results: {
    feret_min_mean: number | null;
    feret_min_std: number | null;
    feret_min_median: number | null;
    length_mean: number | null;
    length_std: number | null;
    length_median: number | null;
    feret_max_mean: number | null;
    feret_max_std: number | null;
    feret_max_median: number | null;
    ecd_mean: number | null;
    ecd_std: number | null;
    ecd_median: number | null;
    aspect_ratio_mean: number | null;
    aspect_ratio_std: number | null;
    aspect_ratio_median: number | null;
    roundness_mean: number | null;
    roundness_std: number | null;
    roundness_median: number | null;
    statistic_table: StatisticTableEntry[];
  };
}

const HRSTEMDataViewer: FC<PageProps> = ({ work_package, element, test, file }) => {
  const [data, setData] = useState<HRSTEMData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("test-conditions");

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
        console.log("Fetched HR-STEM data:", result);
        setData(result);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load HR-STEM data. Please try again later.");
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
            HR-STEM Test Data Report
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
                      <td className="py-2 px-4 border font-medium">Type of the electron microscope</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.electron_microscope_type || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Sample grid/sample holder</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.sample_grid || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Acceleration voltage</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.acceleration_voltage || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Tilt angle</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.tilt_angle || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Spot size</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.spot_size || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Aperture</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.aperture || "N/A"}
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
                  downloadTable("rawDataTable", "raw_data")
                }
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            {/* Raw Particles Table */}
            <div className="overflow-x-auto">
              <table
                id="rawDataTable"
                className="min-w-full bg-white border border-gray-200"
              >
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-2 px-4 border text-left">Feret Min (nm)</th>
                    <th className="py-2 px-4 border text-left">Length (nm)</th>
                    <th className="py-2 px-4 border text-left">Feret Max (nm)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.raw_data?.particles?.length > 0 ? (
                    data.raw_data.particles.map(
                      (particle, index) => (
                        <tr
                          key={index}
                          className={index % 2 === 0 ? "bg-gray-50" : ""}
                        >
                          <td className="py-2 px-4 border">
                            {particle.feret_min?.toFixed(1) ?? "-"}
                          </td>
                          <td className="py-2 px-4 border">
                            {particle.length?.toFixed(1) ?? "-"}
                          </td>
                          <td className="py-2 px-4 border">
                            {particle.feret_max?.toFixed(1) ?? "-"}
                          </td>
                        </tr>
                      )
                    )
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-2 px-4 border text-center">
                        No raw data available
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
                  downloadTable(
                    "processedDataTable",
                    "Processed_Data"
                  )
                }
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            {/* 1. Arithmetic mean, std, median table */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Statistics</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Metric</th>
                      <th className="py-2 px-4 border text-left">Arithmetic Mean</th>
                      <th className="py-2 px-4 border text-left">Standard Deviation</th>
                      <th className="py-2 px-4 border text-left">Median</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2 px-4 border">Feret Min [nm]</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.feret_min_mean?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.feret_min_std?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.feret_min_median?.toFixed(2) ?? "N/A"}</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="py-2 px-4 border">Length [nm]</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.length_mean?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.length_std?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.length_median?.toFixed(2) ?? "N/A"}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border">Feret Max [nm]</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.feret_max_mean?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.feret_max_std?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.feret_max_median?.toFixed(2) ?? "N/A"}</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="py-2 px-4 border">ECD [nm]</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.ecd_mean?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.ecd_std?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.ecd_median?.toFixed(2) ?? "N/A"}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border">Aspect Ratio</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.aspect_ratio_mean?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.aspect_ratio_std?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.aspect_ratio_median?.toFixed(2) ?? "N/A"}</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="py-2 px-4 border">Roundness</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.roundness_mean?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.roundness_std?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.processed_data.metrics.roundness_median?.toFixed(2) ?? "N/A"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. d, V, m etc. */}
            <div className="mb-8 bg-blue-50 p-4 rounded-md">
              <h3 className="text-lg font-semibold mb-3">Other Metrics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="font-semibold">d [g/cm³]:</p>
                  <p>{data.processed_data.metrics.density?.toFixed(1) ?? "N/A"}</p>
                </div>
                <div>
                  <p className="font-semibold">V 1 NPs [nm³]:</p>
                  <p>{data.processed_data.metrics.volume_np_nm3?.toFixed(2) ?? "N/A"}</p>
                </div>
                <div>
                  <p className="font-semibold">V 1 NPs [cm³]:</p>
                  <p>{data.processed_data.metrics.volume_np_cm3 ?? "N/A"}</p>
                </div>
                <div>
                  <p className="font-semibold">m 1 NPs [g]:</p>
                  <p>{data.processed_data.metrics.mass_np_g ?? "N/A"}</p>
                </div>
                <div>
                  <p className="font-semibold">Mass of colloid:</p>
                  <p>{data.processed_data.metrics.mass_colloid ?? "N/A"}</p>
                </div>
                <div>
                  <p className="font-semibold">C colloid [%]:</p>
                  <p>{data.processed_data.metrics.c_colloid_percent?.toFixed(2) ?? "N/A"}</p>
                </div>
                <div>
                  <p className="font-semibold">No. of particles in stock:</p>
                  <p>{data.processed_data.metrics.no_particles_stock?? "N/A"}</p>
                </div>
              </div>
            </div>

            {/* 3. Histogram parameters (from data.processed_data.histogram_params) */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Histogram Parameters</h3>

              {/* helper inside the component to format values */}
              {/* put this const where this JSX can see it (inside the same component) */}
              {
                /* eslint-disable @typescript-eslint/no-unused-vars */
              }
              <script
                /* This is just for clarity — if your file is TSX, add the helper above the return instead.
                  If you prefer inline, move the helper to the top of the component. */
                dangerouslySetInnerHTML={{
                  __html: ''
                }}
              />
              {/* If you're editing inside the component's return, ensure the helper is declared above return:
                  const histogramParams = data.processed_data?.histogram_params ?? {};
                  const formatVal = (raw: number | null | undefined, asInt = false) => { ... } 
              */}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(() => {
                  // Access histogram params safely
                  const histogramParams = (data?.processed_data?.histogram_params as any) ?? {};

                  const columns = [
                    { key: "feret_min", title: "Feret Min" },
                    { key: "length", title: "Length" },
                    { key: "feret_max", title: "Feret Max" },
                  ];

                  // formatting helper
                  const formatVal = (v: any, asInt = false) => {
                    if (v === undefined || v === null || Number.isNaN(v)) return "N/A";
                    const n = Number(v);
                    if (!isFinite(n)) return "N/A";
                    if (asInt || Number.isInteger(n)) return String(Math.round(n));
                    if (Math.abs(n) >= 1000) return n.toFixed(0);
                    return n.toFixed(2);
                  };

                  return columns.map((col) => {
                    const params = histogramParams[col.key] ?? {};
                    return (
                      <div key={col.key} className="bg-white p-3 rounded-md shadow-sm">
                        <h4 className="font-semibold mb-2">{col.title}</h4>
                        <div className="space-y-2 text-sm text-slate-600">
                          <div>
                            <p className="text-sm text-slate-600">Number of results:</p>
                            <p className="font-medium">{formatVal(params?.num_results, true)}</p>
                          </div>

                          <div>
                            <p className="text-sm text-slate-600">x<sub>min</sub>:</p>
                            <p className="font-medium">{formatVal(params?.xmin)}</p>
                          </div>

                          <div>
                            <p className="text-sm text-slate-600">x<sub>max</sub>:</p>
                            <p className="font-medium">{formatVal(params?.xmax)}</p>
                          </div>

                          <div>
                            <p className="text-sm text-slate-600">distance r:</p>
                            <p className="font-medium">{formatVal(params?.range)}</p>
                          </div>

                          <div>
                            <p className="text-sm text-slate-600">calculated number of compartments:</p>
                            <p className="font-medium">{formatVal(params?.compartments, true)}</p>
                          </div>

                          <div>
                            <p className="text-sm text-slate-600">width d<sub>x</sub>:</p>
                            <p className="font-medium">{formatVal(params?.dx)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>



            {/* 4-5. Histograms */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
              <div>
                <h3 className="text-lg font-semibold mb-3">Feret Min Histogram</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={data.processed_data.histogram.feret_min}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bin_start" tick={{ fontSize: 10 }} offset={-10} label={{ value: "Feret Min", position: "insideBottom" , dy: 6}} />
                    <YAxis tick={{ fontSize: 10 }} label={{ value: "Counts", angle: -90, position: "insideLeft", dy: -6 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-3">Length Histogram</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={data.processed_data.histogram.length}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bin_start" tick={{ fontSize: 10 }} offset={-10} label={{ value: "Length", position: "insideBottom", dy: 6 }} />
                    <YAxis tick={{ fontSize: 10 }} label={{ value: "Counts", angle: -90, position: "insideLeft", dy: -6 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-3">Feret Max Histogram</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={data.processed_data.histogram.feret_max}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bin_start" tick={{ fontSize: 10 }} label={{ value: "Feret Max", position: "insideBottom", dy: 6 }} />
                    <YAxis tick={{ fontSize: 10 }} label={{ value: "Counts", angle: -90, position: "insideLeft", dy: -6 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#ffc658" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 6. Processed particles table */}
            <div className="overflow-x-auto">
              <h3 className="text-lg font-semibold mb-3">Processed Particles</h3>
              <table
                id="processedDataTable"
                className="min-w-full bg-white border border-gray-200"
              >
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-2 px-4 border text-left">Particle No.</th>
                    <th className="py-2 px-4 border text-left">Aspect Ratio</th>
                    <th className="py-2 px-4 border text-left">ECD Diameter [nm]</th>
                    <th className="py-2 px-4 border text-left">Radius ECD [nm]</th>
                    <th className="py-2 px-4 border text-left">Roundness</th>
                  </tr>
                </thead>
                <tbody>
                  {data.processed_data?.processed_particles?.length > 0 ? (
                    data.processed_data.processed_particles.map(
                      (particle, index) => (
                        <tr
                          key={index}
                          className={index % 2 === 0 ? "bg-gray-50" : ""}
                        >
                          <td className="py-2 px-4 border">{index + 1}</td>
                          <td className="py-2 px-4 border">{particle.aspect_ratio?.toFixed(2) ?? "-"}</td>
                          <td className="py-2 px-4 border">{particle.ecd_diameter?.toFixed(1) ?? "-"}</td>
                          <td className="py-2 px-4 border">{particle.radius_ecd?.toFixed(1) ?? "-"}</td>
                          <td className="py-2 px-4 border">{particle.roundness?.toFixed(2) ?? "-"}</td>
                        </tr>
                      )
                    )
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-2 px-4 border text-center">
                        No processed particles available
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
              <h2 className="text-xl font-bold text-blue-800">HR-STEM Results</h2>
              <button
                onClick={() => downloadTable("resultsTable", "HRSTEM_Results")}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            {/* Final Statistics Table */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Final Statistics</h3>
              <div className="overflow-x-auto">
                <table id="resultsTable" className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Metric</th>
                      <th className="py-2 px-4 border text-left">Mean</th>
                      <th className="py-2 px-4 border text-left">Std Dev</th>
                      <th className="py-2 px-4 border text-left">Median</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2 px-4 border">Feret Min [nm]</td>
                      <td className="py-2 px-4 border">{data.final_results.feret_min_mean?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.final_results.feret_min_std?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.final_results.feret_min_median?.toFixed(2) ?? "N/A"}</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="py-2 px-4 border">Length [nm]</td>
                      <td className="py-2 px-4 border">{data.final_results.length_mean?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.final_results.length_std?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.final_results.length_median?.toFixed(2) ?? "N/A"}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border">Feret Max [nm]</td>
                      <td className="py-2 px-4 border">{data.final_results.feret_max_mean?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.final_results.feret_max_std?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.final_results.feret_max_median?.toFixed(2) ?? "N/A"}</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="py-2 px-4 border">ECD [nm]</td>
                      <td className="py-2 px-4 border">{data.final_results.ecd_mean?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.final_results.ecd_std?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.final_results.ecd_median?.toFixed(2) ?? "N/A"}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border">Aspect Ratio</td>
                      <td className="py-2 px-4 border">{data.final_results.aspect_ratio_mean?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.final_results.aspect_ratio_std?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.final_results.aspect_ratio_median?.toFixed(2) ?? "N/A"}</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="py-2 px-4 border">Roundness</td>
                      <td className="py-2 px-4 border">{data.final_results.roundness_mean?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.final_results.roundness_std?.toFixed(2) ?? "N/A"}</td>
                      <td className="py-2 px-4 border">{data.final_results.roundness_median?.toFixed(2) ?? "N/A"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Statistic Table if available */}
            {data.final_results.statistic_table?.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-3">Statistic Table</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Metric</th>
                        <th className="py-2 px-4 border text-left">Mean</th>
                        <th className="py-2 px-4 border text-left">Std Dev</th>
                        <th className="py-2 px-4 border text-left">Median</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.final_results.statistic_table.map((entry, index) => (
                        <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                          <td className="py-2 px-4 border">{entry.metric}</td>
                          <td className="py-2 px-4 border">{entry.mean.toFixed(2)}</td>
                          <td className="py-2 px-4 border">{entry.std_dev.toFixed(2)}</td>
                          <td className="py-2 px-4 border">{entry.median.toFixed(2)}</td>
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
    </div>
  );
};

export default HRSTEMDataViewer;