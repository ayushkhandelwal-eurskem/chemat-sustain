"use client";
import React, {
  FC,
  useEffect,
  useState,
  useMemo,
  useCallback,
  useDeferredValue,
  useRef,
  useLayoutEffect,
} from "react";
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
  AreaChart,
  Area,
  Brush,
} from "recharts";

/* ============================ Types ============================ */
interface PageProps {
  work_package: string;
  element: string;
  test: string;
  file?: string;
}

interface Scientist { name: string | null; email: string | null; }
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
interface SIMSRawIon { channel: number | null; mass: number | null; intensity: number | null; }
interface SIMSRawData { run_number?: number; negative_ions: SIMSRawIon[]; positive_ions: SIMSRawIon[]; }
interface SIMSProcessedIon { mass: number | null; counts: number | null; }
interface SIMSProcessedData {
  run_number: number;
  negative_ions: SIMSProcessedIon[];
  positive_ions: SIMSProcessedIon[];
  total_negative_counts: number | null;
  total_positive_counts: number | null;
}
interface SIMSFinalIon { mass: number | null; fragment: string | null; }
interface SIMSFinalResults { negative_ions: SIMSFinalIon[]; positive_ions: SIMSFinalIon[]; }
interface SIMSData {
  test_details: {
    work_package: WorkPackageData;
    material: MaterialData;
    sample_preparation: SamplePreparationData;
    instrumentation: SIMSInstrumentationData;
  };
  replication?: ReplicationData;
  raw_data?: SIMSRawData[];
  replications?: SIMSRawData[];
  processed_data: SIMSProcessedData[];
  final_results: SIMSFinalResults;
}

/* ============================ Helpers ============================ */

const normalizeCmsId = (cmsId: string): string => {
  const match = cmsId.match(/^(?:cms_?)?(\d+a)/i);
  if (match) return match[1].toLowerCase();
  return cmsId.toLowerCase().replace(/^cms_?/i, "").split("_")[0];
};

const getSIMSImageUrls = (workPackage: string, element: string) => {
  const wp = workPackage.toUpperCase();
  const cms = normalizeCmsId(element);
  const basePath = `/images/${wp}/${cms}/sims`;
  return {
    negative: [`${basePath}/${cms}_SIMS_negative1.png`, `${basePath}/${cms}_SIMS_negative2.png`],
    positive: [`${basePath}/${cms}_SIMS_positive1.png`, `${basePath}/${cms}_SIMS_positive2.png`],
  };
};

function useContainerWidth<T extends HTMLElement>(): [React.MutableRefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(800);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 800));
    ro.observe(el);
    setW(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/**
 * Bin ions by mass and SUM intensities per bin.
 *
 * Uses ALL ions provided. The bin width is chosen so the chart
 * renders ~1 bar per ~2 pixels of width — finer binning would draw
 * sub-pixel bars that overlap and wider binning would discard
 * resolvable peaks.
 *
 * Sum is the correct aggregation for a mass spectrum: a peak at
 * m/z ~16 with two channels of intensity 100 + 95 should display as
 * a single bar of height 195, not 100 (max) or 97.5 (mean).
 */
const binBySum = (ions: SIMSRawIon[], binWidth: number) => {
  if (!ions?.length) return [] as { mass: number; intensity: number }[];
  const inv = 1 / binWidth;
  const bins = new Map<number, number>();
  for (const ion of ions) {
    if (ion.mass == null || ion.intensity == null) continue;
    const m = Math.floor(ion.mass * inv) / inv;
    bins.set(m, (bins.get(m) || 0) + ion.intensity);
  }
  return Array.from(bins.entries())
    .filter(([, intensity]) => intensity > 0)
    .map(([mass, intensity]) => ({ mass, intensity }))
    .sort((a, b) => a.mass - b.mass);
};

/** LTTB downsampling — kept as an optional smoothing view. */
function lttb(data: { x: number; y: number }[], threshold: number): { x: number; y: number }[] {
  const n = data.length;
  if (threshold >= n || threshold === 0) return data;
  const sampled: { x: number; y: number }[] = [];
  let a = 0;
  const bucketSize = (n - 2) / (threshold - 2);
  sampled.push(data[a]);
  for (let i = 0; i < threshold - 2; i++) {
    const start = Math.floor((i + 1) * bucketSize) + 1;
    const end = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);
    let avgX = 0, avgY = 0;
    const len = Math.max(1, end - start);
    for (let j = start; j < end; j++) { avgX += data[j].x; avgY += data[j].y; }
    avgX /= len; avgY /= len;
    let maxArea = -1; let nextA = start;
    for (let j = start; j < end; j++) {
      const area = Math.abs(
        (data[a].x - avgX) * (data[j].y - data[a].y) -
        (data[a].x - data[j].x) * (avgY - data[a].y)
      ) * 0.5;
      if (area > maxArea) { maxArea = area; nextA = j; }
    }
    sampled.push(data[nextA]);
    a = nextA;
  }
  sampled.push(data[n - 1]);
  return sampled;
}

/* ============================ Tab Configuration ============================ */
type TabKey = "test-conditions" | "raw-data" | "processed-data" | "results";
interface TabConfig { key: TabKey; label: string; }
const TABS: TabConfig[] = [
  { key: "test-conditions", label: "Test Conditions" },
  { key: "raw-data", label: "Raw Data" },
  { key: "processed-data", label: "Processed Data" },
  { key: "results", label: "Final Results" },
];

/* ============================ Component ============================ */

const SIMSDataViewer: FC<PageProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<SIMSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("test-conditions");
  const [vizMode, setVizMode] = useState<"binned" | "downsampled">("binned");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  // Zoom range per polarity. null = full range. Re-binning happens in the
  // computed memos below so zooming actually increases resolution.
  const [negZoom, setNegZoom] = useState<[number, number] | null>(null);
  const [posZoom, setPosZoom] = useState<[number, number] | null>(null);

  const [chartRefNeg, chartWidthNeg] = useContainerWidth<HTMLDivElement>();
  const [chartRefPos, chartWidthPos] = useContainerWidth<HTMLDivElement>();

  // ---- fetch ----
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        const response = await api.post(
          `/tests/listings`,
          { work_package_name: work_package, element_cms_id: element, test_name: test },
          { signal: ac.signal }
        );
        if (response.status !== 200) throw new Error("Network response was not ok");
        setData(response.data);
      } catch (err: any) {
        if (err.name !== "CanceledError" && err.name !== "AbortError") {
          console.error("Error fetching data:", err);
          setError("Failed to load SIMS data. Please try again later.");
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [work_package, element, test]);

  /* ============================ Downloads ============================ */

  /**
   * Download small static tables (Material Info, Sample Prep, etc.) by
   * reading the rendered DOM. Fine for these because they're <50 rows.
   */
  const downloadTable = useCallback((tableId: string, filename: string) => {
    const table = document.getElementById(tableId);
    if (!table) return;
    const rows = table.querySelectorAll("tr");
    const lines: string[] = [];
    rows.forEach((row) => {
      const cells = row.querySelectorAll("th, td");
      lines.push(
        Array.from(cells)
          .map((cell) => `"${(cell.textContent ?? "").replace(/"/g, '""')}"`)
          .join(",")
      );
    });
    const csv = lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  /**
   * Download from a data array directly. Handles 400k+ rows because it
   * bypasses the DOM and uses a Blob URL (data: URLs are capped at ~2MB
   * in most browsers, which is why the old DOM-based download silently
   * produced truncated files).
   *
   * Builds the CSV via array.join, which is roughly 10x faster than
   * repeated string concatenation. ~2s for 400k rows; we set a
   * downloading flag so the button can show progress.
   */
  const downloadCSV = useCallback(<T extends Record<string, any>>(
    rows: T[],
    columns: { key: keyof T; header: string; format?: (v: any) => string }[],
    filename: string,
    downloadKey: string
  ) => {
    setDownloadingKey(downloadKey);
    // Defer to next tick so the spinner actually paints before we block.
    setTimeout(() => {
      try {
        const headerLine = columns
          .map((c) => `"${c.header.replace(/"/g, '""')}"`)
          .join(",");

        const lines: string[] = new Array(rows.length + 1);
        lines[0] = headerLine;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const parts = new Array(columns.length);
          for (let j = 0; j < columns.length; j++) {
            const c = columns[j];
            const raw = row[c.key];
            const formatted = c.format ? c.format(raw) : (raw ?? "");
            parts[j] = `"${String(formatted).replace(/"/g, '""')}"`;
          }
          lines[i + 1] = parts.join(",");
        }

        const csv = lines.join("\r\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${filename}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } finally {
        setDownloadingKey(null);
      }
    }, 50);
  }, []);

  /* ====================== Data shaping ====================== */

  const safeRuns: SIMSRawData[] = useMemo(() => {
    return (data?.raw_data ?? data?.replications ?? []) as SIMSRawData[];
  }, [data?.raw_data, data?.replications]);

  const allNegativeIons = useMemo(
    () => safeRuns.flatMap((r) => r.negative_ions) as SIMSRawIon[],
    [safeRuns]
  );
  const allPositiveIons = useMemo(
    () => safeRuns.flatMap((r) => r.positive_ions) as SIMSRawIon[],
    [safeRuns]
  );

  const deferredNeg = useDeferredValue(allNegativeIons);
  const deferredPos = useDeferredValue(allPositiveIons);

  // Filter to zoom range if active. This is what makes "all data accurate"
  // — when you zoom in, we re-bin only the ions in the visible range, so
  // resolution actually goes up.
  const negInView = useMemo(() => {
    if (!negZoom) return deferredNeg;
    const [lo, hi] = negZoom;
    return deferredNeg.filter((d) => d.mass != null && d.mass >= lo && d.mass <= hi);
  }, [deferredNeg, negZoom]);

  const posInView = useMemo(() => {
    if (!posZoom) return deferredPos;
    const [lo, hi] = posZoom;
    return deferredPos.filter((d) => d.mass != null && d.mass >= lo && d.mass <= hi);
  }, [deferredPos, posZoom]);

  // Compute mass range of currently-visible ions
  const [negMin, negMax] = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const ion of negInView) {
      if (ion.mass == null) continue;
      if (ion.mass < min) min = ion.mass;
      if (ion.mass > max) max = ion.mass;
    }
    return [min, max];
  }, [negInView]);

  const [posMin, posMax] = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const ion of posInView) {
      if (ion.mass == null) continue;
      if (ion.mass < min) min = ion.mass;
      if (ion.mass > max) max = ion.mass;
    }
    return [min, max];
  }, [posInView]);

  // Adaptive bin widths: aim for ~1 bar per 2 pixels of chart width.
  // When zoomed in, the same chart width covers a smaller mass range,
  // so the bin width shrinks and we resolve finer peaks automatically.
  const targetBinsNeg = Math.max(200, Math.floor((chartWidthNeg || 800) / 2));
  const targetBinsPos = Math.max(200, Math.floor((chartWidthPos || 800) / 2));

  const negBinWidth = useMemo(() => {
    if (!isFinite(negMin) || !isFinite(negMax) || negMax <= negMin) return 1;
    const width = (negMax - negMin) / targetBinsNeg;
    // Allow sub-unit bins when zoomed; cap at min 0.001 m/z
    return Math.max(0.001, Number.isFinite(width) ? width : 1);
  }, [negMin, negMax, targetBinsNeg]);

  const posBinWidth = useMemo(() => {
    if (!isFinite(posMin) || !isFinite(posMax) || posMax <= posMin) return 1;
    const width = (posMax - posMin) / targetBinsPos;
    return Math.max(0.001, Number.isFinite(width) ? width : 1);
  }, [posMin, posMax, targetBinsPos]);

  const negativeBinned = useMemo(
    () => binBySum(negInView, negBinWidth),
    [negInView, negBinWidth]
  );
  const positiveBinned = useMemo(
    () => binBySum(posInView, posBinWidth),
    [posInView, posBinWidth]
  );

  const negativeLttb = useMemo(() => {
    if (!negInView.length) return [];
    const points = negInView
      .filter((d) => d.mass != null && d.intensity != null)
      .map((d) => ({ x: d.mass as number, y: d.intensity as number }))
      .sort((a, b) => a.x - b.x);
    const target = Math.min(1200, Math.max(400, Math.floor((chartWidthNeg || 800) * 1.5)));
    return lttb(points, target).map((p) => ({ mass: p.x, intensity: p.y }));
  }, [negInView, chartWidthNeg]);

  const positiveLttb = useMemo(() => {
    if (!posInView.length) return [];
    const points = posInView
      .filter((d) => d.mass != null && d.intensity != null)
      .map((d) => ({ x: d.mass as number, y: d.intensity as number }))
      .sort((a, b) => a.x - b.x);
    const target = Math.min(1200, Math.max(400, Math.floor((chartWidthPos || 800) * 1.5)));
    return lttb(points, target).map((p) => ({ mass: p.x, intensity: p.y }));
  }, [posInView, chartWidthPos]);

  const limitedNegativeIons = useMemo(() => deferredNeg.slice(0, 100), [deferredNeg]);
  const limitedPositiveIons = useMemo(() => deferredPos.slice(0, 100), [deferredPos]);

  // Column definitions for raw-ion CSV export
  const rawIonColumns = useMemo(() => ([
    { key: "channel" as const, header: "Channel" },
    { key: "mass" as const, header: "Mass", format: (v: any) => v != null ? Number(v).toFixed(6) : "" },
    { key: "intensity" as const, header: "Intensity" },
  ]), []);

  const procIonColumns = useMemo(() => ([
    { key: "mass" as const, header: "Mass", format: (v: any) => v != null ? Number(v).toFixed(2) : "" },
    { key: "counts" as const, header: "Counts" },
  ]), []);

  const finalIonColumns = useMemo(() => ([
    { key: "mass" as const, header: "Mass", format: (v: any) => v != null ? Number(v).toFixed(2) : "" },
    { key: "fragment" as const, header: "Fragment" },
  ]), []);

  /* ============================ Render ============================ */

  return (
    <div className="bg-gray-50 min-h-screen py-8 text-black">
      <div className="container mx-auto px-4">

        {loading && (
          <div className="mb-4 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
            <span className="ml-3 text-slate-600 text-sm">Loading SIMS data…</span>
          </div>
        )}
        {!loading && error && (
          <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-4">SIMS Test Data Report</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Parameters</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2"><span className="font-semibold">Work Package:</span> {work_package || "N/A"}</p>
                <p className="mb-2"><span className="font-semibold">CMS Internal Identifier:</span> {element || "N/A"}</p>
                <p className="mb-2"><span className="font-semibold">ERM Identifier:</span> {data?.test_details.material.erm_id ?? "N/A"}</p>
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-3">Test Information</h2>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="mb-2"><span className="font-semibold">Full Test Name:</span> {data?.test_details.work_package.full_test_name ?? "N/A"}</p>
                <p className="mb-2"><span className="font-semibold">Test Acronym:</span> {data?.test_details.work_package.test_acronym ?? "N/A"}</p>
                <p className="mb-2"><span className="font-semibold">Test Type:</span> {data?.test_details.work_package.test_type ?? "N/A"}</p>
                <p className="mb-2"><span className="font-semibold">Laboratory Name:</span> {data?.test_details.work_package.laboratory_name ?? "N/A"}</p>
                <p className="mb-2"><span className="font-semibold">Endpoint:</span> {data?.test_details.work_package.endpoint ?? "N/A"}</p>
                <p className="mb-2"><span className="font-semibold">Endpoint Outcome:</span> {data?.test_details.work_package.endpoint_outcome ?? "N/A"}</p>
                <p><span className="font-semibold">SOP:</span> {data?.test_details.work_package.sop ?? "N/A"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="w-full mb-8">
          <ul className="relative flex flex-wrap p-1.5 list-none rounded-md bg-slate-100" role="tablist">
            {TABS.map((tab) => (
              <li key={tab.key} className="z-30 flex-auto text-center" role="presentation">
                <button
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  className={`z-30 w-full px-0 py-2 text-sm mb-0 transition-all rounded-md ${
                    activeTab === tab.key ? "bg-blue-600 text-white shadow-md" : "text-slate-600 hover:text-slate-800"
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Test Conditions */}
        {activeTab === "test-conditions" && (
          <>
            {/* Material */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-blue-800">Material Information</h2>
                <button
                  onClick={() => downloadTable("materialTable", "Material_Info")}
                  className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  <Download size={16} /><span>Download</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table id="materialTable" className="min-w-full bg-white border border-gray-200">
                  <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Property</th><th className="py-2 px-4 border text-left">Value</th></tr></thead>
                  <tbody>
                    <tr><td className="py-2 px-4 border font-medium">CMS Internal Identifier</td><td className="py-2 px-4 border">{element}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">ERM Identifier</td><td className="py-2 px-4 border">{data?.test_details.material.erm_id ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Material Name</td><td className="py-2 px-4 border">{data?.test_details.material.material_name ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Core Chemistry</td><td className="py-2 px-4 border">{data?.test_details.material.core_chemistry ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Material State</td><td className="py-2 px-4 border">{data?.test_details.material.material_state ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">CAS No</td><td className="py-2 px-4 border">{data?.test_details.material.cas ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">CAS for Core</td><td className="py-2 px-4 border">{data?.test_details.material.cas_for_core ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Supplier</td><td className="py-2 px-4 border">{data?.test_details.material.supplier ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Batch</td><td className="py-2 px-4 border">{data?.test_details.material.batch ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Batch Preparation Date</td><td className="py-2 px-4 border">{data?.test_details.material.preparation_date ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Molar Concentration</td><td className="py-2 px-4 border">{data?.test_details.material.molar_concentration ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Particles in Stock</td><td className="py-2 px-4 border">{data?.test_details.material.particles_stock ?? "N/A"}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sample Prep */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-blue-800">Sample Preparation</h2>
                <button
                  onClick={() => downloadTable("samplePrepTable", "Sample_Preparation")}
                  className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  <Download size={16} /><span>Download</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table id="samplePrepTable" className="min-w-full bg-white border border-gray-200">
                  <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Property</th><th className="py-2 px-4 border text-left">Value</th></tr></thead>
                  <tbody>
                    <tr><td className="py-2 px-4 border font-medium">Dispersion protocol used</td><td className="py-2 px-4 border">{data?.test_details.sample_preparation.dispersion_protocol ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Dispersion technique used</td><td className="py-2 px-4 border">{data?.test_details.sample_preparation.dispersion_technique ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Dispersion/Dilution medium</td><td className="py-2 px-4 border">{data?.test_details.sample_preparation.dispersion_medium ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Sonicator type</td><td className="py-2 px-4 border">{data?.test_details.sample_preparation.sonicator_type ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Power(W)</td><td className="py-2 px-4 border">{data?.test_details.sample_preparation.power ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Sonication time(secs)</td><td className="py-2 px-4 border">{data?.test_details.sample_preparation.sonication_time ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Tip thickness(mm)</td><td className="py-2 px-4 border">{data?.test_details.sample_preparation.tip_thickness ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Tip composition</td><td className="py-2 px-4 border">{data?.test_details.sample_preparation.tip_composition ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Size of ultrasonic bath/water volume (dm3)</td><td className="py-2 px-4 border">{data?.test_details.sample_preparation.ultrasonic_bath_size ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Sample volume</td><td className="py-2 px-4 border">{data?.test_details.sample_preparation.sample_volume ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Final sample concentration (mg/L or ppm)</td><td className="py-2 px-4 border">{data?.test_details.sample_preparation.final_concentration ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Additional information</td><td className="py-2 px-4 border">{data?.test_details.sample_preparation.additional_info ?? "N/A"}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Instrumentation */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-blue-800">Instrumentation</h2>
                <button
                  onClick={() => downloadTable("instrumentationTable", "Instrumentation")}
                  className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  <Download size={16} /><span>Download</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table id="instrumentationTable" className="min-w-full bg-white border border-gray-200">
                  <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Property</th><th className="py-2 px-4 border text-left">Value</th></tr></thead>
                  <tbody>
                    <tr><td className="py-2 px-4 border font-medium">SIMS Instrumentation Model and Company</td><td className="py-2 px-4 border">{data?.test_details.instrumentation.instrument_specs ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Primary Ions</td><td className="py-2 px-4 border">{data?.test_details.instrumentation.primary_ions ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Detector</td><td className="py-2 px-4 border">{data?.test_details.instrumentation.detector ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Measurement Technique</td><td className="py-2 px-4 border">{data?.test_details.instrumentation.measurement_technique ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Mass Resolution</td><td className="py-2 px-4 border">{data?.test_details.instrumentation.mass_resolution ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Mass Range</td><td className="py-2 px-4 border">{data?.test_details.instrumentation.mass_range ?? "N/A"}</td></tr>
                    <tr><td className="py-2 px-4 border font-medium">Scan Area</td><td className="py-2 px-4 border">{data?.test_details.instrumentation.scan_area ?? "N/A"}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Scientists */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-blue-800">Scientists Information</h2>
                <button
                  onClick={() => downloadTable("scientistsTable", "Scientists_Info")}
                  className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  <Download size={16} /><span>Download</span>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Lead Scientists</h3>
                  <table id="scientistsTable" className="min-w-full bg-white border border-gray-200">
                    <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Name</th><th className="py-2 px-4 border text-left">Email</th></tr></thead>
                    <tbody>
                      {data?.test_details.work_package.lead_scientists?.length ? (
                        data.test_details.work_package.lead_scientists.map((s, i) => (
                          <tr key={i}><td className="py-2 px-4 border">{s.name ?? "N/A"}</td><td className="py-2 px-4 border">{s.email ?? "N/A"}</td></tr>
                        ))
                      ) : (
                        <tr><td colSpan={2} className="py-2 px-4 border text-center">No lead scientists available</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-3">Assay Scientists</h3>
                  <table className="min-w-full bg-white border border-gray-200">
                    <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Name</th><th className="py-2 px-4 border text-left">Email</th></tr></thead>
                    <tbody>
                      {data?.test_details.work_package.assay_scientists?.length ? (
                        data.test_details.work_package.assay_scientists.map((s, i) => (
                          <tr key={i}><td className="py-2 px-4 border">{s.name ?? "N/A"}</td><td className="py-2 px-4 border">{s.email ?? "N/A"}</td></tr>
                        ))
                      ) : (
                        <tr><td colSpan={2} className="py-2 px-4 border text-center">No assay scientists available</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Raw Data */}
        {activeTab === "raw-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-blue-800">Raw Data</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">View:</span>
                <select
                  className="border rounded px-2 py-1 text-sm"
                  value={vizMode}
                  onChange={(e) => setVizMode(e.target.value as any)}
                >
                  <option value="binned">Binned (sum, all records)</option>
                  <option value="downsampled">Downsampled (smoothed)</option>
                </select>
              </div>
            </div>

            {/* Explainer banner so users understand what's plotted */}
            <div className="mb-6 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2">
              All {(deferredNeg.length + deferredPos.length).toLocaleString()} ion records are used to build the spectrum.
              In <strong>Binned</strong> mode, intensities within each pixel-width mass bin are summed (the standard
              representation for a mass spectrum). Drag the brush below each chart to zoom in — the binning
              recalculates at finer resolution as you zoom.
            </div>

            {!allNegativeIons.length && !allPositiveIons.length ? (
              <p className="text-center text-gray-500">No raw data available.</p>
            ) : (
              <>
                {/* Negative */}
                <div className="mb-10">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold">Negative Ions Spectrum</h3>
                    <div className="text-xs text-slate-500">
                      {deferredNeg.length.toLocaleString()} ions
                      {negZoom && (
                        <>
                          {" • zoomed: "}
                          {negZoom[0].toFixed(2)}–{negZoom[1].toFixed(2)} m/z
                          {" • "}
                          <button
                            className="text-blue-600 hover:underline"
                            onClick={() => setNegZoom(null)}
                          >
                            reset
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div ref={chartRefNeg} className="w-full h-[460px]">
                    <ResponsiveContainer key={chartWidthNeg} width="100%" height="100%">
                      {vizMode === "downsampled" ? (
                        <AreaChart data={negativeLttb} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="mass" type="number" domain={["dataMin", "dataMax"]} tickCount={10}
                            label={{ value: "m/z", position: "insideBottom", offset: -5 }} />
                          <YAxis label={{ value: "Counts", angle: -90, position: "insideLeft" }} />
                          <Tooltip />
                          <Area dataKey="intensity" isAnimationActive={false} />
                          <Brush
                            dataKey="mass"
                            height={24}
                            tickFormatter={(v: number) => v?.toFixed(1) ?? ""}
                            onChange={(range: any) => {
                              if (range && range.startIndex != null && range.endIndex != null) {
                                const lo = negativeLttb[range.startIndex]?.mass;
                                const hi = negativeLttb[range.endIndex]?.mass;
                                if (lo != null && hi != null && hi > lo) setNegZoom([lo, hi]);
                              }
                            }}
                          />
                        </AreaChart>
                      ) : (
                        <BarChart data={negativeBinned} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="mass" type="number" domain={["dataMin", "dataMax"]} tickCount={10}
                            label={{ value: "m/z", position: "insideBottom", offset: -5 }} />
                          <YAxis label={{ value: "Counts", angle: -90, position: "insideLeft" }} />
                          <Tooltip
                            formatter={(value: any) => [Number(value).toLocaleString(), "Counts"]}
                            labelFormatter={(label: any) => `m/z ${Number(label).toFixed(3)}`}
                          />
                          <Bar dataKey="intensity" isAnimationActive={false} />
                          <Brush
                            dataKey="mass"
                            height={24}
                            tickFormatter={(v: number) => v?.toFixed(1) ?? ""}
                            onChange={(range: any) => {
                              if (range && range.startIndex != null && range.endIndex != null) {
                                const lo = negativeBinned[range.startIndex]?.mass;
                                const hi = negativeBinned[range.endIndex]?.mass;
                                if (lo != null && hi != null && hi > lo) setNegZoom([lo, hi]);
                              }
                            }}
                          />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Positive */}
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold">Positive Ions Spectrum</h3>
                    <div className="text-xs text-slate-500">
                      {deferredPos.length.toLocaleString()} ions
                      {posZoom && (
                        <>
                          {" • zoomed: "}
                          {posZoom[0].toFixed(2)}–{posZoom[1].toFixed(2)} m/z
                          {" • "}
                          <button
                            className="text-blue-600 hover:underline"
                            onClick={() => setPosZoom(null)}
                          >
                            reset
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div ref={chartRefPos} className="w-full h-[460px]">
                    <ResponsiveContainer key={chartWidthPos} width="100%" height="100%">
                      {vizMode === "downsampled" ? (
                        <AreaChart data={positiveLttb} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="mass" type="number" domain={["dataMin", "dataMax"]} tickCount={10}
                            label={{ value: "m/z", position: "insideBottom", offset: -5 }} />
                          <YAxis label={{ value: "Counts", angle: -90, position: "insideLeft" }} />
                          <Tooltip />
                          <Area dataKey="intensity" isAnimationActive={false} />
                          <Brush
                            dataKey="mass"
                            height={24}
                            tickFormatter={(v: number) => v?.toFixed(1) ?? ""}
                            onChange={(range: any) => {
                              if (range && range.startIndex != null && range.endIndex != null) {
                                const lo = positiveLttb[range.startIndex]?.mass;
                                const hi = positiveLttb[range.endIndex]?.mass;
                                if (lo != null && hi != null && hi > lo) setPosZoom([lo, hi]);
                              }
                            }}
                          />
                        </AreaChart>
                      ) : (
                        <BarChart data={positiveBinned} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="mass" type="number" domain={["dataMin", "dataMax"]} tickCount={10}
                            label={{ value: "m/z", position: "insideBottom", offset: -5 }} />
                          <YAxis label={{ value: "Counts", angle: -90, position: "insideLeft" }} />
                          <Tooltip
                            formatter={(value: any) => [Number(value).toLocaleString(), "Counts"]}
                            labelFormatter={(label: any) => `m/z ${Number(label).toFixed(3)}`}
                          />
                          <Bar dataKey="intensity" isAnimationActive={false} />
                          <Brush
                            dataKey="mass"
                            height={24}
                            tickFormatter={(v: number) => v?.toFixed(1) ?? ""}
                            onChange={(range: any) => {
                              if (range && range.startIndex != null && range.endIndex != null) {
                                const lo = positiveBinned[range.startIndex]?.mass;
                                const hi = positiveBinned[range.endIndex]?.mass;
                                if (lo != null && hi != null && hi > lo) setPosZoom([lo, hi]);
                              }
                            }}
                          />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Preview tables */}
                <div className="mb-8">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-md font-medium">
                      Raw Negative Ions{" "}
                      <span className="text-sm text-slate-500 font-normal">
                        (showing first 100 of {deferredNeg.length.toLocaleString()})
                      </span>
                    </h4>
                    <button
                      disabled={downloadingKey === "raw-neg" || !deferredNeg.length}
                      onClick={() => downloadCSV(
                        deferredNeg as any,
                        rawIonColumns,
                        "Raw_Negative_Full",
                        "raw-neg"
                      )}
                      className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-wait"
                    >
                      <Download size={14} />
                      <span>
                        {downloadingKey === "raw-neg"
                          ? "Preparing…"
                          : `Download Full (${deferredNeg.length.toLocaleString()})`}
                      </span>
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table id="rawNegativeTable" className="min-w-full bg-white border border-gray-200">
                      <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Channel</th><th className="py-2 px-4 border text-left">Mass</th><th className="py-2 px-4 border text-left">Intensity</th></tr></thead>
                      <tbody>
                        {limitedNegativeIons.length ? limitedNegativeIons.map((ion, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                            <td className="py-2 px-4 border">{ion.channel ?? "-"}</td>
                            <td className="py-2 px-4 border">{ion.mass?.toFixed(6) ?? "-"}</td>
                            <td className="py-2 px-4 border">{ion.intensity ?? "-"}</td>
                          </tr>
                        )) : <tr><td colSpan={3} className="py-2 px-4 border text-center">No negative ions data available</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-md font-medium">
                      Raw Positive Ions{" "}
                      <span className="text-sm text-slate-500 font-normal">
                        (showing first 100 of {deferredPos.length.toLocaleString()})
                      </span>
                    </h4>
                    <button
                      disabled={downloadingKey === "raw-pos" || !deferredPos.length}
                      onClick={() => downloadCSV(
                        deferredPos as any,
                        rawIonColumns,
                        "Raw_Positive_Full",
                        "raw-pos"
                      )}
                      className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-wait"
                    >
                      <Download size={14} />
                      <span>
                        {downloadingKey === "raw-pos"
                          ? "Preparing…"
                          : `Download Full (${deferredPos.length.toLocaleString()})`}
                      </span>
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table id="rawPositiveTable" className="min-w-full bg-white border border-gray-200">
                      <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Channel</th><th className="py-2 px-4 border text-left">Mass</th><th className="py-2 px-4 border text-left">Intensity</th></tr></thead>
                      <tbody>
                        {limitedPositiveIons.length ? limitedPositiveIons.map((ion, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                            <td className="py-2 px-4 border">{ion.channel ?? "-"}</td>
                            <td className="py-2 px-4 border">{ion.mass?.toFixed(6) ?? "-"}</td>
                            <td className="py-2 px-4 border">{ion.intensity ?? "-"}</td>
                          </tr>
                        )) : <tr><td colSpan={3} className="py-2 px-4 border text-center">No positive ions data available</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Processed Data */}
        {activeTab === "processed-data" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-blue-800 mb-6">Processed Data</h2>
            {!data?.processed_data?.length ? (
              <p className="text-center text-gray-500">No processed data available.</p>
            ) : (
              data.processed_data.map((run, runIndex) => (
                <div key={runIndex} className="mb-8">
                  {/* Processed Negative */}
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-md font-semibold">Processed Negative Ions</h4>
                      <button
                        disabled={downloadingKey === `proc-neg-${runIndex}`}
                        onClick={() => downloadCSV(
                          run.negative_ions as any,
                          procIonColumns,
                          `Processed_Negative_Run_${run.run_number}`,
                          `proc-neg-${runIndex}`
                        )}
                        className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        <Download size={14} />
                        <span>{downloadingKey === `proc-neg-${runIndex}` ? "Preparing…" : "Download"}</span>
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table id={`processedNegativeTable${runIndex}`} className="min-w-full bg-white border border-gray-200">
                        <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Mass</th><th className="py-2 px-4 border text-left">Counts</th></tr></thead>
                        <tbody>
                          {run.negative_ions.length ? run.negative_ions.map((ion, i) => (
                            <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                              <td className="py-2 px-4 border">{ion.mass?.toFixed(2) ?? "-"}</td>
                              <td className="py-2 px-4 border">{ion.counts ?? "-"}</td>
                            </tr>
                          )) : <tr><td colSpan={2} className="py-2 px-4 border text-center">No processed negative ions data available</td></tr>}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {getSIMSImageUrls(work_package, element).negative.map((url, idx) => (
                        <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden bg-white flex flex-col">
                          <div className="relative flex-1 min-h-[200px] bg-white">
                            <img
                              src={url}
                              alt={`Negative Ion Spectrum ${idx + 1}`}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const errorDiv = target.parentElement?.querySelector('.error-placeholder');
                                if (errorDiv) errorDiv.classList.remove('hidden');
                              }}
                            />
                            <div className="error-placeholder hidden absolute inset-0 flex items-center justify-center text-gray-400">
                              <span className="text-sm">Image not available</span>
                            </div>
                          </div>
                          <div className="p-2 bg-gray-50 flex items-center justify-between border-t border-gray-200">
                            <span className="text-sm text-gray-600">Negative Spectrum {idx + 1}</span>
                            <a href={url} download={`negative_spectrum_${idx + 1}.png`}
                              className="p-1 text-gray-500 hover:text-blue-600 transition" title="Download image">
                              <Download size={16} />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Processed Positive */}
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-md font-semibold">Processed Positive Ions</h4>
                      <button
                        disabled={downloadingKey === `proc-pos-${runIndex}`}
                        onClick={() => downloadCSV(
                          run.positive_ions as any,
                          procIonColumns,
                          `Processed_Positive_Run_${run.run_number}`,
                          `proc-pos-${runIndex}`
                        )}
                        className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        <Download size={14} />
                        <span>{downloadingKey === `proc-pos-${runIndex}` ? "Preparing…" : "Download"}</span>
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table id={`processedPositiveTable${runIndex}`} className="min-w-full bg-white border border-gray-200">
                        <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Mass</th><th className="py-2 px-4 border text-left">Counts</th></tr></thead>
                        <tbody>
                          {run.positive_ions.length ? run.positive_ions.map((ion, i) => (
                            <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                              <td className="py-2 px-4 border">{ion.mass?.toFixed(2) ?? "-"}</td>
                              <td className="py-2 px-4 border">{ion.counts ?? "-"}</td>
                            </tr>
                          )) : <tr><td colSpan={2} className="py-2 px-4 border text-center">No processed positive ions data available</td></tr>}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {getSIMSImageUrls(work_package, element).positive.map((url, idx) => (
                        <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden bg-white flex flex-col">
                          <div className="relative flex-1 min-h-[200px] bg-white">
                            <img
                              src={url}
                              alt={`Positive Ion Spectrum ${idx + 1}`}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const errorDiv = target.parentElement?.querySelector('.error-placeholder');
                                if (errorDiv) errorDiv.classList.remove('hidden');
                              }}
                            />
                            <div className="error-placeholder hidden absolute inset-0 flex items-center justify-center text-gray-400">
                              <span className="text-sm">Image not available</span>
                            </div>
                          </div>
                          <div className="p-2 bg-gray-50 flex items-center justify-between border-t border-gray-200">
                            <span className="text-sm text-gray-600">Positive Spectrum {idx + 1}</span>
                            <a href={url} download={`positive_spectrum_${idx + 1}.png`}
                              className="p-1 text-gray-500 hover:text-blue-600 transition" title="Download image">
                              <Download size={16} />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="mb-6">
                    <h4 className="text-md font-semibold mb-2">Totals</h4>
                    <table className="min-w-full bg-white border border-gray-200">
                      <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Metric</th><th className="py-2 px-4 border text-left">Value</th></tr></thead>
                      <tbody>
                        <tr><td className="py-2 px-4 border">Total Negative Counts</td><td className="py-2 px-4 border">{run.total_negative_counts ?? "N/A"}</td></tr>
                        <tr className="bg-gray-50"><td className="py-2 px-4 border">Total Positive Counts</td><td className="py-2 px-4 border">{run.total_positive_counts ?? "N/A"}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Results */}
        {activeTab === "results" && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-blue-800 mb-6">SIMS Results</h2>

            <div className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Final Negative Ions</h3>
                <button
                  disabled={downloadingKey === "final-neg"}
                  onClick={() => downloadCSV(
                    (data?.final_results.negative_ions ?? []) as any,
                    finalIonColumns,
                    "Final_Negative_Ions",
                    "final-neg"
                  )}
                  className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition disabled:opacity-50"
                >
                  <Download size={14} />
                  <span>{downloadingKey === "final-neg" ? "Preparing…" : "Download"}</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table id="finalNegativeTable" className="min-w-full bg-white border border-gray-200">
                  <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Mass</th><th className="py-2 px-4 border text-left">Fragment</th></tr></thead>
                  <tbody>
                    {data?.final_results.negative_ions?.length ? data.final_results.negative_ions.map((ion, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                        <td className="py-2 px-4 border">{ion.mass?.toFixed(2) ?? "-"}</td>
                        <td className="py-2 px-4 border">{ion.fragment ?? "-"}</td>
                      </tr>
                    )) : <tr><td colSpan={2} className="py-2 px-4 border text-center">No final negative ions available</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Final Positive Ions</h3>
                <button
                  disabled={downloadingKey === "final-pos"}
                  onClick={() => downloadCSV(
                    (data?.final_results.positive_ions ?? []) as any,
                    finalIonColumns,
                    "Final_Positive_Ions",
                    "final-pos"
                  )}
                  className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition disabled:opacity-50"
                >
                  <Download size={14} />
                  <span>{downloadingKey === "final-pos" ? "Preparing…" : "Download"}</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table id="finalPositiveTable" className="min-w-full bg-white border border-gray-200">
                  <thead><tr className="bg-gray-100"><th className="py-2 px-4 border text-left">Mass</th><th className="py-2 px-4 border text-left">Fragment</th></tr></thead>
                  <tbody>
                    {data?.final_results.positive_ions?.length ? data.final_results.positive_ions.map((ion, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                        <td className="py-2 px-4 border">{ion.mass?.toFixed(2) ?? "-"}</td>
                        <td className="py-2 px-4 border">{ion.fragment ?? "-"}</td>
                      </tr>
                    )) : <tr><td colSpan={2} className="py-2 px-4 border text-center">No final positive ions available</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && !data && (
          <p className="text-center text-gray-500">No data available.</p>
        )}
      </div>
    </div>
  );
};

export default SIMSDataViewer;