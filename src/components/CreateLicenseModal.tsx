import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Plus,
  Loader2,
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
  AppWindow,
  RotateCcw,
} from 'lucide-react';
import { api } from '../services/apiClient';
import { License, AppItem } from '../types';

interface CreateLicenseModalProps {
  onClose: () => void;
  onCreated: (license: License) => void;
}

export const CreateLicenseModal: React.FC<CreateLicenseModalProps> = ({ onClose, onCreated }) => {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [prefix, setPrefix] = useState('VCON');
  const [customKey, setCustomKey] = useState('');
  const [tier, setTier] = useState('Standard');
  const [deviceLimit, setDeviceLimit] = useState<number>(1);
  const [validityType, setValidityType] = useState<'hourly' | 'daily' | 'lifetime'>('daily');
  const [validityValue, setValidityValue] = useState<number>(30);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Result state after creation - popup does NOT close
  const [createdLicense, setCreatedLicense] = useState<License | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getApps().then((res) => {
      const appList = res?.apps || (Array.isArray(res) ? (res as any) : []);
      const validApps = Array.isArray(appList) ? appList : [];
      setApps(validApps);
      if (validApps.length > 0) {
        setSelectedAppId(validApps[0].id);
      }
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.createLicense({
        key: customKey.trim() || undefined,
        prefix: prefix.trim(),
        tier,
        app_id: selectedAppId === 'global' ? null : (selectedAppId || null),
        device_limit: Number(deviceLimit),
        validity_type: validityType,
        validity_value: Number(validityValue),
        customer_name: customerName.trim() || null,
        customer_email: customerEmail.trim() || null,
        notes: notes.trim() || null,
      });

      setCreatedLicense(res.license);
      onCreated(res.license);
    } catch (err: any) {
      setError(err.message || 'Failed to generate license');
    } finally {
      setLoading(false);
    }
  };

  const getCopyText = (lic: License) => {
    if (lic.pin) {
      return `${lic.key} PIN: ${lic.pin}`;
    }
    return lic.key;
  };

  const handleCopy = () => {
    if (!createdLicense) return;
    const text = getCopyText(createdLicense);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleResetForAnother = () => {
    setCreatedLicense(null);
    setCustomKey('');
    setNotes('');
    setCustomerName('');
    setCustomerEmail('');
    setCopied(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-xs font-sans text-xs">
      <div className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-lg shadow-xl overflow-hidden font-sans">
        {/* Header */}
        <div className="p-3.5 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-slate-400" />
            <span className="font-semibold text-slate-200 text-xs tracking-normal">
              {createdLicense ? 'License Created Successfully' : 'Issue License Key'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-850 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* View 1: License Created Success Details (Modal stays open) */}
        {createdLicense ? (
          <div className="p-4 space-y-4 font-sans">
            <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-900/50 flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-semibold text-xs text-emerald-300">License Generated Successfully</span>
            </div>

            {/* License Key & PIN Card */}
            <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-3 font-sans">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <span className="text-xs uppercase font-medium text-slate-400">License Credentials</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 text-[10px] font-semibold">
                  ACTIVE
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <span className="text-xs text-slate-400 block font-normal">License Key</span>
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800 font-mono text-slate-200 font-medium tracking-wider select-all text-sm">
                    {createdLicense.key}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-xs text-indigo-300/90 block font-medium uppercase">Security PIN</span>
                  <div className="p-2.5 rounded bg-indigo-950/30 border border-indigo-700/50 font-mono text-indigo-300 font-semibold text-center tracking-widest text-sm select-all">
                    {createdLicense.pin || 'N/A'}
                  </div>
                </div>
              </div>

              {/* Combined Format Preview */}
              <div className="pt-1">
                <span className="text-xs text-slate-400 block mb-1">Clipboard Copy Format:</span>
                <div className="p-2 rounded bg-slate-950/80 border border-slate-850 text-slate-300 text-xs font-mono select-all break-all">
                  {getCopyText(createdLicense)}
                </div>
              </div>

              {/* Meta details */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-xs text-slate-400 border-t border-slate-800/60 font-sans">
                <div>
                  <span className="text-[10px] text-slate-500 block">Tier</span>
                  <span className="text-slate-300 font-medium">{createdLicense.tier}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Device Limit</span>
                  <span className="text-slate-300 font-medium">
                    {createdLicense.device_limit === -1 ? 'Unlimited' : `${createdLicense.device_limit} Device`}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Validity</span>
                  <span className="text-slate-300 font-medium">
                    {createdLicense.validity_type === 'lifetime'
                      ? 'Lifetime'
                      : `${createdLicense.validity_value} ${createdLicense.validity_type}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleResetForAnother}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Issue Another</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
                >
                  Done
                </button>

                {/* Main Copy Button: Copies License Key and PIN */}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 font-medium transition-colors shadow-sm"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Copied Key & PIN!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy License & PIN</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* View 2: License Creation Form */
          <form onSubmit={handleSubmit} className="p-4 space-y-3.5 font-sans">
            {error && (
              <div className="p-2 text-xs text-rose-400 bg-rose-950/30 border border-rose-900/40 rounded">
                {error}
              </div>
            )}

            {/* Target Application Selector */}
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Target Application Scope</label>
              <select
                value={selectedAppId}
                onChange={(e) => setSelectedAppId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-sans focus:outline-none"
              >
                <option value="global">Global (All Registered Applications)</option>
                {apps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.display_name} ({app.app_slug})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Prefix</label>
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                  placeholder="VCON"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-mono text-xs focus:border-indigo-500/80 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Custom Key (Optional)</label>
                <input
                  type="text"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value.toUpperCase())}
                  placeholder="Auto-generated if empty"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-mono text-xs focus:border-indigo-500/80 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Tier</label>
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-sans focus:outline-none"
                >
                  <option value="Standard">Standard</option>
                  <option value="Pro">Pro</option>
                  <option value="Enterprise">Enterprise</option>
                  <option value="VIP">VIP</option>
                  <option value="Trial">Trial</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Hardware Limit (HWID)</label>
                <select
                  value={deviceLimit}
                  onChange={(e) => setDeviceLimit(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-sans focus:outline-none"
                >
                  <option value={1}>1 Machine (Single Device)</option>
                  <option value={2}>2 Machines</option>
                  <option value={3}>3 Machines</option>
                  <option value={5}>5 Machines</option>
                  <option value={10}>10 Machines</option>
                  <option value={-1}>Unlimited (-1)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Validity Model</label>
                <select
                  value={validityType}
                  onChange={(e: any) => setValidityType(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-sans focus:outline-none"
                >
                  <option value="daily">Daily Expiry (e.g. 30 days)</option>
                  <option value="hourly">Hourly Clock (e.g. 24h from first run)</option>
                  <option value="lifetime">Lifetime Unlimited</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Duration Units</label>
                <input
                  type="number"
                  disabled={validityType === 'lifetime'}
                  value={validityValue}
                  onChange={(e) => setValidityValue(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-sans disabled:opacity-40 focus:border-indigo-500/80 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-sans focus:border-indigo-500/80 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Customer Email</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-sans focus:border-indigo-500/80 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal tracking notes"
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-sans focus:outline-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 font-sans">
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
                className="flex items-center gap-1.5 px-3 py-1.5 font-medium rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Create License</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
