"use client";
import React, { FC, useState, useEffect, useCallback } from "react";
import { Download, ZoomIn, X, ImageOff, ChevronLeft, ChevronRight } from "lucide-react";
import { 
  TestImage, 
  TestType, 
  getTestImagesWithOverrides, 
  getImageTypeBadgeColor,
  isValidCmsId,
  TEST_IMAGE_CONFIGS
} from "@/lib/images/testImageConfig";

/* ============================ Props ============================ */
interface UniversalImagesTabProps {
  workPackage: string;
  element: string;           // CMS ID (1a, 2a, etc. or CMS_1a, CMS_2a)
  testType: TestType;        // sims, dls, ftir, etc.
  apiImages?: TestImage[];   // Optional: if images come from API
}

/* ============================ Component ============================ */
const UniversalImagesTab: FC<UniversalImagesTabProps> = ({ 
  workPackage, 
  element, 
  testType,
  apiImages 
}) => {
  const [images, setImages] = useState<TestImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<TestImage | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [imageLoadErrors, setImageLoadErrors] = useState<Set<string>>(new Set());

  // Get test label for display
  const testLabel = TEST_IMAGE_CONFIGS[testType]?.testLabel || testType.toUpperCase();

  // Load images based on work package, CMS ID, and test type
  useEffect(() => {
    setLoading(true);
    setImageLoadErrors(new Set());

    // Priority: API images > Generated images
    if (apiImages && apiImages.length > 0) {
      setImages(apiImages);
    } else {
      const resolvedImages = getTestImagesWithOverrides(workPackage, element, testType);
      setImages(resolvedImages);
    }

    setLoading(false);
  }, [workPackage, element, testType, apiImages]);

  // Handle image load error
  const handleImageError = useCallback((imageId: string) => {
    setImageLoadErrors(prev => new Set(prev).add(imageId));
  }, []);

  // Open lightbox
  const openLightbox = useCallback((image: TestImage, index: number) => {
    if (!imageLoadErrors.has(image.id)) {
      setSelectedImage(image);
      setSelectedIndex(index);
    }
  }, [imageLoadErrors]);

  // Close lightbox
  const closeLightbox = useCallback(() => {
    setSelectedImage(null);
  }, []);

  // Navigate in lightbox
  const navigateLightbox = useCallback((direction: 'prev' | 'next') => {
    const validImages = images.filter(img => !imageLoadErrors.has(img.id));
    if (validImages.length === 0) return;

    const currentValidIndex = validImages.findIndex(img => img.id === selectedImage?.id);
    let newIndex: number;

    if (direction === 'next') {
      newIndex = (currentValidIndex + 1) % validImages.length;
    } else {
      newIndex = (currentValidIndex - 1 + validImages.length) % validImages.length;
    }

    setSelectedImage(validImages[newIndex]);
    setSelectedIndex(images.findIndex(img => img.id === validImages[newIndex].id));
  }, [images, imageLoadErrors, selectedImage]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedImage) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') navigateLightbox('next');
      if (e.key === 'ArrowLeft') navigateLightbox('prev');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage, closeLightbox, navigateLightbox]);

  // Download single image
  const downloadImage = useCallback(async (image: TestImage) => {
    try {
      const response = await fetch(image.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${workPackage}_${element}_${testType}_${image.type}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      // Fallback: direct download
      const link = document.createElement('a');
      link.href = image.url;
      link.download = `${workPackage}_${element}_${testType}_${image.type}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [workPackage, element, testType]);

  // Download all images
  const downloadAllImages = useCallback(async () => {
    const validImages = images.filter(img => !imageLoadErrors.has(img.id));
    for (const image of validImages) {
      await downloadImage(image);
      await new Promise(resolve => setTimeout(resolve, 500)); // Stagger downloads
    }
  }, [images, imageLoadErrors, downloadImage]);

  // Format type label for display
  const formatTypeLabel = (type: string): string => {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  // Validation warning
  const showValidationWarning = !isValidCmsId(element);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
          <span className="ml-3 text-slate-600">Loading images...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-blue-800">{testLabel} Images</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-sm text-gray-500">
              Work Package: <span className="font-medium text-gray-700">{workPackage}</span>
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">
              CMS ID: <span className="font-medium text-gray-700">{element}</span>
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">
              Test: <span className="font-medium text-gray-700">{testLabel}</span>
            </span>
          </div>
        </div>
        <button
          onClick={downloadAllImages}
          disabled={images.every(img => imageLoadErrors.has(img.id))}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <Download size={16} />
          <span>Download All</span>
        </button>
      </div>

      {/* Validation Warning */}
      {showValidationWarning && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md">
          <p className="text-sm">
            <strong>Note:</strong> The CMS ID "{element}" doesn't match the expected format (1a to 30a). 
            Images may not be available.
          </p>
        </div>
      )}

      {/* Image Grid */}
      {images.length === 0 ? (
        <div className="text-center py-12">
          <ImageOff className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No images available for this test case.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {images.map((image, index) => (
            <div
              key={image.id}
              className={`border border-gray-200 rounded-lg overflow-hidden transition-all ${
                imageLoadErrors.has(image.id) 
                  ? 'opacity-60' 
                  : 'hover:shadow-lg hover:border-blue-300 cursor-pointer'
              }`}
              onClick={() => openLightbox(image, index)}
            >
              {/* Image Container */}
              <div className="aspect-video bg-gray-100 relative group overflow-hidden">
                {imageLoadErrors.has(image.id) ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                    <ImageOff className="w-12 h-12 mb-2" />
                    <span className="text-sm">Image not available</span>
                  </div>
                ) : (
                  <>
                    <img
                      src={image.url}
                      alt={image.title}
                      className="absolute inset-0 w-full h-full object-contain bg-white"
                      onError={() => handleImageError(image.id)}
                    />
                    {/* Zoom Overlay */}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center">
                      <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </>
                )}
              </div>

              {/* Image Info */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-800">{image.title}</h3>
                    {image.description && (
                      <p className="text-sm text-gray-500 mt-1">{image.description}</p>
                    )}
                  </div>
                  {!imageLoadErrors.has(image.id) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadImage(image);
                      }}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                      title="Download image"
                    >
                      <Download size={18} />
                    </button>
                  )}
                </div>
                <span className={`inline-block mt-3 px-2.5 py-1 text-xs font-medium rounded-full border ${getImageTypeBadgeColor(image.type)}`}>
                  {formatTypeLabel(image.type)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Close Button */}
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition z-10"
            onClick={closeLightbox}
          >
            <X size={32} />
          </button>

          {/* Navigation Buttons */}
          {images.filter(img => !imageLoadErrors.has(img.id)).length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition p-2 rounded-full bg-black bg-opacity-50 hover:bg-opacity-70"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateLightbox('prev');
                }}
              >
                <ChevronLeft size={32} />
              </button>
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition p-2 rounded-full bg-black bg-opacity-50 hover:bg-opacity-70"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateLightbox('next');
                }}
              >
                <ChevronRight size={32} />
              </button>
            </>
          )}

          {/* Image Container */}
          <div
            className="max-w-[90vw] max-h-[90vh] relative"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedImage.url}
              alt={selectedImage.title}
              className="max-w-full max-h-[80vh] object-contain"
            />

            {/* Image Info Bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white p-4 flex justify-between items-center">
              <div>
                <h3 className="font-semibold">{selectedImage.title}</h3>
                <p className="text-sm text-gray-300">
                  {workPackage} / {element} / {testLabel}
                </p>
              </div>
              <button
                onClick={() => downloadImage(selectedImage)}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            </div>
          </div>

          {/* Image Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black bg-opacity-50 px-3 py-1 rounded-full">
            {selectedIndex + 1} / {images.length}
          </div>
        </div>
      )}
    </div>
  );
};

export default UniversalImagesTab;