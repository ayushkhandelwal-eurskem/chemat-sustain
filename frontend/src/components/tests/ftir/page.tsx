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

interface WavelengthTransmittance {
  wavelengths: number[];
  transmittances: number[];
}

interface PeakTransmittance {
  peaks: number[];
  transmittances: number[];
}

interface FunctionalGroup {
  group_name: string;
  peaks: number[];
}

interface FTIRData {
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
      ftir_model: string | null;
      beamsplitter: string | null;
      detector: string | null;
      measurement_technique: string | null;
      accessory_model: string | null;
      atr_crystal_material: string | null;
      resolution: string | null;
      number_of_scans: number | null;
      replication: number | null;
      spectral_range: string | null;
    };
  };
  raw_data: {
    run_number: number;
    wavelength_transmittance: WavelengthTransmittance;
  }[];
  processed_data: {
    run_number: number;
    peak_transmittance: PeakTransmittance;
  }[];
  final_results: {
    functional_groups: FunctionalGroup[];
  };
}

type Point = { x: number; y: number };

function mapRunToPoints(run: FTIRData["raw_data"][0]): {
  transmittancePoints: Point[];
} {
  const wt = run?.wavelength_transmittance ?? { wavelengths: [], transmittances: [] };
  const transmittancePoints: Point[] =
    Array.isArray(wt.wavelengths) && Array.isArray(wt.transmittances)
      ? wt.wavelengths.map((w, i) => ({
        x: w,
        y: wt.transmittances[i] ?? 0,
      }))
      : [];

  return { transmittancePoints };
}

const FTIRDataViewer: FC<PageProps> = ({ work_package, element, test, file }) => {
  const [data, setData] = useState<FTIRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("test-conditions");
  const [transmittancePoints, setTransmittancePoints] = useState<Point[]>([]);

  // Fetch data and initialize plots for run 2
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
        console.log("Fetched FTIR data:", result);
        setData(result);

        if (result?.raw_data?.length > 0) {
          const { transmittancePoints } = mapRunToPoints(result.raw_data[0]);
          setTransmittancePoints(transmittancePoints);
        } else {
          console.warn("No raw_data available, setting empty points");
          setTransmittancePoints([]);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load FTIR data. Please try again later.");
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
            FTIR Test Data Report
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
                      <td className="py-2 px-4 border font-medium">
                        CMS Internal Identifier
                      </td>
                      <td className="py-2 px-4 border">{element}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        ERM Identifier
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.material.erm_id}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Material Name
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.material.material_name}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Core Chemistry
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.material.core_chemistry}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Material State
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.material.material_state}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">CAS No</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.material.cas}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        CAS for Core
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.material.casforcore}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Batch</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.material.batch}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Batch Preparation Date
                      </td>
                      <td className="py-2 px-4 border">
                        {String(
                          data?.test_details?.material?.preparation_date ?? ""
                        ).match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Molar Concentration
                      </td>
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
                      <td className="py-2 px-4 border font-medium">
                        Dispersion protocol used
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.sample_preparation.dispersion_protocol}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Dispersion technique used
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.sample_preparation.dispersion_technique}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Dispersion/Dilution medium
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.sample_preparation.dispersion_medium}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Sonicator type
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.sample_preparation.sonicator_type}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Power(W)</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.sample_preparation.power}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Sonication time(secs)
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.sample_preparation.sonication_time}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Tip thickness(mm)
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.sample_preparation.tip_thickness}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Tip composition
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.sample_preparation.tip_composition}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Size of ultrasonic bath/water volume (dm3)
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.sample_preparation.ultrasonic_bath_size}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Sample volume
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.sample_preparation.sample_volume}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Final sample concentration (mg/L or ppm)
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.sample_preparation.final_concentration}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Additional information
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.sample_preparation.additional_info ||
                          "N/A"}
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
                      <td className="py-2 px-4 border font-medium">
                        FTIR Model
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.ftir_model || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Beamsplitter
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.beamsplitter || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">Detector</td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.detector || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Measurement Technique
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.measurement_technique ||
                          "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Accessory Model
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.accessory_model ||
                          "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        ATR Crystal Material
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.atr_crystal_material ||
                          "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Resolution
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.resolution || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Number of Scans
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.number_of_scans ||
                          "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Replication
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.replication || "N/A"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 border font-medium">
                        Spectral Range
                      </td>
                      <td className="py-2 px-4 border">
                        {data.test_details.instrumentation.spectral_range ||
                          "N/A"}
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
                      {data.test_details.work_package.lead_scientists.length >
                        0 ? (
                        data.test_details.work_package.lead_scientists.map(
                          (scientist, index) => (
                            <tr key={index}>
                              <td className="py-2 px-4 border">
                                {scientist.name ?? "N/A"}
                              </td>
                              <td className="py-2 px-4 border">
                                {scientist.email ?? "N/A"}
                              </td>
                            </tr>
                          )
                        )
                      ) : (
                        <tr>
                          <td
                            colSpan={2}
                            className="py-2 px-4 border text-center"
                          >
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
                      {data.test_details.work_package.assay_scientists.length >
                        0 ? (
                        data.test_details.work_package.assay_scientists.map(
                          (scientist, index) => (
                            <tr key={index}>
                              <td className="py-2 px-4 border">
                                {scientist.name ?? "N/A"}
                              </td>
                              <td className="py-2 px-4 border">
                                {scientist.email ?? "N/A"}
                              </td>
                            </tr>
                          )
                        )
                      ) : (
                        <tr>
                          <td
                            colSpan={2}
                            className="py-2 px-4 border text-center"
                          >
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
                onClick={() => downloadTable("rawDataTable", "raw_data")}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>
            {/* Transmittance Graph */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">
                Transmittance Spectrum
              </h3>
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart
                  margin={{ top: 20, right: 20, bottom: 20, left: 10 }}
                >
                  <CartesianGrid />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Wavelength (cm⁻¹)"
                    label={{
                      value: "Wavelength (cm⁻¹)",
                      position: "insideBottomRight",
                      offset: -10,
                    }}
                    domain={[4000, 700]}
                    ticks={[4000, 3500, 3000, 2500, 2000, 1500, 1000, 700]}
                    reversed={true}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Transmittance (%)"
                    label={{
                      value: "Transmittance (%)",
                      angle: -90,
                      position: "insideLeft",
                      offset: 0,
                    }}
                    domain={[80, 105]}
                    ticks={[80, 85, 90, 95, 100, 105]}
                  />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                  <Scatter
                    name="Transmittance"
                    data={transmittancePoints}
                    fill="#8884d8"
                    line={{ stroke: "#8884d8", strokeWidth: 2 }}
                    shape="circle"
                    isAnimationActive={true}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            {data.raw_data.length > 0 ? (
              <>
                {/* Raw Data Table */}
                <div className="overflow-x-auto mb-8">
                  <table
                    id="rawDataTable"
                    className="min-w-full bg-white border border-gray-200"
                  >
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">
                          Wavelength (cm⁻¹)
                        </th>
                        <th className="py-2 px-4 border text-left">
                          Transmittance (%)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.raw_data[0]?.wavelength_transmittance?.wavelengths
                        ?.length > 0 ? (
                        data.raw_data[0].wavelength_transmittance.wavelengths.map(
                          (wavelength, index) => (
                            <tr
                              key={index}
                              className={index % 2 === 0 ? "bg-gray-50" : ""}
                            >
                              <td className="py-2 px-4 border">
                                {wavelength?.toFixed(2) ?? "-"}
                              </td>
                              <td className="py-2 px-4 border">
                                {data.raw_data[0].wavelength_transmittance
                                  .transmittances[index]?.toFixed(2) ?? "-"}
                              </td>
                            </tr>
                          )
                        )
                      ) : (
                        <tr>
                          <td
                            colSpan={2}
                            className="py-2 px-4 border text-center"
                          >
                            No raw data available
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
                onClick={() => downloadTable("processedDataTable", "processed_data")}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>
            {data.processed_data.length > 0 ? (
              <>
                {/* Peak Transmittance Table */}
                <div className="overflow-x-auto">
                  <table
                    id="processedDataTable"
                    className="min-w-full bg-white border border-gray-200"
                  >
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">
                          Peak Position (cm⁻¹)
                        </th>
                        <th className="py-2 px-4 border text-left">
                          Transmittance (%)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.processed_data[0]?.peak_transmittance?.peaks?.length >
                        0 ? (
                        data.processed_data[0].peak_transmittance.peaks.map(
                          (peak, index) => (
                            <tr
                              key={index}
                              className={index % 2 === 0 ? "bg-gray-50" : ""}
                            >
                              <td className="py-2 px-4 border">
                                {peak?.toFixed(2) ?? "-"}
                              </td>
                              <td className="py-2 px-4 border">
                                {data.processed_data[0].peak_transmittance
                                  .transmittances[index]?.toFixed(3) ?? "-"}
                              </td>
                            </tr>
                          )
                        )
                      ) : (
                        <tr>
                          <td
                            colSpan={2}
                            className="py-2 px-4 border text-center"
                          >
                            No processed data available
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
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
              <h2 className="text-xl font-bold text-blue-800">FTIR Results</h2>
              <button
                onClick={() => downloadTable("resultsTable", "FTIR_Results")}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>
            {/* Functional Groups Table */}
            <div className="overflow-x-auto">
              <table
                id="resultsTable"
                className="min-w-full bg-white border border-gray-200"
              >
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-2 px-4 border text-left font-semibold">
                      Functional Group
                    </th>
                    <th className="py-2 px-4 border text-left font-semibold">
                      Characteristic Peaks (cm⁻¹)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.final_results?.functional_groups?.length > 0 ? (
                    data.final_results.functional_groups
                      .filter(
                        (group): group is FunctionalGroup =>
                          typeof group.group_name === "string" &&
                          Array.isArray(group.peaks) &&
                          group.peaks.every((peak) => typeof peak === "number")
                      )
                      .map((group, index) => (
                        <tr
                          key={index}
                          className={index % 2 === 0 ? "bg-gray-50" : ""}
                        >
                          <td className="py-2 px-4 border">
                            {group.group_name || "N/A"}
                          </td>
                          <td className="py-2 px-4 border">
                            {group.peaks.length > 0
                              ? group.peaks.map((p) => Math.round(p)).join(", ")
                              : "No peaks identified"}
                          </td>
                        </tr>
                      ))
                  ) : (
                    <tr>
                      <td
                        colSpan={2}
                        className="py-2 px-4 border text-center text-gray-600"
                      >
                        No valid functional groups identified
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

export default FTIRDataViewer;