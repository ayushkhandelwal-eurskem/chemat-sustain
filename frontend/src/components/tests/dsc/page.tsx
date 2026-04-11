"use client";
import React, { FC, useEffect, useState, useMemo, useCallback } from "react";
import { api } from "@/lib/axios";
import {
  Download,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Flame,
  Droplets,
  Thermometer,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

/* ================================================================
   Types — mapped from DSC parser dataclasses (backend field names)
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
  catalog_number: string | null;
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

interface SampleMass {
  label: string;
  value: string | null;
}

interface InstrumentationData {
  instrument_model: string | null;
  crucible_type: string | null;
  replication_count: number | string | null;
  replicate_labels: string[];
  sample_masses: SampleMass[];
  protective_atmosphere: string | null;
  temperature_range: string | null;
  heating_speed: string | null;
}

interface ReplicationMetadata {
  test_identifier_number: string | null;
  test_start_date: string | null;
  test_end_date: string | null;
  replicate_label: string | null;
  raw_sheet_name: string | null;
  processed_sheet_name: string | null;
}

interface DSCDataPoint {
  time_min: number | null;
  temperature_c: number | null;
  heat_flow_mw_per_mg: number | null;
}

interface DSCRawDataBlock {
  metric_name: string | null;
  raw_sheet_name: string | null;
  time_unit: string | null;
  temperature_unit: string | null;
  heat_flow_unit: string | null;
  point_count: number | null;
  min_time_min: number | null;
  max_time_min: number | null;
  min_temperature_c: number | null;
  max_temperature_c: number | null;
  min_heat_flow: number | null;
  max_heat_flow: number | null;
  data_points: DSCDataPoint[];
}

interface DSCThermalEvent {
  event_name: string | null;
  enthalpy_j_per_g: number | null;
  onset_temperature_c: number | string | null;
  standard_deviation_pct: number | string | null;
  character: string | null;
}

interface ParserWarning {
  type?: string;
  sheet?: string;
  note?: string;
}

interface DSCData {
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
  raw_data: DSCRawDataBlock[];
  processed_data: {
    available: boolean;
    notes: string;
  };
  final_results: DSCThermalEvent[];
  statistical_analysis: {
    available: boolean;
    notes: string;
  };
  parser_warnings?: ParserWarning[];
}

/* ================================================================
   Tab Configuration
   ================================================================ */

type TabKey = "test-conditions" | "raw-data" | "results";

interface TabConfig {
  key: TabKey;
  label: string;
}

const TABS: TabConfig[] = [
  { key: "test-conditions", label: "Test Conditions" },
  { key: "raw-data", label: "Raw Data" },
  { key: "results", label: "Final Results" },
];

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

/** LTTB downsampling for large DSC thermograms */
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

/** Colour-coded icon for thermal event character */
const EventIcon: FC<{ character: string | null }> = ({ character }) => {
  const c = (character ?? "").toLowerCase();
  if (c.includes("endo"))
    return <Droplets size={20} className="text-blue-500" />;
  if (c.includes("exo"))
    return <Flame size={20} className="text-red-500" />;
  return <Thermometer size={20} className="text-gray-500" />;
};

/* ================================================================
   Main Component
   ================================================================ */

const DSCDataViewer: FC<PageProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<DSCData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("test-conditions");
  const [selectedRawBlock, setSelectedRawBlock] = useState(0);
  const [chartXAxis, setChartXAxis] = useState<"temperature" | "time">(
    "temperature"
  );

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
          console.error("Error fetching DSC data:", err);
          setError("Failed to load DSC data. Please try again later.");
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [work_package, element, test]);

  /* ---- Derived data ---- */

  const safeRawBlocks: DSCRawDataBlock[] = useMemo(() => {
    return Array.isArray(data?.raw_data) ? data.raw_data : [];
  }, [data?.raw_data]);

  const safeFinalResults: DSCThermalEvent[] = useMemo(() => {
    return Array.isArray(data?.final_results) ? data.final_results : [];
  }, [data?.final_results]);

  /** Build downsampled thermogram chart data */
  const thermogramChartData = useMemo(() => {
    const block = safeRawBlocks[selectedRawBlock];
    if (!block?.data_points?.length) return [];

    const useTemp = chartXAxis === "temperature";

    const raw = block.data_points
      .filter(
        (p) =>
          p.heat_flow_mw_per_mg != null &&
          (useTemp ? p.temperature_c != null : p.time_min != null)
      )
      .map((p) => ({
        x: (useTemp ? p.temperature_c : p.time_min) as number,
        y: p.heat_flow_mw_per_mg as number,
        time: p.time_min,
        temp: p.temperature_c,
        hf: p.heat_flow_mw_per_mg,
      }))
      .sort((a, b) => a.x - b.x);

    const target = Math.min(1000, raw.length);
    const sampled = lttb(
      raw.map((p) => ({ x: p.x, y: p.y })),
      target
    );

    // Map back with full data for tooltip
    const xSet = new Set(sampled.map((p) => p.x));
    return raw
      .filter((p) => xSet.has(p.x))
      .map((p) => ({
        x_value: p.x,
        heat_flow: p.y,
        temperature: p.temp,
        time: p.time,
      }));
  }, [safeRawBlocks, selectedRawBlock, chartXAxis]);

  /** Reference lines for thermal event onset temperatures */
  const onsetLines = useMemo(() => {
    if (chartXAxis !== "temperature") return [];
    return safeFinalResults
      .filter((ev) => ev.onset_temperature_c != null)
      .map((ev) => ({
        x: Number(ev.onset_temperature_c),
        label: ev.event_name ?? "Event",
      }));
  }, [safeFinalResults, chartXAxis]);

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
            DSC Test Data Report
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
                  {mat.erm_id ?? "N/A"}
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
                  <span className="font-semibold">SOP:</span>{" "}
                  {wp.sop ?? "N/A"}
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
                downloadFilename="DSC_Material_Info"
                rows={[
                  { label: "CMS Internal Identifier", value: mat.material_identifier ?? element ?? "" },
                  { label: "ERM Identifier", value: mat.erm_id ?? "" },
                  { label: "Material Name", value: mat.material_name ?? "" },
                  { label: "Core Chemistry", value: mat.core_chemistry ?? "" },
                  { label: "CAS No", value: mat.cas_no ?? "" },
                  { label: "CAS for Core", value: mat.cas_for_core ?? "" },
                  { label: "Material Supplier", value: mat.material_supplier ?? "" },
                  { label: "Catalog Number", value: mat.catalog_number ?? "" },
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
                downloadFilename="DSC_Sample_Preparation"
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
                downloadFilename="DSC_Instrumentation"
                rows={[
                  { label: "Instrument Model", value: inst.instrument_model ?? "" },
                  { label: "Crucible Type", value: inst.crucible_type ?? "" },
                  { label: "Replication Count", value: inst.replication_count ?? "" },
                  { label: "Protective Atmosphere", value: inst.protective_atmosphere ?? "" },
                  { label: "Temperature Range", value: inst.temperature_range ?? "" },
                  { label: "Heating Speed", value: inst.heating_speed ?? "" },
                ]}
              />

              {/* Sample masses */}
              {inst.sample_masses &&
                inst.sample_masses.some((sm) => sm.value) && (
                  <div className="mt-4">
                    <h4 className="text-md font-semibold mb-2">Sample Masses</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white border border-gray-200 text-sm">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="py-2 px-4 border text-left">Replicate</th>
                            <th className="py-2 px-4 border text-left">Mass</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inst.sample_masses.map((sm, i) => (
                            <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                              <td className="py-2 px-4 border">{sm.label}</td>
                              <td className="py-2 px-4 border">{sm.value ?? ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              {/* Replicate labels */}
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
                    downloadTableCSV("replicationMetaTable", "DSC_Replications")
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
                    </tr>
                  </thead>
                  <tbody>
                    {repMeta.length ? (
                      repMeta.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                          <td className="py-2 px-4 border">{r.test_identifier_number ?? ""}</td>
                          <td className="py-2 px-4 border">{r.test_start_date ?? ""}</td>
                          <td className="py-2 px-4 border">{r.test_end_date ?? ""}</td>
                          <td className="py-2 px-4 border">{r.replicate_label ?? ""}</td>
                          <td className="py-2 px-4 border">{r.raw_sheet_name ?? ""}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-2 px-4 border text-center">
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
                  <table id="scientistsTable" className="min-w-full bg-white border border-gray-200">
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
           TAB: Raw Data (DSC Thermogram)
           ================================================================ */}
        {activeTab === "raw-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">
                DSC Thermogram
              </h2>
              <button
                onClick={() =>
                  downloadTableCSV(
                    "rawDataTable",
                    `DSC_Raw_${selectedRawBlock + 1}`
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
                        Time: {fmt(block.min_time_min, 1)} – {fmt(block.max_time_min, 1)} {block.time_unit}
                      </span>
                      <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-3 py-1.5 rounded-full">
                        Temp: {fmt(block.min_temperature_c, 1)}° – {fmt(block.max_temperature_c, 1)}° {block.temperature_unit}
                      </span>
                      <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-3 py-1.5 rounded-full">
                        Heat Flow: {fmt(block.min_heat_flow, 2)} – {fmt(block.max_heat_flow, 2)} {block.heat_flow_unit}
                      </span>
                    </div>
                  );
                })()}

                {/* X-axis toggle */}
                <div className="mb-4 flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-700">
                    X-Axis:
                  </span>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="chartXAxis"
                      checked={chartXAxis === "temperature"}
                      onChange={() => setChartXAxis("temperature")}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">
                      Temperature (°C)
                    </span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="chartXAxis"
                      checked={chartXAxis === "time"}
                      onChange={() => setChartXAxis("time")}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Time (min)</span>
                  </label>
                </div>

                {/* Thermogram chart */}
                {thermogramChartData.length > 0 && (
                  <div className="mb-8">
                    <ResponsiveContainer width="100%" height={450}>
                      <LineChart
                        data={thermogramChartData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="x_value"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          tickCount={15}
                          label={{
                            value:
                              chartXAxis === "temperature"
                                ? "Temperature (°C)"
                                : "Time (min)",
                            position: "insideBottom",
                            offset: -5,
                          }}
                        />
                        <YAxis
                          label={{
                            value: `Heat Flow (${safeRawBlocks[selectedRawBlock]?.heat_flow_unit ?? "mW/mg"})`,
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
                                <p>
                                  <span className="font-semibold">Temp:</span>{" "}
                                  {fmt(d.temperature, 2)} °C
                                </p>
                                <p>
                                  <span className="font-semibold">Time:</span>{" "}
                                  {fmt(d.time, 3)} min
                                </p>
                                <p>
                                  <span className="font-semibold">
                                    Heat Flow:
                                  </span>{" "}
                                  {fmt(d.heat_flow, 4)}{" "}
                                  {safeRawBlocks[selectedRawBlock]
                                    ?.heat_flow_unit ?? "mW/mg"}
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Legend />

                        {/* Onset temperature reference lines */}
                        {onsetLines.map((ol, i) => (
                          <ReferenceLine
                            key={i}
                            x={ol.x}
                            stroke="#ef4444"
                            strokeDasharray="4 4"
                            label={{
                              value: ol.label,
                              position: "top",
                              fill: "#ef4444",
                              fontSize: 11,
                            }}
                          />
                        ))}

                        <Line
                          dataKey="heat_flow"
                          name="Heat Flow"
                          stroke="#2563eb"
                          dot={false}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Raw data table preview */}
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
                            Time ({safeRawBlocks[selectedRawBlock]?.time_unit ?? "min"})
                          </th>
                          <th className="py-2 px-3 border text-right">
                            Temp ({safeRawBlocks[selectedRawBlock]?.temperature_unit ?? "°C"})
                          </th>
                          <th className="py-2 px-3 border text-right">
                            Heat Flow ({safeRawBlocks[selectedRawBlock]?.heat_flow_unit ?? "mW/mg"})
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {safeRawBlocks[selectedRawBlock].data_points
                          .slice(0, 100)
                          .map((p, pi) => (
                            <tr
                              key={pi}
                              className={pi % 2 === 0 ? "bg-gray-50" : ""}
                            >
                              <td className="py-2 px-3 border text-right">
                                {fmt(p.time_min, 3)}
                              </td>
                              <td className="py-2 px-3 border text-right">
                                {fmt(p.temperature_c, 2)}
                              </td>
                              <td className="py-2 px-3 border text-right">
                                {fmt(p.heat_flow_mw_per_mg, 6)}
                              </td>
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
           TAB: Final Results (Thermal Events)
           ================================================================ */}
        {activeTab === "results" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-800">
                DSC Final Results — Thermal Events
              </h2>
              <button
                onClick={() =>
                  downloadTableCSV("finalResultsTable", "DSC_Final_Results")
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
                          Thermal Event
                        </th>
                        <th className="py-2 px-4 border text-right">
                          ΔH (J/g)
                        </th>
                        <th className="py-2 px-4 border text-right">
                          Onset Temp (°C)
                        </th>
                        <th className="py-2 px-4 border text-right">
                          Std. Dev. (%)
                        </th>
                        <th className="py-2 px-4 border text-left">
                          Character
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {safeFinalResults.map((ev, i) => (
                        <tr
                          key={i}
                          className={i % 2 === 0 ? "bg-gray-50" : ""}
                        >
                          <td className="py-2 px-4 border font-medium capitalize">
                            {ev.event_name ?? ""}
                          </td>
                          <td className="py-2 px-4 border text-right">
                            {ev.enthalpy_j_per_g != null
                              ? fmt(ev.enthalpy_j_per_g, 2)
                              : ""}
                          </td>
                          <td className="py-2 px-4 border text-right">
                            {ev.onset_temperature_c ?? ""}
                          </td>
                          <td className="py-2 px-4 border text-right">
                            {ev.standard_deviation_pct ?? ""}
                          </td>
                          <td className="py-2 px-4 border capitalize">
                            {ev.character ?? ""}
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

export default DSCDataViewer;