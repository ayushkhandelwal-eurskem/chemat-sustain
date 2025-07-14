'use client';

// import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import React, { useState, useEffect } from 'react';
import { Search, ArrowUpDown, FileText, Download, Eye } from 'lucide-react';
import { api } from '@/lib/axios';
import Link from 'next/link';

export default function Home() {
  // const { user, loading } = useAuth();

  // if (loading) {
  //   return (
  //     <div className="min-h-screen flex items-center justify-center bg-white">
  //       <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
  //     </div>
  //   );
  // }

  return (
    <ProtectedRoute requireAuth={false}>
      <div className="bg-white">
        <div className="container mx-auto min-h-screen">
          <h1 className="text-4xl font-bold text-center px-16 pt-15 text-blue-900">CheMatSustain Database</h1>
          <p className="text-center text-blue-300 pt-8">Search data</p>

          {/* User Welcome Section */}
          {/* {user && (
            <div className="text-center mb-8 bg-blue-50 p-4 rounded-lg mx-4">
              <p className="text-blue-800">
                Welcome back, <span className="font-semibold">{user.email}</span>
                <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {user.role}
                </span>
              </p>
            </div>
          )} */}

          <ProtocolFilters />
        </div>
      </div>
    </ProtectedRoute>
  );
}

// API service to make requests
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
      const response = await api.post("/tests/listings", { "work_package_name": workPackage });
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
        "work_package_name": workPackage,
        "element_cms_id": element
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
      return [{
        "name": element + "_" + test,
        "type": "xlsx",
      }];
    } catch (error) {
      console.error('Error fetching test data:', error);
      return [];
    }
  }
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

const ProtocolFilters: React.FC = () => {
  const [searchTerms, setSearchTerms] = useState<{ [key: string]: string }>({});
  const [selectedFilters, setSelectedFilters] = useState<{ [key: string]: string | null }>({
    'Work package': null,
    'Element': null,
    'Test': null
  });

  const [workPackages, setWorkPackages] = useState<string[]>([]);
  const [elements, setElements] = useState<string[]>([]);
  const [tests, setTests] = useState<string[]>([]);
  const [filtersActive, setFiltersActive] = useState(0);
  const [testData, setTestData] = useState<TestDataItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch work packages on component mount
  useEffect(() => {
    const fetchInitialData = async () => {
      const packages = await apiService.fetchWorkPackages();
      setWorkPackages(packages);
    };

    fetchInitialData();
  }, []);

  // Fetch elements when work package is selected
  useEffect(() => {
    const fetchElementsData = async () => {
      if (selectedFilters['Work package']) {
        const elementData = await apiService.fetchElements(selectedFilters['Work package']);
        // Sort elements by first differing character
        const sorted = elementData.sort((a: string, b: string) => {
          const i = Number(a.split('_')[1].slice(0, -1));
          const j = Number(b.split('_')[1].slice(0, -1));
          return i - j;
        });

        setElements(sorted);
      } else {
        // Clear elements if work package is deselected
        setElements([]);
        // Also clear Element selection
        setSelectedFilters(prev => ({
          ...prev,
          'Element': null,
          'Test': null
        }));
        // Clear test data
        setTestData([]);
      }
    };

    fetchElementsData();
  }, [selectedFilters['Work package']]);

  // Fetch tests when element is selected
  useEffect(() => {
    const fetchTestsData = async () => {
      if (selectedFilters['Work package'] && selectedFilters['Element']) {
        const testData = await apiService.fetchTests(
          selectedFilters['Work package'],
          selectedFilters['Element']
        );
        setTests(testData);
      } else {
        // Clear tests if element is deselected
        setTests([]);
        // Also clear Test selection
        setSelectedFilters(prev => ({
          ...prev,
          'Test': null
        }));
        // Clear test data
        setTestData([]);
      }
    };

    fetchTestsData();
  }, [selectedFilters['Element'], selectedFilters['Work package']]);

  // Update active filters count and fetch test data when all filters are selected
  useEffect(() => {
    const activeCount = Object.values(selectedFilters).filter(val => val !== null).length;
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
    {
      name: 'Work package',
      label: 'Work package',
      options: workPackages,
    },
    {
      name: 'Element',
      label: 'Element',
      options: elements,
      disabled: !selectedFilters['Work package']
    },
    {
      name: 'Test',
      label: 'Test',
      options: tests,
      disabled: !selectedFilters['Element'] || !selectedFilters['Work package']
    }
  ];

  const handleSearchChange = (columnName: string, value: string) => {
    setSearchTerms(prev => ({
      ...prev,
      [columnName]: value
    }));
  };

  const handleFilterSelect = (columnName: string, value: string) => {
    setSelectedFilters(prev => {
      // If the same value is selected again, deselect it
      if (prev[columnName] === value) {
        // Create new state with this filter cleared
        const newState = { ...prev, [columnName]: null };

        // If deselecting a parent filter, also clear child filters
        if (columnName === 'Work package') {
          newState['Element'] = null;
          newState['Test'] = null;
        } else if (columnName === 'Element') {
          newState['Test'] = null;
        }

        return newState;
      }

      // Otherwise select the new value
      return { ...prev, [columnName]: value };
    });

    // Clear search term when a selection is made
    setSearchTerms(prev => ({
      ...prev,
      [columnName]: ''
    }));
  };

  const handleClearAll = () => {
    setSelectedFilters({
      'Work package': null,
      'Element': null,
      'Test': null
    });
    setSearchTerms({});
    setElements([]);
    setTests([]);
    setTestData([]);
  };

  const filteredOptions = (column: FilterColumn) => {
    const searchTerm = searchTerms[column.name]?.toLowerCase() || '';
    return column.options.filter(option =>
      option.toLowerCase().includes(searchTerm)
    );
  };


  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-4 bg-white rounded-lg text-black">
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-gray-600">Filters Active - {filtersActive}</span>
        <div className="flex items-center space-x-2">
          <button className="text-sm bg-gray-300 hover:bg-gray-400 text-gray-800 py-2 px-4 rounded">Collapse All</button>
          <button className="text-sm bg-gray-200 hover:bg-gray-400 text-gray-800 py-2 px-4 rounded">Show All</button>
          <button
            className="text-sm bg-gray-200 hover:bg-gray-400 text-gray-800 py-2 px-4 rounded"
            onClick={handleClearAll}
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-7 mb-8">
        {columns.map((column) => (
          <div key={column.name}>
            <div className="flex items-center justify-between p-2">
              <div className="flex items-center w-full relative">
                <div className="flex-1 flex items-center relative border border-gray-300 rounded">
                  <input
                    type="text"
                    placeholder={column.placeholder || `Search ${column.label}`}
                    className={`w-full p-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 rounded ${column.disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    value={searchTerms[column.name] || ''}
                    onChange={(e) => handleSearchChange(column.name, e.target.value)}
                    id={`search-${column.name}`}
                    disabled={column.disabled}
                  />
                  <button
                    className={`absolute h-full bg-gray-300 right-0 px-2 ${column.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:text-blue-500'}`}
                    onClick={() => !column.disabled && document.getElementById(`search-${column.name}`)?.focus()}
                    disabled={column.disabled}
                  >
                    <Search className="w-4 h-4 text-gray-800" />
                  </button>
                </div>
                <div className="ml-2">
                  <button className={column.disabled ? 'opacity-50 cursor-not-allowed' : ''}>
                    <ArrowUpDown className="w-4 h-4 text-gray-800" />
                  </button>
                </div>
              </div>
            </div>

            <ul className={`shadow-lg max-h-48 overflow-y-auto ${column.disabled ? 'opacity-50' : ''}`}>
              {column.options.length > 0 ? (
                filteredOptions(column).map((option, index) => (
                  <li
                    key={option}
                    className={`p-2 text-sm cursor-pointer 
                      ${selectedFilters[column.name] === option ? 'bg-blue-100 text-blue-800 font-medium' : index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                      ${!column.disabled ? 'hover:bg-blue-50' : ''}`}
                    onClick={() => !column.disabled && handleFilterSelect(column.name, option)}
                  >
                    <div className="flex justify-between">
                      <span>{option}</span>
                    </div>
                  </li>
                ))
              ) : (
                <li className="p-2 text-sm text-gray-500 italic bg-white">
                  {column.disabled ?
                    (column.name === 'Element' ? 'Select a work package first' : 'Select an element first') :
                    'No options available'}
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>

      {/* Test Data Results Section */}
      {filtersActive === 3 && (
        <div className="mt-8 shadow-xl p-4">
          <div className="pt-4 mb-4">
            <h2 className="text-xl font-semibold text-blue-900">
              Test Data for {selectedFilters['Work package']} / {selectedFilters['Element']} / {selectedFilters['Test']}
            </h2>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-48">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : testData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">File Name</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Type</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {testData.map((item, index) => (
                    <tr key={item.id || index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm text-gray-900 flex items-center">
                        <FileText className="w-4 h-4 mr-2 text-blue-500" /> {item.name || 'Untitled'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{item.type || 'Unknown'}</td>
                      <td className="px-4 py-3 text-sm flex">

                        <Link className='p-1 rounded hover:bg-blue-100 text-blue-600' target='blank' href={'/' + selectedFilters['Work package'] + '/' + selectedFilters['Element'] + '/' + selectedFilters['Test']}
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button className="p-1 rounded hover:bg-blue-100 text-blue-600">
                          <Download className="w-4 h-4" />
                        </button>

                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 bg-gray-50 rounded">
              <p className="text-gray-500">No test data available for the selected filters.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
