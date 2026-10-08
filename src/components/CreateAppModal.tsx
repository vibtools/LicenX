import React, { useState } from 'react';
import { X, AppWindow, Plus, Loader2, Download, CheckCircle2 } from 'lucide-react';
import { api } from '../services/apiClient';
import { AppItem } from '../types';

interface CreateAppModalProps {
  onClose: () => void;
  onCreated: (app: AppItem) => void;
}

export const CreateAppModal: React.FC<CreateAppModalProps> = ({ onClose, onCreated }) => {
  const [appSlug, setAppSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [minVersion, setMinVersion] = useState('1.0.0');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdApp, setCreatedApp] = useState<AppItem | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appSlug || !displayName) {
      setError('App Identifier and Display Name are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.createApp({
        app_slug: appSlug.trim(),
        display_name: displayName.trim(),
        min_version: minVersion.trim() || '1.0.0',
        description: description.trim() || undefined,
      });

      setCreatedApp(res.app);
      onCreated(res.app);
    } catch (err: any) {
      setError(err.message || 'Failed to register application');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadConfig = async () => {
    if (!createdApp) return;
    try {
      await api.downloadAppConfig(createdApp.id, createdApp.app_slug);
    } catch (err: any) {
      alert(err.message || 'Failed to download config file');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-xs">
      <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-lg shadow-xl overflow-hidden font-mono text-xs">
        <div className="p-3 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AppWindow className="w-4 h-4 text-slate-400" />
            <span className="font-medium text-slate-200 uppercase tracking-wider">
              Register New Application
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-850 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {createdApp ? (
          <div className="p-4 space-y-3">
            <div className="p-3 rounded bg-emerald-950/30 border border-emerald-900/40 flex items-center gap-2 text-emerald-400 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Application "{createdApp.display_name}" registered successfully</span>
            </div>

            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 space-y-1.5 text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">App Identifier:</span>
                <span className="text-slate-200 font-medium">{createdApp.app_slug}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Minimum Version:</span>
                <span className="text-slate-200 font-medium">{createdApp.min_version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">App Status:</span>
                <span className="text-emerald-400 font-medium uppercase text-[10px]">Active</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleDownloadConfig}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 font-medium transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download Client Config (JSON)
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            {error && (
              <div className="p-2 text-xs text-rose-400 bg-rose-950/30 border border-rose-900/40 rounded">
                {error}
              </div>
            )}

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">
                App Identifier / Slug (e.g. vpn_suite, dark_tool_pro)
              </label>
              <input
                type="text"
                value={appSlug}
                onChange={(e) =>
                  setAppSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_-]/g, '_')
                  )
                }
                placeholder="lowercase_letters_and_numbers"
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. VPN Suite Pro"
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Minimum Client Version</label>
              <input
                type="text"
                value={minVersion}
                onChange={(e) => setMinVersion(e.target.value)}
                placeholder="1.0.0"
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Description / Notes</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional internal description"
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 font-medium disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add Application
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
