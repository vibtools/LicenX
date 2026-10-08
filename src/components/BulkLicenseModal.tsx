import React, { useState, useEffect } from 'react';
import { X, Layers, Download, Cloud, Loader2, CheckCircle2, Copy, Check, ShieldCheck } from 'lucide-react';
import { api } from '../services/apiClient';
import { AppItem } from '../types';

interface BulkLicenseModalProps {
  r2Configured: boolean;
  onClose: () => void;
  onCompleted: () => void;
}

export const BulkLicenseModal: React.FC<BulkLicenseModalProps> = ({
  r2Configured,
  onClose,
  onCompleted,
}) => {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('global');
  const [count, setCount] = useState<number>(50);
  const [prefix, setPrefix] = useState('VCON');
  const [tier, setTier] = useState('Standard');
  const [deviceLimit, setDeviceLimit] = useState<number>(1);
  const [validityType, setValidityType] = useState<'hourly' | 'daily' | 'lifetime'>('daily');
  const [validityValue, setValidityValue] = useState<number>(30);
  const [notes, setNotes] = useState('Bulk Batch');
  const [backupToR2, setBackupToR2] = useState<boolean>(r2Configured);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ count: number; pin: string; keys: string[]; csv: string; r2Backup: any } | null>(
    null
  );
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);

  useEffect(() => {
    api.getApps().then((res) => {
      setApps(res.apps);
    }).catch(() => {});
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.bulkCreateLicenses({
        count: Number(count),
        prefix: prefix.trim(),
        tier,
        app_id: selectedAppId === 'global' ? null : (selectedAppId || null),
        device_limit: Number(deviceLimit),
        validity_type: validityType,
        validity_value: Number(validityValue),
        notes: notes.trim(),
        backupToR2: backupToR2 && r2Configured,
      });

      setResult(res);
      onCompleted();
    } catch (err: any) {
      setError(err.message || 'Bulk generation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!result?.csv) return;
    const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `vcon_bulk_licenses_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getBulkCopyText = () => {
    if (!result) return '';
    return result.keys.map((k) => `${k} PIN: ${result.pin}`).join('\n');
  };

  const handleCopyAll = () => {
    const text = getBulkCopyText();
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleCopyPinOnly = () => {
    if (!result?.pin) return;
    navigator.clipboard.writeText(result.pin);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-xs font-sans text-xs">
      <div className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-lg shadow-xl overflow-hidden font-sans">
        {/* Header */}
        <div className="p-3.5 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-400" />
            <span className="font-semibold text-slate-200 text-xs tracking-normal">
              {result ? 'Batch Licenses Created' : 'Bulk License Generator'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-850 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* View 1: Success Results View (Popup stays open) */}
        {result ? (
          <div className="p-4 space-y-3.5 font-sans">
            <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-900/50 flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-semibold text-xs text-emerald-300">
                Generated {result.count} Licenses Successfully
              </span>
            </div>

            {/* Batch PIN Card */}
            <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-800/50 flex items-center justify-between font-sans">
              <div>
                <span className="text-xs text-indigo-300/90 uppercase font-medium block">
                  Batch Security PIN
                </span>
                <span className="text-base font-semibold text-slate-200 tracking-widest font-mono">
                  {result.pin}
                </span>
              </div>
              <button
                onClick={handleCopyPinOnly}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-indigo-600/80 hover:bg-indigo-600 text-slate-100 transition-colors"
              >
                {copiedPin ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                <span>{copiedPin ? 'Copied' : 'Copy PIN'}</span>
              </button>
            </div>

            {result.r2Backup && (
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-center justify-between font-sans">
                <span className="flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5 text-slate-400" />
                  Backed up to Cloudflare R2
                </span>
                {result.r2Backup.url && (
                  <a
                    href={result.r2Backup.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-300 underline hover:text-slate-100"
                  >
                    Download from R2
                  </a>
                )}
              </div>
            )}

            {/* Generated Keys & PIN List Preview */}
            <div className="space-y-1 font-sans">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400 block">
                  Generated Licenses & Security PINs ({result.count} items)
                </label>
                <span className="text-xs text-slate-500">Format: Key PIN: 4-digit</span>
              </div>
              <textarea
                readOnly
                rows={7}
                value={getBulkCopyText()}
                className="w-full p-2.5 text-xs bg-slate-950 border border-slate-800 rounded font-mono text-slate-200 select-all focus:outline-none leading-relaxed"
              />
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 flex items-center justify-between gap-2 font-sans">
              <button
                onClick={handleDownloadCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 font-medium transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span>Export CSV (with PIN)</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 font-medium transition-colors"
                >
                  Close
                </button>

                {/* Copy All Button */}
                <button
                  onClick={handleCopyAll}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 font-medium transition-colors shadow-sm"
                >
                  {copiedAll ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Copied All ({result.count})!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy All (Keys & PIN)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* View 2: Generation Form */
          <form onSubmit={handleGenerate} className="p-4 space-y-3.5 font-sans">
            {error && (
              <div className="p-2 text-xs text-rose-400 bg-rose-950/30 border border-rose-900/40 rounded">
                {error}
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Target Application Scope</label>
              <select
                value={selectedAppId}
                onChange={(e) => setSelectedAppId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 font-sans focus:outline-none"
              >
                <option value="global">Global (All Applications)</option>
                {apps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.display_name} ({app.app_slug})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Quantity</label>
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Prefix</label>
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                  placeholder="VCON"
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Tier</label>
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:outline-none"
                >
                  <option value="Standard">Standard</option>
                  <option value="Pro">Pro</option>
                  <option value="Enterprise">Enterprise</option>
                  <option value="VIP">VIP</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Hardware Limit (HWID)</label>
                <select
                  value={deviceLimit}
                  onChange={(e) => setDeviceLimit(Number(e.target.value))}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:outline-none"
                >
                  <option value={1}>1 Machine</option>
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
                <label className="text-[10px] text-slate-400 block mb-1">Validity Model</label>
                <select
                  value={validityType}
                  onChange={(e: any) => setValidityType(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:outline-none"
                >
                  <option value="daily">Daily Expiry (e.g. 30 days)</option>
                  <option value="hourly">Hourly Clock (e.g. 24h)</option>
                  <option value="lifetime">Lifetime Unlimited</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Duration Units</label>
                <input
                  type="number"
                  disabled={validityType === 'lifetime'}
                  value={validityValue}
                  onChange={(e) => setValidityValue(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 disabled:opacity-40 focus:border-indigo-500/80 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Batch Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:outline-none"
              />
            </div>

            {r2Configured && (
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={backupToR2}
                    onChange={(e) => setBackupToR2(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span className="text-[11px] text-slate-300">
                    Auto-upload generated CSV to Cloudflare R2 Storage
                  </span>
                </label>
              </div>
            )}

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
                className="flex items-center gap-1.5 px-3 py-1.5 font-medium rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                <span>Generate Batch</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
