"use client";
import { useEffect, useState } from "react";
import { api, getBaseUrl } from "@/lib/axios";
import UniversalImagesTab from "./UniversalImagesTab";
import type { TestType } from "@/lib/images/testImageConfig";
import WorkbookCharts from "./WorkbookCharts";
import type { WorkbookChart } from "./WorkbookCharts";

export interface ManagedImage {
  id: string; title: string; category: string | null; url: string; origin: string;
  sheet?: string; anchor?: string; replication?: string;
}
export const imageUrl = (url: string) => `${getBaseUrl()}${url}`;
export const imageCategory = (tab: string) => ({"raw-data":"raw", "processed-data":"processed", results:"final", "final-results":"final", "test-conditions":"conditions", raw_data:"raw", processed_data:"processed", final_results:"final", statistical_analysis:"statistics", test_details:"conditions"}[tab] ?? tab);

export default function TestImageGallery({ workPackage, element, test, category, replication, unassignedOnly = false }: {
  workPackage: string; element: string; test: string; category: string; replication?: string; unassignedOnly?: boolean;
}) {
  const [images, setImages] = useState<ManagedImage[]>([]);
  const [charts, setCharts] = useState<WorkbookChart[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setImages([]); setCharts([]); setError(false);
    api.get<{images: ManagedImage[]; charts?: WorkbookChart[]}>("/test-images", {params: {work_package:workPackage, element, test_name:test}, signal:controller.signal})
      .then(response => { if (!controller.signal.aborted) { setImages(response.data.images); setCharts(response.data.charts ?? []); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [workPackage, element, test]);
  const visible = images.filter(image => image.category === imageCategory(category) && (!replication || image.replication === replication) && (!unassignedOnly || !image.replication));
  if (error) return <p className="text-sm text-gray-500">Images could not be loaded. Refresh to retry.</p>;
  const visibleCharts = imageCategory(category) === "final" && !replication ? charts : [];
  if (!visible.length && !visibleCharts.length) return null;
  return <div className="space-y-6"><WorkbookCharts charts={visibleCharts} />{visible.length > 0 && <UniversalImagesTab workPackage={workPackage} element={element} testType={test.toLowerCase() as TestType}
    apiImages={visible.map(image => ({id:image.id, title:image.title, url:imageUrl(image.url), type:image.category ?? "image",
      description:[image.replication, image.origin === "excel" ? image.sheet : "Uploaded image"].filter(Boolean).join(" · ")}))} />}</div>;
}