import React, { useEffect, useState } from 'react';
import {
  Key,
  CheckCircle,
  Clock,
  Ban,
  Laptop,
  Activity,
  Plus,
  Layers,
  RefreshCw,
  Terminal,
  AppWindow,
} from 'lucide-react';
import { api } from '../services/apiClient';
import { SystemStats, ValidationLog } from '../types';

interface OverviewTabProps {
  onOpenCreate: () => void;
  onOpenBulk: () => void;
  onNavigateTab: (tab: any) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  onOpenCreate,
  onOpenBulk,
  onNavigateTab,
}) => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [logs, setLogs] = useState<ValidationLog[]>([]);
  const [loading, setLoading] = useState(!stats);

  const loadData = async (force = false) => {
    try {
      if (!stats) setLoading(true);
      const [sRes, lRes] = await Promise.all([api.getStats(force), api.getLogs({ limit: 8 }, force)]);
      if (sRes) setStats(sRes);
      const logList = lRes?.logs || (Array.isArray(lRes) ? (lRes as any) : []);
      setLogs(Array.isArray(logList) ? logList : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatLogTime = (ms: number) => {
    return new Date(ms).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between font-sans">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300 tracking-normal">
            System Metrics
          </span>
          <button
            onClick={() => loadData(true)}
            title="Refresh data"
            className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenBulk}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-750 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            Bulk Engine
          </button>
          <button
            onClick={onOpenCreate}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Issue Key
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 font-sans">
        <div
          onClick={() => onNavigateTab('apps')}
          className="p-3 rounded bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/80 cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-medium uppercase tracking-wider">Apps</span>
            <AppWindow className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="text-lg font-semibold font-mono text-slate-200 mt-1">
            {stats?.totalApps ?? 0}
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('licenses')}
          className="p-3 rounded bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/80 cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-medium uppercase tracking-wider">Total Keys</span>
            <Key className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="text-lg font-semibold font-mono text-slate-200 mt-1">
            {stats?.totalLicenses ?? 0}
          </div>
        </div>

        <div className="p-3 rounded bg-slate-900/40 border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-medium uppercase tracking-wider">Active</span>
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400/80" />
          </div>
          <div className="text-lg font-semibold font-mono text-emerald-400/90 mt-1">
            {stats?.activeLicenses ?? 0}
          </div>
        </div>

        <div className="p-3 rounded bg-slate-900/40 border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-medium uppercase tracking-wider">Expired</span>
            <Clock className="w-3.5 h-3.5 text-amber-400/80" />
          </div>
          <div className="text-lg font-semibold font-mono text-amber-400/90 mt-1">
            {stats?.expiredLicenses ?? 0}
          </div>
        </div>

        <div className="p-3 rounded bg-slate-900/40 border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-medium uppercase tracking-wider">Revoked</span>
            <Ban className="w-3.5 h-3.5 text-rose-400/80" />
          </div>
          <div className="text-lg font-semibold font-mono text-rose-400/90 mt-1">
            {stats?.revokedLicenses ?? 0}
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('devices')}
          className="p-3 rounded bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/80 cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-medium uppercase tracking-wider">Active HWIDs</span>
            <Laptop className="w-3.5 h-3.5 text-indigo-400/80" />
          </div>
          <div className="text-lg font-semibold font-mono text-indigo-300 mt-1">
            {stats?.activeDevices ?? 0}
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('logs')}
          className="p-3 rounded bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/80 cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-medium uppercase tracking-wider">24h Requests</span>
            <Activity className="w-3.5 h-3.5 text-cyan-400/80" />
          </div>
          <div className="text-lg font-semibold font-mono text-cyan-300 mt-1">
            {stats?.validations24h ?? 0}
          </div>
        </div>
      </div>

      {/* Live Activity & Stream */}
      <div className="p-3 rounded bg-slate-900/40 border border-slate-800/80">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-2">
          <div className="flex items-center gap-1.5 text-slate-300 text-xs font-semibold">
            <Terminal className="w-3.5 h-3.5 text-indigo-400/90" />
            Live Client Validation Stream
          </div>
          <button
            onClick={() => onNavigateTab('logs')}
            className="text-[11px] font-medium text-indigo-400/90 hover:text-indigo-300 transition-colors font-sans"
          >
            View All Logs →
          </button>
        </div>

        {(logs || []).length === 0 ? (
          <div className="py-6 text-center text-slate-500 font-mono text-xs">
            No validation requests recorded yet.
          </div>
        ) : (
          <div className="space-y-1 font-mono text-xs">
            {(logs || []).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between py-1.5 px-2 rounded bg-slate-950/60 border border-slate-900 text-[11px] hover:border-slate-800/80 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${
                      log.status_code === 200
                        ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40'
                        : 'bg-rose-950/40 text-rose-400 border border-rose-900/40'
                    }`}
                  >
                    {log.status_code}
                  </span>
                  <span className="text-slate-300 font-medium">{log.license_key || 'UNKNOWN'}</span>
                  <span className="text-slate-500">[{log.hwid?.slice(0, 12) || 'N/A'}]</span>
                  <span className="text-slate-400 hidden sm:inline">{log.message}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 text-[10px]">
                  <span>{log.ip_address}</span>
                  <span>{formatLogTime(log.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
