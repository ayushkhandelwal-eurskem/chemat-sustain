'use client';

import { useEffect, useMemo, useState, useCallback, FC } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import {
  ChevronRight,
  ChevronDown,
  FlaskConical,
  Microscope,
  Activity,
  Leaf,
  HelpCircle,
  FileText,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Test taxonomy (from the project spreadsheet).                        */
/* Maps the stored test_name -> { display label, category }.            */
/* The raw test_name is still used to build the viewer URL; the label   */
/* is purely for display. Entries without a parser yet (AFM, apoptosis, */
/* etc.) are included so they render automatically once data exists.    */
/* Any stored test_name NOT in this map falls back to showing its raw   */
/* name under "Other".                                                  */
/* ------------------------------------------------------------------ */
type CategoryKey =
  | 'physicochemical'
  | 'photoelectron'
  | 'toxicological'
  | 'ecotoxicological'
  | 'other';

const CATEGORY_META: Record<
  CategoryKey,
  { label: string; icon: FC<{ className?: string }>; order: number }
> = {
  physicochemical: { label: 'Physicochemical characteristics', icon: FlaskConical, order: 0 },
  photoelectron: { label: 'Photoelectron spectroscopy characterisation', icon: Microscope, order: 1 },
  toxicological: { label: 'Toxicological assays', icon: Activity, order: 2 },
  ecotoxicological: { label: 'Eco-toxicological assays', icon: Leaf, order: 3 },
  other: { label: 'Other', icon: HelpCircle, order: 4 },
};

// Stored test_name (as it appears in the database) -> display + category.
const TEST_META: Record<string, { label: string; category: CategoryKey }> = {
  // Physicochemical
  FTIR: { label: 'Fourier Transform Infrared spectroscopy (FT-IR)', category: 'physicochemical' },
  'UV-VIS': { label: 'UV-VIS spectroscopy', category: 'physicochemical' },
  'HR-STEM': { label: 'HR-SEM/TEM', category: 'physicochemical' },
  DLS: { label: 'Dynamic light scattering (DLS)', category: 'physicochemical' },
  ZETA: { label: 'Z-Potential', category: 'physicochemical' },
  SIMS: { label: 'Secondary ion Mass spectroscopy (SIMS)', category: 'physicochemical' },
  DSC: { label: 'Differential Scanning Calorimetry (DSC)', category: 'physicochemical' },
  TGA: { label: 'Thermogravimetric Analysis (TGA)', category: 'physicochemical' },
  XRD: { label: 'X-Ray Diffraction (XRD)', category: 'physicochemical' },
  AFM: { label: 'Atomic Force microscopy (AFM)', category: 'physicochemical' },

  // Photoelectron
  XPS: { label: 'X-Ray photoelectron spectroscopy (XPS)', category: 'photoelectron' },
  UPS: { label: 'Ultraviolet photoelectron spectroscopy (UPS)', category: 'photoelectron' },

  // Toxicological
  MTT: { label: 'Cytotoxicity (MTT)', category: 'toxicological' },
  ROS: { label: 'ROS', category: 'toxicological' },
  MNT: { label: 'Genotoxicity-Micronucleus test (MNT)', category: 'toxicological' },
  'Three Parametric': { label: 'Three Parametric test', category: 'toxicological' },
  'Early apoptosis': { label: 'Early apoptosis', category: 'toxicological' },
  'Late apoptosis': { label: 'Late apoptosis', category: 'toxicological' },
  TB: { label: 'Trypan Blue', category: 'toxicological' },
  'Inflammatory-PCR': { label: 'Inflammatory response -PCR', category: 'toxicological' },
  'TB-Microfludic': { label: 'Trypan Blue (microfludic in-vitro)', category: 'toxicological' },
  'Inflammatory-PCR-Microfludic': {
    label: 'Inflammatory response-PCR (microfludic in-vitro)',
    category: 'toxicological',
  },

  // Eco-toxicological
  Algae: { label: 'Algae toxicity', category: 'ecotoxicological' },
  Rotifier: { label: 'Rotifier toxicity', category: 'ecotoxicological' },
  WaterFlea: { label: 'Water flea toxicity', category: 'ecotoxicological' },
};

function metaFor(testName: string): { label: string; category: CategoryKey } {
  return TEST_META[testName] ?? { label: testName, category: 'other' };
}

/**
 * Identifier display rule:
 *   - Always show CMS Internal Identifier (the element_cms_id).
 *   - If ERM Identifier exists, show CMS + ERM.
 *   - If ERM is missing, show CMS + CAS instead.
 * element_cms_id is the canonical CMS identifier (e.g. "CMS_1a_AuNP"); the
 * material's own cms_id/material_identifier (e.g. "Material 1") is just a label
 * and is not used here.
 */
function identifierLabel(m: {
  erm_id?: string | null;
  cas_no?: string | null;
  element_cms_id: string;
}): string {
  const parts: string[] = [];
  if (m.element_cms_id) parts.push(`CMS: ${m.element_cms_id}`);
  if (m.erm_id) {
    parts.push(`ERM: ${m.erm_id}`);
  } else if (m.cas_no) {
    parts.push(`CAS: ${m.cas_no}`);
  }
  return parts.join('  ·  ');
}

/* ----------------------------- Types ----------------------------- */
interface TestRecord {
  work_package_name: string;
  element_cms_id: string;
  test_name: string;
  material_name?: string;
  cms_id?: string | null;
  erm_id?: string | null;
  cas_no?: string | null;
}

interface MaterialEntry {
  work_package_name: string;
  element_cms_id: string;
  test_name: string;
  material_name?: string;
  cms_id?: string | null;
  erm_id?: string | null;
  cas_no?: string | null;
}

interface TestTypeGroup {
  testName: string;
  label: string;
  materials: MaterialEntry[];
}

interface CategoryGroup {
  key: CategoryKey;
  label: string;
  icon: FC<{ className?: string }>;
  testTypes: TestTypeGroup[];
  total: number;
}

/* ============================ Page ============================ */
const ExperimentalDataPage: FC = () => {
  const router = useRouter();
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openCats, setOpenCats] = useState<Set<CategoryKey>>(new Set());
  const [openTypes, setOpenTypes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        // Single lightweight call — no per-work-package looping, no heavy fields.
        const res = await api.get('/tests/catalog', { signal: ac.signal });
        const list: any[] = Array.isArray(res.data) ? res.data : [];
        setRecords(
          list.map((rec) => ({
            work_package_name: rec.work_package_name,
            element_cms_id: rec.element_cms_id,
            test_name: rec.test_name,
            material_name: rec.material_name,
            cms_id: rec.cms_id,
            erm_id: rec.erm_id,
            cas_no: rec.cas_no,
          }))
        );
        setError('');
      } catch (err: any) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
          setError('Failed to load experimental data.');
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  /* ---- group records: category -> test type -> materials ---- */
  const categories = useMemo<CategoryGroup[]>(() => {
    // category -> testName -> { label, materials }
    const byCat = new Map<
      CategoryKey,
      Map<string, { label: string; materials: MaterialEntry[] }>
    >();

    for (const rec of records) {
      const meta = metaFor(rec.test_name);
      if (!byCat.has(meta.category)) byCat.set(meta.category, new Map());
      const typeMap = byCat.get(meta.category)!;
      if (!typeMap.has(rec.test_name)) {
        typeMap.set(rec.test_name, { label: meta.label, materials: [] });
      }
      typeMap.get(rec.test_name)!.materials.push({
        work_package_name: rec.work_package_name,
        element_cms_id: rec.element_cms_id,
        test_name: rec.test_name,
        material_name: rec.material_name,
        cms_id: rec.cms_id,
        erm_id: rec.erm_id,
        cas_no: rec.cas_no,
      });
    }

    const result: CategoryGroup[] = [];
    for (const [key, typeMap] of byCat.entries()) {
      const testTypes: TestTypeGroup[] = [];
      let total = 0;
      for (const [testName, { label, materials }] of typeMap.entries()) {
        testTypes.push({ testName, label, materials });
        total += materials.length;
      }
      // sort by display label
      testTypes.sort((a, b) => a.label.localeCompare(b.label));
      result.push({
        key,
        label: CATEGORY_META[key].label,
        icon: CATEGORY_META[key].icon,
        testTypes,
        total,
      });
    }
    result.sort((a, b) => CATEGORY_META[a.key].order - CATEGORY_META[b.key].order);
    return result;
  }, [records]);

  const toggleCat = useCallback((k: CategoryKey) => {
    setOpenCats((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  }, []);

  const toggleType = useCallback((id: string) => {
    setOpenTypes((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const openViewer = useCallback(
    (m: MaterialEntry) => {
      // Same route the home page links to: /{wp}/{element}/{test}
      router.push(
        `/${encodeURIComponent(m.work_package_name)}/${encodeURIComponent(
          m.element_cms_id
        )}/${encodeURIComponent(m.test_name)}`
      );
    },
    [router]
  );

  return (
    <ProtectedRoute requireAuth={true}>
      <div className="bg-gray-50 min-h-screen">
        <div className="container mx-auto px-4 py-10">
          {/* Header */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 mb-8">
            <p className="text-sm font-medium tracking-wide uppercase text-blue-700 mb-1">
              Selected chemicals &amp; nanomaterials (CNM&apos;s) data
            </p>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
              Experimental Data
            </h1>
            <p className="text-slate-600 mt-3 max-w-3xl leading-relaxed">
              Browse the experimental results by category. Open a category to see the
              tests that have data, then pick a material to view its full results.
            </p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600" />
            </div>
          )}

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {!loading && !error && categories.length === 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-12 text-center text-slate-500">
              No experimental data available yet.
            </div>
          )}

          {/* Category cards */}
          {!loading &&
            !error &&
            categories.map((cat) => {
              const Icon = cat.icon;
              const catOpen = openCats.has(cat.key);
              return (
                <div
                  key={cat.key}
                  className="bg-white rounded-2xl shadow-sm border border-slate-100 mb-5 overflow-hidden"
                >
                  <button
                    onClick={() => toggleCat(cat.key)}
                    className="w-full flex items-center gap-3 px-6 py-5 text-left hover:bg-slate-50 transition-colors"
                    aria-expanded={catOpen}
                  >
                    {catOpen ? (
                      <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />
                    )}
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 shrink-0">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex-1">
                      <span className="block font-semibold text-slate-900">{cat.label}</span>
                      <span className="block text-sm text-slate-500">
                        {cat.testTypes.length} test type
                        {cat.testTypes.length !== 1 ? 's' : ''} · {cat.total} record
                        {cat.total !== 1 ? 's' : ''}
                      </span>
                    </span>
                  </button>

                  {catOpen && (
                    <div className="px-6 pb-5 border-t border-slate-100">
                      <ul className="mt-3 space-y-2">
                        {cat.testTypes.map((tt) => {
                          const typeId = `${cat.key}::${tt.testName}`;
                          const typeOpen = openTypes.has(typeId);
                          return (
                            <li
                              key={typeId}
                              className="rounded-lg border border-slate-100"
                            >
                              <button
                                onClick={() => toggleType(typeId)}
                                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-blue-50/50 transition-colors"
                                aria-expanded={typeOpen}
                              >
                                {typeOpen ? (
                                  <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                                )}
                                <span className="font-medium text-slate-800">
                                  {tt.label}
                                </span>
                                <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                  {tt.materials.length} material
                                  {tt.materials.length !== 1 ? 's' : ''}
                                </span>
                              </button>

                              {typeOpen && (
                                <ul className="border-t border-slate-100 divide-y divide-slate-50">
                                  {tt.materials.map((m, i) => (
                                    <li key={`${m.element_cms_id}-${i}`}>
                                      <button
                                        onClick={() => openViewer(m)}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-blue-50 transition-colors group"
                                      >
                                        <FileText className="h-4 w-4 text-slate-400 group-hover:text-blue-600 shrink-0" />
                                        <span className="min-w-0">
                                          <span className="block text-sm text-slate-800 truncate">
                                            {identifierLabel(m)}
                                          </span>
                                        </span>
                                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600 ml-auto shrink-0" />
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default ExperimentalDataPage;