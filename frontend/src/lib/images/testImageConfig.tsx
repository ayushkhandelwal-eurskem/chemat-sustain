/* ==============================================================================
   UNIVERSAL TEST IMAGES CONFIGURATION
   ============================================================================== 
   
   A standardized image system for all test types.
   
   FOLDER STRUCTURE:
   public/images/{workPackage}/{cmsId}/{testType}/
   
   EXAMPLE:
   public/images/wp1/1a/sims/1a_SIMS_negative1.png
   public/images/wp1/1a/ftir/1a_FTIR_spectrum.png
   public/images/wp1/1a/dls/1a_DLS_size_distribution.png
   
   USAGE:
   import { getTestImages, TestType } from "@/lib/images/testImageConfig";
   const images = getTestImages("wp1", "1a", "sims");
   
   ============================================================================== */

/* ============================ Types ============================ */
export interface TestImage {
  id: string;
  url: string;
  title: string;
  description?: string;
  type: string;  // Flexible type per test
}

export interface TestImageConfig {
  testType: string;
  testLabel: string;  // Display name
  images: {
    suffix: string;      // e.g., "negative1", "spectrum", "size_distribution"
    title: string;
    description?: string;
    type: string;        // Category for styling (e.g., "negative", "positive", "spectrum")
  }[];
}

/* ============================ Supported Test Types ============================ */
export type TestType = 
  | 'sims' 
  | 'dls' 
  | 'ftir' 
  | 'hr_stem' 
  | 'mtt' 
  | 'uv_vis' 
  | 'zeta';

/* ============================ Test Configurations ============================ */
// Add new test types here - this is the ONLY place you need to update
export const TEST_IMAGE_CONFIGS: Record<TestType, TestImageConfig> = {
  sims: {
    testType: 'sims',
    testLabel: 'SIMS',
    images: [
      { suffix: 'negative1', title: 'Negative Ion Spectrum 1', description: 'ToF-SIMS negative ion mass spectrum (1)', type: 'negative' },
      { suffix: 'negative2', title: 'Negative Ion Spectrum 2', description: 'ToF-SIMS negative ion mass spectrum (2)', type: 'negative' },
      { suffix: 'positive1', title: 'Positive Ion Spectrum 1', description: 'ToF-SIMS positive ion mass spectrum (1)', type: 'positive' },
      { suffix: 'positive2', title: 'Positive Ion Spectrum 2', description: 'ToF-SIMS positive ion mass spectrum (2)', type: 'positive' },
    ]
  },
  
  dls: {
    testType: 'dls',
    testLabel: 'DLS',
    images: [
      { suffix: 'size_distribution', title: 'Size Distribution', description: 'Particle size distribution curve', type: 'distribution' },
      { suffix: 'correlation', title: 'Correlation Function', description: 'Autocorrelation function', type: 'correlation' },
      { suffix: 'intensity', title: 'Intensity Distribution', description: 'Intensity-weighted size distribution', type: 'intensity' },
      { suffix: 'volume', title: 'Volume Distribution', description: 'Volume-weighted size distribution', type: 'volume' },
    ]
  },
  
  ftir: {
    testType: 'ftir',
    testLabel: 'FTIR',
    images: [
      { suffix: 'spectrum', title: 'FTIR Spectrum', description: 'Full FTIR absorption spectrum', type: 'spectrum' },
      { suffix: 'fingerprint', title: 'Fingerprint Region', description: 'Fingerprint region detail', type: 'detail' },
      { suffix: 'functional', title: 'Functional Groups', description: 'Functional group region', type: 'detail' },
      { suffix: 'baseline', title: 'Baseline Corrected', description: 'Baseline corrected spectrum', type: 'processed' },
    ]
  },
  
  hr_stem: {
    testType: 'hr_stem',
    testLabel: 'HR-STEM',
    images: [
      { suffix: 'overview', title: 'Overview Image', description: 'Low magnification overview', type: 'overview' },
      { suffix: 'highres', title: 'High Resolution', description: 'High resolution image', type: 'highres' },
      { suffix: 'eds', title: 'EDS Mapping', description: 'Energy dispersive spectroscopy map', type: 'mapping' },
      { suffix: 'diffraction', title: 'Diffraction Pattern', description: 'Selected area diffraction', type: 'diffraction' },
    ]
  },
  
  mtt: {
    testType: 'mtt',
    testLabel: 'MTT',
    images: [
      { suffix: 'viability', title: 'Cell Viability', description: 'Cell viability curve', type: 'viability' },
      { suffix: 'dose_response', title: 'Dose Response', description: 'Dose-response curve', type: 'response' },
      { suffix: 'control', title: 'Control', description: 'Control sample image', type: 'control' },
      { suffix: 'treated', title: 'Treated', description: 'Treated sample image', type: 'treated' },
    ]
  },
  
  uv_vis: {
    testType: 'uv_vis',
    testLabel: 'UV-Vis',
    images: [
      { suffix: 'absorption', title: 'Absorption Spectrum', description: 'UV-Vis absorption spectrum', type: 'absorption' },
      { suffix: 'transmission', title: 'Transmission Spectrum', description: 'Transmission spectrum', type: 'transmission' },
      { suffix: 'calibration', title: 'Calibration Curve', description: 'Calibration curve', type: 'calibration' },
      { suffix: 'kinetics', title: 'Kinetics', description: 'Time-dependent absorption', type: 'kinetics' },
    ]
  },
  
  zeta: {
    testType: 'zeta',
    testLabel: 'Zeta Potential',
    images: [
      { suffix: 'distribution', title: 'Zeta Distribution', description: 'Zeta potential distribution', type: 'distribution' },
      { suffix: 'phase', title: 'Phase Plot', description: 'Phase plot analysis', type: 'phase' },
      { suffix: 'mobility', title: 'Electrophoretic Mobility', description: 'Mobility distribution', type: 'mobility' },
      { suffix: 'quality', title: 'Quality Report', description: 'Measurement quality report', type: 'quality' },
    ]
  },
};

/* ============================ Badge Color Mapping ============================ */
// Define colors for different image types across all tests
export const IMAGE_TYPE_COLORS: Record<string, string> = {
  // SIMS
  negative: 'bg-red-100 text-red-700 border-red-200',
  positive: 'bg-green-100 text-green-700 border-green-200',
  
  // DLS
  distribution: 'bg-blue-100 text-blue-700 border-blue-200',
  correlation: 'bg-purple-100 text-purple-700 border-purple-200',
  intensity: 'bg-orange-100 text-orange-700 border-orange-200',
  volume: 'bg-teal-100 text-teal-700 border-teal-200',
  
  // FTIR
  spectrum: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  detail: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  processed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  
  // HR-STEM
  overview: 'bg-slate-100 text-slate-700 border-slate-200',
  highres: 'bg-violet-100 text-violet-700 border-violet-200',
  mapping: 'bg-amber-100 text-amber-700 border-amber-200',
  diffraction: 'bg-rose-100 text-rose-700 border-rose-200',
  
  // MTT
  viability: 'bg-lime-100 text-lime-700 border-lime-200',
  response: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  control: 'bg-gray-100 text-gray-700 border-gray-200',
  treated: 'bg-pink-100 text-pink-700 border-pink-200',
  
  // UV-Vis
  absorption: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  transmission: 'bg-sky-100 text-sky-700 border-sky-200',
  calibration: 'bg-stone-100 text-stone-700 border-stone-200',
  kinetics: 'bg-red-100 text-red-700 border-red-200',
  
  // Zeta
  phase: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  mobility: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  quality: 'bg-amber-100 text-amber-700 border-amber-200',
  
  // Default
  default: 'bg-gray-100 text-gray-700 border-gray-200',
};

/* ============================ Helper Functions ============================ */

/**
 * Normalize CMS ID: "CMS_1a_AuNP" -> "1a", "CMS_1a" -> "1a", "1a" -> "1a"
 * Extracts the number+letter part (e.g., "1a", "2a", "30a")
 */
export const normalizeCmsId = (cmsId: string): string => {
  // Match pattern: optional "CMS_" + number + "a" + optional "_suffix"
  const match = cmsId.match(/^(?:cms_?)?(\d+a)/i);
  if (match) {
    return match[1].toLowerCase();
  }
  // Fallback: just clean up the string
  return cmsId.toLowerCase().replace(/^cms_?/i, '').split('_')[0].replace(/\s+/g, '');
};

/**
 * Normalize Work Package: "WP1" -> "wp1"
 */
export const normalizeWorkPackage = (wp: string): string => {
  return wp.toLowerCase().replace(/\s+/g, '');
};

/**
 * Generate image URL based on standardized naming convention
 * Pattern: /images/{wp}/{cmsId}/{testType}/{cmsId}_{TEST}_{suffix}.png
 */
export const generateImageUrl = (
  workPackage: string,
  cmsId: string,
  testType: TestType,
  suffix: string
): string => {
  const wp = normalizeWorkPackage(workPackage);
  const cms = normalizeCmsId(cmsId);
  const testLabel = TEST_IMAGE_CONFIGS[testType].testLabel;
  
  return `/images/${wp}/${cms}/${testType}/${cms}_${testLabel}_${suffix}.png`;
};

/**
 * Get all images for a specific test
 */
export const getTestImages = (
  workPackage: string,
  cmsId: string,
  testType: TestType
): TestImage[] => {
  const config = TEST_IMAGE_CONFIGS[testType];
  if (!config) {
    console.warn(`Unknown test type: ${testType}`);
    return [];
  }
  
  const cms = normalizeCmsId(cmsId);
  
  return config.images.map((img, index) => ({
    id: `${cms}-${testType}-${img.suffix}`,
    url: generateImageUrl(workPackage, cmsId, testType, img.suffix),
    title: img.title,
    description: img.description,
    type: img.type,
  }));
};

/**
 * Get badge color for an image type
 */
export const getImageTypeBadgeColor = (type: string): string => {
  return IMAGE_TYPE_COLORS[type] || IMAGE_TYPE_COLORS.default;
};

/**
 * Validate CMS ID - accepts formats like:
 * - "1a", "2a", ..., "30a"
 * - "CMS_1a", "CMS_2a", etc.
 * - "CMS_1a_AuNP", "CMS_5a_AgNP", etc. (with material suffix)
 */
export const isValidCmsId = (cmsId: string): boolean => {
  // Match: optional "CMS_" + number + "a" + optional "_anything"
  const match = cmsId.match(/^(?:cms_?)?(\d+)a(?:_\w+)?$/i);
  if (!match) return false;
  const num = parseInt(match[1], 10);
  return num >= 1 && num <= 30;
};

/**
 * Get all supported test types
 */
export const getSupportedTestTypes = (): TestType[] => {
  return Object.keys(TEST_IMAGE_CONFIGS) as TestType[];
};

/**
 * Check if a test type is supported
 */
export const isValidTestType = (testType: string): testType is TestType => {
  return testType in TEST_IMAGE_CONFIGS;
};

/* ============================ Custom Override Support ============================ */
// For cases where you need custom image paths
export const CUSTOM_IMAGE_OVERRIDES: Record<string, Record<string, Record<string, TestImage[]>>> = {
  // Structure: { [workPackage]: { [cmsId]: { [testType]: TestImage[] } } }
  // Example:
  // "wp1": {
  //   "1a": {
  //     "sims": [
  //       { id: "custom-1", url: "/custom/path.png", title: "Custom", type: "negative" }
  //     ]
  //   }
  // }
};

/**
 * Get images with custom override support
 */
export const getTestImagesWithOverrides = (
  workPackage: string,
  cmsId: string,
  testType: TestType
): TestImage[] => {
  const wp = normalizeWorkPackage(workPackage);
  const cms = normalizeCmsId(cmsId);
  
  // Check for custom overrides first
  const override = CUSTOM_IMAGE_OVERRIDES[wp]?.[cms]?.[testType];
  if (override && override.length > 0) {
    return override;
  }
  
  // Fall back to generated URLs
  return getTestImages(workPackage, cmsId, testType);
};