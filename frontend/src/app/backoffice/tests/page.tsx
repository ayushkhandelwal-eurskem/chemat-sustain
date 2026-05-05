'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/axios';
import CreateTestModal from '@/components/modals/CreateTestModal';
import UpdateTestModal from '@/components/modals/UpdateTestModal';
import { testTypes, workPackages, elements } from '@/components/modals/CreateTestModal';

interface Test {
  id: number;
  work_package_name: string;
  element_cms_id: string;
  test_name: string;
  is_public: boolean;
  test_result: boolean;
  release_test_details: boolean;
  release_raw_data: boolean;
  release_processed_data: boolean;
  release_final_results: boolean;
  release_statistical_analysis: boolean;
  created_at: string;
  updated_at: string;
}

interface TestsResponse {
  tests: Test[];
  total_pages: number;
  page: number;
}

// Sentinel value for "no filter applied". Can't use empty string as the
// <select> value because empty string is falsy and confuses comparisons;
// "all" is explicit and never collides with a real test/element id.
const ALL = 'all';

export default function TestsPage() {
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState<Test | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const perPage = 10;

  // ---- filters ----
  const [filterWorkPackage, setFilterWorkPackage] = useState<string>(ALL);
  const [filterTest, setFilterTest] = useState<string>(ALL);
  const [filterElement, setFilterElement] = useState<string>(ALL);

  const fetchTests = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params: Record<string, any> = { page, per_page: perPage };
      if (filterWorkPackage !== ALL) params.work_package_name = filterWorkPackage;
      if (filterTest !== ALL) params.test_name = filterTest;
      if (filterElement !== ALL) params.element_cms_id = filterElement;

      const response = await api.get('/tests', { params });
      const data: TestsResponse = response.data;
      setTests(data.tests);
      setTotalPages(data.total_pages);
      setCurrentPage(data.page);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch tests');
    } finally {
      setLoading(false);
    }
  }, [filterWorkPackage, filterTest, filterElement]);

  // Refetch whenever the page changes OR the filters change.
  // When filters change, we also reset the page to 1 (see handlers below)
  // so we don't end up on, say, page 5 of a now-empty filtered result set.
  useEffect(() => {
    fetchTests(currentPage);
  }, [currentPage, fetchTests]);

  const resetToFirstPage = () => {
    if (currentPage !== 1) {
      setCurrentPage(1); // triggers refetch via effect
    } else {
      fetchTests(1);     // already on page 1, force refetch
    }
  };

  const handleFilterChange = (
    setter: (v: string) => void,
    value: string
  ) => {
    setter(value);
    // currentPage update happens after state settles. We could call
    // resetToFirstPage() but the useEffect dependency on filterX values
    // already triggers a refetch; we just need to ensure we're on page 1.
    if (currentPage !== 1) setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilterWorkPackage(ALL);
    setFilterTest(ALL);
    setFilterElement(ALL);
    if (currentPage !== 1) setCurrentPage(1);
  };

  const hasActiveFilters =
    filterWorkPackage !== ALL || filterTest !== ALL || filterElement !== ALL;

  const handleCreateTest = () => setIsCreateModalOpen(true);

  const handleUpdateTest = (test: Test) => {
    setSelectedTest(test);
    setIsUpdateModalOpen(true);
  };

  const handleTestCreated = () => {
    fetchTests(1);
    setIsCreateModalOpen(false);
  };

  const handleTestUpdated = () => {
    fetchTests(currentPage);
    setIsUpdateModalOpen(false);
    setSelectedTest(null);
  };

  const handleDeleteTest = async (testId: number) => {
    if (!window.confirm('Are you sure you want to delete this test? This action cannot be undone.')) return;
    setIsDeleting(testId);
    try {
      await api.delete(`/tests/${testId}`);
      if (tests.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      } else {
        fetchTests(currentPage);
      }
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete test');
    } finally {
      setIsDeleting(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Look up the friendly label for the currently displayed test_name.
  // Falls back to the raw value if no mapping exists (e.g. legacy data).
  const labelForTest = (value: string) =>
    testTypes.find((t) => t.value === value)?.label ?? value;

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tests</h1>
          <p className="text-gray-600 mt-2">Manage tests and their data</p>
        </div>
        <button
          onClick={handleCreateTest}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Create New Test
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1">
            <label htmlFor="filter-wp" className="block text-xs font-medium text-gray-600 mb-1">
              Work Package
            </label>
            <select
              id="filter-wp"
              value={filterWorkPackage}
              onChange={(e) => handleFilterChange(setFilterWorkPackage, e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={ALL}>All work packages</option>
              {workPackages.map((wp) => (
                <option key={wp} value={wp}>{wp}</option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label htmlFor="filter-test" className="block text-xs font-medium text-gray-600 mb-1">
              Test
            </label>
            <select
              id="filter-test"
              value={filterTest}
              onChange={(e) => handleFilterChange(setFilterTest, e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={ALL}>All tests</option>
              {testTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label htmlFor="filter-element" className="block text-xs font-medium text-gray-600 mb-1">
              Element
            </label>
            <select
              id="filter-element"
              value={filterElement}
              onChange={(e) => handleFilterChange(setFilterElement, e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={ALL}>All elements</option>
              {elements.map((el) => (
                <option key={el} value={el}>{el}</option>
              ))}
            </select>
          </div>

          <div className="md:w-auto">
            <button
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="w-full md:w-auto px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear filters
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between items-start">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-4 text-red-500 hover:text-red-700"
            aria-label="Dismiss error"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Work Package</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Test Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Element ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Public</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tests.map((test) => (
                  <tr key={test.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {test.work_package_name}
                      <div className="text-sm text-gray-500">ID: {test.id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{labelForTest(test.test_name)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{test.element_cms_id}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        test.is_public ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {test.is_public ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(test.created_at)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleUpdateTest(test)}
                        className="text-blue-600 hover:text-blue-900 transition-colors"
                        aria-label={`Edit test ${test.test_name}`}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteTest(test.id)}
                        className="text-red-600 hover:text-red-900 transition-colors ml-4"
                        aria-label={`Delete test ${test.test_name}`}
                        disabled={isDeleting === test.id}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tests.length === 0 && !loading && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H5a2 2 0 01-2-2V7a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              {hasActiveFilters ? 'No tests match your filters' : 'No tests found'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {hasActiveFilters
                ? 'Try adjusting or clearing your filters above.'
                : 'Get started by creating a new test.'}
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col items-center space-y-4 mt-8">
          <p className="text-gray-600">
            Showing {tests.length} objects, page {currentPage} of {totalPages}
          </p>
          <div className="flex justify-center items-center space-x-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              Previous
            </button>

            {currentPage > 3 && (
              <>
                <button onClick={() => setCurrentPage(1)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">1</button>
                <span className="px-2 py-2 text-gray-500">...</span>
              </>
            )}

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let page;
              if (currentPage <= 3) page = i + 1;
              else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
              else page = currentPage - 2 + i;
              return page >= 1 && page <= totalPages ? (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-4 py-2 rounded-lg ${
                    currentPage === page ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  aria-label={`Go to page ${page}`}
                >
                  {page}
                </button>
              ) : null;
            })}

            {currentPage < totalPages - 2 && (
              <>
                <span className="px-2 py-2 text-gray-500">...</span>
                <button onClick={() => setCurrentPage(totalPages)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">{totalPages}</button>
              </>
            )}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <CreateTestModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onTestCreated={handleTestCreated}
      />

      {selectedTest != null && (
        <UpdateTestModal
          isOpen={isUpdateModalOpen}
          onClose={() => {
            setIsUpdateModalOpen(false);
            setSelectedTest(null);
          }}
          onTestUpdated={handleTestUpdated}
          test={selectedTest}
        />
      )}
    </div>
  );
}