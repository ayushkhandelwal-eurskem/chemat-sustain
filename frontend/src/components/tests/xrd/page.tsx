"use client";
import React, { FC, useEffect, useState, useMemo, useCallback } from "react";
import { api } from "@/lib/axios";
import {
  Download,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

/* ================================================================
   Types — mapped directly from XRD parser dataclasses
   ================================================================ */

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
  molar_concentration: string | null;
  particles_stock: string | null;
}

interface DispersionData {
  dispersion_protocol: string | null;
  dispersion_technique: string | null;
  dispersion_medium: string | null;
  sonicator_type: string | null;
  power_w: string | null;
  sonication_time_s: string | null;
  tip_thickness_mm: string | null;
  tip_composition: string | null;
  bath_volume_dm3: string | null;
  sample_volume: string | null;
  final_concentration: string | null;
  additional_info: string | null;
}

interface InstrumentationData {
  diffractometer_model: string | null;
  xray_lamp: string | null;
  detector: string | null;
  measurement_technique: string | null;
  generator_voltage: string | null;
  scan_speed: string | null;
  resolution: string | null;
  number_of_scans: number | string | null;
  replication_count: number | string | null;
  replicate_labels: string[];
  two_theta_range: string | null;
}

interface ReplicationMetadata {
  test_identifier_number: string | null;
  test_start_date: string | null;
  test_end_date: string | null;
  replicate_label: string | null;
  raw_sheet_name: string | null;
  processed_sheet_name: string | null;
}

interface XRDSpectrumPoint {
  two_theta_deg: number | null;
  counts_mean: number | null;
  counts_individual: (number | null)[];
}

interface XRDRawDataBlock {
  metric_name: string | null;
  raw_sheet_name: string | null;
  processed_sheet_name: string | null;
  two_theta_unit: string | null;
  counts_unit: string | null;
  number_of_scans: number | null;
  point_count: number | null;
  min_two_theta_deg: number | null;
  max_two_theta_deg: number | null;
  min_counts_mean: number | null;
  max_counts_mean: number | null;
  spectrum_points: XRDSpectrumPoint[];
}

interface XRDPeakEntry {
  peak_number: number | null;
  position_2theta_deg: number | null;
  d_spacing_angstrom: number | null;
  height_counts: number | null;
  fwhm_left_2theta_deg: number | null;
  area_counts_2theta: number | null;
}

interface XRDProcessedDataBlock {
  processed_sheet_name: string | null;
  peak_count: number | null;
  peaks: XRDPeakEntry[];
}

interface XRDFinalResultBlock {
  crystal_structure: string | null;
  other_crystal_forms: string | null;
  other_crystal_forms_concentration: string | null;
}

interface ParserWarning {
  type?: string;
  sheet?: string;
  note?: string;
}

interface XRDData {
  test_details: {
    work_package: WorkPackageData;
    material: MaterialData;
    cell_line: Record<string, never>;
    dispersion: DispersionData;
    instrumentation: InstrumentationData;
  };
  /** Backend remaps parser's "replication_metadata" → "replications" */
  replications: ReplicationMetadata[];
  /** Backend remaps parser's "replications" → "raw_data" */
  raw_data: XRDRawDataBlock[];
  processed_data: {
    peak_lists: XRDProcessedDataBlock[];
    processed_sheet_count: number;
    total_peaks_identified: number;
  };
  final_results: XRDFinalResultBlock[];
  statistical_analysis: {
    available: boolean;
    notes: string;
  };
  parser_warnings?: ParserWarning[];
}

/* ================================================================
   Tab Configuration
   ================================================================ */

type TabKey = "test-conditions" | "raw-data" | "processed-data" | "results";

interface TabConfig {
  key: TabKey;
  label: string;
}

const TABS: TabConfig[] = [
  { key: "test-conditions", label: "Test Conditions" },
  { key: "raw-data", label: "Raw Data" },
  { key: "processed-data", label: "Processed Data" },
  { key: "results", label: "Final Results" },
];

/* ================================================================
   Chart Colors
   ================================================================ */

const SCAN_COLORS = [
  "#94a3b8", // slate-400
  "#a1a1aa", // zinc-400
  "#9ca3af", // gray-400
  "#93c5fd", // blue-300
  "#c4b5fd", // violet-300
  "#86efac", // green-300
  "#fde68a", // amber-200
  "#fca5a5", // red-300
  "#67e8f9", // cyan-300
];

const MEAN_COLOR = "#2563eb"; // blue-600

/* ================================================================
   Helpers
   ================================================================ */

const fmt = (value: any, digits = 4) => {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return value.toFixed(digits);
  return String(value);
};

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

function downloadTableCSV(tableId: string, filename: string) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const rows = table.querySelectorAll("tr");
  let csv = "data:text/csv;charset=utf-8,";

  rows.forEach((row) => {
    const cells = row.querySelectorAll("th, td");
    csv +=
      Array.from(cells)
        .map((c) => csvEscape(c.textContent ?? ""))
        .join(",") + "\r\n";
  });

  const a = document.createElement("a");
  a.href = encodeURI(csv);
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** LTTB downsampling for large XRD datasets */
function lttb(
  data: { x: number; y: number }[],
  threshold: number
): { x: number; y: number }[] {
  const n = data.length;
  if (threshold >= n || threshold === 0) return data;
  const sampled: { x: number; y: number }[] = [];
  let a = 0;
  const bucketSize = (n - 2) / (threshold - 2);
  sampled.push(data[a]);
  for (let i = 0; i < threshold - 2; i++) {
    const start = Math.floor((i + 1) * bucketSize) + 1;
    const end = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);

    let avgX = 0,
      avgY = 0;
    const len = Math.max(1, end - start);
    for (let j = start; j < end; j++) {
      avgX += data[j].x;
      avgY += data[j].y;
    }
    avgX /= len;
    avgY /= len;

    let maxArea = -1;
    let nextA = start;
    for (let j = start; j < end; j++) {
      const area =
        Math.abs(
          (data[a].x - avgX) * (data[j].y - data[a].y) -
            (data[a].x - data[j].x) * (avgY - data[a].y)
        ) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        nextA = j;
      }
    }
    sampled.push(data[nextA]);
    a = nextA;
  }
  sampled.push(data[n - 1]);
  return sampled;
}

/* ================================================================
   Helper Components
   ================================================================ */

const CollapsibleSection: FC<{
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition"
        onClick={() => setOpen((prev) => !prev)}
      >
        <h2 className="text-xl font-bold text-blue-800">{title}</h2>
        {open ? (
          <ChevronUp className="text-gray-400" size={20} />
        ) : (
          <ChevronDown className="text-gray-400" size={20} />
        )}
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
};

const KVTable: FC<{
  id: string;
  rows: { label: string; value: React.ReactNode }[];
  downloadFilename?: string;
}> = ({ id, rows, downloadFilename }) => {
  const onDownload = useCallback(() => {
    if (downloadFilename) downloadTableCSV(id, downloadFilename);
  }, [id, downloadFilename]);

  return (
    <>
      {downloadFilename && (
        <div className="flex justify-end mb-3">
          <button
            onClick={onDownload}
            className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"
          >
            <Download size={14} />
            <span>Download</span>
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table id={id} className="min-w-full bg-white border border-gray-200">
          <thead>
            <tr className="bg-gray-100">
              <th className="py-2 px-4 border text-left">Property</th>
              <th className="py-2 px-4 border text-left">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                <td className="py-2 px-4 border font-medium">{row.label}</td>
                <td className="py-2 px-4 border">{row.value ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

/* ================================================================
   Main Component
   ================================================================ */

const XRDDataViewer: FC<PageProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<XRDData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("test-conditions");
  const [selectedRawBlock, setSelectedRawBlock] = useState(0);
  const [showIndividualScans, setShowIndividualScans] = useState(false);
  const [selectedPeakList, setSelectedPeakList] = useState(0);

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
          console.error("Error fetching XRD data:", err);
          setError("Failed to load XRD data. Please try again later.");
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [work_package, element, test]);

  /* ---- Derived data (hooks always run) ---- */

  const safeRawBlocks: XRDRawDataBlock[] = useMemo(() => {
    return Array.isArray(data?.raw_data) ? data.raw_data : [];
  }, [data?.raw_data]);

  const safePeakLists: XRDProcessedDataBlock[] = useMemo(() => {
    return Array.isArray(data?.processed_data?.peak_lists)
      ? data.processed_data.peak_lists
      : [];
  }, [data?.processed_data?.peak_lists]);

  const safeFinalResults: XRDFinalResultBlock[] = useMemo(() => {
    return Array.isArray(data?.final_results) ? data.final_results : [];
  }, [data?.final_results]);

  /** Downsample the mean diffractogram for chart rendering */
  const meanChartData = useMemo(() => {
    const block = safeRawBlocks[selectedRawBlock];
    if (!block?.spectrum_points?.length) return [];

    const raw = block.spectrum_points
      .filter(
        (p) => p.two_theta_deg != null && p.counts_mean != null
      )
      .map((p) => ({ x: p.two_theta_deg as number, y: p.counts_mean as number }))
      .sort((a, b) => a.x - b.x);

    const target = Math.min(800, raw.length);
    const sampled = lttb(raw, target);
    return sampled.map((p) => ({ two_theta: p.x, counts_mean: p.y }));
  }, [safeRawBlocks, selectedRawBlock]);

  /** Build chart data with individual scans when toggled */
  const fullChartData = useMemo(() => {
    if (!showIndividualScans) return meanChartData;

    const block = safeRawBlocks[selectedRawBlock];
    if (!block?.spectrum_points?.length) return [];

    const numScans = block.number_of_scans ?? 0;
    const raw = block.spectrum_points
      .filter((p) => p.two_theta_deg != null)
      .sort((a, b) => (a.two_theta_deg as number) - (b.two_theta_deg as number));

    // Downsample for performance
    const indices = lttb(
      raw.map((p) => ({
        x: p.two_theta_deg as number,
        y: p.counts_mean ?? 0,
      })),
      Math.min(800, raw.length)
    );

    const indexSet = new Set(indices.map((p) => p.x));

    return raw
      .filter((p) => indexSet.has(p.two_theta_deg as number))
      .map((p) => {
        const point: Record<string, any> = {
          two_theta: p.two_theta_deg,
          counts_mean: p.counts_mean,
        };
        if (p.counts_individual) {
          p.counts_individual.forEach((v, i) => {
            point[`Scan ${i + 1}`] = v;
          });
        }
        return point;
      });
  }, [meanChartData, showIndividualScans, safeRawBlocks, selectedRawBlock]);

  /** Peak bar chart data */
  const peakBarData = useMemo(() => {
    const peakList = safePeakLists[selectedPeakList];
    if (!peakList?.peaks?.length) return [];

    return peakList.peaks.map((p) => ({
      label: `${fmt(p.position_2theta_deg, 2)}°`,
      position: p.position_2theta_deg,
      height: p.height_counts,
      area: p.area_counts_2theta,
      fwhm: p.fwhm_left_2theta_deg,
      d_spacing: p.d_spacing_angstrom,
    }));
  }, [safePeakLists, selectedPeakList]);

  /* ---- Render ---- */

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

  const td = data.test_details;
  const wp = td.work_package;
  const mat = td.material;
  const disp = td.dispersion;
  const inst = td.instrumentation;
  const repMeta = data.replications ?? [];
  const warnings = data.parser_warnings ?? [];

  return (
    <div className="bg-gray-50 min-h-screen py-8 text-black">
      <div className="container mx-auto px-4">
        {/* ---- Header ---- */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-4">
            XRD Test Data Report
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Parameters</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2">
                  <span className="font-semibold">Work Package:</span>{" "}
                  {wp.wp_name || work_package || ""}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">CMS Internal Identifier:</span>{" "}
                  {mat.material_identifier ?? element ?? ""}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">ERM Identifier:</span>{" "}
                  {mat.erm_id ?? ""}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Partner:</span>{" "}
                  {wp.partner ?? ""}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Material:</span>{" "}
                  {mat.material_name ?? ""}
                </p>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-3">Test Information</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2">
                  <span className="font-semibold">Full Test Name:</span>{" "}
                  {wp.full_test_name ?? ""}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Test Acronym:</span>{" "}
                  {wp.test_acronym ?? ""}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Test Type:</span>{" "}
                  {wp.test_type ?? ""}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Endpoint:</span>{" "}
                  {wp.endpoint ?? ""}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Endpoint Outcome:</span>{" "}
                  {wp.endpoint_outcome ?? ""}
                </p>
                <p>
                  <span className="font-semibold">SOP:</span> {wp.sop ?? "N/A"}
                </p>
              </div>
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="mt-4 bg-yellow-50 border border-yellow-300 rounded-md p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-yellow-600" />
                <span className="font-semibold text-yellow-800 text-sm">
                  Parser Warnings ({warnings.length})
                </span>
              </div>
              <ul className="text-sm text-yellow-700 space-y-1">
                {warnings.map((w, i) => (
                  <li key={i}>
                    {w.sheet ? `Sheet "${w.sheet}": ` : ""}
                    {w.note || w.type || "Warning"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ---- Tab Bar ---- */}
        <div className="w-full mb-8">
          <ul
            className="relative flex flex-wrap p-1.5 list-none rounded-md bg-slate-100"
            role="tablist"
          >
            {TABS.map((tab) => (
              <li
                key={tab.key}
                className="z-30 flex-auto text-center"
                role="presentation"
              >
                <button
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  className={`z-30 w-full px-0 py-2 text-sm mb-0 transition-all rounded-md ${
                    activeTab === tab.key
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* ================================================================
           TAB: Test Conditions
           ================================================================ */}
        {activeTab === "test-conditions" && (
          <>
            <CollapsibleSection title="Material Information">
              <KVTable
                id="materialTable"
                downloadFilename="XRD_Material_Info"
                rows={[
                  { label: "CMS Internal Identifier", value: mat.material_identifier ?? element ?? "" },
                  { label: "ERM Identifier", value: mat.erm_id ?? "" },
                  { label: "Material Name", value: mat.material_name ?? "" },
                  { label: "Core Chemistry", value: mat.core_chemistry ?? "" },
                  { label: "CAS No", value: mat.cas_no ?? "" },
                  { label: "CAS for Core", value: mat.cas_for_core ?? "" },
                  { label: "Material Supplier", value: mat.material_supplier ?? "" },
                  { label: "Material State", value: mat.material_state ?? "" },
                  { label: "Batch", value: mat.batch ?? "" },
                  { label: "Vial", value: mat.vial ?? "" },
                  { label: "Preparation Date", value: mat.preparation_date ?? "" },
                  { label: "Molar Concentration", value: mat.molar_concentration ?? "" },
                  { label: "No. of Particles in Stock", value: mat.particles_stock ?? "" },
                ]}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Sample Preparation">
              <KVTable
                id="dispersionTable"
                downloadFilename="XRD_Sample_Preparation"
                rows={[
                  { label: "Dispersion Protocol", value: disp.dispersion_protocol ?? "" },
                  { label: "Dispersion Technique", value: disp.dispersion_technique ?? "" },
                  { label: "Dispersion/Dilution Medium", value: disp.dispersion_medium ?? "" },
                  { label: "Sonicator Type", value: disp.sonicator_type ?? "" },
                  { label: "Power (W)", value: disp.power_w ?? "" },
                  { label: "Sonication Time (secs)", value: disp.sonication_time_s ?? "" },
                  { label: "Tip Thickness (mm)", value: disp.tip_thickness_mm ?? "" },
                  { label: "Tip Composition", value: disp.tip_composition ?? "" },
                  { label: "Ultrasonic Bath Volume (dm³)", value: disp.bath_volume_dm3 ?? "" },
                  { label: "Sample Volume", value: disp.sample_volume ?? "" },
                  { label: "Final Sample Concentration (mg/L)", value: disp.final_concentration ?? "" },
                  { label: "Additional Information", value: disp.additional_info ?? "" },
                ]}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Instrumentation">
              <KVTable
                id="instrumentationTable"
                downloadFilename="XRD_Instrumentation"
                rows={[
                  { label: "Diffractometer Model", value: inst.diffractometer_model ?? "" },
                  { label: "X-Ray Lamp", value: inst.xray_lamp ?? "" },
                  { label: "Detector", value: inst.detector ?? "" },
                  { label: "Measurement Technique", value: inst.measurement_technique ?? "" },
                  { label: "Generator Voltage", value: inst.generator_voltage ?? "" },
                  { label: "Scan Speed", value: inst.scan_speed ?? "" },
                  { label: "Resolution", value: inst.resolution ?? "" },
                  { label: "Number of Scans", value: inst.number_of_scans ?? "" },
                  { label: "Replication Count", value: inst.replication_count ?? "" },
                  { label: "2Theta Range", value: inst.two_theta_range ?? "" },
                ]}
              />

              {inst.replicate_labels && inst.replicate_labels.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-md font-semibold mb-2">Replicate Labels</h4>
                  <div className="flex flex-wrap gap-2">
                    {inst.replicate_labels.map((lbl, i) => (
                      <span
                        key={i}
                        className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded"
                      >
                        {lbl}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Replication Metadata">
              <div className="flex justify-end mb-3">
                <button
                  onClick={() =>
                    downloadTableCSV("replicationMetaTable", "XRD_Replications")
                  }
                  className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"
                >
                  <Download size={14} />
                  <span>Download</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table
                  id="replicationMetaTable"
                  className="min-w-full bg-white border border-gray-200"
                >
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border text-left">Test Identifier</th>
                      <th className="py-2 px-4 border text-left">Start Date</th>
                      <th className="py-2 px-4 border text-left">End Date</th>
                      <th className="py-2 px-4 border text-left">Label</th>
                      <th className="py-2 px-4 border text-left">Raw Sheet</th>
                      <th className="py-2 px-4 border text-left">Processed Sheet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repMeta.length ? (
                      repMeta.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                          <td className="py-2 px-4 border">
                            {r.test_identifier_number ?? ""}
                          </td>
                          <td className="py-2 px-4 border">
                            {r.test_start_date ?? ""}
                          </td>
                          <td className="py-2 px-4 border">
                            {r.test_end_date ?? ""}
                          </td>
                          <td className="py-2 px-4 border">
                            {r.replicate_label ?? ""}
                          </td>
                          <td className="py-2 px-4 border">
                            {r.raw_sheet_name ?? ""}
                          </td>
                          <td className="py-2 px-4 border">
                            {r.processed_sheet_name ?? ""}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-2 px-4 border text-center">
                          No replication metadata available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Scientists Information">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Lead Scientists</h3>
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
                      {wp.lead_scientists?.length ? (
                        wp.lead_scientists.map((s, i) => (
                          <tr key={i}>
                            <td className="py-2 px-4 border">{s.name ?? ""}</td>
                            <td className="py-2 px-4 border">{s.email ?? ""}</td>
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
                  <h3 className="text-lg font-semibold mb-3">Assay Scientists</h3>
                  <table className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">Name</th>
                        <th className="py-2 px-4 border text-left">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wp.assay_scientists?.length ? (
                        wp.assay_scientists.map((s, i) => (
                          <tr key={i}>
                            <td className="py-2 px-4 border">{s.name ?? ""}</td>
                            <td className="py-2 px-4 border">{s.email ?? ""}</td>
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
            </CollapsibleSection>
          </>
        )}

        {/* ================================================================
           TAB: Raw Data
           ================================================================ */}
        {activeTab === "raw-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">
                Raw XRD Diffractogram
              </h2>
              <button
                onClick={() =>
                  downloadTableCSV(
                    "rawDataTable",
                    `XRD_Raw_${selectedRawBlock + 1}`
                  )
                }
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            {safeRawBlocks.length > 0 ? (
              <>
                {/* Block selector (if multiple) */}
                {safeRawBlocks.length > 1 && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Data Block:
                    </label>
                    <select
                      value={selectedRawBlock}
                      onChange={(e) =>
                        setSelectedRawBlock(Number(e.target.value))
                      }
                      className="w-full md:w-2/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
                    >
                      {safeRawBlocks.map((block, index) => (
                        <option key={index} value={index}>
                          {block.metric_name || `Block ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Summary badges */}
                {(() => {
                  const block = safeRawBlocks[selectedRawBlock];
                  return (
                    <div className="flex flex-wrap gap-3 mb-6">
                      <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-3 py-1.5 rounded-full">
                        {block.point_count ?? 0} data points
                      </span>
                      <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-3 py-1.5 rounded-full">
                        {block.number_of_scans ?? 0} individual scans
                      </span>
                      <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-3 py-1.5 rounded-full">
                        2θ: {fmt(block.min_two_theta_deg, 2)}° –{" "}
                        {fmt(block.max_two_theta_deg, 2)}°
                      </span>
                      <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-3 py-1.5 rounded-full">
                        Max counts: {fmt(block.max_counts_mean, 0)}
                      </span>
                    </div>
                  );
                })()}

                {/* Toggle individual scans */}
                <div className="mb-4">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showIndividualScans}
                      onChange={(e) =>
                        setShowIndividualScans(e.target.checked)
                      }
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">
                      Show individual scans
                    </span>
                  </label>
                </div>

                {/* Diffractogram chart */}
                {fullChartData.length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold mb-3">
                      {safeRawBlocks[selectedRawBlock].metric_name ??
                        "XRD Diffractogram"}
                    </h3>
                    <ResponsiveContainer width="100%" height={450}>
                      <LineChart
                        data={fullChartData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="two_theta"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          tickCount={15}
                        />
                        <YAxis
                          label={{
                            value: "Counts",
                            angle: -90,
                            position: "insideLeft",
                          }}
                        />
                        <Tooltip
                          formatter={(value: any, name: string) => [
                            typeof value === "number"
                              ? value.toFixed(1)
                              : value,
                            name,
                          ]}
                          labelFormatter={(label) =>
                            `2θ = ${Number(label).toFixed(3)}°`
                          }
                        />
                        <Legend />

                        {/* Individual scans (drawn first, behind mean) */}
                        {showIndividualScans &&
                          Array.from(
                            {
                              length:
                                safeRawBlocks[selectedRawBlock]
                                  .number_of_scans ?? 0,
                            },
                            (_, i) => (
                              <Line
                                key={`scan-${i}`}
                                dataKey={`Scan ${i + 1}`}
                                stroke={SCAN_COLORS[i % SCAN_COLORS.length]}
                                dot={false}
                                strokeWidth={1}
                                opacity={0.5}
                                isAnimationActive={false}
                              />
                            )
                          )}

                        {/* Mean line */}
                        <Line
                          dataKey="counts_mean"
                          name="Mean Counts"
                          stroke={MEAN_COLOR}
                          dot={false}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Raw data table (first 100 rows) */}
                <div className="mt-6">
                  <h4 className="text-md font-semibold mb-3">
                    Raw Data Preview (First 100 rows of{" "}
                    {safeRawBlocks[selectedRawBlock].point_count ?? 0})
                  </h4>
                  <div className="overflow-x-auto">
                    <table
                      id="rawDataTable"
                      className="min-w-full bg-white border border-gray-200 text-sm"
                    >
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="py-2 px-3 border text-right">
                            2θ (°)
                          </th>
                          <th className="py-2 px-3 border text-right">
                            Counts (Mean)
                          </th>
                          {Array.from(
                            {
                              length:
                                safeRawBlocks[selectedRawBlock]
                                  .number_of_scans ?? 0,
                            },
                            (_, i) => (
                              <th
                                key={i}
                                className="py-2 px-3 border text-right"
                              >
                                Scan {i + 1}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {safeRawBlocks[selectedRawBlock].spectrum_points
                          .slice(0, 100)
                          .map((p, pi) => (
                            <tr
                              key={pi}
                              className={pi % 2 === 0 ? "bg-gray-50" : ""}
                            >
                              <td className="py-2 px-3 border text-right">
                                {fmt(p.two_theta_deg, 3)}
                              </td>
                              <td className="py-2 px-3 border text-right">
                                {fmt(p.counts_mean, 1)}
                              </td>
                              {(p.counts_individual ?? []).map((v, vi) => (
                                <td
                                  key={vi}
                                  className="py-2 px-3 border text-right"
                                >
                                  {v != null ? fmt(v, 0) : ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-center text-gray-500">
                No raw data available.
              </p>
            )}
          </div>
        )}

        {/* ================================================================
           TAB: Processed Data (Peak List)
           ================================================================ */}
        {activeTab === "processed-data" && (
          <>
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-blue-800">
                  Identified Peaks
                </h2>
                <button
                  onClick={() =>
                    downloadTableCSV(
                      "peakListTable",
                      `XRD_Peaks_${selectedPeakList + 1}`
                    )
                  }
                  className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  <Download size={16} />
                  <span>Download</span>
                </button>
              </div>

              {safePeakLists.length > 0 ? (
                <>
                  {/* Selector if multiple */}
                  {safePeakLists.length > 1 && (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Peak List:
                      </label>
                      <select
                        value={selectedPeakList}
                        onChange={(e) =>
                          setSelectedPeakList(Number(e.target.value))
                        }
                        className="w-full md:w-2/3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
                      >
                        {safePeakLists.map((pl, index) => (
                          <option key={index} value={index}>
                            {pl.processed_sheet_name ||
                              `Peak List ${index + 1}`}{" "}
                            ({pl.peak_count} peaks)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Summary */}
                  <div className="mb-6">
                    <div className="flex flex-wrap gap-3">
                      <span className="inline-block bg-green-100 text-green-800 text-xs font-medium px-3 py-1.5 rounded-full">
                        {data.processed_data.total_peaks_identified} total peaks
                        identified
                      </span>
                      <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-3 py-1.5 rounded-full">
                        {data.processed_data.processed_sheet_count} processed
                        sheet(s)
                      </span>
                    </div>
                  </div>

                  {/* Peak height bar chart */}
                  {peakBarData.length > 0 && (
                    <div className="mb-8">
                      <h3 className="text-lg font-semibold mb-3">
                        Peak Heights by 2θ Position
                      </h3>
                      <ResponsiveContainer width="100%" height={350}>
                        <BarChart
                          data={peakBarData}
                          margin={{
                            top: 20,
                            right: 30,
                            left: 20,
                            bottom: 5,
                          }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="label"
                            label={{
                              value: "2θ (°)",
                              position: "insideBottom",
                              offset: -5,
                            }}
                          />
                          <YAxis
                            label={{
                              value: "Height (counts)",
                              angle: -90,
                              position: "insideLeft",
                            }}
                          />
                          <Tooltip
                            content={({ payload }) => {
                              if (!payload?.length) return null;
                              const d = payload[0].payload;
                              return (
                                <div className="bg-white border border-gray-300 p-3 rounded shadow-lg text-sm">
                                  <p className="font-semibold mb-1">
                                    2θ = {fmt(d.position, 4)}°
                                  </p>
                                  <p>
                                    Height: {fmt(d.height, 2)} cts
                                  </p>
                                  <p>
                                    d-spacing: {fmt(d.d_spacing, 5)} Å
                                  </p>
                                  <p>
                                    FWHM: {fmt(d.fwhm, 4)}°
                                  </p>
                                  <p>
                                    Area: {fmt(d.area, 2)} cts·°
                                  </p>
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="height" name="Height (counts)">
                            {peakBarData.map((_, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={
                                  index === 0
                                    ? "#2563eb"
                                    : "#60a5fa"
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Peak list table */}
                  <div className="overflow-x-auto">
                    <table
                      id="peakListTable"
                      className="min-w-full bg-white border border-gray-200 text-sm"
                    >
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="py-2 px-3 border text-center">
                            No.
                          </th>
                          <th className="py-2 px-3 border text-right">
                            Position 2θ (°)
                          </th>
                          <th className="py-2 px-3 border text-right">
                            d-spacing (Å)
                          </th>
                          <th className="py-2 px-3 border text-right">
                            Height (cts)
                          </th>
                          <th className="py-2 px-3 border text-right">
                            FWHM Left (°2θ)
                          </th>
                          <th className="py-2 px-3 border text-right">
                            Area (cts·°2θ)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {safePeakLists[selectedPeakList].peaks.map((p, pi) => (
                          <tr
                            key={pi}
                            className={pi % 2 === 0 ? "bg-gray-50" : ""}
                          >
                            <td className="py-2 px-3 border text-center font-medium">
                              {p.peak_number}
                            </td>
                            <td className="py-2 px-3 border text-right">
                              {fmt(p.position_2theta_deg, 4)}
                            </td>
                            <td className="py-2 px-3 border text-right">
                              {fmt(p.d_spacing_angstrom, 5)}
                            </td>
                            <td className="py-2 px-3 border text-right">
                              {fmt(p.height_counts, 2)}
                            </td>
                            <td className="py-2 px-3 border text-right">
                              {fmt(p.fwhm_left_2theta_deg, 4)}
                            </td>
                            <td className="py-2 px-3 border text-right">
                              {fmt(p.area_counts_2theta, 2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-center text-gray-500">
                  No processed peak data available.
                </p>
              )}
            </div>
          </>
        )}

        {/* ================================================================
           TAB: Final Results
           ================================================================ */}
        {activeTab === "results" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">
                XRD Final Results
              </h2>
              <button
                onClick={() =>
                  downloadTableCSV("finalResultsTable", "XRD_Final_Results")
                }
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>

            {safeFinalResults.length > 0 ? (
              <>
                {/* Results table */}
                <div className="overflow-x-auto">
                  <table
                    id="finalResultsTable"
                    className="min-w-full bg-white border border-gray-200"
                  >
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border text-left">
                          Crystal Structure
                        </th>
                        <th className="py-2 px-4 border text-left">
                          Other Crystal Forms
                        </th>
                        <th className="py-2 px-4 border text-left">
                          Other Forms Concentration
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {safeFinalResults.map((fr, i) => (
                        <tr
                          key={i}
                          className={i % 2 === 0 ? "bg-gray-50" : ""}
                        >
                          <td className="py-2 px-4 border capitalize">
                            {fr.crystal_structure ?? ""}
                          </td>
                          <td className="py-2 px-4 border">
                            {fr.other_crystal_forms ?? ""}
                          </td>
                          <td className="py-2 px-4 border">
                            {fr.other_crystal_forms_concentration ?? ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-center text-gray-500">
                No final results available.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default XRDDataViewer;