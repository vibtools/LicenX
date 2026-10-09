import React, { useEffect, useState, useMemo } from 'react';
import { X, Laptop, RotateCcw, Loader2 } from 'lucide-react';
import { api } from '../services/apiClient';
import { License, Device } from '../types';
import { TablePagination } from './TablePagination';

interface ManageDevicesModalProps {
  license: License;
  onClose: () => void;
  onDevicesUpdated: () => void;
}

export const ManageDevicesModal: React.FC<ManageDevicesModalProps> = ({
  license,
  onClose,
  onDevicesUpdated,
}) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const res = await api.getLicenseDevices(license.id);
      const devList = res?.devices || (Array.isArray(res) ? (res as any) : []);
      setDevices(Array.isArray(devList) ? devList : []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchDevices();
  }, [license.id]);

  const totalPages = Math.max(1, Math.ceil(devices.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedDevices = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return devices.slice(start, start + pageSize);
  }, [devices, safeCurrentPage, pageSize]);

  const handleUnbind = async (deviceId: string) => {
    if (!confirm('Unbind this hardware device from license?')) return;
    try {
      setActionLoading(true);
      await api.unbindDevice(deviceId);
      await fetchDevices();
      onDevicesUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to unbind device');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetAll = async () => {
    if (!confirm('Reset ALL bound hardware devices for this license?')) return;
    try {
      setActionLoading(true);
      await api.resetLicenseDevices(license.id);
      await fetchDevices();
      onDevicesUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to reset all devices');
    } finally {
      setActionLoading(false);
    }
  };

  const formatTime = (ms: number) => {
    if (!ms) return 'Never';
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-lg shadow-xl overflow-hidden">
        <div className="p-3 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Laptop className="w-4 h-4 text-slate-400" />
            <span className="font-mono text-xs font-medium text-slate-300 uppercase tracking-wider">
              HWID Lock Inspector: {license.key}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
              {devices.filter((d) => d.status === 'active').length} / {license.device_limit === -1 ? '∞' : license.device_limit} Bound
            </span>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-850 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2 text-xs text-rose-400 bg-rose-950/30 border border-rose-900/40 rounded font-mono">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-8 flex items-center justify-center text-slate-500 font-mono text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading hardware locks...
            </div>
          ) : devices.length === 0 ? (
            <div className="py-8 text-center text-slate-500 font-mono text-xs border border-dashed border-slate-800/80 rounded">
              No devices currently bound to this license key.
            </div>
          ) : (
            <div className="border border-slate-800/80 rounded overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-slate-900/60 border-b border-slate-800/80 text-slate-400 text-[10px] uppercase">
                    <tr>
                      <th className="py-2 px-2.5">HWID Hash</th>
                      <th className="py-2 px-2.5">Device / OS</th>
                      <th className="py-2 px-2.5">Status</th>
                      <th className="py-2 px-2.5">IP Address</th>
                      <th className="py-2 px-2.5">Last Ping</th>
                      <th className="py-2 px-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 text-slate-300 text-[11px]">
                    {paginatedDevices.map((d) => {
                      const isActive = d.status === 'active';
                      return (
                        <tr key={d.id} className="hover:bg-slate-900/30 transition-colors">
                          <td className="py-2 px-2.5">
                            <span className="font-medium text-slate-300 select-all" title={d.hwid}>
                              {d.hwid.slice(0, 16)}...
                            </span>
                          </td>
                          <td className="py-2 px-2.5">
                            <div className="font-medium text-slate-300">{d.device_name || 'PC Client'}</div>
                            <div className="text-[10px] text-slate-500">{d.os_info || 'Windows/Linux'}</div>
                          </td>
                          <td className="py-2 px-2.5">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium uppercase ${
                                isActive
                                  ? 'bg-emerald-950/30 text-emerald-400/90 border border-emerald-900/40'
                                  : 'bg-slate-900 text-slate-400 border border-slate-800'
                              }`}
                            >
                              <span
                                className={`w-1 h-1 rounded-full ${
                                  isActive ? 'bg-emerald-500/80' : 'bg-slate-500'
                                }`}
                              />
                              {isActive ? 'Active Lock' : 'Logged Out'}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 text-slate-400">{d.ip_address}</td>
                          <td className="py-2 px-2.5 text-slate-400">{formatTime(d.last_ping_at)}</td>
                          <td className="py-2 px-2.5 text-right">
                            <button
                              onClick={() => handleUnbind(d.id)}
                              disabled={actionLoading}
                              className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                                isActive
                                  ? 'bg-slate-900 hover:bg-rose-950/40 text-rose-400 border-slate-800 hover:border-rose-900/50'
                                  : 'bg-slate-900 hover:bg-slate-850 text-slate-400 border-slate-800'
                              }`}
                              title={isActive ? 'Unbind active hardware slot' : 'Remove inactive record'}
                            >
                              {isActive ? 'Unbind HWID' : 'Remove'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <TablePagination
                currentPage={safeCurrentPage}
                totalItems={devices.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(newSize) => {
                  setPageSize(newSize);
                  setCurrentPage(1);
                }}
                itemLabel="devices"
              />
            </div>
          )}

          <div className="pt-2 flex items-center justify-between">
            {devices.length > 0 && (
              <button
                onClick={handleResetAll}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded bg-slate-900 hover:bg-rose-950/40 text-rose-400 border border-slate-800 hover:border-rose-900/50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset All Devices
              </button>
            )}
            <button
              onClick={onClose}
              className="ml-auto px-3 py-1.5 text-xs font-mono rounded bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
