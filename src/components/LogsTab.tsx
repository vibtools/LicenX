import React, { useEffect, useState, useMemo } from 'react';
import { Terminal, Trash2, RefreshCw } from 'lucide-react';
import { api } from '../services/apiClient';
import { ValidationLog } from '../types';
import { TablePagination } from './TablePagination';

export const LogsTab: React.FC = () => {
  const [logs, setLogs] = useState<ValidationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const loadLogs = async (force = false) => {
    try {
      if (logs.length === 0) setLoading(true);
      const res = await api.getLogs({
        action: actionFilter !== 'all' ? actionFilter : undefined,
        limit: 150,
      }, force);
      const logList = res?.logs || (Array.isArray(res) ? (res as any) : []);
      setLogs(Array.isArray(logList) ? logList : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    loadLogs();
  }, [actionFilter]);

  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedLogs = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return logs.slice(start, start + pageSize);
  }, [logs, safeCurrentPage, pageSize]);

  const handleClearLogs = async () => {
    if (!confirm('Clear all audit logs permanently?')) return;
    try {
      await api.clearLogs();
      await loadLogs();
    } catch (err: any) {
      alert(err.message || 'Failed to clear logs');
    }
  };

  const formatTime = (ms: number) => {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="space-y-3 font-mono text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-300 uppercase tracking-wider">
            Audit Log Trail ({(logs || []).length})
          </span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-2 py-1 text-xs bg-slate-900 border border-slate-800 rounded text-slate-300 focus:outline-none"
          >
            <option value="all">Action: All</option>
            <option value="validate">Validated (200)</option>
            <option value="reject">Rejected (403)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadLogs(true)}
            className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleClearLogs}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        </div>
      </div>

      <div className="border border-slate-800/80 rounded bg-slate-950/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-slate-900/60 border-b border-slate-800/80 text-slate-400 text-[10px] uppercase">
              <tr>
                <th className="py-2 px-2.5">Code</th>
                <th className="py-2 px-2.5">Action</th>
                <th className="py-2 px-2.5">License Key</th>
                <th className="py-2 px-2.5">HWID</th>
                <th className="py-2 px-2.5">Message / Outcome</th>
                <th className="py-2 px-2.5">IP</th>
                <th className="py-2 px-2.5 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-slate-300 text-[11px]">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    {loading ? 'Loading logs...' : 'No audit logs recorded.'}
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-2 px-2.5">
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${
                          log.status_code === 200
                            ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/40'
                            : log.status_code === 404
                            ? 'bg-slate-900 text-slate-400 border border-slate-800'
                            : 'bg-rose-950/30 text-rose-400 border border-rose-900/40'
                        }`}
                      >
                        {log.status_code}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 uppercase text-[10px] text-slate-400 font-medium">
                      {log.action}
                    </td>
                    <td className="py-2 px-2.5 font-medium text-slate-300 select-all">
                      {log.license_key || 'UNKNOWN'}
                    </td>
                    <td className="py-2 px-2.5 text-slate-400 select-all">
                      {log.hwid ? log.hwid.slice(0, 16) + '...' : '—'}
                    </td>
                    <td className="py-2 px-2.5 text-slate-300">{log.message}</td>
                    <td className="py-2 px-2.5 text-slate-500">{log.ip_address}</td>
                    <td className="py-2 px-2.5 text-slate-500 text-right">{formatTime(log.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          currentPage={safeCurrentPage}
          totalItems={logs.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          itemLabel="logs"
        />
      </div>
    </div>
  );
};
