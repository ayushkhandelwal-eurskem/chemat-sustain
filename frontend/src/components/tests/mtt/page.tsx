"use client";
import { api } from "@/lib/axios";
import { FC, useEffect, useState } from "react";
import { Download } from "lucide-react";
import dynamic from 'next/dynamic'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ErrorBar,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  Line,
  ComposedChart,
  Legend,
  Area
} from "recharts";
import { log } from "console";


const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface PageProps {
  work_package: string;
  element: string;
  test: string;
}

interface Replication {
  replication: {
    test_identifier_number: string;
    test_start_date: string;
    test_end_date: string;
    no_of_replicate: string;
  };
  raw_data: RawData[];
}

interface RawData {
  plate: number;
  repeat: number;
  well: string;
  type: string;
  time_1: string;
  p570: number;
  time_2: string;
  p650: number;
}

const MTTDataViewer: FC<PageProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("test-conditions");
  const [selectedReplication, setSelectedReplication] = useState<number>(0);
  const [selectedProcessedSheet, setSelectedProcessedSheet] = useState<number>(0);

  const [dataPoints, setDataPoints] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await api.post(`/tests/listings`, {
          "work_package_name": work_package,
          "element_cms_id": element,
          "test_name": test
        });
        if (response.status !== 200) {
          throw new Error('Network response was not ok');
        }
        const result = response.data;
        setData(result);
        if (result.final_results) {
          const dataPoints = result.final_results.concentrations_dash
            .map((concentration: number, i: number) => ({
              x: concentration,
              y: result.final_results.percent_viability_vs_nc.reverse_mean_without_pc[i],
              error: result.final_results.percent_viability_vs_nc.reverse_std_dev_without_pc[i],
            }))
            .filter((point: any) => point.y !== undefined && point.error !== undefined);

          setDataPoints(dataPoints);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError("Failed to load data. Please try again later.");
        setLoading(false);
      }
    };
    fetchData();
  }, [work_package, element, test]);

  const downloadTable = (tableId: string, filename: string) => {
    const table = document.getElementById(tableId);
    if (!table) return;

    const rows = table.querySelectorAll('tr');
    let csvContent = "data:text/csv;charset=utf-8,";

    rows.forEach(row => {
      const cells = row.querySelectorAll('th, td');
      const rowData = Array.from(cells).map(cell => `"${cell.textContent}"`).join(',');
      csvContent += rowData + '\r\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getExponent = (text: string) => {
    const pattern = /x10\^(\d+)/;
    const match = text.match(pattern);

    if (match && match[1]) {
      return parseInt(match[1], 10); // Convert to integer
    }
    return null; // Return null if no match found
  }

  const generateRegressionLine = (intercept: number, slope: number, xMin: number, xMax: number, numPoints = 100) => {
    const points = [];
    const step = (xMax - xMin) / (numPoints - 1);

    for (let i = 0; i < numPoints; i++) {
      const x = xMin + (step * i);
      const y = intercept + (slope * x);
      points.push({ logDose: x, mean: y });
    }

    return points;
  };


  if (loading) {
    return (
      <div className="bg-white flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white flex items-center justify-center min-h-screen">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen py-8 text-black">
      <div className="container mx-auto px-4">


        {/* Header - Common to both tabs */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-4">Test Data Report</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Parameters</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2">
                  <span className="font-semibold">Work Package:</span> {work_package}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Element:</span> {element}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Test:</span> {test}
                </p>
              </div>
            </div>

            {data.test_details && data.test_details.work_package && (
              <div>
                <h2 className="text-lg font-semibold mb-3">Test Information</h2>
                <div className="bg-blue-50 p-4 rounded-md">
                  <p className="mb-2">
                    <span className="font-semibold">Full Test Name:</span> {data.test_details.work_package.full_test_name}
                  </p>
                  <p className="mb-2">
                    <span className="font-semibold">ERM Identifier:</span> {data.test_details.material.erm_id}
                  </p>
                  <p className="mb-2">
                    <span className="font-semibold">Test Acronym:</span> {data.test_details.work_package.test_acronym}
                  </p>
                  <p className="mb-2">
                    <span className="font-semibold">Test Type:</span> {data.test_details.work_package.test_type}
                  </p>
                  <p className="mb-2">
                    <span className="font-semibold">Endpoint:</span> {data.test_details.work_package.endpoint}
                  </p>
                  <p>
                    <span className="font-semibold">SOP:</span> {data.test_details.work_package.sop}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="w-full mb-8">
          <div className="relative">
            <ul className="relative flex flex-wrap p-1.5 list-none rounded-md bg-slate-100" role="list">
              {data.test_details && <li className="z-30 flex-auto text-center">
                <a
                  className={`z-30 flex items-center justify-center w-full px-0 py-2 text-sm mb-0 transition-all ease-in-out border-0 rounded-md cursor-pointer ${activeTab === "test-conditions" ? "bg-blue-600 text-white shadow-md" : "text-slate-600 bg-inherit"}`}
                  onClick={() => setActiveTab("test-conditions")}
                  role="tab"
                  aria-selected={activeTab === "test-conditions"}
                >
                  Test Conditions
                </a>
              </li>}
              {data.raw_data && <li className="z-30 flex-auto text-center">
                <a
                  className={`z-30 flex items-center justify-center w-full px-0 py-2 mb-0 text-sm transition-all ease-in-out border-0 rounded-md cursor-pointer ${activeTab === "raw-data" ? "bg-blue-600 text-white shadow-md" : "text-slate-600 bg-inherit"}`}
                  onClick={() => setActiveTab("raw-data")}
                  role="tab"
                  aria-selected={activeTab === "raw-data"}
                >
                  Raw Data
                </a>
              </li>}
              {data.processed_data && <li className="z-30 flex-auto text-center">
                <a
                  className={`z-30 flex items-center justify-center w-full px-0 py-2 mb-0 text-sm transition-all ease-in-out border-0 rounded-md cursor-pointer ${activeTab === "processed-data" ? "bg-blue-600 text-white shadow-md" : "text-slate-600 bg-inherit"}`}
                  onClick={() => setActiveTab("processed-data")}
                  role="tab"
                  aria-selected={activeTab === "processed-data"}
                >
                  Processed Data
                </a>
              </li>}
              {data.final_results && <li className="z-30 flex-auto text-center">
                <a
                  className={`z-30 flex items-center justify-center w-full px-0 py-2 mb-0 text-sm transition-all ease-in-out border-0 rounded-md cursor-pointer ${activeTab === "final-results" ? "bg-blue-600 text-white shadow-md" : "text-slate-600 bg-inherit"}`}
                  onClick={() => setActiveTab("final-results")}
                  role="tab"
                  aria-selected={activeTab === "final-results"}
                >
                  Final results
                </a>
              </li>}
            </ul>
          </div>
        </div>
        {/* Test Conditions Tab Content */}
        {activeTab === "test-conditions" && (
          <>
            {/* Material Information */}
            {data.test_details.material && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-blue-800">Material Information</h2>
                  <button
                    onClick={() => downloadTable('materialTable', 'Material_Info')}
                    className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                  >
                    <Download size={16} />
                    <span>Download</span>
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table id="materialTable" className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Property</th>
                        <th className="py-2 px-4 border text-left">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-2 px-4 border font-medium">Material Identifier</td>
                        <td className="py-2 px-4 border">{element}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-4 border font-medium">ERM Identifier</td>
                        <td className="py-2 px-4 border">{data.test_details.material.erm_id}</td>
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
                        <td className="py-2 px-4 border font-medium">Batch</td>
                        <td className="py-2 px-4 border">{data.test_details.material.batch}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-4 border font-medium">Preparation Date</td>
                        <td className="py-2 px-4 border">{new Date(data.test_details.material.preparation_date).toLocaleDateString()}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-4 border font-medium">Endotoxin Absent</td>
                        <td className="py-2 px-4 border">{data.test_details.material.endotoxin_absent}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-4 border font-medium">Particles Stock</td>
                        <td className="py-2 px-4 border">{data.test_details.material.particles_stock}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-4 border font-medium">Aids to Disperse</td>
                        <td className="py-2 px-4 border">{data.test_details.material.aids_to_disperse}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Treatment Concentration Data */}
            {data.treatment_concentration_data && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-blue-800">Treatment Concentration Data</h2>
                  <button
                    onClick={() => downloadTable('concentrationTable', 'Treatment_Concentration_Data')}
                    className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                  >
                    <Download size={16} />
                    <span>Download</span>
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table id="concentrationTable" className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Label</th>
                        <th className="py-2 px-4 border text-left">Concentration (μg/mL)</th>
                        <th className="py-2 px-4 border text-left">Particles (×10<sup>{getExponent(data.test_details.material.treatment_concentration_unit)}</sup> /mL)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.treatment_concentration_data.treatment_concentration_series_labels.map((label: string, index: number) => (
                        <tr key={label}>
                          <td className="py-2 px-4 border">{label}</td>
                          <td className="py-2 px-4 border">
                            {data.treatment_concentration_data.treatment_concentration_series_c_in_g_ml_[index]}
                          </td>
                          <td className="py-2 px-4 border">
                            {data.treatment_concentration_data["treatment_concentration_series_c_no_of_particles_x10_" + getExponent(data.test_details.material.treatment_concentration_unit) + "_ml_"][index]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Controls */}
            {data.treatment_concentration_data && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-blue-800">Controls</h2>
                  <button
                    onClick={() => downloadTable('controlsTable', 'Controls_Data')}
                    className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                  >
                    <Download size={16} />
                    <span>Download</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Positive Controls</h3>
                    <table id="controlsTable" className="min-w-full bg-white border border-gray-200">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="py-2 px-4 border text-left">Abbreviation</th>
                          <th className="py-2 px-4 border text-left">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.treatment_concentration_data.positive_controls_abbreviations_.map((abbr: string, index: number) => (
                          <tr key={abbr}>
                            <td className="py-2 px-4 border">{abbr}</td>
                            <td className="py-2 px-4 border">
                              {data.treatment_concentration_data.positive_controls_description[index]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Negative Controls</h3>
                    <table className="min-w-full bg-white border border-gray-200">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="py-2 px-4 border text-left">Abbreviation</th>
                          <th className="py-2 px-4 border text-left">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.treatment_concentration_data.negative_controls_abbreviations_.map((abbr: string, index: number) => (
                          <tr key={abbr}>
                            <td className="py-2 px-4 border">{abbr}</td>
                            <td className="py-2 px-4 border">
                              {data.treatment_concentration_data.negative_controls_description[index]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Treatment Series on Plate */}
            {data.treatment_concentration_data && data.treatment_concentration_data.treatment_type_series_on_plate_ && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-blue-800">Treatment Series on Plate</h2>
                  <button
                    onClick={() => downloadTable('plateSeriesTable', 'Treatment_Series_On_Plate')}
                    className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                  >
                    <Download size={16} />
                    <span>Download</span>
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table id="plateSeriesTable" className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Position</th>
                        <th className="py-2 px-4 border text-left">Treatment Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.treatment_concentration_data.treatment_type_series_on_plate_.map((treatment: string, index: number) => (
                        <tr key={index}>
                          <td className="py-2 px-4 border">{index + 1}</td>
                          <td className="py-2 px-4 border">{treatment}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Scientists Information */}
            {data.test_details.work_package && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-blue-800">Scientists Information</h2>
                  <button
                    onClick={() => downloadTable('scientistsTable', 'Scientists_Info')}
                    className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                  >
                    <Download size={16} />
                    <span>Download</span>
                  </button>
                </div>
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
                        {data.test_details.work_package.lead_scientists.map((scientist: any, index: number) => (
                          <tr key={index}>
                            <td className="py-2 px-4 border">{scientist.name}</td>
                            <td className="py-2 px-4 border">{scientist.email}</td>
                          </tr>
                        ))}
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
                        {data.test_details.work_package.assay_scientists.map((scientist: any, index: number) => (
                          <tr key={index}>
                            <td className="py-2 px-4 border">{scientist.name}</td>
                            <td className="py-2 px-4 border">{scientist.email}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Raw Data Tab Content */}
        {activeTab === "raw-data" && data.raw_data && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">Raw Test Data</h2>
              <button
                onClick={() => downloadTable('rawDataTable', `Raw_Data_Replication_${selectedReplication + 1}`)}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            {data.raw_data.length > 0 && (
              <>
                <div className="mb-6">
                  <label htmlFor="replication-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Select Replication:
                  </label>
                  <select
                    id="replication-select"
                    value={selectedReplication}
                    onChange={(e) => setSelectedReplication(Number(e.target.value))}
                    className="w-full md:w-1/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
                  >
                    {data.raw_data.map((rep: any, index: number) => (
                      <option key={index} value={index}>
                        {rep.replication.no_of_replicate} - {rep.replication.test_identifier_number}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-6 bg-blue-50 p-4 rounded-md">
                  <h3 className="text-lg font-semibold mb-3">Replication Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="font-semibold">Test Identifier:</p>
                      <p>{data.raw_data[selectedReplication].replication.test_identifier_number}</p>
                    </div>
                    <div>
                      <p className="font-semibold">Start Date:</p>
                      <p>{new Date(data.raw_data[selectedReplication].replication.test_start_date).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="font-semibold">End Date:</p>
                      <p>{new Date(data.raw_data[selectedReplication].replication.test_end_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table id="rawDataTable" className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Plate</th>
                        <th className="py-2 px-4 border text-left">Repeat</th>
                        <th className="py-2 px-4 border text-left">Well</th>
                        <th className="py-2 px-4 border text-left">Type</th>
                        <th className="py-2 px-4 border text-left">Time 1</th>
                        <th className="py-2 px-4 border text-left">P570</th>
                        <th className="py-2 px-4 border text-left">Time 2</th>
                        <th className="py-2 px-4 border text-left">P650</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.raw_data[selectedReplication].raw_data.map((row: RawData, index: number) => (
                        <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                          <td className="py-2 px-4 border">{row.plate}</td>
                          <td className="py-2 px-4 border">{row.repeat}</td>
                          <td className="py-2 px-4 border">{row.well}</td>
                          <td className="py-2 px-4 border">{row.type}</td>
                          <td className="py-2 px-4 border">{row.time_1}</td>
                          <td className="py-2 px-4 border">{row.p570.toFixed(4)}</td>
                          <td className="py-2 px-4 border">{row.time_2}</td>
                          <td className="py-2 px-4 border">{row.p650.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* Processed Data Tab Content */}
        {activeTab === "processed-data" && data.raw_data && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">Processed Data</h2>
              <button
                onClick={() => downloadTable('rawDataTable', `Raw_Data_Replication_${selectedReplication + 1}`)}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>


            {data.processed_data.length > 0 && (
              <>
                <div className="mb-6">
                  <label htmlFor="replication-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Select Processed Sheet:
                  </label>
                  <select
                    id="replication-select"
                    value={selectedProcessedSheet}
                    onChange={(e) => setSelectedProcessedSheet(Number(e.target.value))}
                    className="w-full md:w-1/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
                  >
                    {data.processed_data.map((proc_rep: any, index: number) => (
                      <option key={index} value={index}>
                        {proc_rep.processed_sheet_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-6 bg-blue-50 p-4 rounded-md">
                  <h3 className="text-lg font-semibold mb-3">Processed Replication Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="font-semibold">Experiment Identifier:</p>
                      <p>{data.processed_data[selectedProcessedSheet].experiment_id}</p>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white border border-gray-300">
                    <thead>
                      <tr>
                        <th className="py-2 px-4 border border-gray-300 text-left">Absorbance value at 570 nm</th>
                        {data.processed_data[selectedProcessedSheet].absorbance_570.concentrations.map((conc: string, index: number) => (
                          <th
                            key={index}
                            className={`py-2 px-4 border border-gray-300 text-center ${conc === "NC" || conc === "NC'" ? 'bg-blue-500 text-white' :
                              conc === "PC" ? 'bg-red-500 text-white' :
                                'bg-blue-400 text-white'
                              }`}
                          >
                            {conc}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Create rows based on the number of readings */}
                      {Array.from({ length: data.processed_data[selectedProcessedSheet].absorbance_570.readings["NC"].length }).map((_, rowIndex) => (
                        <tr key={rowIndex}>
                          <td className="py-2 px-4 border border-gray-300"></td>
                          {data.processed_data[selectedProcessedSheet].absorbance_570.concentrations.map((conc: any, colIndex: number) => {
                            const key = typeof conc === 'number' ? conc.toString() : conc;
                            return (
                              <td key={colIndex} className="py-2 px-4 border border-gray-300 text-center">
                                {data.processed_data[selectedProcessedSheet].absorbance_570.readings[key][rowIndex]?.toFixed(3)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr className="bg-green-100">
                        <td className="py-2 px-4 border border-gray-300 font-medium">Mean</td>
                        {data.processed_data[selectedProcessedSheet].absorbance_570.concentrations.map((conc: any, index: number) => {
                          const key = typeof conc === 'number' ? conc.toString() : conc;
                          return (
                            <td key={index} className="py-2 px-4 border border-gray-300 text-center font-medium">
                              {data.processed_data[selectedProcessedSheet].absorbance_570.mean_values[key]?.toFixed(3)}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="py-2 px-4 border border-gray-300">SD</td>
                        {data.processed_data[selectedProcessedSheet].absorbance_570.concentrations.map((conc: any, index: number) => {
                          const key = typeof conc === 'number' ? conc.toString() : conc;
                          return (
                            <td key={index} className="py-2 px-4 border border-gray-300 text-center">
                              {data.processed_data[selectedProcessedSheet].absorbance_570.std_dev[key]?.toFixed(3)}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="py-2 px-4 border border-gray-300">CV</td>
                        {data.processed_data[selectedProcessedSheet].absorbance_570.concentrations.map((conc: any, index: number) => {
                          const key = typeof conc === 'number' ? conc.toString() : conc;
                          return (
                            <td key={index} className="py-2 px-4 border border-gray-300 text-center">
                              {data.processed_data[selectedProcessedSheet].absorbance_570.cv_values[key].toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="py-2 px-4 border border-gray-300 "></td>
                        <td className="py-2 px-4 border border-gray-300"></td>
                        <td className="py-2 px-4 border border-gray-300"></td>
                        <td className="py-2 px-4 border border-gray-300"></td>
                        <td className="py-2 px-4 border border-gray-300"></td>
                        <td className="py-2 px-4 border border-gray-300"></td>
                        <td className="py-2 px-4 border border-gray-300"></td>
                        <td className="py-2 px-4 border border-gray-300"></td>
                        <td className="py-2 px-4 border border-gray-300 text-bold text-center bg-red-100">Mean</td>
                        <td className="py-2 px-4 border border-gray-300 text-center">{data.processed_data[selectedProcessedSheet].absorbance_570.mean_nc?.toFixed(3)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="mt-4">
                    <div className="flex items-center">
                      <div className="mr-2">NPs concentration unit:</div>
                      <div className="font-medium">μg/mL</div>
                    </div>
                  </div>

                  <div className="mt-4 ">
                    <div className="flex items-center ">
                      <div className="mr-2">Acceptance criteria: if CV is less than 20%, the acceptance criteria are fulfilled:</div>
                      <div className={`font-large font-semibold 
                       ${data.processed_data[selectedProcessedSheet].absorbance_570.acceptance_criteria[0].status.toLowerCase() == "passed" ? "bg-green-200" : "bg-red-200"}`}>
                        {data.processed_data[selectedProcessedSheet].absorbance_570.acceptance_criteria[0].status}
                      </div>
                    </div>
                  </div>


                  <div className="mt-6">
                    <table className="min-w-full bg-white border border-gray-300">
                      <thead>
                        <tr>
                          <th className="py-2 px-4 border border-gray-300 text-left">Absorbance value at 650 nm</th>
                          {data.processed_data[selectedProcessedSheet].absorbance_650.concentrations.map((conc: string, index: number) => (
                            <th
                              key={index}
                              className={`py-2 px-4 border border-gray-300 text-center ${conc === "NC" || conc === "NC'" ? 'bg-blue-500 text-white' :
                                conc === "PC" ? 'bg-red-500 text-white' :
                                  'bg-blue-400 text-white'
                                }`}
                            >
                              {conc}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Create rows based on the number of readings */}
                        {Array.from({ length: data.processed_data[selectedProcessedSheet].absorbance_650.readings["NC"].length }).map((_, rowIndex) => (
                          <tr key={rowIndex}>
                            <td className="py-2 px-4 border border-gray-300"></td>
                            {data.processed_data[selectedProcessedSheet].absorbance_650.concentrations.map((conc: any, colIndex: number) => {
                              const key = typeof conc === 'number' ? conc.toString() : conc;
                              return (
                                <td key={colIndex} className="py-2 px-4 border border-gray-300 text-center">
                                  {data.processed_data[selectedProcessedSheet].absorbance_650.readings[key][rowIndex]?.toFixed(3)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>


                  <div className="mt-6">
                    <table className="min-w-full bg-white border border-gray-300">
                      <thead>
                        <tr>
                          <th className="py-2 px-4 border border-gray-300 text-left">Background substraction (Abs570 nm-Abs650 nm)</th>
                          {data.processed_data[selectedProcessedSheet].background_subtraction.concentrations.map((conc: string, index: number) => (
                            <th
                              key={index}
                              className={`py-2 px-4 border border-gray-300 text-center ${conc === "NC" || conc === "NC'" ? 'bg-blue-500 text-white' :
                                conc === "PC" ? 'bg-red-500 text-white' :
                                  'bg-blue-400 text-white'
                                }`}
                            >
                              {conc}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Create rows based on the number of readings */}
                        {Array.from({ length: data.processed_data[selectedProcessedSheet].background_subtraction["NC"].length }).map((_, rowIndex) => (
                          <tr key={rowIndex}>
                            <td className="py-2 px-4 border border-gray-300"></td>
                            {data.processed_data[selectedProcessedSheet].background_subtraction.concentrations.map((conc: any, colIndex: number) => {
                              const key = typeof conc === 'number' ? conc.toString() : conc;
                              return (
                                <td key={colIndex} className="py-2 px-4 border border-gray-300 text-center">
                                  {data.processed_data[selectedProcessedSheet].background_subtraction[key][rowIndex]?.toFixed(3)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-6 overflow-x-auto">
                  <div className="flex flex-col">
                    <div className="overflow-x-auto">
                      <table className="min-w-full border border-gray-300">
                        <tbody>
                          <tr>
                            <td className="border border-gray-300 px-4 py-2"></td>
                            <td className="border border-gray-300 px-4 py-2"></td>
                            <td className="border border-gray-300 px-4 py-2">&gt;85%</td>
                            <td className="border border-gray-300 px-4 py-2">&lt;115%</td>
                          </tr>
                          <tr>
                            <td className="border border-gray-300 px-4 py-2">% NC1=</td>
                            <td className="border border-gray-300 px-4 py-2">{data.processed_data[selectedProcessedSheet].nc_status["NC1"]?.toFixed(3)}</td>
                            <td className={`border border-gray-300 px-4 py-2 ${data.processed_data[selectedProcessedSheet].nc_status["NC1_greater_85"].toLowerCase() == "passed" ? 'bg-green-200' : 'bg-red-200'}`}>{data.processed_data[selectedProcessedSheet].nc_status["NC1_greater_85"]}</td>
                            <td className={`border border-gray-300 px-4 py-2 ${data.processed_data[selectedProcessedSheet].nc_status["NC1_less_115"].toLowerCase() == "passed" ? 'bg-green-200' : 'bg-red-200'}`}>{data.processed_data[selectedProcessedSheet].nc_status["NC1_less_115"]}</td>
                          </tr>
                          <tr>
                            <td className="border border-gray-300 px-4 py-2">% NC2=</td>
                            <td className="border border-gray-300 px-4 py-2">{data.processed_data[selectedProcessedSheet].nc_status["NC2"]?.toFixed(3)}</td>
                            <td className={`border border-gray-300 px-4 py-2 ${data.processed_data[selectedProcessedSheet].nc_status["NC2_greater_85"].toLowerCase() == "passed" ? 'bg-green-200' : 'bg-red-200'}`}>{data.processed_data[selectedProcessedSheet].nc_status["NC2_greater_85"]}</td>
                            <td className={`border border-gray-300 px-4 py-2 ${data.processed_data[selectedProcessedSheet].nc_status["NC2_less_115"].toLowerCase() == "passed" ? 'bg-green-200' : 'bg-red-200'}`}>{data.processed_data[selectedProcessedSheet].nc_status["NC2_less_115"]}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="mt-6 overflow-x-auto">
                  <table className="min-w-full bg-white border border-gray-300">
                    <thead>
                      <tr>
                        <th className="py-2 px-4 border border-gray-300 text-left">% of viability vs. NC</th>
                        {data.processed_data[selectedProcessedSheet].viability_data.concentrations.map((conc: string, index: number) => (
                          <th
                            key={index}
                            className={`py-2 px-4 border border-gray-300 text-center ${conc === "NC" || conc === "NC'" ? 'bg-blue-500 text-white' :
                              conc === "PC" ? 'bg-red-500 text-white' :
                                'bg-blue-400 text-white'
                              }`}
                          >
                            {conc}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Create rows based on the number of readings */}
                      {Array.from({ length: data.processed_data[selectedProcessedSheet].viability_data.readings["NC"].length }).map((_, rowIndex) => (
                        <tr key={rowIndex}>
                          <td className="py-2 px-4 border border-gray-300"></td>
                          {data.processed_data[selectedProcessedSheet].viability_data.concentrations.map((conc: any, colIndex: number) => {
                            const key = typeof conc === 'number' ? conc.toString() : conc;
                            return (
                              <td key={colIndex} className="py-2 px-4 border border-gray-300 text-center">
                                {data.processed_data[selectedProcessedSheet].viability_data.readings[key][rowIndex]?.toFixed(3)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 overflow-x-auto">
                  <table className="min-w-full bg-white border border-gray-300">
                    <thead>
                      <tr>
                        <th className="py-2 px-4 border border-gray-300 text-left">% of viability vs. NC</th>
                        {data.processed_data[selectedProcessedSheet].viability_data.concentrations.map((conc: string, i: number) => (
                          conc !== "NC'" ? (
                            <th
                              key={i}
                              className={`py-2 px-4 border border-gray-300 text-center ${conc === "NC" ? 'bg-blue-500 text-white' :
                                conc === "PC" ? 'bg-red-500 text-white' :
                                  'bg-blue-400 text-white'
                                }`}
                            >
                              {conc}
                            </th>
                          ) : null
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-2 px-4 border border-gray-300">Mean</td>
                        {data.processed_data[selectedProcessedSheet].viability_data.concentrations.map((concentration: string) => (
                          concentration !== "NC'" ? (
                            <td key={concentration} className="py-2 px-4 border border-gray-300 text-center">
                              {data.processed_data[selectedProcessedSheet].viability_data.percentage_values[concentration].toFixed(1)}
                            </td>
                          ) : null
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-4 border border-gray-300">SD</td>
                        {data.processed_data[selectedProcessedSheet].viability_data.concentrations.map((concentration: string) =>
                          concentration !== "NC'" ? (
                            <td key={concentration} className="py-2 px-4 border border-gray-300 text-center">
                              {data.processed_data[selectedProcessedSheet].viability_data.percentage_std[concentration].toFixed(1)}
                            </td>
                          ) : null
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-6">
                  {(typeof window !== 'undefined') &&
                    <Chart
                      options={{
                        chart: {
                          id: "bar",
                          type: "bar",
                        },
                        title: {
                          text: data.processed_data[selectedProcessedSheet].experiment_id,
                          align: "center",
                        },
                        plotOptions: {
                          bar: {
                            columnWidth: "20%",
                            horizontal: false,
                          },
                        },
                        dataLabels: {
                          enabled: false,
                        },
                        legend: {
                          show: false // Hide legend since we're using custom colors
                        },
                        stroke: {
                          show: true,
                          width: 2,
                          colors: ['transparent']
                        },
                        colors: ["#2E8DEF", "#A9A9A9", "#A9A9A9", "#A9A9A9", "#A9A9A9", "#A9A9A9", "#A9A9A9", "#A9A9A9"],
                        yaxis: {
                          title: {
                            text: "% of viability vs. NC"
                          }
                        },
                        xaxis: {
                          title: {
                            text: "NPs concentration [μg/mL]"
                          },
                          labels: {
                            formatter: function (value) {
                              // Return the value exactly as is (preventing any rounding)
                              return value;
                            },
                            // Prevent truncation of decimal values
                            trim: false,
                            // Ensure enough space for decimal values
                            style: {
                              fontSize: '12px'
                            }
                          },
                          categories: data.processed_data[selectedProcessedSheet].viability_data.concentrations
                            .filter((item: string) => item !== "NC'")
                            .map((item: string) => {
                              // If item is a number, parse and format it
                              const num = parseFloat(item);

                              return isNaN(num) ? item : num;
                            }),
                        },
                      }}
                      series={[
                        {
                          name: "Viability",
                          data: data.processed_data[selectedProcessedSheet].viability_data.concentrations
                            .filter((item: string) => item !== "NC'")
                            .map((concentration: string) =>
                              data.processed_data[selectedProcessedSheet].viability_data.percentage_values[concentration].toFixed(1)
                            ),
                        },
                      ]}
                      type="bar"
                      height={365}
                    />
                  }
                </div>


              </>

            )}
          </div>
        )}


        {/* Final results Tab Content */}
        {activeTab === "final-results" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">Final Results Data</h2>
              <button
                onClick={() => downloadTable('rawDataTable', `Raw_Data_Replication`)}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              {data.processed_data.map((sheet: any, sheetIndex: number) =>
                !data.final_results.excluded_sheets.includes(sheet.processed_sheet_name) && (
                  <div key={sheetIndex} className="mb-8">
                    <h3 className="text-lg font-semibold text-blue-700 mb-3">{sheet.processed_sheet_name}</h3>
                    <table className="min-w-full bg-white border border-gray-300">
                      <thead>
                        <tr>
                          <th className="py-2 px-4 border border-gray-300 text-left"></th>
                          {sheet.absorbance_570.concentrations.map((conc: string, index: number) => (
                            <th
                              key={index}
                              className={`py-2 px-4 border border-gray-300 text-center ${conc === "NC" || conc === "NC'" ? 'bg-blue-500 text-white' :
                                conc === "PC" ? 'bg-red-500 text-white' :
                                  'bg-blue-400 text-white'
                                }`}
                            >
                              {conc}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Create rows based on the number of readings */}
                        {Array.from({ length: sheet.absorbance_570.readings["NC"].length }).map((_, rowIndex) => (
                          <tr key={rowIndex}>
                            <td className="py-2 px-4 border border-gray-300"></td>
                            {sheet.absorbance_570.concentrations.map((conc: number, colIndex: number) => {
                              const key = typeof conc === 'number' ? conc.toString() : conc;
                              return (
                                <td key={colIndex} className="py-2 px-4 border border-gray-300 text-center">
                                  {sheet.absorbance_570.readings[key][rowIndex]?.toFixed(3)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        <tr className="bg-green-100">
                          <td className="py-2 px-4 border border-gray-300 font-medium">Mean</td>
                          {sheet.absorbance_570.concentrations.map((conc: number, index: number) => {
                            const key = typeof conc === 'number' ? conc.toString() : conc;
                            return (
                              <td key={index} className="py-2 px-4 border border-gray-300 text-center font-medium">
                                {sheet.absorbance_570.mean_values[key]?.toFixed(3)}
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td className="py-2 px-4 border border-gray-300">SD</td>
                          {sheet.absorbance_570.concentrations.map((conc: number, index: number) => {
                            const key = typeof conc === 'number' ? conc.toString() : conc;
                            return (
                              <td key={index} className="py-2 px-4 border border-gray-300 text-center">
                                {sheet.absorbance_570.std_dev[key]?.toFixed(3)}
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td className="py-2 px-4 border border-gray-300">CV</td>
                          {sheet.absorbance_570.concentrations.map((conc: number, index: number) => {
                            const key = typeof conc === 'number' ? conc.toString() : conc;
                            return (
                              <td key={index} className="py-2 px-4 border border-gray-300 text-center">
                                {sheet.absorbance_570.cv_values[key]?.toFixed(2)}
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td className="py-2 px-4 border border-gray-300"></td>
                          <td className="py-2 px-4 border border-gray-300"></td>
                          <td className="py-2 px-4 border border-gray-300"></td>
                          <td className="py-2 px-4 border border-gray-300"></td>
                          <td className="py-2 px-4 border border-gray-300"></td>
                          <td className="py-2 px-4 border border-gray-300"></td>
                          <td className="py-2 px-4 border border-gray-300"></td>
                          <td className="py-2 px-4 border border-gray-300"></td>
                          <td className="py-2 px-4 border border-gray-300 text-bold text-center bg-red-100">Mean</td>
                          <td className="py-2 px-4 border border-gray-300 text-center">{sheet.absorbance_570.mean_nc?.toFixed(3)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ))}
            </div>



            <div className="space-y-8">
              {/* First Table: % of viability vs. NC (μg/mL) */}
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th colSpan={10} className="px-2 py-1 border border-gray-300 text-center">
                        % of viability vs. NC
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-2 py-1 border border-gray-300 font-bold text-center"></td>
                      {data.final_results.percent_viability_vs_nc.concentrations.map((conc: number, index: number) => (
                        <td key={index} className="px-2 py-1 border border-gray-300 font-bold text-center">
                          {conc}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-2 py-1 border border-gray-300 bg-green-200 font-bold text-center">MEAN</td>
                      {data.final_results.percent_viability_vs_nc.concentrations.map((conc: number, index: number) => (
                        <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                          {data.final_results.percent_viability_vs_nc.mean[index].toFixed(2)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-2 py-1 border border-gray-300 bg-green-200 font-bold text-center">SD</td>
                      {data.final_results.percent_viability_vs_nc.concentrations.map((conc: number, index: number) => (
                        <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                          {data.final_results.percent_viability_vs_nc.std_dev[index].toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th colSpan={10} className="px-2 py-1 border border-gray-300 text-center">
                        NPs concentration [μg/mL]
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-2 py-1 border border-gray-300  text-center"></td>
                      {data.final_results.reverse_concentrations.map((conc: number, index: number) => (
                        <td key={index} className="px-2 py-1 border border-gray-300 font-bold text-center">
                          {conc}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-2 py-1 border border-gray-300 bg-green-200 font-bold text-center">MEAN</td>
                      {data.final_results.percent_viability_vs_nc.concentrations.map((conc: number, index: number) => (
                        <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                          {data.final_results.percent_viability_vs_nc.reverse_mean[index].toFixed(2)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-2 py-1 border border-gray-300 bg-green-200 font-bold text-center">SD</td>
                      {data.final_results.percent_viability_vs_nc.concentrations.map((conc: number, index: number) => (
                        <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                          {data.final_results.percent_viability_vs_nc.reverse_std_dev[index].toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {(typeof window !== 'undefined') && (
                <ResponsiveContainer width="100%" height={365}>
                  <BarChart
                    data={data.final_results.percent_viability_vs_nc.concentrations
                      .filter((item: string) => item !== "NC'")
                      .map((item: string, index: number) => {
                        const num = parseFloat(item);
                        const label = isNaN(num) ? item : num;
                        return {
                          name: label,
                          viability: data.final_results.percent_viability_vs_nc.mean[index],
                          sd: data.final_results.percent_viability_vs_nc.std_dev[index],
                          error: [0, data.final_results.percent_viability_vs_nc.std_dev[index]], // [negative error, positive error]
                          isControl: item === "NC",
                          isPositiveControl: item === "PC"
                        };
                      })}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 40,
                      bottom: 5,
                    }}
                    barCategoryGap="20%"
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      axisLine={true}
                      tickLine={true}
                      tick={{ fontSize: 12 }}
                      label={{ value: 'NPs concentration [μg/mL]', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis
                      domain={[0, 150]}
                      axisLine={true}
                      tickLine={true}
                      tick={{ fontSize: 12 }}
                      label={{ value: '% of viability vs. NC', angle: -90, position: 'insideLeft' }}
                    />
                    <Bar dataKey="viability" fill="#2E8DEF" barSize={50}>
                      {data.final_results.percent_viability_vs_nc.concentrations
                        .filter((item: string) => item !== "NC'")
                        .map((item: string, index: number) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={item === "NC" ? '#3b82f6' : item === "PC" ? '#ef4444' : '#6b7280'}
                          />
                        ))}
                      <ErrorBar
                        dataKey="error"
                        width={4}
                        stroke="#000000"
                        strokeWidth={1.5}
                        direction="y"
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              {/* {(typeof window !== 'undefined') &&
                <Chart
                  options={{
                    chart: {
                      id: "bar",
                      type: "bar",
                    },
                    title: {
                      text: element,
                      align: "center",
                    },
                    plotOptions: {
                      bar: {
                        columnWidth: "40%",
                        horizontal: false,
                      },
                    },
                    dataLabels: {
                      enabled: false,
                    },
                    legend: {
                      show: false // Hide legend since we're using custom colors
                    },
                    stroke: {
                      show: true,
                      width: 2,
                      colors: ['transparent']
                    },
                    colors: ["#2E8DEF", "#A9A9A9", "#A9A9A9", "#A9A9A9", "#A9A9A9", "#A9A9A9", "#A9A9A9", "#A9A9A9"],
                    yaxis: {
                      title: {
                        text: "% of viability vs. NC"
                      }
                    },
                    xaxis: {
                      title: {
                        text: "NPs concentration [μg/mL]"
                      },
                      labels: {
                        formatter: function (value) {
                          // Return the value exactly as is (preventing any rounding)
                          return value;
                        },
                        // Prevent truncation of decimal values
                        trim: false,
                        // Ensure enough space for decimal values
                        style: {
                          fontSize: '12px'
                        }
                      },
                      categories: data.final_results.percent_viability_vs_nc.concentrations
                        .filter((item: string) => item !== "NC'")
                        .map((item: string) => {
                          // If item is a number, parse and format it
                          const num = parseFloat(item);

                          return isNaN(num) ? item : num;
                        }),
                    },
                  }}
                  series={[
                    {
                      name: "Viability",
                      data: data.final_results.percent_viability_vs_nc.mean
                        .map((mean: number) =>
                          mean.toFixed(1)
                        ),
                    },
                  ]}
                  type="bar"
                  height={365}
                />
              } */}



              {/* Third Table: Reverse concentrations */}
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th colSpan={10} className="px-2 py-1 border border-gray-300 text-center">
                        % of viability vs. NC
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-2 py-1 border border-gray-300 font-bold text-center"></td>
                      {data.final_results.concentrations_dash.map((conc: number, index: number) => (
                        <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                          {conc.toFixed(4)}
                        </td>
                      ))}
                      <td className="px-2 py-1 border border-gray-300 text-center">
                        ×10<sup>{getExponent(data.test_details.material.treatment_concentration_unit)}</sup> particles/mL
                      </td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 border border-gray-300 bg-green-200 font-bold text-center">MEAN</td>
                      {data.final_results.percent_viability_vs_nc.concentrations.slice(0, -1).map((conc: number, index: number) => (
                        <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                          {data.final_results.percent_viability_vs_nc.mean[index].toFixed(2)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-2 py-1 border border-gray-300 bg-green-200 font-bold text-center">SD</td>
                      {data.final_results.percent_viability_vs_nc.concentrations.slice(0, -1).map((conc: number, index: number) => (
                        <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                          {data.final_results.percent_viability_vs_nc.std_dev[index].toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Fourth Table: Reverse concentrations dash */}
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th colSpan={10} className="px-2 py-1 border border-gray-300 text-center">
                        No of particles x10<sup>{getExponent(data.test_details.material.treatment_concentration_unit)}</sup>/mL
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-2 py-1 border border-gray-300 font-bold text-center"></td>
                      {data.final_results.concentrations_dash.map((conc: number, index: number) => (
                        <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                          {conc.toFixed(4)}
                        </td>
                      ))}
                      <td className="px-2 py-1 border border-gray-300 text-center">
                        ×10<sup>{getExponent(data.test_details.material.treatment_concentration_unit)}</sup> particles/mL
                      </td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 border border-gray-300 bg-green-200 font-bold text-center">MEAN</td>
                      {data.final_results.percent_viability_vs_nc.concentrations.slice(0, -1).map((conc: number, index: number) => (
                        <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                          {data.final_results.percent_viability_vs_nc.reverse_mean_without_pc[index].toFixed(2)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-2 py-1 border border-gray-300 bg-green-200 font-bold text-center">SD</td>
                      {data.final_results.percent_viability_vs_nc.concentrations.slice(0, -1).map((conc: number, index: number) => (
                        <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                          {data.final_results.percent_viability_vs_nc.reverse_std_dev_without_pc[index].toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>


              {(typeof window !== 'undefined') && dataPoints && dataPoints.length > 0 && (
                <ResponsiveContainer width="100%" height={365}>
                  <ScatterChart
                    data={dataPoints}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 40,
                      bottom: 60,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="x"
                      type="number"
                      axisLine={true}
                      tickLine={true}
                      tick={{ fontSize: 12 }}
                      label={{
                        value: `no of particles x10^${getExponent(data.test_details.material.treatment_concentration_unit)}/AL`,
                        position: 'insideBottom',
                        offset: -10,
                        style: { fontSize: '12px' }
                      }}
                    />
                    <YAxis
                      domain={[0, 120]}
                      axisLine={true}
                      tickLine={true}
                      tick={{ fontSize: 12 }}
                      label={{
                        value: '% of viability vs. NC',
                        angle: -90,
                        position: 'insideLeft'
                      }}
                    />
                    <Tooltip
                      formatter={(value, name) => [`${typeof value === 'number' ? value.toFixed(2) : value}%`, 'Viability']}
                      labelFormatter={(label) => `Point: ${label}`}
                    />
                    <Scatter
                      dataKey="y"
                      fill="#555555"
                      stroke="#555555"
                      strokeWidth={2}
                      r={6}
                    >
                      <ErrorBar
                        dataKey="error"
                        width={4}
                        stroke="#000000"
                        strokeWidth={1.5}
                        direction="y"
                      />
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              )}

              <div className="overflow-x-auto ">
                <h1 className="font-bold">Log dose response</h1>
                <h2 className="font-bold">NPs concentration [μg/mL]</h2>
                <hr />

                {/* Log Dose Response Chart and regression line */}
                {(typeof window !== 'undefined') && data.final_results && (
                  <div className="mt-8">
                    <h3 className="text-lg font-bold mb-4">Log Dose Response</h3>
                    {(() => {
                      // Build scatter points excluding first and last index as before
                      const scatterPoints = data.final_results.log_dose
                        .map((logDose: number, i: number) => ({
                          name: i,              // categorical name not used but required by ComposedChart when needed
                          logDose,
                          mean: data.final_results.percent_viability_vs_nc.reverse_mean_without_pc[i],
                          index: i
                        }))
                        .filter((p: any) =>
                          typeof p.mean === 'number' &&
                          typeof p.logDose === 'number' &&
                          !Number.isNaN(p.mean) &&
                          !Number.isNaN(p.logDose) &&
                          p.index !== 0 &&
                          p.index !== data.final_results.log_dose.length - 1
                        )
                        .map(({ index, ...rest }: any) => rest);

                      // Regression points over the visible domain
                      const regPoints = generateRegressionLine(
                        Number(data.final_results.intercept),
                        Number(data.final_results.slope),
                        -0.3,
                        0.9
                      );

                      // Compose a single dataset so ComposedChart lines and scatter share same data prop
                      // We only need it for X/Y numeric axes; ComposedChart allows child components to have their own data,
                      // but providing a common 'data' improves axis binding consistency.
                      // We'll still pass explicit data to Scatter and Line to avoid unintended joins.
                      const composedData = scatterPoints;

                      return (
                        <ResponsiveContainer width="100%" height={400}>
                          <ComposedChart
                            data={composedData}
                            margin={{ top: 20, right: 30, left: 40, bottom: 60 }}
                          >
                            <CartesianGrid stroke="#f5f5f5" />
                            <XAxis
                              type="number"
                              dataKey="logDose"
                              domain={[-0.6, 1.0]}
                              tickCount={9}
                              ticks={[-0.6, -0.4, -0.2, 0.0, 0.2, 0.4, 0.6, 0.8, 1.0]}
                              tickFormatter={(v: number) => v.toFixed(1)}
                              label={{ value: 'Log Dose Concentration', position: 'insideBottom', offset: -10, style: { fontSize: '12px' } }}
                            />
                            <YAxis
                              type="number"
                              dataKey="mean"
                              domain={[0, 120]}
                              tickCount={7}
                              ticks={[0, 20, 40, 60, 80, 100, 120]}
                              tickFormatter={(v: number) => v.toFixed(0)}
                              label={{ value: '% of viability vs. NC (Mean)', angle: -90, position: 'insideLeft', style: { fontSize: '12px' } }}
                            />
                            <Tooltip />
                            <Legend />

                            {/* Scatter of means */}
                            <Scatter
                              name="Data Points"
                              data={scatterPoints}
                              fill="#3b82f6"
                            />

                            {/* Regression line over same axes */}
                            <Line
                              name="Regression Line"
                              type="linear"
                              data={regPoints}
                              dataKey="mean"
                              stroke="#ff7300"
                              strokeWidth={2}
                              dot={false}
                              xAxisId={0}
                              yAxisId={0}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      );
                    })()}
                  </div>
                )}


                <div className="border-2 border-black p-4 w-64 bg-white mt-8">
                  <div className="flex flex-col items-center">
                    <div className="w-full text-center mb-1">
                      <span className="font-medium">R² = {data.final_results.r_squared.toFixed(4)}</span>
                    </div>
                    <div className="w-full text-center">
                      <span className="font-medium">R = {data.final_results.r.toFixed(4)}</span>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto mt-4">
                  <table className="min-w-full border-collapse border border-gray-300">
                    <tbody>
                      <tr>
                        <td className="px-2 py-1 border border-gray-300 font-bold text-center">Log dose</td>
                        {data.final_results.log_dose.map((conc: number, index: number) => (
                          <td key={index} className="px-2 py-1 border border-gray-300 text-center bg-gray-100">
                            {typeof conc === "string" ? conc : conc.toFixed(4)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-2 py-1 border border-gray-300 font-bold text-center">Dose</td>
                        {data.final_results.dose.map((conc: number, index: number) => (
                          <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                            {typeof conc === "string" ? conc : conc.toFixed(4)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-2 py-1 border border-gray-300 bg-green-200 font-bold text-center">MEAN</td>
                        {data.final_results.percent_viability_vs_nc.concentrations.slice(0, -1).map((conc: number, index: number) => (
                          <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                            {data.final_results.percent_viability_vs_nc.reverse_mean[index].toFixed(1)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-2 py-1 border border-gray-300 bg-green-200 font-bold text-center">SD</td>
                        {data.final_results.percent_viability_vs_nc.concentrations.slice(0, -1).map((conc: number, index: number) => (
                          <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                            {data.final_results.percent_viability_vs_nc.reverse_std_dev[index].toFixed(1)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="border-2 border-black p-4 w-64 bg-white mt-8">
                  <div className="flex flex-col items-center">
                    <div className="w-full text-center mb-1">
                      <span className="font-medium">a = {data.final_results.slope.toFixed(4)}</span>
                    </div>
                    <div className="w-full text-center">
                      <span className="font-medium">b = {data.final_results.intercept.toFixed(4)}</span>
                    </div>
                  </div>
                </div>


                <div className="overflow-x-auto mt-4">
                  <table className="min-w-full border-collapse border border-gray-300">
                    <tbody>
                      <tr>
                        <td></td>
                        <td className="px-2 py-1 border border-gray-300 font-bold text-center">Log(x)</td>
                        <td className="px-2 py-1 border border-gray-300 font-bold text-center">x</td>
                        <td className="px-2 py-1 border border-gray-300 font-bold text-center"></td>
                      </tr>
                      <tr>
                        <td className="px-2 py-1 border border-gray-300 font-bold text-center bg-green-200">EC10</td>
                        {data.final_results.ec10.map((conc: number, index: number) => (
                          <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                            {typeof conc === "string" ? conc : conc.toFixed(4)}
                          </td>
                        ))}
                        <td className="px-2 py-1 border border-gray-300 text-center">μg/mL</td>
                      </tr>
                      <tr>
                        <td className="px-2 py-1 border border-gray-300 font-bold text-center bg-green-200">EC25</td>
                        {data.final_results.ec25.map((conc: number, index: number) => (
                          <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                            {typeof conc === "string" ? conc : conc.toFixed(4)}
                          </td>
                        ))}
                        <td className="px-2 py-1 border border-gray-300 text-center">μg/mL</td>
                      </tr>
                      <tr>
                        <td className="px-2 py-1 border border-gray-300 font-bold text-center bg-green-200">EC50</td>
                        {data.final_results.ec50.map((conc: number, index: number) => (
                          <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                            {typeof conc === "string" ? conc : conc.toFixed(4)}
                          </td>
                        ))}
                        <td className="px-2 py-1 border border-gray-300 text-center">μg/mL</td>
                      </tr>

                    </tbody>
                  </table>
                </div>

              </div>

              <div className="overflow-x-auto ">
                <h1 className="font-bold">Log dose response</h1>
                <h2 className="font-bold">no of particles x10<sup>{getExponent(data.test_details.material.treatment_concentration_unit)}</sup>/mL</h2>
                <hr />


                {/* Log Dose Response Chart and regression line */}
                {(typeof window !== 'undefined') && data.final_results && (
                  <div className="mt-8">
                    <h3 className="text-lg font-bold mb-4">Log Dose Response</h3>
                    {(() => {
                      // Build scatter points excluding first and last index as before
                      const scatterPoints = data.final_results.log_dose_dash
                        .map((logDose: number, i: number) => ({
                          name: i,              // categorical name not used but required by ComposedChart when needed
                          logDose,
                          mean: data.final_results.percent_viability_vs_nc.reverse_mean_without_pc[i],
                          index: i
                        }))
                        .filter((p: any) =>
                          typeof p.mean === 'number' &&
                          typeof p.logDose === 'number' &&
                          !Number.isNaN(p.mean) &&
                          !Number.isNaN(p.logDose) &&
                          p.index !== 0 &&
                          p.index !== data.final_results.log_dose.length - 1
                        )
                        .map(({ index, ...rest }: any) => rest);

                      // Regression points over the visible domain
                      const regPoints = generateRegressionLine(
                        Number(data.final_results.intercept),
                        Number(data.final_results.slope),
                        -0.6,
                        0.9
                      );

                      // Compose a single dataset so ComposedChart lines and scatter share same data prop
                      // We only need it for X/Y numeric axes; ComposedChart allows child components to have their own data,
                      // but providing a common 'data' improves axis binding consistency.
                      // We'll still pass explicit data to Scatter and Line to avoid unintended joins.
                      const composedData = scatterPoints;

                      return (
                        <ResponsiveContainer width="100%" height={400}>
                          <ComposedChart
                            data={composedData}
                            margin={{ top: 20, right: 30, left: 40, bottom: 60 }}
                          >
                            <CartesianGrid stroke="#f5f5f5" />
                            <XAxis
                              type="number"
                              dataKey="logDose"
                              domain={[-0.6, 1.0]}
                              tickCount={9}
                              ticks={[-0.6, -0.4, -0.2, 0.0, 0.2, 0.4, 0.6, 0.8, 1.0]}
                              tickFormatter={(v: number) => v.toFixed(1)}
                              label={{ value: 'Log Dose Concentration', position: 'insideBottom', offset: -10, style: { fontSize: '12px' } }}
                            />
                            <YAxis
                              type="number"
                              dataKey="mean"
                              domain={[0, 120]}
                              tickCount={7}
                              ticks={[0, 20, 40, 60, 80, 100, 120]}
                              tickFormatter={(v: number) => v.toFixed(0)}
                              label={{ value: '% of viability vs. NC (Mean)', angle: -90, position: 'insideLeft', style: { fontSize: '12px' } }}
                            />
                            <Tooltip />
                            <Legend />

                            {/* Scatter of means */}
                            <Scatter
                              name="Data Points"
                              data={scatterPoints}
                              fill="#3b82f6"
                            />

                            {/* Regression line over same axes */}
                            <Line
                              name="Regression Line"
                              type="linear"
                              data={regPoints}
                              dataKey="mean"
                              stroke="#ff7300"
                              strokeWidth={2}
                              dot={false}
                              xAxisId={0}
                              yAxisId={0}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      );
                    })()}
                  </div>
                )}

                <div className="border-2 border-black p-4 w-64 bg-white mt-8">
                  <div className="flex flex-col items-center">
                    <div className="w-full text-center mb-1">
                      <span className="font-medium">R² = {data.final_results.r_squared.toFixed(4)}</span>
                    </div>
                    <div className="w-full text-center">
                      <span className="font-medium">R = {data.final_results.r.toFixed(4)}</span>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto mt-4">
                  <table className="min-w-full border-collapse border border-gray-300">
                    <tbody>
                      <tr>
                        <td className="px-2 py-1 border border-gray-300 font-bold text-center">Log dose</td>
                        {data.final_results.log_dose_dash.map((conc: number, index: number) => (
                          <td key={index} className="px-2 py-1 border border-gray-300 text-center bg-gray-100">
                            {typeof conc === "string" ? conc : conc.toFixed(4)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-2 py-1 border border-gray-300 font-bold text-center">Dose</td>
                        {data.final_results.dose_dash.map((conc: number, index: number) => (
                          <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                            {typeof conc === "string" ? conc : conc.toFixed(4)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-2 py-1 border border-gray-300 bg-green-200 font-bold text-center">MEAN</td>
                        {data.final_results.percent_viability_vs_nc.concentrations.slice(0, -1).map((conc: number, index: number) => (
                          <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                            {data.final_results.percent_viability_vs_nc.reverse_mean_without_pc[index].toFixed(2)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-2 py-1 border border-gray-300 bg-green-200 font-bold text-center">SD</td>
                        {data.final_results.percent_viability_vs_nc.concentrations.slice(0, -1).map((conc: number, index: number) => (
                          <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                            {data.final_results.percent_viability_vs_nc.reverse_std_dev_without_pc[index].toFixed(2)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="border-2 border-black p-4 w-64 bg-white mt-8">
                  <div className="flex flex-col items-center">
                    <div className="w-full text-center mb-1">
                      <span className="font-medium">a = {data.final_results.slope_dash.toFixed(4)}</span>
                    </div>
                    <div className="w-full text-center">
                      <span className="font-medium">b = {data.final_results.intercept_dash.toFixed(4)}</span>
                    </div>
                  </div>
                </div>


                <div className="overflow-x-auto mt-4">
                  <table className="min-w-full border-collapse border border-gray-300">
                    <tbody>
                      <tr>
                        <td></td>
                        <td className="px-2 py-1 border border-gray-300 font-bold text-center">Log(x)</td>
                        <td className="px-2 py-1 border border-gray-300 font-bold text-center">x</td>
                        <td className="px-2 py-1 border border-gray-300 font-bold text-center"></td>
                      </tr>
                      <tr>
                        <td className="px-2 py-1 border border-gray-300 font-bold text-center bg-green-200">EC10</td>
                        {data.final_results.ec10_dash.map((conc: number, index: number) => (
                          <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                            {typeof conc === "string" ? conc : conc.toFixed(4)}
                          </td>
                        ))}
                        <td className="px-2 py-1 border border-gray-300 text-center">μg/mL</td>
                      </tr>
                      <tr>
                        <td className="px-2 py-1 border border-gray-300 font-bold text-center bg-green-200">EC25</td>
                        {data.final_results.ec25_dash.map((conc: number, index: number) => (
                          <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                            {typeof conc === "string" ? conc : conc.toFixed(4)}
                          </td>
                        ))}
                        <td className="px-2 py-1 border border-gray-300 text-center">μg/mL</td>
                      </tr>
                      <tr>
                        <td className="px-2 py-1 border border-gray-300 font-bold text-center bg-green-200">EC50</td>
                        {data.final_results.ec50_dash.map((conc: number, index: number) => (
                          <td key={index} className="px-2 py-1 border border-gray-300 text-center">
                            {typeof conc === "string" ? conc : conc.toFixed(4)}
                          </td>
                        ))}
                        <td className="px-2 py-1 border border-gray-300 text-center">μg/mL</td>
                      </tr>

                    </tbody>
                  </table>
                </div>

              </div>

              <div className="overflow-x-auto">
                <div className="border-2 border-black p-4 w-64 bg-white mt-8">
                  <div className="flex flex-col items-center">
                    <div className="w-full text-center mb-1">
                      <span className="font-medium">a = {data.final_results.slope_dash.toFixed(4)}</span>
                    </div>
                    <div className="w-full text-center">
                      <span className="font-medium">b = {data.final_results.intercept_dash.toFixed(4)}</span>
                    </div>
                  </div>
                </div>


                <div className="overflow-x-auto mt-4">
                  <table className="min-w-full border-collapse border border-gray-300">
                    <tbody>
                      <tr>
                        {data.final_results.final_table.headers.map((header: string, index: number) => (
                          <th key={index} className="px-2 py-1 border border-gray-300 text-center bg-green-200">
                            {header}
                          </th>
                        ))}
                      </tr>

                      {data.final_results.final_table.rows.map((row: any, rowIndex: number) => (
                        <tr key={rowIndex}>
                          {row.map((cell: any, cellIndex: number) => (
                            <td key={cellIndex} className="px-2 py-1 border border-gray-300 text-center">
                              {typeof cell === "string" ? cell : cell.toFixed(4)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </div>
            </div>
          </div>
        )}
      </div>
    </div >
  );
};

export default MTTDataViewer;