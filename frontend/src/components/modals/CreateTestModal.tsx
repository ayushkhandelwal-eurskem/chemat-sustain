'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/axios';

interface CreateTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTestCreated: () => void;
}
export type ReleaseKey = 'release_test_details' | 'release_raw_data' | 'release_processed_data' | 'release_final_results' | 'release_statistical_analysis';

export default function CreateTestModal({ isOpen, onClose, onTestCreated }: CreateTestModalProps) {
  const [workPackageName, setWorkPackageName] = useState('WP2');
  const [elementCmsId, setElementCmsId] = useState('CMS_1a_AuNP');
  const [testName, setTestName] = useState('MTT');
  const [isPublic, setIsPublic] = useState(false);
  const [release, setRelease] = useState({
    release_test_details: false,
    release_raw_data: false,
    release_processed_data: false,
    release_final_results: false,
    release_statistical_analysis: false
  })
  const [testResult, setTestResult] = useState("null")
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workPackages = ['WP2', 'WP3', 'WP4'];
  const elements = [
    "CMS_1a_AuNP",
    "CMS_1c_AuNP",
    "CMS_2a_AuNP",
    "CMS_2c_AuNP",
    "CMS_3a_AuNP",
    "CMS_4a_AuNP",
    "CMS_4b_AuNP",
    "CMS_5a_AuNP",
    "CMS_5b_AuNP",
    "CMS_6a_AuNP",
    "CMS_6b_AuNP",
    "CMS_7b_AgNP",
    "CMS_8b_AgNP",
    "CMS_9b_AgNP",
    "CMS_10b_AgNP",
    "CMS_11b_AgNP",
    "CMS_12b_AgNP",
    "CMS_13a_AgNR",
    "CMS_14a_AgNR",
    "CMS_15a_TNR",
    "CMS_16a_TMR",
    "CMS_17a_TNA",
    "CMS_18a_TNA",
    "CMS_19a_NC",
    "CMS_20a_MC",
    "CMS_21a_DG4",
    "CMS_22a_DG5",
    "CMS_23a_DG6",
    "CMS_24a_PS1",
    "CMS_25a_PS2",
    "CMS_26a_CH_CIT",
    "CMS_26b_CH_CIT",
    "CMS_27a_CH_PEG",
    "CMS_27d_CH_PEG",
    "CMS_28a_CH_PVP",
    "CMS_28b_CH_PVP",
    "CMS_29a_CH_TOR",
    "CMS_30a_CH_TER"
  ]

  const testNames = ['MTT','DLS','FTIR','HR-STEM','UV-VIS','ZETA','SIMS','ROS','UPS','XPS','TB','TB Microfludic','XRD','DSC','TGA','MNT']; // Static test names

  const handleToggleChange = (key: ReleaseKey) => {
    setRelease(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('work_package_name', workPackageName);
    formData.append('element_cms_id', elementCmsId);
    formData.append('test_name', testName);
    formData.append('is_public', String(isPublic));
    formData.append("test_result", testResult)
    Object.keys(release).map((key) => {
      const releaseKey = key as ReleaseKey
      formData.append(key, String(release[releaseKey]))
    })
    if (file) {
      formData.append('file', file);
    }

    try {
      await api.post('/tests', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      onTestCreated();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create test');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-md bg-opacity-50 flex items-center justify-center z-50 text-gray-900">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Create New Test</h2>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="workPackageName" className="block text-sm font-medium text-gray-700">
                Work Package
              </label>
              <select
                id="workPackageName"
                value={workPackageName}
                onChange={(e) => setWorkPackageName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                {workPackages.map((wp) => (
                  <option key={wp} value={wp}>{wp}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="elementCmsId" className="block text-sm font-medium text-gray-700">
                Element
              </label>
              <select
                id="elementCmsId"
                value={elementCmsId}
                onChange={(e) => setElementCmsId(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                {elements.map((el) => (
                  <option key={el} value={el}>{el}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="testName" className="block text-sm font-medium text-gray-700">
                Test Name
              </label>
              <select
                id="testName"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                {testNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="testName" className="block text-sm font-medium text-gray-700">
                Test Result
              </label>
              <select
                id="testResult"
                value={testResult}
                onChange={(e) => setTestResult(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option key="NA" value={"null"}>NA</option>
                <option key="PASS" value={"true"}>Pass</option>
                <option key="FAIL" value={"false"}>Fail</option>
              </select>
            </div>
            <div>
              <label htmlFor="file" className="block text-sm font-medium text-gray-700">
                Test Data File (Optional)
              </label>
              <input
                type="file"
                id="file"
                onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            <div className="flex items-center">
              <input
                id="isPublic"
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="isPublic" className="ml-2 block text-sm text-gray-900">
                Make Public
              </label>
            </div>
          </div>
          <div className="mt-4">
            {Object.keys(release).map((key) => {
              const releaseKey = key as ReleaseKey;
              return (
                <div key={key} className="mb-4">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={release[releaseKey]}
                      onChange={() => handleToggleChange(releaseKey)}
                      className="sr-only peer"
                    />
                    <div className="relative w-11 h-6 bg-gray-100 rounded-full peer dark:bg-gray-300 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600"></div>
                    <span className="ms-3 text-sm font-medium">{key}</span>
                  </label>
                </div>
              )
            })}
          </div>

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-300"
            >
              {loading ? 'Creating...' : 'Create Test'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
