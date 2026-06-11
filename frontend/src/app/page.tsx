'use client';

import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import React, { useState, useEffect } from 'react';
import { Search, ArrowUpDown, FileText, Download, Eye, Package, FlaskConical, ClipboardList } from 'lucide-react';
import { api } from '@/lib/axios';
import Link from 'next/link';

export default function Home() {
  return (
    <ProtectedRoute requireAuth={true}>
      <div className="bg-gray-50 min-h-screen">
        <div className="container mx-auto px-4 py-10">
          <WelcomeHeader />
          <ProtocolFilters />
        </div>
      </div>
    </ProtectedRoute>
  );
}

/* ----------------------- Welcome header ----------------------- */
const WelcomeHeader: React.FC = () => {
  const { user } = useAuth();
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Welcome{user?.email ? `, ${user.email.split('@')[0]}` : ''}
          </h1>
        </div>
        {user && (
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
            {user.email}
            <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white uppercase tracking-wide">
              {user.role}
            </span>
          </span>
        )}
      </div>
    </div>
  );
};

/* ----------------------- API service (unchanged) ----------------------- */
const apiService = {
  async fetchWorkPackages() {
    try {
      const response = await api.post('/tests/listings', {});
      if (response.status !== 200) throw new Error('Failed to fetch work packages');
      return response.data.work_packages;
    } catch (error) {
      console.error('Error fetching work packages:', error);
      return [];
    }
  },
  async fetchElements(workPackage: string) {
    if (!workPackage) return [];
    try {
      const response = await api.post('/tests/listings', { work_package_name: workPackage });
      if (response.status !== 200) throw new Error('Failed to fetch elements');
      return response.data.element_cms_ids;
    } catch (error) {
      console.error('Error fetching elements:', error);
      return [];
    }
  },
  async fetchTests(workPackage: string, element: string) {
    if (!workPackage || !element) return [];
    try {
      const response = await api.post(`/tests/listings`, {
        work_package_name: workPackage,
        element_cms_id: element,
      });
      if (response.status !== 200) throw new Error('Failed to fetch tests');
      return response.data.test_names;
    } catch (error) {
      console.error('Error fetching tests:', error);
      return [];
    }
  },
  fetchTestData(workPackage: string, element: string, test: string) {
    if (!workPackage || !element || !test) return [];
    try {
      return [{ name: element + '_' + test, type: 'xlsx' }];
    } catch (error) {
      console.error('Error fetching test data:', error);
      return [];
    }
  },
};

interface FilterColumn {
  name: string;
  label: string;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
}
interface TestDataItem {
  name: string;
  type: string;
  [key: string]: any;
}

/* ----------------------- Summary card ----------------------- */
const SummaryCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number | string;
  active?: boolean;
}> = ({ icon, label, value, active }) => (
  <div
    className={`flex items-center gap-4 rounded-xl border p-5 transition-colors ${
      active ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-white'
    }`}
  >
    <div
      className={`flex h-11 w-11 items-center justify-center rounded-lg ${
        active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
      }`}
    >
      {icon}
    </div>
    <div>
      <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
      <p className="text-sm text-slate-500 mt-1">{label}</p>
    </div>
  </div>
);

const ProtocolFilters: React.FC = () => {
  const [searchTerms, setSearchTerms] = useState<{ [key: string]: string }>({});
  const [selectedFilters, setSelectedFilters] = useState<{ [key: string]: string | null }>({
    'Work package': null,
    Element: null,
    Test: null,
  });

  const [workPackages, setWorkPackages] = useState<string[]>([]);
  const [elements, setElements] = useState<string[]>([]);
  const [tests, setTests] = useState<string[]>([]);
  const [filtersActive, setFiltersActive] = useState(0);
  const [testData, setTestData] = useState<TestDataItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchInitialData = async () => {
      const packages = await apiService.fetchWorkPackages();
      setWorkPackages(packages);
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    const fetchElementsData = async () => {
      if (selectedFilters['Work package']) {
        const elementData = await apiService.fetchElements(selectedFilters['Work package']!);
        const sorted = elementData.sort((a: string, b: string) => {
          const i = Number(a.split('_')[1].slice(0, -1));
          const j = Number(b.split('_')[1].slice(0, -1));
          return i - j;
        });
        setElements(sorted);
      } else {
        setElements([]);
        setSelectedFilters((prev) => ({ ...prev, Element: null, Test: null }));
        setTestData([]);
      }
    };
    fetchElementsData();
  }, [selectedFilters['Work package']]);

  useEffect(() => {
    const fetchTestsData = async () => {
      if (selectedFilters['Work package'] && selectedFilters['Element']) {
        const td = await apiService.fetchTests(
          selectedFilters['Work package']!,
          selectedFilters['Element']!
        );
        setTests(td);
      } else {
        setTests([]);
        setSelectedFilters((prev) => ({ ...prev, Test: null }));
        setTestData([]);
      }
    };
    fetchTestsData();
  }, [selectedFilters['Element'], selectedFilters['Work package']]);

  useEffect(() => {
    const activeCount = Object.values(selectedFilters).filter((val) => val !== null).length;
    setFiltersActive(activeCount);

    if (activeCount === 3) {
      const fetchAndSetTestData = async () => {
        setIsLoading(true);
        try {
          const data = apiService.fetchTestData(
            selectedFilters['Work package']!,
            selectedFilters['Element']!,
            selectedFilters['Test']!
          );
          setTestData(data);
        } catch (error) {
          console.error('Error fetching test data:', error);
          setTestData([]);
        } finally {
          setIsLoading(false);
        }
      };
      fetchAndSetTestData();
    }
  }, [selectedFilters]);

  const columns: FilterColumn[] = [
    { name: 'Work package', label: 'Work package', options: workPackages },
    {
      name: 'Element',
      label: 'Element',
      options: elements,
      disabled: !selectedFilters['Work package'],
    },
    {
      name: 'Test',
      label: 'Test',
      options: tests,
      disabled: !selectedFilters['Element'] || !selectedFilters['Work package'],
    },
  ];

  const handleSearchChange = (columnName: string, value: string) => {
    setSearchTerms((prev) => ({ ...prev, [columnName]: value }));
  };

  const handleFilterSelect = (columnName: string, value: string) => {
    setSelectedFilters((prev) => {
      if (prev[columnName] === value) {
        const newState = { ...prev, [columnName]: null };
        if (columnName === 'Work package') {
          newState['Element'] = null;
          newState['Test'] = null;
        } else if (columnName === 'Element') {
          newState['Test'] = null;
        }
        return newState;
      }
      return { ...prev, [columnName]: value };
    });
    setSearchTerms((prev) => ({ ...prev, [columnName]: '' }));
  };

  const handleClearAll = () => {
    setSelectedFilters({ 'Work package': null, Element: null, Test: null });
    setSearchTerms({});
    setElements([]);
    setTests([]);
    setTestData([]);
  };

  const filteredOptions = (column: FilterColumn) => {
    const searchTerm = searchTerms[column.name]?.toLowerCase() || '';
    return column.options.filter((option) => option.toLowerCase().includes(searchTerm));
  };

  return (
    <div className="text-black">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <SummaryCard
          icon={<Package className="h-5 w-5" />}
          label="Work packages"
          value={workPackages.length}
          active={!!selectedFilters['Work package']}
        />
        <SummaryCard
          icon={<FlaskConical className="h-5 w-5" />}
          label={selectedFilters['Work package'] ? 'Elements available' : 'Elements'}
          value={elements.length}
          active={!!selectedFilters['Element']}
        />
        <SummaryCard
          icon={<ClipboardList className="h-5 w-5" />}
          label={selectedFilters['Element'] ? 'Tests available' : 'Tests'}
          value={tests.length}
          active={!!selectedFilters['Test']}
        />
      </div>

      {/* Filters card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Search</h2>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {filtersActive} active
            </span>
          </div>
          <button
            className="text-sm text-slate-600 hover:text-blue-700 font-medium"
            onClick={handleClearAll}
          >
            Clear all
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {columns.map((column) => (
            <div key={column.name}>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {column.label}
              </label>
              <div className="flex items-center relative border border-slate-300 rounded-lg overflow-hidden mb-2">
                <input
                  type="text"
                  placeholder={column.placeholder || `Search ${column.label.toLowerCase()}`}
                  className={`w-full px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg ${
                    column.disabled ? 'bg-slate-100 cursor-not-allowed' : ''
                  }`}
                  value={searchTerms[column.name] || ''}
                  onChange={(e) => handleSearchChange(column.name, e.target.value)}
                  id={`search-${column.name}`}
                  disabled={column.disabled}
                />
                <span className="absolute right-0 h-full px-2.5 flex items-center bg-slate-100 text-slate-500">
                  <Search className="w-4 h-4" />
                </span>
              </div>

              <ul
                className={`border border-slate-100 rounded-lg max-h-56 overflow-y-auto ${
                  column.disabled ? 'opacity-50' : ''
                }`}
              >
                {column.options.length > 0 ? (
                  filteredOptions(column).map((option, index) => (
                    <li
                      key={option}
                      className={`px-3 py-2 text-sm cursor-pointer transition-colors
                        ${
                          selectedFilters[column.name] === option
                            ? 'bg-blue-600 text-white font-medium'
                            : index % 2 === 0
                            ? 'bg-white'
                            : 'bg-slate-50'
                        }
                        ${
                          !column.disabled && selectedFilters[column.name] !== option
                            ? 'hover:bg-blue-50'
                            : ''
                        }`}
                      onClick={() => !column.disabled && handleFilterSelect(column.name, option)}
                    >
                      {option}
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-2 text-sm text-slate-400 italic bg-white">
                    {column.disabled
                      ? column.name === 'Element'
                        ? 'Select a work package first'
                        : 'Select an element first'
                      : 'No options available'}
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Results */}
      {filtersActive === 3 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mt-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Results for{' '}
            <span className="text-blue-700">
              {selectedFilters['Work package']} / {selectedFilters['Element']} /{' '}
              {selectedFilters['Test']}
            </span>
          </h2>

          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500" />
            </div>
          ) : testData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-sm font-semibold text-slate-600">
                      File Name
                    </th>
                    <th className="px-4 py-2.5 text-left text-sm font-semibold text-slate-600">
                      Type
                    </th>
                    <th className="px-4 py-2.5 text-left text-sm font-semibold text-slate-600">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {testData.map((item, index) => (
                    <tr
                      key={item.id || index}
                      className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                    >
                      <td className="px-4 py-3 text-sm text-slate-900 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-500" />
                        {item.name || 'Untitled'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 uppercase">
                        {item.type || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-1">
                          <Link
                            className="p-1.5 rounded-md hover:bg-blue-100 text-blue-600"
                            target="blank"
                            href={
                              '/' +
                              selectedFilters['Work package'] +
                              '/' +
                              selectedFilters['Element'] +
                              '/' +
                              selectedFilters['Test']
                            }
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <button className="p-1.5 rounded-md hover:bg-blue-100 text-blue-600">
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-10 bg-slate-50 rounded-lg">
              <p className="text-slate-500">No test data available for the selected filters.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};