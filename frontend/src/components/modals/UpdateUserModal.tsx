'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/axios';

interface User {
  id: number;
  email: string;
  role: 'admin' | 'user';
  is_active: boolean;
  last_activity: string;
}

interface UpdateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserUpdated: () => void;
  user: User | null;
}

export default function UpdateUserModal({ isOpen, onClose, onUserUpdated, user }: UpdateUserModalProps) {
  const [formData, setFormData] = useState({
    email: '',
    role: 'user' as 'admin' | 'user',
    is_active: true,
    newPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFormData({
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        newPassword: '',
      });
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      // Update user basic info (we'll need to add this endpoint to backend)
      const updateData = {
        email: formData.email,
        role: formData.role,
        is_active: formData.is_active,
      };

      // For now, we'll use the change password endpoint if password is provided
      if (formData.newPassword) {
        await api.post('/users/change-password', {
          email: user.email,
          new_password: formData.newPassword,
        });
      }

      // Note: We need to add an update user endpoint to the backend
      // For now, this will only work for password changes
      onUserUpdated();
      setFormData({
        email: '',
        role: 'user',
        is_active: true,
        newPassword: '',
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      email: '',
      role: 'user',
      is_active: true,
      newPassword: '',
    });
    setError(null);
    onClose();
  };

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-md
     bg-opacity-50 flex items-center justify-center z-50 text-gray-900">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Update User</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="update-email" className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              id="update-email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
              placeholder="user@example.com"
              disabled // Email updates not implemented in backend yet
            />
            <p className="text-xs text-gray-500 mt-1">Email updates are not currently supported</p>
          </div>

          <div>
            <label htmlFor="update-role" className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              id="update-role"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
              disabled // Role updates not implemented in backend yet
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Role updates are not currently supported</p>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="update-is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              disabled // Status updates not implemented in backend yet
            />
            <label htmlFor="update-is_active" className="ml-2 block text-sm text-gray-700">
              Active user
            </label>
            <p className="text-xs text-gray-500 ml-2">(Status updates not currently supported)</p>
          </div>

          <div>
            <label htmlFor="update-password" className="block text-sm font-medium text-gray-700 mb-1">
              New Password (Optional)
            </label>
            <input
              type="password"
              id="update-password"
              value={formData.newPassword}
              onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Leave blank to keep current password"
              minLength={6}
            />
            <p className="text-xs text-gray-500 mt-1">Only password changes are currently supported</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex">
              <svg className="w-5 h-5 text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">Limited Functionality</h3>
                <p className="text-sm text-blue-700 mt-1">
                  Currently, only password changes are supported. Other user properties require backend API updates.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.newPassword}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
