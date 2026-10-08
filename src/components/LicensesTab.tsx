import React, { useEffect, useState } from 'react';
import {
  Search,
  Plus,
  Layers,
  Copy,
  Check,
  Laptop,
  Trash2,
  Edit2,
  RefreshCw,
  Download,
  RotateCcw,
  LogOut,
  Settings,
  CheckCircle2,
  PauseCircle,
  Ban,
  Eye,
} from 'lucide-react';
import { api } from '../services/apiClient';
import { License, AppItem } from '../types';

interface LicensesTabProps {
  onOpenCreate: () => void;
  onOpenBulk: () => void;
  onManageDevices: (license: License) => void;
}

export const LicensesTab: React.FC<LicensesTabProps> = ({
  onOpenCreate,
  onOpenBulk,
  onManageDevices,
}) => {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [appFilter, setAppFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Settings dropdown state per license
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Edit Modal State
  const [editingLicense, setEditingLicense] = useState<License | null>(null);
  const [editTier, setEditTier] = useState('');
  const [editAppId, setEditAppId] = useState<string>('');
  const [editLimit, setEditLimit] = useState(1);
  const [editStatus, setEditStatus] = useState<'active' | 'suspended' | 'expired' | 'revoked'>('active');
  const [editNotes, setEditNotes] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.license-settings-menu')) {
        setOpenMenuId(null);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const loadLicenses = async () => {
    try {
      setLoading(true);
      const [licRes, appRes] = await Promise.all([
        api.getLicenses({
          search: search.trim() || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          tier: tierFilter !== 'all' ? tierFilter : undefined,
          app_id: appFilter !== 'all' ? appFilter : undefined,
          limit: 100,
        }),
        api.getApps(),
      ]);
      setLicenses(licRes.licenses);
      setTotal(licRes.total);
      setApps(appRes.apps);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLicenses();
  }, [statusFilter, tierFilter, appFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadLicenses();
  };

  const handleCopyKey = (lic: License) => {
    const textToCopy = lic.pin ? `${lic.key} PIN: ${lic.pin}` : lic.key;
    navigator.clipboard.writeText(textToCopy);
    setCopiedKey(lic.key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formatHalfKey = (key: string) => {
    if (!key) return '';
    const parts = key.split('-');
    if (parts.length >= 4) {
      return `${parts[0]}-${parts[1]}-••••-••••`;
    }
    if (parts.length === 3) {
      return `${parts[0]}-${parts[1]}-••••`;
    }
    if (key.length > 10) {
      return `${key.slice(0, 9)}••••`;
    }
    return key;
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === licenses.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(licenses.map((l) => l.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkAction = async (action: string, extendDays?: number) => {
    if (selectedIds.length === 0) return;
    if (action === 'delete' && !confirm(`Delete ${selectedIds.length} licenses?`)) return;
    if (action === 'reset' && !confirm(`Reset devices for ${selectedIds.length} licenses? All clients will be logged out and slots cleared.`)) return;

    try {
      await api.bulkAction({ ids: selectedIds, action, extendDays });
      setSelectedIds([]);
      await loadLicenses();
    } catch (err: any) {
      alert(err.message || 'Bulk action failed');
    }
  };

  const handleDeleteSingle = async (id: string) => {
    if (!confirm('Delete this license key permanently?')) return;
    try {
      await api.deleteLicense(id);
      setOpenMenuId(null);
      await loadLicenses();
    } catch (err: any) {
      alert(err.message || 'Failed to delete license');
    }
  };

  const handleResetSingle = async (lic: License) => {
    if (!confirm(`Reset all devices for license key "${lic.key}"?\n\nThis will log out all connected client devices, unbind hardware locks, and make the license fresh and ready to use.`)) {
      return;
    }
    try {
      await api.resetLicenseDevices(lic.id);
      await loadLicenses();
    } catch (err: any) {
      alert(err.message || 'Failed to reset license');
    }
  };

  const handleLogoutSingle = async (lic: License) => {
    if (!confirm(`Force logout all client apps bound to license "${lic.key}"?`)) {
      return;
    }
    try {
      await api.resetLicenseDevices(lic.id);
      await loadLicenses();
    } catch (err: any) {
      alert(err.message || 'Failed to log out client apps');
    }
  };

  const handleStatusChange = async (id: string, newStatus: 'active' | 'suspended' | 'revoked') => {
    try {
      await api.updateLicense(id, { status: newStatus });
      setOpenMenuId(null);
      await loadLicenses();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  const handleOpenEdit = (license: License) => {
    setOpenMenuId(null);
    setEditingLicense(license);
    setEditTier(license.tier || 'Standard');
    setEditAppId(license.app_id || 'global');
    setEditLimit(license.device_limit);
    setEditStatus(license.status);
    setEditNotes(license.notes || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLicense) return;
    setEditLoading(true);
    try {
      await api.updateLicense(editingLicense.id, {
        tier: editTier,
        app_id: editAppId === 'global' ? null : editAppId,
        device_limit: Number(editLimit),
        status: editStatus,
        notes: editNotes,
      });
      setEditingLicense(null);
      await loadLicenses();
    } catch (err: any) {
      alert(err.message || 'Failed to update license');
    } finally {
      setEditLoading(false);
    }
  };

  const handleExportSelectedCsv = () => {
    const target = selectedIds.length > 0
      ? licenses.filter((l) => selectedIds.includes(l.id))
      : licenses;

    let csv = 'key,pin,status,tier,app,device_limit,validity_type,expires_at,customer,notes\n';
    target.forEach((l) => {
      const expStr = l.expires_at ? new Date(l.expires_at).toISOString() : 'Lifetime';
      csv += `"${l.key}","${l.pin || ''}","${l.status}","${l.tier}","${l.app_name || l.app_slug || 'GLOBAL'}",${l.device_limit},"${l.validity_type}","${expStr}","${l.customer_name || ''}","${l.notes || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vcon_licenses_export_${Date.now()}.csv`;
    a.click();
  };

  const formatExpiry = (license: License) => {
    if (license.validity_type === 'lifetime' || (!license.expires_at && license.validity_type !== 'hourly')) {
      return <span className="text-slate-400">Lifetime</span>;
    }

    if (!license.activated_at && license.validity_type === 'hourly') {
      return <span className="text-slate-400">{license.validity_value}h (Inactive)</span>;
    }

    if (!license.expires_at) return <span className="text-slate-500">N/A</span>;

    const diff = license.expires_at - Date.now();
    if (diff <= 0) {
      return <span className="text-rose-400/90 font-medium">Expired</span>;
    }

    const hours = Math.floor(diff / (3600 * 1000));
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return <span className="text-slate-400">{days}d {hours % 24}h</span>;
    }
    return <span className="text-amber-400/90 font-medium">{hours}h</span>;
  };

  return (
    <div className="space-y-3 font-mono text-xs">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5 flex-1 max-w-md">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search key..."
              className="w-full pl-7 pr-2.5 py-1 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1.5" />
          </div>
          <button
            type="submit"
            className="px-2 py-1 text-xs rounded bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 transition-colors"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-2">
          {/* App Scope Filter */}
          <select
            value={appFilter}
            onChange={(e) => setAppFilter(e.target.value)}
            className="px-2 py-1 text-xs bg-slate-900 border border-slate-800 rounded text-slate-300 focus:outline-none max-w-[140px] truncate"
          >
            <option value="all">App: All</option>
            <option value="global">Global Only</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1 text-xs bg-slate-900 border border-slate-800 rounded text-slate-300 focus:outline-none"
          >
            <option value="all">Status: All</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="suspended">Suspended</option>
            <option value="revoked">Revoked</option>
          </select>

          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="px-2 py-1 text-xs bg-slate-900 border border-slate-800 rounded text-slate-300 focus:outline-none"
          >
            <option value="all">Tier: All</option>
            <option value="Standard">Standard</option>
            <option value="Pro">Pro</option>
            <option value="Enterprise">Enterprise</option>
            <option value="VIP">VIP</option>
          </select>

          <button
            onClick={loadLicenses}
            title="Reload table"
            className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onOpenBulk}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-750 transition-colors"
          >
            <Layers className="w-3 h-3 text-slate-400" />
            Bulk
          </button>

          <button
            onClick={onOpenCreate}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Issue
          </button>
        </div>
      </div>

      {/* Bulk Action Bar (when selected) - Includes Reset Feature */}
      {selectedIds.length > 0 && (
        <div className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-xs text-slate-300">
          <span>{selectedIds.length} licenses selected</span>
          <div className="flex items-center gap-1.5">
            {/* Bulk Reset Feature */}
            <button
              onClick={() => handleBulkAction('reset')}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-sky-400 border border-slate-700 transition-colors"
              title="Reset devices & logout clients for selected licenses"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Devices
            </button>
            <button
              onClick={() => handleBulkAction('activate')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-emerald-400 border border-slate-700 transition-colors"
            >
              Activate
            </button>
            <button
              onClick={() => handleBulkAction('suspend')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-amber-400 border border-slate-700 transition-colors"
            >
              Suspend
            </button>
            <button
              onClick={() => handleBulkAction('revoke')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-rose-400 border border-slate-700 transition-colors"
            >
              Revoke
            </button>
            <button
              onClick={() => handleBulkAction('extend', 30)}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-indigo-300 border border-slate-700 transition-colors"
            >
              +30 Days
            </button>
            <button
              onClick={handleExportSelectedCsv}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition-colors"
            >
              <Download className="w-3 h-3" />
              CSV
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

      {/* Main License Table - Clean & Compact */}
      <div className="border border-slate-800/80 rounded bg-slate-950/50 overflow-x-auto min-h-[320px]">
        <table className="w-full text-left font-mono text-xs">
          <thead className="bg-slate-900/60 border-b border-slate-800/80 text-slate-400 text-[10px] uppercase">
            <tr>
              <th className="py-2 px-2.5 w-6">
                <input
                  type="checkbox"
                  checked={selectedIds.length > 0 && selectedIds.length === licenses.length}
                  onChange={toggleSelectAll}
                  className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                />
              </th>
              <th className="py-2 px-2.5">License Key</th>
              <th className="py-2 px-2.5">App Scope</th>
              <th className="py-2 px-2.5">Status</th>
              <th className="py-2 px-2.5">Tier</th>
              <th className="py-2 px-2.5">HWID Lock</th>
              <th className="py-2 px-2.5">Validity</th>
              <th className="py-2 px-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40 text-slate-300 text-[11px]">
            {licenses.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  {loading ? 'Loading licenses...' : 'No licenses matching filter criteria.'}
                </td>
              </tr>
            ) : (
              licenses.map((lic) => {
                const boundCount = lic.bound_devices_count ?? 0;
                const limit = lic.device_limit;
                const isFull = limit !== -1 && boundCount >= limit;
                const isMenuOpen = openMenuId === lic.id;

                return (
                  <tr key={lic.id} className="hover:bg-slate-900/30 transition-colors">
                    {/* Checkbox */}
                    <td className="py-2 px-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(lic.id)}
                        onChange={() => toggleSelectOne(lic.id)}
                        className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                      />
                    </td>

                    {/* License Key: Half shown, full key & PIN copied */}
                    <td className="py-2 px-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="flex flex-col">
                          <span
                            onClick={() => handleCopyKey(lic)}
                            className="font-medium text-slate-200 cursor-pointer font-mono tracking-wide hover:text-indigo-300 transition-colors"
                            title={`Click to copy: ${lic.key}${lic.pin ? ` PIN: ${lic.pin}` : ''}`}
                          >
                            {formatHalfKey(lic.key)}
                          </span>
                          {lic.pin && (
                            <span className="text-[10px] text-indigo-400 font-medium tracking-wider">
                              PIN: {lic.pin}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleCopyKey(lic)}
                          className="text-slate-500 hover:text-slate-300 p-0.5 rounded transition-colors"
                          title={`Copy Key & PIN: ${lic.key}${lic.pin ? ` PIN: ${lic.pin}` : ''}`}
                        >
                          {copiedKey === lic.key ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* App Scope: Only App Display Name */}
                    <td className="py-2 px-2.5">
                      <span className="text-slate-300 font-medium">
                        {lic.app_name || 'Global'}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-2 px-2.5">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium uppercase ${
                          lic.status === 'active'
                            ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/40'
                            : lic.status === 'expired'
                            ? 'bg-amber-950/30 text-amber-400 border border-amber-900/40'
                            : lic.status === 'suspended'
                            ? 'bg-slate-900 text-slate-400 border border-slate-800'
                            : 'bg-rose-950/30 text-rose-400 border border-rose-900/40'
                        }`}
                      >
                        {lic.status}
                      </span>
                    </td>

                    {/* Tier */}
                    <td className="py-2 px-2.5">
                      <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-400">
                        {lic.tier}
                      </span>
                    </td>

                    {/* HWID Lock */}
                    <td className="py-2 px-2.5">
                      <button
                        onClick={() => onManageDevices(lic)}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                          isFull
                            ? 'bg-amber-950/20 border-amber-900/40 text-amber-400/90'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                        title="Click to view & unbind locked hardware"
                      >
                        <Laptop className="w-3 h-3 text-slate-400" />
                        <span>
                          {boundCount} / {limit === -1 ? '∞' : limit}
                        </span>
                      </button>
                    </td>

                    {/* Validity without 'remaining' */}
                    <td className="py-2 px-2.5">{formatExpiry(lic)}</td>

                    {/* Actions: Reset Icon, Logout Icon, Settings Dropdown Menu */}
                    <td className="py-2 px-2.5 text-right relative">
                      <div className="flex items-center justify-end gap-1 license-settings-menu">
                        {/* 1. Reset Icon: Click to reset all login devices, logged out all, and license fresh */}
                        <button
                          onClick={() => handleResetSingle(lic)}
                          title="Reset: Unbind all devices & make license fresh ready to use"
                          className="p-1 rounded text-slate-400 hover:text-sky-400 hover:bg-slate-900 transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>

                        {/* 2. Logout Icon: Click to logout client app */}
                        <button
                          onClick={() => handleLogoutSingle(lic)}
                          title="Logout: Force logout active client applications"
                          className="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-900 transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                        </button>

                        {/* 3. Settings Icon: Opens dropdown menu */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(isMenuOpen ? null : lic.id);
                          }}
                          title="Settings & Actions Menu"
                          className={`p-1 rounded transition-colors ${
                            isMenuOpen
                              ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                          }`}
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>

                        {/* Dropdown Menu */}
                        {isMenuOpen && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-2 top-8 z-50 w-44 rounded-md bg-slate-950 border border-slate-800 shadow-xl py-1 text-left font-mono text-xs"
                          >
                            {/* Device View */}
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                onManageDevices(lic);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-300 hover:bg-slate-900 hover:text-slate-100 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5 text-indigo-400" />
                              <span>View Devices</span>
                            </button>

                            {/* Edit */}
                            <button
                              onClick={() => handleOpenEdit(lic)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-300 hover:bg-slate-900 hover:text-slate-100 transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                              <span>Edit License</span>
                            </button>

                            <div className="my-1 border-t border-slate-800/80" />

                            {/* Activate */}
                            {lic.status !== 'active' && (
                              <button
                                onClick={() => handleStatusChange(lic.id, 'active')}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-emerald-400 hover:bg-slate-900 transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Activate</span>
                              </button>
                            )}

                            {/* Deactivate / Suspend */}
                            {lic.status !== 'suspended' && (
                              <button
                                onClick={() => handleStatusChange(lic.id, 'suspended')}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-amber-400 hover:bg-slate-900 transition-colors"
                              >
                                <PauseCircle className="w-3.5 h-3.5" />
                                <span>Suspend</span>
                              </button>
                            )}

                            {/* Revoke */}
                            {lic.status !== 'revoked' && (
                              <button
                                onClick={() => handleStatusChange(lic.id, 'revoked')}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-rose-400 hover:bg-slate-900 transition-colors"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>Revoke</span>
                              </button>
                            )}

                            <div className="my-1 border-t border-slate-800/80" />

                            {/* Delete */}
                            <button
                              onClick={() => handleDeleteSingle(lic.id)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-rose-400 hover:bg-rose-950/30 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Key</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Edit License Modal */}
      {editingLicense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-lg shadow-xl overflow-hidden">
            <div className="p-3 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between font-mono text-xs">
              <span className="font-medium text-slate-200 uppercase">
                Edit Key: {editingLicense.key}
              </span>
              <button
                onClick={() => setEditingLicense(null)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-4 space-y-3 font-mono text-xs">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Target Application Scope</label>
                <select
                  value={editAppId}
                  onChange={(e) => setEditAppId(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:outline-none"
                >
                  <option value="global">Global (All Applications)</option>
                  {apps.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.display_name} ({a.app_slug})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e: any) => setEditStatus(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:outline-none"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="expired">Expired</option>
                  <option value="revoked">Revoked</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Tier</label>
                  <select
                    value={editTier}
                    onChange={(e) => setEditTier(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:outline-none"
                  >
                    <option value="Standard">Standard</option>
                    <option value="Pro">Pro</option>
                    <option value="Enterprise">Enterprise</option>
                    <option value="VIP">VIP</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Device Limit</label>
                  <select
                    value={editLimit}
                    onChange={(e) => setEditLimit(Number(e.target.value))}
                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:outline-none"
                  >
                    <option value={1}>1 Device</option>
                    <option value={2}>2 Devices</option>
                    <option value={3}>3 Devices</option>
                    <option value={5}>5 Devices</option>
                    <option value={10}>10 Devices</option>
                    <option value={-1}>Unlimited (-1)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Notes</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingLicense(null)}
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-3 py-1.5 rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 font-medium disabled:opacity-50 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
