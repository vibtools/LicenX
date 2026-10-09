import React, { useEffect, useState, useMemo } from 'react';
import {
  AppWindow,
  Search,
  Plus,
  Download,
  Edit2,
  Trash2,
  RefreshCw,
  Power,
  Key,
} from 'lucide-react';
import { api } from '../services/apiClient';
import { AppItem } from '../types';
import { CreateAppModal } from './CreateAppModal';
import { EditAppModal } from './EditAppModal';
import { TablePagination } from './TablePagination';

export const AppsTab: React.FC = () => {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingApp, setEditingApp] = useState<AppItem | null>(null);
  const [downloadingSdk, setDownloadingSdk] = useState(false);

  const handleDownloadSdk = async () => {
    try {
      setDownloadingSdk(true);
      await api.downloadPythonSdk();
    } catch (err: any) {
      alert(err.message || 'Failed to download Python SDK package');
    } finally {
      setDownloadingSdk(false);
    }
  };

  const loadApps = async (force = false) => {
    try {
      if (apps.length === 0) setLoading(true);
      const res = await api.getApps({
        search: search.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        limit: 100,
      }, force);
      const appList = res?.apps || (Array.isArray(res) ? (res as any) : []);
      setApps(Array.isArray(appList) ? appList : []);
      setTotal(typeof res?.total === 'number' ? res.total : (Array.isArray(appList) ? appList.length : 0));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    loadApps();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadApps();
  };

  const totalPages = Math.max(1, Math.ceil(apps.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedApps = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return apps.slice(start, start + pageSize);
  }, [apps, safeCurrentPage, pageSize]);

  const isAllPageSelected = paginatedApps.length > 0 && paginatedApps.every((a) => selectedIds.includes(a.id));

  const toggleSelectAll = () => {
    if (isAllPageSelected) {
      const pageIds = new Set(paginatedApps.map((a) => a.id));
      setSelectedIds(selectedIds.filter((id) => !pageIds.has(id)));
    } else {
      const newSelected = new Set(selectedIds);
      paginatedApps.forEach((a) => newSelected.add(a.id));
      setSelectedIds(Array.from(newSelected));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedIds.length === 0) return;
    if (action === 'delete' && !confirm(`Delete ${selectedIds.length} applications? Linked licenses will become global.`)) return;

    try {
      await api.bulkAppAction({ ids: selectedIds, action });
      setSelectedIds([]);
      await loadApps();
    } catch (err: any) {
      alert(err.message || 'Bulk action failed');
    }
  };

  const handleDeleteSingle = async (id: string, name: string) => {
    if (!confirm(`Delete application "${name}"? Linked licenses will be set to global.`)) return;
    try {
      await api.deleteApp(id);
      await loadApps();
    } catch (err: any) {
      alert(err.message || 'Failed to delete app');
    }
  };

  const handleToggleStatus = async (app: AppItem) => {
    const nextStatus = app.status === 'active' ? 'inactive' : 'active';
    try {
      await api.updateApp(app.id, { status: nextStatus });
      await loadApps();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle status');
    }
  };

  const handleDownloadConfig = async (app: AppItem) => {
    try {
      await api.downloadAppConfig(app.id, app.app_slug);
    } catch (err: any) {
      alert(err.message || 'Failed to download client config');
    }
  };

  return (
    <div className="space-y-3 font-sans text-xs">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5 flex-1 max-w-md">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search app identifier, display name..."
              className="w-full pl-7 pr-2.5 py-1 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200 font-sans focus:border-indigo-500/80 focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1.5" />
          </div>
          <button
            type="submit"
            className="px-2.5 py-1 text-xs font-medium rounded bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 transition-colors"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1 text-xs font-sans bg-slate-900 border border-slate-800 rounded text-slate-300 focus:outline-none"
          >
            <option value="all">Status: All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <button
            onClick={() => loadApps(true)}
            title="Reload table"
            className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleDownloadSdk}
            disabled={downloadingSdk}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 hover:border-slate-700 transition-colors"
            title="Download Python Client SDK (x_license_python.zip)"
          >
            <Download className={`w-3.5 h-3.5 ${downloadingSdk ? 'animate-bounce' : ''}`} />
            Download Python SDK
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Application
          </button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-xs text-slate-300 font-sans">
          <span>{selectedIds.length} apps selected</span>
          <div className="flex items-center gap-1.5 font-medium">
            <button
              onClick={() => handleBulkAction('activate')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-emerald-400 border border-slate-700 transition-colors"
            >
              Activate
            </button>
            <button
              onClick={() => handleBulkAction('deactivate')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-amber-400 border border-slate-700 transition-colors"
            >
              Deactivate
            </button>
            <button
              onClick={() => handleBulkAction('delete')}
              className="p-1 rounded bg-slate-800 hover:bg-rose-950/40 text-rose-400 transition-colors"
              title="Delete Selected"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Apps Table */}
      <div className="border border-slate-800/80 rounded bg-slate-950/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans text-xs">
            <thead className="bg-slate-900/60 border-b border-slate-800/80 text-xs font-semibold tracking-wider text-slate-400 uppercase font-sans">
              <tr>
                <th className="py-2.5 px-3 w-6">
                  <input
                    type="checkbox"
                    checked={isAllPageSelected}
                    onChange={toggleSelectAll}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                </th>
                <th className="py-2.5 px-3">App Identifier (Slug)</th>
                <th className="py-2.5 px-3">Display Name</th>
                <th className="py-2.5 px-3">Min Version</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Scoped Licenses</th>
                <th className="py-2.5 px-3">Notes</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-slate-300 text-xs">
              {apps.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-sans">
                    {loading ? 'Loading applications...' : 'No applications found.'}
                  </td>
                </tr>
              ) : (
                paginatedApps.map((app) => (
                <tr key={app.id} className="hover:bg-slate-900/30 transition-colors">
                  <td className="py-2 px-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(app.id)}
                      onChange={() => toggleSelectOne(app.id)}
                      className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <span className="font-mono text-xs font-medium text-slate-200 select-all tracking-wide">
                      {app.app_slug}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-200 font-medium">
                    {app.display_name}
                  </td>
                  <td className="py-2 px-3">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                      v{app.min_version || '1.0.0'}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase font-sans ${
                        app.status === 'active'
                          ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/40'
                          : 'bg-slate-900 text-slate-500 border border-slate-800'
                      }`}
                    >
                      {app.status}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                      <Key className="w-3 h-3 text-slate-500" />
                      <span className="font-mono text-slate-300">{app.licenses_count ?? 0}</span> Keys
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-400 max-w-xs truncate">
                    {app.description || '—'}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center justify-end gap-1 font-sans">
                      <button
                        onClick={() => handleDownloadConfig(app)}
                        title="Download Client Config (JSON)"
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 font-medium transition-colors text-[11px]"
                      >
                        <Download className="w-3 h-3 text-slate-400" />
                        <span>Config</span>
                      </button>
                      <button
                        onClick={() => handleToggleStatus(app)}
                        title={app.status === 'active' ? 'Deactivate App' : 'Activate App'}
                        className={`p-1 rounded transition-colors ${
                          app.status === 'active'
                            ? 'text-slate-400 hover:text-amber-400 hover:bg-slate-900'
                            : 'text-slate-500 hover:text-emerald-400 hover:bg-slate-900'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingApp(app)}
                        title="Edit Application"
                        className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSingle(app.id, app.display_name)}
                        title="Delete Application"
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-900 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <TablePagination
        currentPage={safeCurrentPage}
        totalItems={apps.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setCurrentPage(1);
        }}
        itemLabel="applications"
      />
    </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateAppModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            loadApps();
          }}
        />
      )}

      {editingApp && (
        <EditAppModal
          app={editingApp}
          onClose={() => setEditingApp(null)}
          onUpdated={() => {
            loadApps();
          }}
        />
      )}
    </div>
  );
};
