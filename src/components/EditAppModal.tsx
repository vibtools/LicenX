import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { api } from '../services/apiClient';
import { AppItem } from '../types';

interface EditAppModalProps {
  app: AppItem;
  onClose: () => void;
  onUpdated: () => void;
}

export const EditAppModal: React.FC<EditAppModalProps> = ({ app, onClose, onUpdated }) => {
  const [displayName, setDisplayName] = useState(app.display_name);
  const [minVersion, setMinVersion] = useState(app.min_version || '1.0.0');
  const [status, setStatus] = useState<'active' | 'inactive'>(app.status);
  const [description, setDescription] = useState(app.description || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName) {
      setError('Display Name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.updateApp(app.id, {
        display_name: displayName.trim(),
        min_version: minVersion.trim() || '1.0.0',
        status,
        description: description.trim() || null,
      });

      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update application');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-xs font-mono text-xs">
      <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-lg shadow-xl overflow-hidden">
        <div className="p-3 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <span className="font-medium text-slate-200 uppercase tracking-wider">
            Edit App: {app.app_slug}
          </span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-850 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {error && (
            <div className="p-2 text-xs text-rose-400 bg-rose-950/30 border border-rose-900/40 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Minimum Version</label>
              <input
                type="text"
                value={minVersion}
                onChange={(e) => setMinVersion(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Status</label>
              <select
                value={status}
                onChange={(e: any) => setStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-3 py-1.5 rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 font-medium disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
