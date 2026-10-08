import React, { useState, useEffect } from 'react';
import { ShieldCheck, Play, RotateCw, Loader2 } from 'lucide-react';
import { api } from '../services/apiClient';
import { AppItem } from '../types';

export const SimulatorTab: React.FC = () => {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [selectedAppName, setSelectedAppName] = useState<string>('');
  const [appVersion, setAppVersion] = useState<string>('1.0.0');
  const [licenseKey, setLicenseKey] = useState('');
  const [hwid, setHwid] = useState('HWID-9F82-BCA1-48C7');
  const [deviceName, setDeviceName] = useState('DESKTOP-TEST-01');
  const [osInfo, setOsInfo] = useState('Windows 11 Pro 64-bit');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);

  useEffect(() => {
    api.getApps().then((res) => {
      const appList = res?.apps || (Array.isArray(res) ? (res as any) : []);
      const validApps = Array.isArray(appList) ? appList : [];
      setApps(validApps);
      if (validApps.length > 0) {
        setSelectedAppName(validApps[0].app_slug);
        setAppVersion(validApps[0].min_version || '1.0.0');
      }
    }).catch(() => {});
  }, []);

  const generateRandomHwid = () => {
    const chars = '0123456789ABCDEF';
    let hex = '';
    for (let i = 0; i < 32; i++) {
      hex += chars[Math.floor(Math.random() * chars.length)];
    }
    setHwid(`HWID-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`);
  };

  const handleTestValidation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey) return;
    setLoading(true);
    setResponse(null);

    try {
      const res = await api.validateLicense({
        license_key: licenseKey.trim(),
        hwid: hwid.trim(),
        app_name: selectedAppName || undefined,
        app_version: appVersion.trim() || undefined,
        device_name: deviceName.trim(),
        os_info: osInfo.trim(),
      });
      setResponse(res);
    } catch (err: any) {
      setResponse({ status: 500, ok: false, data: { error: err.message } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 font-mono text-xs max-w-4xl">
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-300 uppercase tracking-wider">
          Client Validation & Signature Simulator
        </span>
        <button
          type="button"
          onClick={generateRandomHwid}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RotateCw className="w-3 h-3" />
          Random HWID
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Request Form */}
        <form onSubmit={handleTestValidation} className="p-3.5 rounded bg-slate-900/40 border border-slate-800 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Target App</label>
              <select
                value={selectedAppName}
                onChange={(e) => {
                  setSelectedAppName(e.target.value);
                  const found = apps.find((a) => a.app_slug === e.target.value);
                  if (found) setAppVersion(found.min_version);
                }}
                className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none"
              >
                <option value="">None (Generic)</option>
                {apps.map((app) => (
                  <option key={app.id} value={app.app_slug}>
                    {app.display_name} ({app.app_slug})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Client App Version</label>
              <input
                type="text"
                value={appVersion}
                onChange={(e) => setAppVersion(e.target.value)}
                placeholder="1.0.0"
                className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">License Key</label>
            <input
              type="text"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
              placeholder="e.g. VCON-ABCD-EFGH-IJKL"
              className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Client HWID (Hardware Fingerprint)</label>
            <input
              type="text"
              value={hwid}
              onChange={(e) => setHwid(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-indigo-500/80 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Device Name</label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">OS Info</label>
              <input
                type="text"
                value={osInfo}
                onChange={(e) => setOsInfo(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !licenseKey}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 font-medium disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              Execute Client Validation Request
            </button>
          </div>
        </form>

        {/* Response Panel */}
        <div className="p-3.5 rounded bg-slate-900/40 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-2">
              <span className="text-[10px] uppercase text-slate-400 font-medium">Server Output</span>
              {response && (
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${
                    response.ok
                      ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/40'
                      : 'bg-rose-950/30 text-rose-400 border border-rose-900/40'
                  }`}
                >
                  HTTP {response.status}
                </span>
              )}
            </div>

            {response ? (
              <div className="space-y-2">
                {response.ok && response.data?.signature && (
                  <div className="p-2 rounded bg-emerald-950/20 border border-emerald-900/40 flex items-center gap-1.5 text-emerald-400 text-[11px]">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Cryptographic Ed25519 Signature Verified ({response.data.app_name || 'Global'})</span>
                  </div>
                )}

                <textarea
                  readOnly
                  rows={9}
                  value={JSON.stringify(response.data, null, 2)}
                  className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-300 text-[11px] select-all font-mono focus:outline-none"
                />
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-[11px]">
                Enter a license key and click Execute to test.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
