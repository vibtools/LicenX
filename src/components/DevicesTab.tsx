import React, { useEffect, useState, useMemo } from 'react';
import { Laptop, Search, Trash2, RefreshCw, Key } from 'lucide-react';
import { api } from '../services/apiClient';
import { Device } from '../types';
import { TablePagination } from './TablePagination';

export const DevicesTab: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const loadDevices = async (force = false) => {
    try {
      if (devices.length === 0) setLoading(true);
      const res = await api.getDevices({ search: search.trim() || undefined, limit: 100 }, force);
      const devList = res?.devices || (Array.isArray(res) ? (res as any) : []);
      setDevices(Array.isArray(devList) ? devList : []);
      setTotal(typeof res?.total === 'number' ? res.total : (Array.isArray(devList) ? devList.length : 0));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadDevices();
  };

  const totalPages = Math.max(1, Math.ceil(devices.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedDevices = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return devices.slice(start, start + pageSize);
  }, [devices, safeCurrentPage, pageSize]);

  const handleUnbind = async (id: string) => {
    if (!confirm('Unbind this hardware device? The client slot will be freed immediately.')) return;
    try {
      setActionLoading(true);
      await api.unbindDevice(id);
      await loadDevices();
    } catch (err: any) {
      alert(err.message || 'Unbind failed');
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5 flex-1 max-w-md">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search HWID, machine name, IP, key..."
              className="w-full pl-7 pr-2.5 py-1 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200 font-mono focus:border-indigo-500/80 focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1.5" />
          </div>
          <button
            type="submit"
            className="px-2 py-1 text-xs font-mono rounded bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 transition-colors"
          >
            Filter
          </button>
        </form>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-400">Total Bound: {total}</span>
          <button
            onClick={() => loadDevices(true)}
            className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="border border-slate-800/80 rounded bg-slate-950/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-slate-900/60 border-b border-slate-800/80 text-slate-400 text-[10px] uppercase">
              <tr>
                <th className="py-2 px-2.5">Hardware ID (HWID)</th>
                <th className="py-2 px-2.5">Bound License</th>
                <th className="py-2 px-2.5">Client Device</th>
                <th className="py-2 px-2.5">IP Address</th>
                <th className="py-2 px-2.5">Status</th>
                <th className="py-2 px-2.5">Last Heartbeat</th>
                <th className="py-2 px-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-slate-300 text-[11px]">
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    {loading ? 'Loading devices...' : 'No active hardware bindings found.'}
                  </td>
                </tr>
              ) : (
                paginatedDevices.map((dev) => (
                  <tr key={dev.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-2 px-2.5">
                      <span className="font-medium text-slate-300 select-all" title={dev.hwid}>
                        {dev.hwid}
                      </span>
                    </td>
                    <td className="py-2 px-2.5">
                      <div className="flex items-center gap-1 font-medium text-slate-300">
                        <Key className="w-3 h-3 text-slate-400" />
                        {dev.license_key || 'UNKNOWN'}
                      </div>
                    </td>
                    <td className="py-2 px-2.5">
                      <div className="text-slate-300">{dev.device_name || 'Generic PC'}</div>
                      <div className="text-[10px] text-slate-500">{dev.os_info || 'Unknown OS'}</div>
                    </td>
                    <td className="py-2 px-2.5 text-slate-400">{dev.ip_address}</td>
                    <td className="py-2 px-2.5">
                      {dev.status === 'active' ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-900/50">
                          Active
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-900 text-slate-400 border border-slate-800">
                          Logged Out
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2.5 text-slate-400">{formatTime(dev.last_ping_at)}</td>
                    <td className="py-2 px-2.5 text-right">
                      <button
                        onClick={() => handleUnbind(dev.id)}
                        disabled={actionLoading}
                        className="px-2 py-0.5 text-[10px] rounded bg-slate-900 hover:bg-rose-950/40 text-rose-400 border border-slate-800 hover:border-rose-900/50 transition-colors"
                        title="Unbind hardware slot"
                      >
                        {dev.status === 'active' ? 'Unbind HWID' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
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
    </div>
  );
};
