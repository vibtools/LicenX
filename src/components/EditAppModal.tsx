import { Loader2, X } from 'lucide-react';
import React, { useState } from 'react';
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
  const [deviceLeaseSeconds, setDeviceLeaseSeconds] = useState(app.device_lease_seconds ?? 7200);
  const [pingIntervalSeconds, setPingIntervalSeconds] = useState(app.ping_interval_seconds ?? 1200);
  const [offlineGraceSeconds, setOfflineGraceSeconds] = useState(app.offline_grace_seconds ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName) {
      setError('Display Name is required');
      return;
    }
    if (
      !Number.isSafeInteger(deviceLeaseSeconds) ||
      !Number.isSafeInteger(pingIntervalSeconds) ||
      !Number.isSafeInteger(offlineGraceSeconds) ||
      pingIntervalSeconds < 60 ||
      pingIntervalSeconds > 1200 ||
      offlineGraceSeconds < 0 ||
      offlineGraceSeconds > 3600 ||
      deviceLeaseSeconds <= pingIntervalSeconds + offlineGraceSeconds + 10
    ) {
      setError('Lease must exceed heartbeat interval, offline grace, and 10-second heartbeat timeout. Interval: 60-1200s; grace: 0-3600s.');
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
        device_lease_seconds: deviceLeaseSeconds,
        ping_interval_seconds: pingIntervalSeconds,
        offline_grace_seconds: offlineGraceSeconds,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-xs font-sans text-xs">
      <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-lg shadow-xl overflow-hidden font-sans">
        <div className="p-3.5 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <span className="font-semibold text-slate-200 text-xs tracking-normal">
            Edit Application: <span className="font-mono text-indigo-300 font-medium">{app.app_slug}</span>
          </span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-850 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 font-sans">
          {error && (
            <div className="p-2 text-xs text-rose-400 bg-rose-950/30 border border-rose-900/40 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-sans focus:border-indigo-500/80 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Minimum Version</label>
              <input
                type="text"
                value={minVersion}
                onChange={(e) => setMinVersion(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-mono text-xs focus:border-indigo-500/80 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Status</label>
              <select
                value={status}
                onChange={(e: any) => setStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-sans focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-sans focus:border-indigo-500/80 focus:outline-none"
            />
          </div>

          <div className="border-t border-slate-800 pt-3">
            <div className="text-xs font-medium text-slate-300 mb-2">License Session Policy</div>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Device Lease (sec)</label>
                <input
                  type="number"
                  min={pingIntervalSeconds + offlineGraceSeconds + 11}
                  step={60}
                  value={deviceLeaseSeconds}
                  onChange={(e) => setDeviceLeaseSeconds(Number(e.target.value))}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-mono text-xs focus:border-indigo-500/80 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Heartbeat (sec)</label>
                <input
                  type="number"
                  min={60}
                  max={1200}
                  step={60}
                  value={pingIntervalSeconds}
                  onChange={(e) => setPingIntervalSeconds(Number(e.target.value))}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-mono text-xs focus:border-indigo-500/80 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Offline Grace (sec)</label>
                <input
                  type="number"
                  min={0}
                  max={3600}
                  step={60}
                  value={offlineGraceSeconds}
                  onChange={(e) => setOfflineGraceSeconds(Number(e.target.value))}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-mono text-xs focus:border-indigo-500/80 focus:outline-none"
                  required
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 font-medium transition-colors"
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
