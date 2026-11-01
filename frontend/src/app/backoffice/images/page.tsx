"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/axios";
import { imageUrl } from "@/components/tests/shared/TestImageGallery";
import type { ManagedImage } from "@/components/tests/shared/TestImageGallery";

interface TestChoice { id: number; work_package_name: string; element_cms_id: string; test_name: string }
const categories = [{value:"final", label:"Final Results"}, {value:"raw", label:"Raw Data"}, {value:"processed", label:"Processed Data"}, {value:"statistics", label:"Statistical Analysis"}, {value:"conditions", label:"Test Conditions"}];

function ImageEditor({ image, testId, onSaved, onError }: { image: ManagedImage; testId:number; onSaved:()=>Promise<void>; onError:(message:string)=>void }) {
  const [title, setTitle] = useState(image.title);
  const [category, setCategory] = useState(image.category ?? "");
  const [busy, setBusy] = useState(false);
  async function save(remove = false) {
    if (remove && !window.confirm("Remove this image from the test?")) return;
    setBusy(true);
    try {
      if (remove) await api.delete(`/test-images/${testId}/${image.id}`);
      else await api.patch(`/test-images/${testId}/${image.id}`, {title, category});
      await onSaved();
    } catch { onError("Could not save the image. Please retry."); }
    finally { setBusy(false); }
  }
  return <div className="bg-white rounded-lg shadow p-4 space-y-3">
    <img src={imageUrl(image.url)} alt={image.title} className="w-full h-48 object-contain" />
    <p className="text-sm text-gray-500">{image.origin === "excel" ? `${image.sheet} · ${image.anchor} · ${image.replication ?? ""}` : "Manually uploaded"}</p>
    <label className="block text-sm font-medium text-gray-700">Title<input value={title} maxLength={200} onChange={e=>setTitle(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-gray-900" /></label>
    <label className="block text-sm font-medium text-gray-700">Category<select value={category} onChange={e=>setCategory(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-gray-900"><option value="" disabled>Needs category review</option>{categories.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
    <div className="flex gap-3"><button disabled={busy || !category} onClick={()=>save()} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50">Save</button><button disabled={busy} onClick={()=>save(true)} className="text-red-600 px-4 py-2 rounded border">Remove</button></div>
  </div>;
}

export default function ImagesPage() {
  const [tests, setTests] = useState<TestChoice[]>([]);
  const [selected, setSelected] = useState("");
  const [images, setImages] = useState<ManagedImage[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [category, setCategory] = useState("final");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const test = tests.find(t=>String(t.id)===selected);
  useEffect(()=> {
    const controller = new AbortController();
    (async()=> {
      const all: TestChoice[] = [];
      for (let page=1; ; page++) {
        const response = await api.get<{tests:TestChoice[];total_pages:number}>("/tests", {params:{page, per_page:100}, signal:controller.signal});
        all.push(...response.data.tests);
        if (page >= response.data.total_pages) break;
      }
      if (!controller.signal.aborted) setTests(all);
    })().catch(()=> { if (!controller.signal.aborted) setError("Could not load tests."); });
    return ()=>controller.abort();
  },[]);
  const refresh = useCallback(async()=> {
    if (!test) return;
    const response = await api.get<{images:ManagedImage[];warnings:string[]}>("/test-images", {params:{work_package:test.work_package_name, element:test.element_cms_id, test_name:test.test_name}});
    setImages(response.data.images); setWarnings(response.data.warnings);
  },[test]);
  useEffect(()=> {
    let active=true; setImages([]); setWarnings([]); setError("");
    if (!test) return;
    setLoading(true);
    api.get<{images:ManagedImage[];warnings:string[]}>("/test-images", {params:{work_package:test.work_package_name, element:test.element_cms_id, test_name:test.test_name}})
      .then(response=> {if(active){setImages(response.data.images);setWarnings(response.data.warnings);}})
      .catch(()=> {if(active)setError("Could not load images.");}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[test]);
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!test || !file) return;
    if (file.size > 15*1024*1024) {setError("Choose an image smaller than 15 MB.");return;}
    const form=event.currentTarget; setBusy(true); setError("");
    try {
      const data=new FormData();data.append("file",file);data.append("title",title);data.append("category",category);
      await api.post(`/test-images/${test.id}`,data,{headers:{"Content-Type":"multipart/form-data"}});
      await refresh();setFile(null);setTitle("");form.reset();
    } catch {setError("Upload failed. Use a supported image up to 15 MB and 25 megapixels.");}
    finally {setBusy(false);}
  }
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold text-gray-900">Test Images</h1><p className="text-gray-600 mt-2">Choose a test and category. Embedded Excel images are imported automatically by worksheet; unrecognized sheets need review. Images follow the test’s existing section-release permissions.</p></div>
    {error && <p role="alert" className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</p>}
    <label className="block text-sm font-medium text-gray-700">Test<select disabled={busy} value={selected} onChange={e=>setSelected(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-gray-900"><option value="">Select a test</option>{tests.map(t=><option key={t.id} value={t.id}>{t.work_package_name} / {t.element_cms_id} / {t.test_name} (#{t.id})</option>)}</select></label>
    {test && <form onSubmit={upload} className="bg-white rounded-lg shadow p-6 space-y-4">
      <h2 className="text-xl font-bold text-blue-800">Add image</h2>
      <label className="block text-sm font-medium text-gray-700">Category<select value={category} onChange={e=>setCategory(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-gray-900">{categories.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
      <label className="block text-sm font-medium text-gray-700">Title<input value={title} maxLength={200} onChange={e=>setTitle(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-gray-900" /></label>
      <input required type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff" onChange={e=>setFile(e.target.files?.[0]??null)} className="text-gray-900" />
      <button disabled={busy||!file} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50">{busy?"Uploading…":"Upload image"}</button>
    </form>}
    {loading && <p role="status" className="text-gray-500">Extracting and loading workbook images…</p>}
    {warnings.map(w=><p key={w} className="text-sm text-gray-600">{w}</p>)}
    {!loading && test && !images.length && <p className="text-gray-500">No embedded or uploaded images found. Add an image above.</p>}
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">{test && images.map(image=><ImageEditor key={`${test.id}-${image.id}`} image={image} testId={test.id} onSaved={refresh} onError={setError} />)}</div>
  </div>;
}