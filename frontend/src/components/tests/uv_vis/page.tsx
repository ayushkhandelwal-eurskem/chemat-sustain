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
  ReferenceLine,
} from "recharts";

// Interfaces
interface PageProps {
  work_package: string;
  element: string;
  test: string;
  file: string;
}

interface SpectrumPoint {
  no: number;
  wavelength: number;
  absorbance: number;
}

interface Peak {
  absorbance: number;
  wavelength: number;
  compound: string | null;
}

interface UVVisData {
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
      instrument_specifications: string | null;
      software: string | null;
      display_model: string | null;
      cell_model: string | null;
      optical_path_length: string | null;
      start_wavelength: string | null;
      end_wavelength: string | null;
      wavelength_interval: string | null;
      background: string | null;
    };
  };
  replications: {
    spectrum: SpectrumPoint[];
  };
  final_results: {
    peaks: Peak[];
  };
}

type Point = { wavelength: number; absorbance: number };

const UVVisDataViewer: FC<PageProps> = ({ work_package, element, test, file }) => {
  const [data, setData] = useState<UVVisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("test-conditions");
  const [spectrumPoints, setSpectrumPoints] = useState<Point[]>([]);

  // Function to map spectrum to chart points (similar to DLS's mapRunToPoints)
  function mapSpectrumToPoints(spectrum: SpectrumPoint[] = []): Point[] {
    return spectrum
      .filter((point) => point.wavelength != null && point.absorbance != null)
      .map((point) => ({
        wavelength: point.wavelength,
        absorbance: point.absorbance,
      }))
      .sort((a, b) => a.wavelength - b.wavelength);
  }

  // Fetch data and initialize spectrum points
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
        console.log("Fetched UV-Vis data:", result);
        // Validate data structure
        if (!result.replications || !result.replications.spectrum) {
          console.warn("Replications spectrum is missing in the API response");
          result.replications = { spectrum: [] }; // Provide fallback
        }
        setData(result);

        // Initialize spectrum points
        const points = mapSpectrumToPoints(result.replications.spectrum);
        setSpectrumPoints(points);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load UV-Vis data. Please try again later.");
        setData(null);
        setSpectrumPoints([]);
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
            UV-Vis Test Data Report
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
                  <span className="font-semibold">CMS Internal Identifier:</span>{" "}
                  {element || "N/A"}
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
            {["test-conditions", "raw-data", "results"].map((tab) => (
              <li key={tab} className="z-30 flex-auto text-center">
                <a
                  className={`z-30 flex items-center justify-center w-full px-0 py-2 text-sm mb-0 transition-all ease-in-out border-0 rounded-md cursor-pointer ${
                    activeTab === tab
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
                    : "Final Results"}
                </a>
              </li>
            ))}
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
                    <tr>
                      <td className="py-2 px-4 border font-medium">No of Particles in Stock</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.material.particles_stock || "N/A"}
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
                      <td className="py-2 px-4 border font-medium">UV-Vis Instrument specifications</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.instrument_specifications || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Software</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.software || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Display Model</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.display_model || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Cell model</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.cell_model || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Optical path length</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.optical_path_length || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Start Wavelength</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.start_wavelength || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">End Wavelength</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.end_wavelength || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Wavelength Interval (nm)</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.wavelength_interval || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Background</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.background || "N/A"}
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
        {activeTab === "raw-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">Raw Data</h2>
              <button
                onClick={() => downloadTable("rawDataTable", "raw_data")}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            {/* Spectrum Chart */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Absorbance Spectrum</h3>
              {spectrumPoints.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart
                    data={spectrumPoints}
                    margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="wavelength"
                      label={{
                        value: "Wavelength (nm)",
                        position: "insideBottom",
                        offset: -5,
                        fill: "#1f2937",
                      }}
                      stroke="#1f2937"
                      tick={{ fill: "#1f2937" }}
                    />
                    <YAxis
                      label={{
                        value: "Absorbance",
                        angle: -90,
                        position: "insideLeft",
                        offset: 10,
                        fill: "#1f2937",
                      }}
                      stroke="#1f2937"
                      tick={{ fill: "#1f2937" }}
                    />
                    <Tooltip
                      formatter={(value: number) => value.toFixed(4)}
                      labelFormatter={(label) => `Wavelength: ${label} nm`}
                      contentStyle={{
                        backgroundColor: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: "4px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="absorbance"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-gray-600 py-8">
                  No spectrum data available to display the chart.
                </div>
              )}
            </div>

            {/* Raw Spectrum Table */}
            <div className="overflow-x-auto">
              <table
                id="rawDataTable"
                className="min-w-full bg-white border border-gray-200"
              >
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-2 px-4 border text-left font-semibold">No.</th>
                    <th className="py-2 px-4 border text-left font-semibold">Wavelength [nm]</th>
                    <th className="py-2 px-4 border text-left font-semibold">Absorbance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.replications.spectrum.length > 0 ? (
                    data.replications.spectrum.map((point, index) => (
                      <tr
                        key={index}
                        className={index % 2 === 0 ? "bg-gray-50" : ""}
                      >
                        <td className="py-2 px-4 border">{point.no}</td>
                        <td className="py-2 px-4 border">{point.wavelength.toFixed(2)}</td>
                        <td className="py-2 px-4 border">{point.absorbance.toFixed(4)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-4 px-4 border text-center text-gray-600">
                        No raw data available to display.
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
              <h2 className="text-xl font-bold text-blue-800">UV-Vis Results</h2>
              <button
                onClick={() => downloadTable("resultsTable", "UVVis_Results")}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            {/* Peaks Spectrum Chart */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Spectrum with Identified Peaks</h3>
              {spectrumPoints.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart
                    data={spectrumPoints}
                    margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="wavelength"
                      label={{
                        value: "Wavelength (nm)",
                        position: "insideBottom",
                        offset: -5,
                        fill: "#1f2937",
                      }}
                      stroke="#1f2937"
                      tick={{ fill: "#1f2937" }}
                    />
                    <YAxis
                      label={{
                        value: "Absorbance",
                        angle: -90,
                        position: "insideLeft",
                        offset: 10,
                        fill: "#1f2937",
                      }}
                      stroke="#1f2937"
                      tick={{ fill: "#1f2937" }}
                    />
                    <Tooltip
                      formatter={(value: number) => value.toFixed(4)}
                      labelFormatter={(label) => `Wavelength: ${label} nm`}
                      contentStyle={{
                        backgroundColor: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: "4px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="absorbance"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                    />
                    {data.final_results.peaks.map((peak, index) => (
                      <ReferenceLine
                        key={index}
                        x={peak.wavelength}
                        stroke="#ef4444"
                        label={{
                          value: `${peak.compound || "Peak"} (${peak.absorbance.toFixed(4)})`,
                          position: "top",
                          fill: "#ef4444",
                          fontSize: 12,
                        }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-gray-600 py-8">
                  No spectrum data available to display the chart.
                </div>
              )}
            </div>

            {/* Peaks Table */}
            <div className="overflow-x-auto">
              <table id="resultsTable" className="min-w-full bg-white border border-gray-200">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-2 px-4 border text-left font-semibold">Peak No.</th>
                    <th className="py-2 px-4 border text-left font-semibold">Max Absorbance</th>
                    <th className="py-2 px-4 border text-left font-semibold">Wavelength (nm)</th>
                    <th className="py-2 px-4 border text-left font-semibold">Identified Compound</th>
                  </tr>
                </thead>
                <tbody>
                  {data.final_results?.peaks?.length > 0 ? (
                    data.final_results.peaks.map((peak, index) => (
                      <tr
                        key={index}
                        className={index % 2 === 0 ? "bg-gray-50" : ""}
                      >
                        <td className="py-2 px-4 border">{index + 1}</td>
                        <td className="py-2 px-4 border">{peak.absorbance.toFixed(4)}</td>
                        <td className="py-2 px-4 border">{peak.wavelength.toFixed(2)}</td>
                        <td className="py-2 px-4 border">{peak.compound ?? "N/A"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-4 px-4 border text-center text-gray-600">
                        No peaks identified
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UVVisDataViewer;