import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Lock,
  Key,
  Laptop,
  Clock,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  User,
  Activity,
  ArrowRight,
  ExternalLink,
  Smartphone,
  Cpu,
  SlidersHorizontal,
  Eye,
  EyeOff,
  Megaphone,
  Mail,
  Send,
  MessageSquare,
} from 'lucide-react';
import { api } from '../services/apiClient';
import { SiteSettings, DEFAULT_SITE_SETTINGS } from '../types';

interface QuickCheckResult {
  status: string;
  device_limit: number;
  active_device_count: number;
}

interface AnalysisData {
  license: {
    id: string;
    key: string;
    status: string;
    tier: string;
    app_name: string;
    device_limit: number;
    validity_type: string;
    validity_value: number;
    created_at: number;
    activated_at: number | null;
    expires_at: number | null;
    customer_name?: string | null;
    customer_email?: string | null;
    bound_devices_count: number;
  };
  devices: Array<{
    id: string;
    hwid: string;
    device_name?: string;
    os_info?: string;
    ip_address?: string;
    first_bound_at: number;
    last_ping_at: number;
    status: string;
  }>;
}

export const LandingPage: React.FC = () => {
  // Check License State
  const [checkKey, setCheckKey] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<QuickCheckResult | null>(null);
  const [checkError, setCheckError] = useState('');

  // Control Form State
  const [showControlForm, setShowControlForm] = useState(false);
  const [controlKey, setControlKey] = useState('');
  const [controlPin, setControlPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [openingControl, setOpeningControl] = useState(false);
  const [controlError, setControlError] = useState('');

  // Analysis Page State
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');

  // Site Settings State (Controlled from Admin Site Settings)
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);

  useEffect(() => {
    api.getPublicSiteSettings().then((res) => {
      if (res && res.siteName) {
        setSiteSettings(res);
      }
    }).catch(() => {
      // keep fallback
    });
  }, []);

  useEffect(() => {
    if (siteSettings.siteTitle) {
      document.title = siteSettings.siteTitle;
    }
    if (siteSettings.metaDescription) {
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', siteSettings.metaDescription);
    }
    if (siteSettings.faviconUrl) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = siteSettings.faviconUrl;
    }
  }, [siteSettings]);

  // 1. Quick Check Handler (Shows ONLY: status, device limit, active device count)
  const handleQuickCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkKey.trim()) return;

    setChecking(true);
    setCheckResult(null);
    setCheckError('');

    try {
      const res = await api.checkUserLicense(checkKey.trim());
      setCheckResult(res);
      // Pre-fill control key for user convenience
      setControlKey(checkKey.trim().toUpperCase());
    } catch (err: any) {
      setCheckError(err.message || 'License key not found or invalid.');
    } finally {
      setChecking(false);
    }
  };

  // 2. Control Open Handler (Requires License Key & 4-digit PIN)
  const handleOpenControl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!controlKey.trim() || !controlPin.trim()) return;

    setOpeningControl(true);
    setControlError('');
    setResetSuccessMessage('');

    try {
      const res = await api.openUserControl(controlKey.trim(), controlPin.trim());
      setAnalysis(res);
    } catch (err: any) {
      setControlError(err.message || 'Incorrect License Key or PIN.');
    } finally {
      setOpeningControl(false);
    }
  };

  // 3. User Self-Service Device Reset Handler
  const handleResetDevices = async () => {
    if (!analysis) return;
    if (
      !confirm(
        'Are you sure you want to reset all devices?\n\nThis will instantly disconnect all logged-in machines, allowing you to activate fresh on a new device.'
      )
    ) {
      return;
    }

    setResetting(true);
    setResetSuccessMessage('');
    try {
      const res = await api.resetUserControl(controlKey.trim(), controlPin.trim());
      setResetSuccessMessage(res.message || 'All devices reset successfully!');

      // Refresh analysis state
      setAnalysis((prev) =>
        prev
          ? {
              ...prev,
              license: {
                ...prev.license,
                bound_devices_count: 0,
              },
              devices: [],
            }
          : null
      );

      // Also update quick check result if checked
      if (checkResult) {
        setCheckResult((prev) => (prev ? { ...prev, active_device_count: 0 } : null));
      }
    } catch (err: any) {
      alert(err.message || 'Failed to reset devices.');
    } finally {
      setResetting(false);
    }
  };

  // Format Helper for Usage & Validity Time
  const formatTimeDetails = (license: AnalysisData['license']) => {
    const now = Date.now();
    const createdDate = new Date(license.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Time used calculation
    const startTime = license.activated_at || license.created_at;
    const elapsedMs = Math.max(0, now - startTime);
    const elapsedHours = Math.floor(elapsedMs / (3600 * 1000));
    const elapsedDays = Math.floor(elapsedHours / 24);
    const timeUsedStr = elapsedDays > 0 ? `${elapsedDays}d ${elapsedHours % 24}h` : `${elapsedHours}h`;

    // Remaining time calculation
    let validityTotalStr = 'Lifetime';
    let remainingStr = 'Unlimited';

    if (license.validity_type === 'hourly') {
      validityTotalStr = `${license.validity_value} Hours`;
      if (license.expires_at) {
        const diff = license.expires_at - now;
        if (diff <= 0) {
          remainingStr = 'Expired';
        } else {
          const remHours = Math.floor(diff / (3600 * 1000));
          remainingStr = `${remHours}h`;
        }
      } else {
        remainingStr = `${license.validity_value}h (Not activated yet)`;
      }
    } else if (license.validity_type === 'daily') {
      validityTotalStr = `${license.validity_value} Days`;
      if (license.expires_at) {
        const diff = license.expires_at - now;
        if (diff <= 0) {
          remainingStr = 'Expired';
        } else {
          const remHours = Math.floor(diff / (3600 * 1000));
          const remDays = Math.floor(remHours / 24);
          remainingStr = remDays > 0 ? `${remDays}d ${remHours % 24}h` : `${remHours}h`;
        }
      } else {
        remainingStr = `${license.validity_value} Days`;
      }
    }

    return { createdDate, timeUsedStr, validityTotalStr, remainingStr };
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-mono text-xs selection:bg-indigo-600/30">
      {/* 1. Header: Logo, SiteName & Buy License CTA Button */}
      <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo & Site Name */}
          <div className="flex items-center gap-2.5">
            {siteSettings.logoUrl ? (
              <img
                src={siteSettings.logoUrl}
                alt={siteSettings.siteName || 'Logo'}
                className="w-7 h-7 object-contain rounded-lg border border-slate-800 bg-slate-900"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
            )}
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-wide text-slate-100">
                {siteSettings.siteName || 'LicenX'}
              </span>
              {siteSettings.siteTagline && (
                <span className="text-[9px] text-slate-500 -mt-0.5 max-w-[200px] sm:max-w-xs truncate hidden sm:block">
                  {siteSettings.siteTagline}
                </span>
              )}
            </div>
          </div>

          {/* Right Side: Buy License CTA Button */}
          <a
            href={siteSettings.buyLicenseUrl || '#'}
            target={siteSettings.buyLicenseUrl && siteSettings.buyLicenseUrl !== '#' ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-xs transition-colors shadow-sm"
          >
            <span>Buy License</span>
            <ExternalLink className="w-3 h-3 opacity-80" />
          </a>
        </div>
      </header>

      {/* Announcement / Notice Banner */}
      {siteSettings.noticeBannerEnabled && siteSettings.noticeBanner && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-300 py-2 px-4 text-xs">
          <div className="max-w-2xl mx-auto flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-medium text-[11px] leading-tight">{siteSettings.noticeBanner}</span>
          </div>
        </div>
      )}

      {/* Main Content Area - Mobile-Friendly First, Compact & Clean */}
      <main className="max-w-md w-full mx-auto px-4 py-8 flex-1 flex flex-col justify-center space-y-4">
        {/* If user is inside the Analysis / Self-Service View */}
        {analysis ? (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Top Bar with Back action */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-100 text-xs uppercase tracking-wide">
                  License Control Panel
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                    analysis.license.status === 'active'
                      ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50'
                      : 'bg-rose-950/40 text-rose-400 border border-rose-900/50'
                  }`}
                >
                  {analysis.license.status}
                </span>
              </div>
              <button
                onClick={() => {
                  setAnalysis(null);
                  setResetSuccessMessage('');
                }}
                className="text-[11px] text-slate-400 hover:text-slate-200 underline transition-colors"
              >
                Exit Control
              </button>
            </div>

            {/* Reset Success Alert */}
            {resetSuccessMessage && (
              <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-900/50 flex items-center gap-2 text-emerald-300 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{resetSuccessMessage}</span>
              </div>
            )}

            {/* License Overview & Validity Stats */}
            {(() => {
              const times = formatTimeDetails(analysis.license);
              return (
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block mb-1">License Key</span>
                    <div className="font-mono text-slate-100 font-bold tracking-wider select-all text-xs bg-slate-950 p-2 rounded border border-slate-850">
                      {analysis.license.key}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-slate-950/70 p-2 rounded border border-slate-850">
                      <span className="text-[10px] text-slate-500 block">Created On</span>
                      <span className="text-slate-200 font-medium">{times.createdDate}</span>
                    </div>

                    <div className="bg-slate-950/70 p-2 rounded border border-slate-850">
                      <span className="text-[10px] text-slate-500 block">App & Tier</span>
                      <span className="text-slate-200 font-medium">
                        {analysis.license.app_name} ({analysis.license.tier})
                      </span>
                    </div>

                    <div className="bg-slate-950/70 p-2 rounded border border-slate-850">
                      <span className="text-[10px] text-slate-500 block">Time Used</span>
                      <span className="text-amber-400/90 font-medium">{times.timeUsedStr} used</span>
                    </div>

                    <div className="bg-slate-950/70 p-2 rounded border border-slate-850">
                      <span className="text-[10px] text-slate-500 block">Valid Remaining</span>
                      <span className="text-indigo-300 font-medium">{times.remainingStr}</span>
                    </div>
                  </div>

                  {analysis.license.customer_name && (
                    <div className="pt-1 text-[11px] text-slate-400 border-t border-slate-800/80">
                      <span className="text-slate-500">Registered to:</span>{' '}
                      <span className="text-slate-300">{analysis.license.customer_name}</span>
                      {analysis.license.customer_email && (
                        <span className="text-slate-500"> ({analysis.license.customer_email})</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Connected Devices List */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/80">
                <span className="font-semibold text-slate-200 text-xs">
                  Active Connected Devices
                </span>
                <span className="text-[11px] text-indigo-400 font-medium">
                  {analysis.devices.length} /{' '}
                  {analysis.license.device_limit === -1 ? '∞' : analysis.license.device_limit}
                </span>
              </div>

              {analysis.devices.length === 0 ? (
                <div className="py-4 text-center text-slate-500 text-xs">
                  No devices currently bound. License is fresh and ready for new device login.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {analysis.devices.map((dev, idx) => (
                    <div
                      key={dev.id || idx}
                      className="p-2.5 rounded-lg bg-slate-950 border border-slate-850 space-y-1 text-[11px]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-slate-200 font-medium">
                          <Laptop className="w-3.5 h-3.5 text-slate-400" />
                          <span>{dev.device_name || 'Machine ' + (idx + 1)}</span>
                        </div>
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Logged In
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-400 flex items-center justify-between">
                        <span>{dev.os_info || 'Client OS'}</span>
                        <span className="text-slate-500 font-mono">
                          HWID: {dev.hwid.slice(0, 14)}...
                        </span>
                      </div>

                      <div className="text-[9px] text-slate-500">
                        First bound: {new Date(dev.first_bound_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* MAIN FOCUSED "RESET" CTA BUTTON */}
            <div className="pt-1">
              <button
                onClick={handleResetDevices}
                disabled={resetting || analysis.devices.length === 0}
                className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-bold text-xs tracking-wide transition-all shadow-lg shadow-rose-950/40 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resetting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                <span>Reset All Devices & Force Logout</span>
              </button>
              <p className="text-[10px] text-slate-500 text-center mt-1.5 leading-relaxed">
                Disconnects all bound machines so you can immediately login on another device.
              </p>
            </div>
          </div>
        ) : (
          /* Default Public View: Check License Box & Control Button */
          <div className="space-y-4">
            {/* 1. "Check License" Box */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-3.5">
              <div className="flex items-center gap-2 pb-1 border-b border-slate-800/80">
                <Search className="w-4 h-4 text-indigo-400" />
                <span className="font-semibold text-slate-100 text-xs uppercase tracking-wide">
                  Check License
                </span>
              </div>

              <form onSubmit={handleQuickCheck} className="space-y-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1 font-medium">
                    Enter License Key
                  </label>
                  <input
                    type="text"
                    value={checkKey}
                    onChange={(e) => setCheckKey(e.target.value.toUpperCase())}
                    placeholder="VCON-XXXX-XXXX-XXXX"
                    required
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none text-xs tracking-wider"
                  />
                </div>

                <button
                  type="submit"
                  disabled={checking || !checkKey.trim()}
                  className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>Check License</span>
                </button>
              </form>

              {/* Error Message */}
              {checkError && (
                <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-900/50 flex items-center gap-2 text-rose-300 text-xs">
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{checkError}</span>
                </div>
              )}

              {/* Check Result: Shows ONLY 3 INFO: Status, Device Limit, Active Device Count */}
              {checkResult && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 animate-in fade-in duration-150">
                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                    License Status Overview
                  </span>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    {/* 1. Status */}
                    <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-850">
                      <span className="text-[10px] text-slate-500 block mb-0.5">Status</span>
                      <span
                        className={`text-xs font-bold uppercase ${
                          checkResult.status === 'active'
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {checkResult.status}
                      </span>
                    </div>

                    {/* 2. Device Limit */}
                    <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-850">
                      <span className="text-[10px] text-slate-500 block mb-0.5">Device Limit</span>
                      <span className="text-xs font-bold text-slate-200">
                        {checkResult.device_limit === -1 ? 'Unlimited' : `${checkResult.device_limit}`}
                      </span>
                    </div>

                    {/* 3. Active Device Count */}
                    <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-850">
                      <span className="text-[10px] text-slate-500 block mb-0.5">Active Devices</span>
                      <span className="text-xs font-bold text-indigo-400">
                        {checkResult.active_device_count}
                      </span>
                    </div>
                  </div>

                  {/* Quick link into Control from Check Result */}
                  <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Need to reset devices or view details?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowControlForm(true);
                        setControlKey(checkKey.trim().toUpperCase());
                        setControlError('');
                      }}
                      className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>Open Control</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. "Control" Prominent, User-Friendly CTA Button below Check License */}
            <div className="space-y-2.5 pt-1">
              {/* Genuine, Prominent Action CTA Button */}
              <button
                type="button"
                onClick={() => {
                  const next = !showControlForm;
                  setShowControlForm(next);
                  setControlError('');
                  if (next && checkKey && !controlKey) {
                    setControlKey(checkKey.trim().toUpperCase());
                  }
                }}
                className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm tracking-wide transition-all duration-200 flex items-center justify-between shadow-lg cursor-pointer active:scale-[0.98] ${
                  showControlForm
                    ? 'bg-slate-800 hover:bg-slate-700 text-indigo-300 border-2 border-indigo-500/60 shadow-slate-950/60'
                    : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:from-indigo-500 hover:to-indigo-400 active:bg-indigo-700 text-white border border-indigo-400/40 shadow-indigo-600/30 hover:shadow-indigo-500/40 hover:-translate-y-0.5'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-black/25 flex items-center justify-center shrink-0">
                    <SlidersHorizontal className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-extrabold uppercase tracking-wider">
                    {showControlForm ? 'Close Control' : 'Control'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] px-2.5 py-1 rounded-lg bg-black/25 text-indigo-100 font-medium hidden sm:inline-flex items-center gap-1">
                    <Lock className="w-3 h-3 text-indigo-300" />
                    <span>Reset & Analysis</span>
                  </span>
                  <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center shrink-0 text-white">
                    {showControlForm ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </div>
              </button>

              <p className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5 px-2">
                <span>Click</span>
                <strong className="text-indigo-400 font-semibold">Control</strong>
                <span>to enter PIN, reset bound devices & view full stats.</span>
              </p>

              {/* Control Form with 2 fields: License Key & PIN */}
              {showControlForm && (
                <div className="p-4 rounded-2xl bg-slate-900/90 border border-indigo-500/40 shadow-2xl space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-1.5 text-slate-200">
                      <Lock className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="font-bold text-xs tracking-wide">
                        Security PIN Verification
                      </span>
                    </div>
                    <span className="text-[10px] text-indigo-400/90 font-medium">4-Digit Security Access</span>
                  </div>

                  {controlError && (
                    <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-900/50 flex items-center gap-2 text-rose-300 text-xs">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{controlError}</span>
                    </div>
                  )}

                  <form onSubmit={handleOpenControl} className="space-y-3">
                    {/* Field 1: License Key */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] text-slate-400 font-medium">
                          License Key
                        </label>
                        {checkKey && controlKey !== checkKey && (
                          <button
                            type="button"
                            onClick={() => setControlKey(checkKey.trim().toUpperCase())}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 underline"
                          >
                            Use checked key
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={controlKey}
                        onChange={(e) => setControlKey(e.target.value.toUpperCase())}
                        placeholder="VCON-XXXX-XXXX-XXXX"
                        required
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none text-xs tracking-wider font-mono"
                      />
                    </div>

                    {/* Field 2: 4-digit PIN */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] text-slate-400 font-medium">
                          4-Digit Security PIN
                        </label>
                        <span className="text-[10px] text-slate-500">From creation receipt</span>
                      </div>
                      <div className="relative">
                        <input
                          type={showPin ? 'text' : 'password'}
                          maxLength={4}
                          value={controlPin}
                          onChange={(e) => setControlPin(e.target.value.replace(/\D/g, ''))}
                          placeholder="••••"
                          required
                          className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none text-xs tracking-widest text-center text-sm font-bold font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPin(!showPin)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer transition-colors"
                          tabIndex={-1}
                          title={showPin ? 'Hide PIN' : 'Show PIN'}
                        >
                          {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* "Open" Button */}
                    <button
                      type="submit"
                      disabled={openingControl || !controlKey.trim() || controlPin.length !== 4}
                      className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 active:scale-[0.99] text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/40 disabled:opacity-50 cursor-pointer border border-indigo-400/30"
                    >
                      {openingControl ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5" />
                      )}
                      <span>Open</span>
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer - Dynamic from Site Settings */}
      <footer className="border-t border-slate-900/90 py-5 px-4 text-center text-slate-500 text-[11px] space-y-2.5">
        <div className="flex flex-wrap items-center justify-center gap-4 text-slate-400">
          {siteSettings.supportEmail && (
            <a
              href={`mailto:${siteSettings.supportEmail}`}
              className="hover:text-indigo-400 transition-colors flex items-center gap-1 text-[11px]"
            >
              <Mail className="w-3 h-3 text-slate-400" />
              <span>{siteSettings.supportEmail}</span>
            </a>
          )}
          {siteSettings.telegramUrl && (
            <a
              href={siteSettings.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-sky-400 transition-colors flex items-center gap-1 text-[11px]"
            >
              <Send className="w-3 h-3 text-sky-400" />
              <span>Telegram</span>
            </a>
          )}
          {siteSettings.discordUrl && (
            <a
              href={siteSettings.discordUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-indigo-400 transition-colors flex items-center gap-1 text-[11px]"
            >
              <MessageSquare className="w-3 h-3 text-indigo-400" />
              <span>Discord</span>
            </a>
          )}
          {siteSettings.docsUrl && (
            <a
              href={siteSettings.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-300 transition-colors flex items-center gap-1 text-[11px]"
            >
              <span>Documentation</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-70" />
            </a>
          )}
        </div>
        <p className="text-[10px] text-slate-600">
          {siteSettings.footerText || `© ${new Date().getFullYear()} ${siteSettings.siteName || 'LicenX'} Open-Source Licensing Engine.`}
        </p>
      </footer>
    </div>
  );
};
