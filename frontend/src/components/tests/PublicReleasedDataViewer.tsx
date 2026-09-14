"use client";

import { FC, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { api } from "@/lib/axios";

interface ViewerProps {
  work_package: string;
  element: string;
  test: string;
  file?: string;
}

type SectionKey =
  | "test_details"
  | "raw_data"
  | "processed_data"
  | "final_results"
  | "statistical_analysis";

type ReleaseFlag =
  | "release_test_details"
  | "release_raw_data"
  | "release_processed_data"
  | "release_final_results"
  | "release_statistical_analysis";

interface PublicTestResponse {
  work_package_name: string;
  element_cms_id: string;
  test_name: string;
  test_details: unknown;
  raw_data: unknown;
  processed_data: unknown;
  final_results: unknown;
  statistical_analysis: unknown;
  release_test_details: boolean;
  release_raw_data: boolean;
  release_processed_data: boolean;
  release_final_results: boolean;
  release_statistical_analysis: boolean;
}

interface SectionDefinition {
  key: SectionKey;
  flag: ReleaseFlag;
  label: string;
}

const SECTIONS: readonly SectionDefinition[] = [
  { key: "test_details", flag: "release_test_details", label: "Test Conditions" },
  { key: "raw_data", flag: "release_raw_data", label: "Raw Data" },
  { key: "processed_data", flag: "release_processed_data", label: "Processed Data" },
  { key: "final_results", flag: "release_final_results", label: "Final Results" },
  {
    key: "statistical_analysis",
    flag: "release_statistical_analysis",
    label: "Statistical Analysis",
  },
] as const;

const MAX_ARRAY_PREVIEW = 100;

export const getReleasedSections = (
  data: PublicTestResponse | null
): SectionDefinition[] =>
  data ? SECTIONS.filter((section) => data[section.flag] === true) : [];

const humanize = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const formatPrimitive = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const ReleasedValue: FC<{ value: unknown; depth?: number }> = ({ value, depth = 0 }) => {
  if (value === null || value === undefined) {
    return <p className="text-gray-500 italic">No data available in this released section.</p>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="text-gray-500 italic">No records available in this released section.</p>;
    }

    const preview = value.slice(0, MAX_ARRAY_PREVIEW);
    const primitives = preview.every(
      (item) => item === null || typeof item !== "object"
    );

    return (
      <div className="space-y-3">
        {value.length > MAX_ARRAY_PREVIEW && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Showing the first {MAX_ARRAY_PREVIEW.toLocaleString()} of{" "}
            {value.length.toLocaleString()} records. Download the section for the complete data.
          </p>
        )}
        {primitives ? (
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-200 bg-white text-sm">
              <thead><tr className="bg-gray-100"><th className="border px-3 py-2 text-left">Value</th></tr></thead>
              <tbody>
                {preview.map((item, index) => (
                  <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                    <td className="border px-3 py-2">{formatPrimitive(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          preview.map((item, index) => (
            <div key={index} className="rounded-md border border-gray-200 p-4">
              <h3 className="mb-3 font-semibold text-blue-800">Record {index + 1}</h3>
              <ReleasedValue value={item} depth={depth + 1} />
            </div>
          ))
        )}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <p className="text-gray-500 italic">No values available in this released section.</p>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 bg-white text-sm">
          <tbody>
            {entries.map(([key, nestedValue], index) => {
              const isNested = nestedValue !== null && typeof nestedValue === "object";
              return (
                <tr key={key} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                  <th className="w-1/4 min-w-48 border px-3 py-2 text-left align-top font-medium">
                    {humanize(key)}
                  </th>
                  <td className="border px-3 py-2 align-top">
                    {isNested ? (
                      <ReleasedValue value={nestedValue} depth={depth + 1} />
                    ) : (
                      formatPrimitive(nestedValue)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return <span>{formatPrimitive(value)}</span>;
};

const PublicReleasedDataViewer: FC<ViewerProps> = ({ work_package, element, test }) => {
  const [data, setData] = useState<PublicTestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<SectionKey | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        setLoading(true);
        setError("");
        const response = await api.post<PublicTestResponse>(
          "/tests/listings",
          {
            work_package_name: work_package,
            element_cms_id: element,
            test_name: test,
          },
          { signal: controller.signal }
        );
        setData(response.data);
      } catch (requestError: unknown) {
        const errorName =
          requestError && typeof requestError === "object" && "name" in requestError
            ? String(requestError.name)
            : "";
        if (errorName !== "CanceledError" && errorName !== "AbortError") {
          console.error("Error fetching released test data:", requestError);
          setError("Failed to load released test data. Please try again later.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [work_package, element, test]);

  const releasedSections = useMemo(() => getReleasedSections(data), [data]);

  useEffect(() => {
    if (!releasedSections.some((section) => section.key === activeSection)) {
      setActiveSection(releasedSections[0]?.key ?? null);
    }
  }, [activeSection, releasedSections]);

  const currentSection = releasedSections.find((section) => section.key === activeSection);

  const downloadSection = () => {
    if (!data || !currentSection) return;
    const blob = new Blob([JSON.stringify(data[currentSection.key], null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${test}_${currentSection.key}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-white"><div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-blue-500" /></div>;
  }

  if (error || !data) {
    return <div className="flex min-h-screen items-center justify-center"><div className="rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">{error || "No data available."}</div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 text-black">
      <div className="container mx-auto px-4">
        <div className="mb-8 rounded-lg bg-white p-6 shadow-md">
          <h1 className="mb-4 text-2xl font-bold text-blue-800">{data.test_name} Test Data Report</h1>
          <div className="grid grid-cols-1 gap-4 rounded-md bg-blue-50 p-4 md:grid-cols-3">
            <p><span className="font-semibold">Work Package:</span> {data.work_package_name || work_package}</p>
            <p><span className="font-semibold">CMS Identifier:</span> {data.element_cms_id || element}</p>
            <p><span className="font-semibold">Released sections:</span> {releasedSections.length}</p>
          </div>
        </div>

        {releasedSections.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900 shadow-sm">
            This test is published, but no data sections have been released.
          </div>
        ) : (
          <>
            <div className="mb-8 w-full">
              <ul className="relative flex flex-wrap rounded-md bg-slate-100 p-1.5" role="tablist">
                {releasedSections.map((section) => (
                  <li key={section.key} className="z-30 flex-auto text-center" role="presentation">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeSection === section.key}
                      onClick={() => setActiveSection(section.key)}
                      className={`w-full rounded-md px-3 py-2 text-sm transition ${activeSection === section.key ? "bg-blue-600 text-white shadow-md" : "text-slate-600 hover:text-slate-800"}`}
                    >
                      {section.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {currentSection && (
              <section className="mb-8 rounded-lg bg-white p-6 shadow-md">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold text-blue-800">{currentSection.label}</h2>
                  <button type="button" onClick={downloadSection} className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700">
                    <Download size={16} /> Download JSON
                  </button>
                </div>
                <ReleasedValue value={data[currentSection.key]} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PublicReleasedDataViewer;
