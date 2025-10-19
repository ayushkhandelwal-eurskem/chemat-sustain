"use client";
import React, { FC, useEffect, useState, useMemo } from "react";
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
    cas: string | null;
    cas_for_core: string | null;
    supplier: string | null;
    material_state: string | null;
    batch: string | null;
    preparation_date: string | null;
    molar_concentration: string | null;
    particles_stock: string | null;
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

interface SIMSInstrumentationData {
    instrument_specs: string | null;
    primary_ions: string | null;
    detector: string | null;
    measurement_technique: string | null;
    mass_resolution: string | null;
    mass_range: string | null;
    scan_area: string | null;
}

interface ReplicationData {
    test_identifier_number: string | null;
    test_start_date: string | null;
    test_end_date: string | null;
    replication_count: number | null;
}

interface SIMSRawIon {
    channel: number | null;
    mass: number | null;
    intensity: number | null;
}

interface SIMSRawData {
    run_number: number;
    negative_ions: SIMSRawIon[];
    positive_ions: SIMSRawIon[];
}

interface SIMSProcessedIon {
    mass: number | null;
    counts: number | null;
}

interface SIMSProcessedData {
    run_number: number;
    negative_ions: SIMSProcessedIon[];
    positive_ions: SIMSProcessedIon[];
    total_negative_counts: number | null;
    total_positive_counts: number | null;
}

interface SIMSFinalIon {
    mass: number | null;
    fragment: string | null;
}

interface SIMSFinalResults {
    negative_ions: SIMSFinalIon[];
    positive_ions: SIMSFinalIon[];
}

interface SIMSData {
    test_details: {
        work_package: WorkPackageData;
        material: MaterialData;
        sample_preparation: SamplePreparationData;
        instrumentation: SIMSInstrumentationData;
    };
    replication: ReplicationData;
    replications: SIMSRawData[];
    processed_data: SIMSProcessedData[];
    final_results: SIMSFinalResults;
}

const SIMSDataViewer: FC<PageProps> = ({ work_package, element, test, file }) => {
    const [data, setData] = useState<SIMSData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState("test-conditions");

    // Move binRawData function definition above useMemo hooks
    const binRawData = (ions: SIMSRawIon[]): { mass: number; intensity: number }[] => {
        const bins = new Map<number, number>();
        ions.forEach((ion) => {
            if (ion.mass !== null && ion.intensity !== null) {
                const m = Math.round(ion.mass);
                bins.set(m, (bins.get(m) || 0) + ion.intensity);
            }
        });
        let chartData = Array.from(bins.entries()).filter(([_, intensity]) => intensity > 0).map(([mass, intensity]) => ({
            mass,
            intensity,
        }));
        chartData.sort((a, b) => a.mass - b.mass);
        return chartData;
    };

    // useMemo hooks
    const allNegativeIons = useMemo(() => data?.replications.flatMap(r => r.negative_ions) || [], [data?.replications]);
    const allPositiveIons = useMemo(() => data?.replications.flatMap(r => r.positive_ions) || [], [data?.replications]);
    const negativeChartData = useMemo(() => binRawData(allNegativeIons), [allNegativeIons]);
    const positiveChartData = useMemo(() => binRawData(allPositiveIons), [allPositiveIons]);
    const limitedNegativeIons = useMemo(() => allNegativeIons.slice(0, 100), [allNegativeIons]);
    const limitedPositiveIons = useMemo(() => allPositiveIons.slice(0, 100), [allPositiveIons]);

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
                console.log("Fetched SIMS data:", result);
                setData(result);
            } catch (err) {
                console.error("Error fetching data:", err);
                setError("Failed to load SIMS data. Please try again later.");
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
                        SIMS Test Data Report
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
                                    <span className="font-semibold">Laboratory Name:</span>{" "}
                                    {data.test_details.work_package.laboratory_name || "N/A"}
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
                                            <td className="py-2 px-4 border">{data.test_details.material.erm_id || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Material Name</td>
                                            <td className="py-2 px-4 border">{data.test_details.material.material_name || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Core Chemistry</td>
                                            <td className="py-2 px-4 border">{data.test_details.material.core_chemistry || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Material State</td>
                                            <td className="py-2 px-4 border">{data.test_details.material.material_state || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">CAS No</td>
                                            <td className="py-2 px-4 border">{data.test_details.material.cas || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">CAS for Core</td>
                                            <td className="py-2 px-4 border">{data.test_details.material.cas_for_core || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Supplier</td>
                                            <td className="py-2 px-4 border">{data.test_details.material.supplier || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Batch</td>
                                            <td className="py-2 px-4 border">{data.test_details.material.batch || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Batch Preparation Date</td>
                                            <td className="py-2 px-4 border">
                                                {data.test_details.material.preparation_date || "N/A"}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Molar Concentration</td>
                                            <td className="py-2 px-4 border">
                                                {data.test_details.material.molar_concentration || "N/A"}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Particles in Stock</td>
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
                                            <td className="py-2 px-4 border">{data.test_details.sample_preparation.dispersion_protocol || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Dispersion technique used</td>
                                            <td className="py-2 px-4 border">{data.test_details.sample_preparation.dispersion_technique || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Dispersion/Dilution medium</td>
                                            <td className="py-2 px-4 border">{data.test_details.sample_preparation.dispersion_medium || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Sonicator type</td>
                                            <td className="py-2 px-4 border">{data.test_details.sample_preparation.sonicator_type || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Power(W)</td>
                                            <td className="py-2 px-4 border">{data.test_details.sample_preparation.power || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Sonication time(secs)</td>
                                            <td className="py-2 px-4 border">{data.test_details.sample_preparation.sonication_time || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Tip thickness(mm)</td>
                                            <td className="py-2 px-4 border">{data.test_details.sample_preparation.tip_thickness || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Tip composition</td>
                                            <td className="py-2 px-4 border">{data.test_details.sample_preparation.tip_composition || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Size of ultrasonic bath/water volume (dm3)</td>
                                            <td className="py-2 px-4 border">{data.test_details.sample_preparation.ultrasonic_bath_size || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Sample volume</td>
                                            <td className="py-2 px-4 border">{data.test_details.sample_preparation.sample_volume || "N/A"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Final sample concentration (mg/L or ppm)</td>
                                            <td className="py-2 px-4 border">{data.test_details.sample_preparation.final_concentration || "N/A"}</td>
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
                                            <td className="py-2 px-4 border font-medium">SIMS Instrumentation Model and Company</td>
                                            <td className="py-2 px-4 border">
                                                {data.test_details.instrumentation.instrument_specs || "N/A"}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Primary Ions</td>
                                            <td className="py-2 px-4 border">
                                                {data.test_details.instrumentation.primary_ions || "N/A"}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Detector</td>
                                            <td className="py-2 px-4 border">
                                                {data.test_details.instrumentation.detector || "N/A"}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Measurement Technique</td>
                                            <td className="py-2 px-4 border">
                                                {data.test_details.instrumentation.measurement_technique || "N/A"}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Mass Resolution</td>
                                            <td className="py-2 px-4 border">
                                                {data.test_details.instrumentation.mass_resolution || "N/A"}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Mass Range</td>
                                            <td className="py-2 px-4 border">
                                                {data.test_details.instrumentation.mass_range || "N/A"}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-4 border font-medium">Scan Area</td>
                                            <td className="py-2 px-4 border">
                                                {data.test_details.instrumentation.scan_area || "N/A"}
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
                {activeTab === "raw-data" && data.replications && (
                    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                        <h2 className="text-xl font-bold text-blue-800 mb-6">Raw Data</h2>
                        {data.replications.length === 0 ? (
                            <p className="text-center text-gray-500">No raw data available.</p>
                        ) : (
                            <>
                                {/* Combined Raw Negative Ions Chart */}
                                <div className="mb-8">
                                    <h3 className="text-lg font-semibold mb-3">Negative Ions Spectrum</h3>
                                    <ResponsiveContainer width="100%" height={400}>
                                        <BarChart data={negativeChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis
                                                dataKey="mass"
                                                label={{ value: "m/z", position: "insideBottom", offset: -5 }}
                                            />
                                            <YAxis label={{ value: "Counts", angle: -90, position: "insideLeft" }} />
                                            <Tooltip />
                                            <Bar dataKey="intensity" fill="#8884d8" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Combined Raw Negative Ions Table (limited to first 100 rows) */}
                                <div className="mb-8">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="text-md font-medium">Raw Negative Ions (First 100 rows shown; full data available via download)</h4>
                                        <button
                                            onClick={() => downloadTable("rawNegativeTable", "Raw_Negative")}
                                            className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition"
                                        >
                                            <Download size={14} />
                                            <span>Download Full</span>
                                        </button>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table id="rawNegativeTable" className="min-w-full bg-white border border-gray-200">
                                            <thead>
                                                <tr className="bg-gray-100">
                                                    <th className="py-2 px-4 border text-left">Channel</th>
                                                    <th className="py-2 px-4 border text-left">Mass</th>
                                                    <th className="py-2 px-4 border text-left">Intensity</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {limitedNegativeIons.length > 0 ? (
                                                    limitedNegativeIons.map((ion, index) => (
                                                        <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                                                            <td className="py-2 px-4 border">{ion.channel ?? "-"}</td>
                                                            <td className="py-2 px-4 border">{ion.mass?.toFixed(6) ?? "-"}</td>
                                                            <td className="py-2 px-4 border">{ion.intensity ?? "-"}</td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan={3} className="py-2 px-4 border text-center">
                                                            No negative ions data available
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Combined Raw Positive Ions Chart */}
                                <div className="mb-8">
                                    <h3 className="text-lg font-semibold mb-3">Positive Ions Spectrum</h3>
                                    <ResponsiveContainer width="100%" height={400}>
                                        <BarChart data={positiveChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis
                                                dataKey="mass"
                                                label={{ value: "m/z", position: "insideBottom", offset: -5 }}
                                            />
                                            <YAxis label={{ value: "Counts", angle: -90, position: "insideLeft" }} />
                                            <Tooltip />
                                            <Bar dataKey="intensity" fill="#82ca9d" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Combined Raw Positive Ions Table (limited to first 100 rows) */}
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="text-md font-medium">Raw Positive Ions (First 100 rows shown; full data available via download)</h4>
                                        <button
                                            onClick={() => downloadTable("rawPositiveTable", "Raw_Positive")}
                                            className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition"
                                        >
                                            <Download size={14} />
                                            <span>Download Full</span>
                                        </button>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table id="rawPositiveTable" className="min-w-full bg-white border border-gray-200">
                                            <thead>
                                                <tr className="bg-gray-100">
                                                    <th className="py-2 px-4 border text-left">Channel</th>
                                                    <th className="py-2 px-4 border text-left">Mass</th>
                                                    <th className="py-2 px-4 border text-left">Intensity</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {limitedPositiveIons.length > 0 ? (
                                                    limitedPositiveIons.map((ion, index) => (
                                                        <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                                                            <td className="py-2 px-4 border">{ion.channel ?? "-"}</td>
                                                            <td className="py-2 px-4 border">{ion.mass?.toFixed(6) ?? "-"}</td>
                                                            <td className="py-2 px-4 border">{ion.intensity ?? "-"}</td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan={3} className="py-2 px-4 border text-center">
                                                            No positive ions data available
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Processed Data Tab */}
                {activeTab === "processed-data" && data.processed_data && (
                    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                        <h2 className="text-xl font-bold text-blue-800 mb-6">Processed Data</h2>
                        {data.processed_data.length === 0 ? (
                            <p className="text-center text-gray-500">No processed data available.</p>
                        ) : (
                            data.processed_data.map((run, runIndex) => (
                                <div key={runIndex} className="mb-8">
                                    <h3 className="text-lg font-semibold mb-3">Run {run.run_number}</h3>

                                    {/* Processed Negative Ions Table */}
                                    <div className="mb-6">
                                        <div className="flex justify-between items-center mb-4">
                                            <h4 className="text-md font-medium">Processed Negative Ions</h4>
                                            <button
                                                onClick={() => downloadTable(`processedNegativeTable${runIndex}`, `Processed_Negative_Run_${run.run_number}`)}
                                                className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition"
                                            >
                                                <Download size={14} />
                                                <span>Download</span>
                                            </button>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table id={`processedNegativeTable${runIndex}`} className="min-w-full bg-white border border-gray-200">
                                                <thead>
                                                    <tr className="bg-gray-100">
                                                        <th className="py-2 px-4 border text-left">Mass</th>
                                                        <th className="py-2 px-4 border text-left">Counts</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {run.negative_ions.length > 0 ? (
                                                        run.negative_ions.map((ion, index) => (
                                                            <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                                                                <td className="py-2 px-4 border">{ion.mass?.toFixed(2) ?? "-"}</td>
                                                                <td className="py-2 px-4 border">{ion.counts ?? "-"}</td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={2} className="py-2 px-4 border text-center">
                                                                No processed negative ions data available
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Processed Positive Ions Table */}
                                    <div>
                                        <div className="flex justify-between items-center mb-4">
                                            <h4 className="text-md font-medium">Processed Positive Ions</h4>
                                            <button
                                                onClick={() => downloadTable(`processedPositiveTable${runIndex}`, `Processed_Positive_Run_${run.run_number}`)}
                                                className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition"
                                            >
                                                <Download size={14} />
                                                <span>Download</span>
                                            </button>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table id={`processedPositiveTable${runIndex}`} className="min-w-full bg-white border border-gray-200">
                                                <thead>
                                                    <tr className="bg-gray-100">
                                                        <th className="py-2 px-4 border text-left">Mass</th>
                                                        <th className="py-2 px-4 border text-left">Counts</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {run.positive_ions.length > 0 ? (
                                                        run.positive_ions.map((ion, index) => (
                                                            <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                                                                <td className="py-2 px-4 border">{ion.mass?.toFixed(2) ?? "-"}</td>
                                                                <td className="py-2 px-4 border">{ion.counts ?? "-"}</td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={2} className="py-2 px-4 border text-center">
                                                                No processed positive ions data available
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    {/* Processed Totals */}
                                    <div className="mb-6">
                                        <h4 className="text-md font-medium mb-2">Totals</h4>
                                        <table className="min-w-full bg-white border border-gray-200">
                                            <thead>
                                                <tr className="bg-gray-100">
                                                    <th className="py-2 px-4 border text-left">Metric</th>
                                                    <th className="py-2 px-4 border text-left">Value</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td className="py-2 px-4 border">Total Negative Counts</td>
                                                    <td className="py-2 px-4 border">{run.total_negative_counts ?? "N/A"}</td>
                                                </tr>
                                                <tr className="bg-gray-50">
                                                    <td className="py-2 px-4 border">Total Positive Counts</td>
                                                    <td className="py-2 px-4 border">{run.total_positive_counts ?? "N/A"}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Results Tab */}
                {activeTab === "results" && (
                    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                        <h2 className="text-xl font-bold text-blue-800 mb-6">SIMS Results</h2>

                        {/* Final Results Negative Ions */}
                        <div className="mb-8">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold">Final Negative Ions</h3>
                                <button
                                    onClick={() => downloadTable("finalNegativeTable", "Final_Negative_Ions")}
                                    className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition"
                                >
                                    <Download size={14} />
                                    <span>Download</span>
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table id="finalNegativeTable" className="min-w-full bg-white border border-gray-200">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="py-2 px-4 border text-left">Mass</th>
                                            <th className="py-2 px-4 border text-left">Fragment</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.final_results.negative_ions.length > 0 ? (
                                            data.final_results.negative_ions.map((ion, index) => (
                                                <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                                                    <td className="py-2 px-4 border">{ion.mass?.toFixed(2) ?? "-"}</td>
                                                    <td className="py-2 px-4 border">{ion.fragment ?? "-"}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={2} className="py-2 px-4 border text-center">
                                                    No final negative ions available
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Final Results Positive Ions */}
                        <div className="mb-8">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold">Final Positive Ions</h3>
                                <button
                                    onClick={() => downloadTable("finalPositiveTable", "Final_Positive_Ions")}
                                    className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition"
                                >
                                    <Download size={14} />
                                    <span>Download</span>
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table id="finalPositiveTable" className="min-w-full bg-white border border-gray-200">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="py-2 px-4 border text-left">Mass</th>
                                            <th className="py-2 px-4 border text-left">Fragment</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.final_results.positive_ions.length > 0 ? (
                                            data.final_results.positive_ions.map((ion, index) => (
                                                <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                                                    <td className="py-2 px-4 border">{ion.mass?.toFixed(2) ?? "-"}</td>
                                                    <td className="py-2 px-4 border">{ion.fragment ?? "-"}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={2} className="py-2 px-4 border text-center">
                                                    No final positive ions available
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

export default SIMSDataViewer;