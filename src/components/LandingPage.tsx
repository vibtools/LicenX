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
  ArrowLeft,
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
  Copy,
  Check,
  Layers,
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
    app_slug?: string | null;
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
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');
  const [copiedLicenseKey, setCopiedLicenseKey] = useState(false);
  const [copiedHwid, setCopiedHwid] = useState<string | null>(null);

  const handleCopyLicenseKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedLicenseKey(true);
    setTimeout(() => setCopiedLicenseKey(false), 2000);
  };

  const handleCopyHwid = (hwid: string) => {
    navigator.clipboard.writeText(hwid);
    setCopiedHwid(hwid);
    setTimeout(() => setCopiedHwid(null), 1500);
  };

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
    if (!confirmReset) {
      setConfirmReset(true);
      setResetError('');
      return;
    }

    setResetting(true);
    setResetSuccessMessage('');
    setResetError('');
    try {
      const res = await api.resetUserControl(controlKey.trim(), controlPin.trim());
      setResetSuccessMessage(res.message || 'All devices reset successfully!');
      setConfirmReset(false);

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
      setResetError(err.message || 'Failed to reset devices.');
    } finally {
      setResetting(false);
    }
  };

  // Format Helper for Usage & Validity Time - 100% Real Accurate Logic
  const formatTimeDetails = (license: AnalysisData['license']) => {
    const now = Date.now();
    const createdDate = new Date(Number(license.created_at)).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    const isActivated = !!license.activated_at;
    const isExpired = license.status === 'expired' || (!!license.expires_at && now > Number(license.expires_at));
    const isRevoked = license.status === 'revoked';
    const isSuspended = license.status === 'suspended';

    // 1. Precise Time Used: ONLY counts if actually activated!
    let timeUsedStr = '0h (Unactivated)';
    let activatedDateStr = 'Pending Activation';

    if (license.activated_at) {
      const actTime = Number(license.activated_at);
      activatedDateStr = new Date(actTime).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

      // If expired, cap elapsed at expires_at so it doesn't inflate into the future
      const endTime = isExpired && license.expires_at ? Number(license.expires_at) : now;
      const elapsedMs = Math.max(0, endTime - actTime);
      const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));
      const elapsedHours = Math.floor(elapsedMs / (3600 * 1000));
      const elapsedDays = Math.floor(elapsedHours / 24);

      if (isExpired) {
        if (elapsedDays > 0) {
          timeUsedStr = `${elapsedDays}d ${elapsedHours % 24}h used (Expired)`;
        } else if (elapsedHours > 0) {
          timeUsedStr = `${elapsedHours}h ${elapsedMinutes % 60}m used (Expired)`;
        } else {
          timeUsedStr = `${Math.max(1, elapsedMinutes)}m used (Expired)`;
        }
      } else {
        if (elapsedDays > 0) {
          timeUsedStr = `${elapsedDays}d ${elapsedHours % 24}h used`;
        } else if (elapsedHours > 0) {
          timeUsedStr = `${elapsedHours}h ${elapsedMinutes % 60}m used`;
        } else {
          timeUsedStr = `${Math.max(1, elapsedMinutes)}m used`;
        }
      }
    }

    // 2. Remaining time calculation
    let validityTotalStr = 'Lifetime Access';
    let remainingStr = 'Unlimited';

    const val = Number(license.validity_value) || 0;
    const unitHourly = val === 1 ? 'Hour' : 'Hours';
    const unitDaily = val === 1 ? 'Day' : 'Days';

    if (isRevoked) {
      remainingStr = 'Revoked';
      validityTotalStr = 'Access Revoked';
    } else if (isSuspended) {
      remainingStr = 'Suspended';
      validityTotalStr = 'Temporarily Suspended';
    } else if (isExpired) {
      remainingStr = 'Expired';
      if (license.validity_type === 'hourly') {
        validityTotalStr = `${val} ${unitHourly} (Expired)`;
      } else if (license.validity_type === 'daily') {
        validityTotalStr = `${val} ${unitDaily} (Expired)`;
      } else {
        validityTotalStr = 'Expired';
      }
    } else if (license.validity_type === 'hourly') {
      validityTotalStr = `${val} ${unitHourly}`;
      if (license.expires_at) {
        const diff = Number(license.expires_at) - now;
        if (diff <= 0) {
          remainingStr = 'Expired';
        } else {
          const remHours = Math.floor(diff / (3600 * 1000));
          const remMinutes = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
          remainingStr = remHours > 0 ? `${remHours}h ${remMinutes}m` : `${remMinutes}m`;
        }
      } else {
        remainingStr = `${val} ${unitHourly} (Starts on Login)`;
      }
    } else if (license.validity_type === 'daily') {
      validityTotalStr = `${val} ${unitDaily}`;
      if (license.expires_at) {
        const diff = Number(license.expires_at) - now;
        if (diff <= 0) {
          remainingStr = 'Expired';
        } else {
          const remHours = Math.floor(diff / (3600 * 1000));
          const remDays = Math.floor(remHours / 24);
          remainingStr = remDays > 0 ? `${remDays}d ${remHours % 24}h` : `${remHours}h`;
        }
      } else {
        remainingStr = `${val} ${unitDaily} (Starts on Login)`;
      }
    }

    return {
      createdDate,
      activatedDateStr,
      isActivated,
      isExpired,
      timeUsedStr,
      validityTotalStr,
      remainingStr,
    };
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 flex flex-col font-mono text-xs selection:bg-indigo-600/20">
      {/* 1. Header: Logo, SiteName & Buy License CTA Button */}
      <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-3.5 h-12 flex items-center justify-between">
          {/* Logo & Site Name */}
          <div className="flex items-center gap-2">
            {siteSettings.logoUrl ? (
              <img
                src={siteSettings.logoUrl}
                alt={siteSettings.siteName || 'Logo'}
                className="w-6 h-6 object-contain rounded border border-slate-800 bg-slate-900"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-6 h-6 rounded bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400/90">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
            )}
            <span className="font-semibold text-xs tracking-wide text-slate-200">
              {siteSettings.siteName || 'LicenX'}
            </span>
          </div>

          {/* Right Side: Buy License CTA Button */}
          <a
            href={siteSettings.buyLicenseUrl || '#'}
            target={siteSettings.buyLicenseUrl && siteSettings.buyLicenseUrl !== '#' ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600/90 hover:bg-indigo-600 active:bg-indigo-700 text-slate-100 font-medium text-[11px] transition-colors shadow-sm"
          >
            <span>Buy License</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-80" />
          </a>
        </div>
      </header>

      {/* Announcement / Notice Banner */}
      {siteSettings.noticeBannerEnabled && siteSettings.noticeBanner && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-300/90 py-2 px-4 text-xs">
          <div className="max-w-2xl mx-auto flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-amber-400/80 shrink-0" />
            <span className="font-medium text-[11px] leading-tight">{siteSettings.noticeBanner}</span>
          </div>
        </div>
      )}

      {/* Main Content Area - Mobile-Friendly First, Compact & Clean */}
      <main
        className={`${
          analysis ? 'max-w-lg' : 'max-w-md'
        } w-full mx-auto px-3.5 py-6 flex-1 flex flex-col justify-center space-y-3 transition-all duration-200`}
      >
        {/* If user is inside the Analysis / Self-Service View */}
        {analysis ? (
          <div className="space-y-3 animate-in fade-in duration-200">
            {/* Top Bar with Back action */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400/90">
                  <ShieldCheck className="w-3 h-3" />
                </div>
                <span className="font-semibold text-slate-200 text-xs tracking-wide">
                  License Control Panel
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[9px] font-semibold uppercase tracking-wider flex items-center gap-1 ${
                    analysis.license.status === 'active' && !(analysis.license.expires_at && Date.now() > analysis.license.expires_at)
                      ? 'bg-emerald-950/40 text-emerald-400/90 border border-emerald-900/50'
                      : 'bg-rose-950/40 text-rose-400/90 border border-rose-900/50'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      analysis.license.status === 'active' && !(analysis.license.expires_at && Date.now() > analysis.license.expires_at)
                        ? 'bg-emerald-500/80'
                        : 'bg-rose-500/80'
                    }`}
                  />
                  {analysis.license.status === 'active' && analysis.license.expires_at && Date.now() > analysis.license.expires_at
                    ? 'expired'
                    : analysis.license.status}
                </span>
              </div>
              <button
                onClick={() => {
                  setAnalysis(null);
                  setResetSuccessMessage('');
                  setConfirmReset(false);
                  setResetError('');
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-850 border border-slate-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-2.5 h-2.5" />
                <span>Exit</span>
              </button>
            </div>

            {/* Reset Success Alert */}
            {resetSuccessMessage && (
              <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-900/40 flex items-center gap-2 text-emerald-300 text-[11px] animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/90 shrink-0" />
                <span className="font-medium">{resetSuccessMessage}</span>
              </div>
            )}

            {/* License Key & Registered Identity Card */}
            <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/90 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 flex items-center gap-1">
                  <Key className="w-3 h-3 text-indigo-400/90" />
                  <span>License Key</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyLicenseKey(analysis.license.key)}
                  className="flex items-center gap-1 text-[10px] font-medium text-indigo-400/90 hover:text-indigo-300 px-1.5 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors cursor-pointer"
                  title="Copy license key"
                >
                  {copiedLicenseKey ? (
                    <>
                      <Check className="w-2.5 h-2.5 text-emerald-400/90" />
                      <span className="text-emerald-400/90">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-2.5 h-2.5" />
                      <span>Copy Key</span>
                    </>
                  )}
                </button>
              </div>

              <div className="font-mono text-slate-200 font-semibold tracking-wider select-all text-xs bg-slate-950 px-2.5 py-1.5 rounded border border-slate-850">
                {analysis.license.key}
              </div>

              {analysis.license.customer_name && (
                <div className="pt-1 border-t border-slate-850/80 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <User className="w-3 h-3 text-slate-400" />
                    <span>Registered to:</span>
                  </span>
                  <div className="text-right truncate">
                    <span className="font-semibold text-slate-300">
                      {analysis.license.customer_name}
                    </span>
                    {analysis.license.customer_email && (
                      <span className="text-slate-400 text-[9px] ml-1">
                        ({analysis.license.customer_email})
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Smart Professional Info Cards Grid */}
            {(() => {
              const times = formatTimeDetails(analysis.license);
              return (
                <div className="grid grid-cols-2 gap-2">
                  {/* Card 1: Application & Plan */}
                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/90 flex flex-col justify-between space-y-1.5 hover:border-slate-700/80 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                        Application
                      </span>
                      <div className="w-4 h-4 rounded bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400/90">
                        <Layers className="w-2.5 h-2.5" />
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-200 truncate">
                        {analysis.license.app_name || 'All Applications'}
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <span className="text-[9px] font-semibold uppercase tracking-wider px-1 py-0.2 rounded bg-indigo-500/10 text-indigo-300/90 border border-indigo-500/20">
                          {analysis.license.tier} Plan
                        </span>
                        {analysis.license.app_slug && analysis.license.app_slug !== 'global' && analysis.license.app_slug !== 'all' ? (
                          <span className="text-[9px] text-slate-400 font-mono">
                            ({analysis.license.app_slug})
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-400 font-mono">
                            (Global Scope)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Hardware Slots & Capacity */}
                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/90 flex flex-col justify-between space-y-1.5 hover:border-slate-700/80 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                        Hardware Slots
                      </span>
                      <div className="w-4 h-4 rounded bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400/90">
                        <Cpu className="w-2.5 h-2.5" />
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-200">
                        {analysis.devices.length} /{' '}
                        {analysis.license.device_limit === -1 ? '∞' : analysis.license.device_limit}
                        <span className="text-[10px] text-slate-400 font-normal ml-1">bound</span>
                      </div>
                      <div className="mt-1">
                        {analysis.license.device_limit === -1 ? (
                          <span className="text-[9px] font-medium text-emerald-400/90">
                            Unlimited Slots
                          </span>
                        ) : analysis.devices.length >= analysis.license.device_limit ? (
                          <span className="text-[9px] font-medium text-amber-300/90">
                            All Slots Bound
                          </span>
                        ) : (
                          <span className="text-[9px] font-medium text-emerald-400/90">
                            {analysis.license.device_limit - analysis.devices.length}{' '}
                            {analysis.license.device_limit - analysis.devices.length === 1 ? 'Slot' : 'Slots'} Available
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Remaining Time & Validity */}
                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/90 flex flex-col justify-between space-y-1.5 hover:border-slate-700/80 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                        Remaining Time
                      </span>
                      <div className="w-4 h-4 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400/90">
                        <Clock className="w-2.5 h-2.5" />
                      </div>
                    </div>
                    <div>
                      <div
                        className={`text-xs font-semibold ${
                          times.isExpired || times.remainingStr === 'Expired'
                            ? 'text-rose-400/90'
                            : 'text-emerald-400/90'
                        }`}
                      >
                        {times.remainingStr}
                      </div>
                      <div className="mt-1 text-[9px] text-slate-400 truncate">
                        {times.validityTotalStr}
                      </div>
                    </div>
                  </div>

                  {/* Card 4: Activation Status & Usage */}
                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/90 flex flex-col justify-between space-y-1.5 hover:border-slate-700/80 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                        Activation Status
                      </span>
                      <div className="w-4 h-4 rounded bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400/90">
                        <Activity className="w-2.5 h-2.5" />
                      </div>
                    </div>
                    <div>
                      <div className={`text-xs font-semibold ${times.isActivated ? 'text-amber-300/85' : 'text-slate-300'}`}>
                        {times.timeUsedStr}
                      </div>
                      <div className="mt-1 text-[9px] text-slate-500 truncate">
                        {times.isActivated
                          ? `Activated: ${times.activatedDateStr}`
                          : `Issued: ${times.createdDate}`}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Connected Hardware Devices Card */}
            <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/90 space-y-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-850">
                <div className="flex items-center gap-1.5">
                  <Laptop className="w-3.5 h-3.5 text-indigo-400/90" />
                  <span className="font-semibold text-slate-200 text-xs">
                    Connected Hardware Devices
                  </span>
                </div>
                <span className="text-[9px] font-medium text-slate-400 bg-slate-950 px-1.5 py-0.2 rounded border border-slate-850">
                  {analysis.devices.length} Active
                </span>
              </div>

              {analysis.devices.length === 0 ? (
                <div className="py-4 text-center space-y-1">
                  <div className="w-7 h-7 rounded-full bg-slate-950 border border-slate-850 flex items-center justify-center mx-auto text-slate-500 mb-1">
                    <Laptop className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xs text-slate-400 font-medium">
                    No connected devices
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {analysis.devices.map((dev, idx) => (
                    <div
                      key={dev.id || idx}
                      className="p-2 rounded-lg bg-slate-950 border border-slate-850 hover:border-slate-800 space-y-1 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                          <Laptop className="w-3 h-3 text-slate-400" />
                          <span>{dev.device_name || `Hardware Device #${idx + 1}`}</span>
                        </div>
                        <span className="flex items-center gap-1 text-[9px] text-emerald-400/90 font-medium bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-900/50">
                          <span className="w-1 h-1 rounded-full bg-emerald-500/80" />
                          Active Lock
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-400 flex items-center justify-between font-mono">
                        <span className="text-slate-400 font-sans">{dev.os_info || 'Client Device'}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400 font-mono bg-slate-900 px-1.5 py-0.2 rounded border border-slate-850 text-[9px]">
                            {dev.hwid.length > 20 ? `${dev.hwid.slice(0, 18)}...` : dev.hwid}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyHwid(dev.hwid)}
                            className="p-1 rounded text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-850 border border-slate-850 transition-colors cursor-pointer"
                            title="Copy HWID Hash"
                          >
                            {copiedHwid === dev.hwid ? (
                              <Check className="w-2.5 h-2.5 text-emerald-400/90" />
                            ) : (
                              <Copy className="w-2.5 h-2.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="text-[9px] text-slate-500 pt-0.5 border-t border-slate-900 flex items-center justify-between">
                        <span>Bound: {new Date(Number(dev.first_bound_at)).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        {dev.ip_address && (
                          <span className="font-mono text-slate-400">IP: {dev.ip_address}</span>
                        )}
                        {dev.last_ping_at && (
                          <span>
                            Ping:{' '}
                            {new Date(Number(dev.last_ping_at)).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Smart Compact Reset Action CTA Card */}
            <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/90 space-y-1.5">
              {resetError && (
                <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-800/60 flex items-center gap-2 text-rose-300 text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400/90 shrink-0" />
                  <span>{resetError}</span>
                </div>
              )}

              {confirmReset ? (
                <div className="p-2 rounded-lg bg-rose-950/30 border border-rose-900/50 space-y-1.5 text-center animate-in fade-in">
                  <span className="text-[11px] font-semibold text-rose-300 block">
                    Disconnect all {analysis.devices.length} machines and free license slots?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="flex-1 py-1 px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-[11px] border border-slate-700 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleResetDevices}
                      disabled={resetting}
                      className="flex-1 py-1 px-2.5 rounded bg-rose-600/90 hover:bg-rose-600 text-slate-100 font-semibold text-[11px] uppercase tracking-wider flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      {resetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                      <span>Yes, Reset</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleResetDevices}
                  disabled={resetting || analysis.devices.length === 0}
                  className="w-full py-2 px-3 rounded-lg bg-rose-600/90 hover:bg-rose-600 active:bg-rose-700 text-slate-100 font-semibold text-xs tracking-wider uppercase transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border border-rose-500/20"
                >
                  {resetting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  <span>Reset All Bound Devices</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Default Public View: Check License Box & Control Button */
          <div className="space-y-3">
            {/* 1. "Check License" Box */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 shadow-md space-y-2.5">
              <div className="flex items-center gap-1.5 pb-1 border-b border-slate-800/80">
                <Search className="w-3.5 h-3.5 text-indigo-400/90" />
                <span className="font-semibold text-slate-200 text-xs uppercase tracking-wide">
                  Check License
                </span>
              </div>

              <form onSubmit={handleQuickCheck} className="space-y-2">
                <div>
                  <input
                    type="text"
                    value={checkKey}
                    onChange={(e) => setCheckKey(e.target.value.toUpperCase())}
                    placeholder="VCON-XXXX-XXXX-XXXX"
                    required
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:border-indigo-500/60 focus:outline-none text-xs tracking-wider font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={checking || !checkKey.trim()}
                  className="w-full py-1.5 px-3 rounded-lg bg-indigo-600/90 hover:bg-indigo-600 active:bg-indigo-700 text-slate-100 font-medium text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                  <span>Check License</span>
                </button>
              </form>

              {/* Error Message */}
              {checkError && (
                <div className="p-2 rounded-lg bg-rose-950/30 border border-rose-900/50 flex items-center gap-2 text-rose-300 text-[11px]">
                  <XCircle className="w-3.5 h-3.5 text-rose-400/90 shrink-0" />
                  <span>{checkError}</span>
                </div>
              )}

              {/* Check Result: Shows ONLY 3 INFO: Status, Device Limit, Active Device Count */}
              {checkResult && (
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-850 space-y-2 animate-in fade-in duration-150">
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    {/* 1. Status */}
                    <div className="p-1.5 rounded-md bg-slate-900/80 border border-slate-850">
                      <span className="text-[9px] text-slate-400 block mb-0.5 uppercase">Status</span>
                      <span
                        className={`text-[11px] font-semibold uppercase ${
                          checkResult.status === 'active'
                            ? 'text-emerald-400/90'
                            : 'text-rose-400/90'
                        }`}
                      >
                        {checkResult.status}
                      </span>
                    </div>

                    {/* 2. Device Limit */}
                    <div className="p-1.5 rounded-md bg-slate-900/80 border border-slate-850">
                      <span className="text-[9px] text-slate-400 block mb-0.5 uppercase">Limit</span>
                      <span className="text-[11px] font-semibold text-slate-300">
                        {checkResult.device_limit === -1 ? 'Unlimited' : `${checkResult.device_limit}`}
                      </span>
                    </div>

                    {/* 3. Active Device Count */}
                    <div className="p-1.5 rounded-md bg-slate-900/80 border border-slate-850">
                      <span className="text-[9px] text-slate-400 block mb-0.5 uppercase">Active</span>
                      <span className="text-[11px] font-semibold text-indigo-300/90">
                        {checkResult.active_device_count}
                      </span>
                    </div>
                  </div>

                  {/* Clean direct action into Control from Check Result */}
                  <div className="pt-1.5 border-t border-slate-900 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowControlForm(true);
                        setControlKey(checkKey.trim().toUpperCase());
                        setControlError('');
                      }}
                      className="text-indigo-400/90 hover:text-indigo-300 font-semibold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>Open Control</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. "Control" CTA Button below Check License */}
            <div className="space-y-2">
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
                className={`w-full py-2.5 px-3.5 rounded-xl font-semibold text-xs tracking-wide transition-all duration-200 flex items-center justify-between shadow-sm cursor-pointer active:scale-[0.99] ${
                  showControlForm
                    ? 'bg-slate-800 hover:bg-slate-750 text-indigo-300/90 border border-indigo-500/40'
                    : 'bg-indigo-600/90 hover:bg-indigo-600 active:bg-indigo-700 text-slate-100 border border-indigo-400/20'
                }`}
              >
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-current" />
                  <span className="uppercase tracking-wider">
                    {showControlForm ? 'Close Control' : 'Control Panel'}
                  </span>
                </div>

                <div className="flex items-center">
                  {showControlForm ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </div>
              </button>

              {/* Control Form with 2 fields: License Key & PIN */}
              {showControlForm && (
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-indigo-500/20 shadow-md space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                    <div className="flex items-center gap-1.5 text-slate-200">
                      <Lock className="w-3.5 h-3.5 text-indigo-400/90" />
                      <span className="font-semibold text-xs tracking-wide">
                        License Control
                      </span>
                    </div>
                  </div>

                  {controlError && (
                    <div className="p-2 rounded-lg bg-rose-950/30 border border-rose-900/50 flex items-center gap-2 text-rose-300 text-[11px]">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400/90 shrink-0" />
                      <span>{controlError}</span>
                    </div>
                  )}

                  <form onSubmit={handleOpenControl} className="space-y-2.5">
                    {/* Field 1: License Key */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-slate-400 font-medium uppercase">
                          License Key
                        </label>
                        {checkKey && controlKey !== checkKey && (
                          <button
                            type="button"
                            onClick={() => setControlKey(checkKey.trim().toUpperCase())}
                            className="text-[10px] text-indigo-400/90 hover:text-indigo-300 underline"
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
                        className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:border-indigo-500/60 focus:outline-none text-xs tracking-wider font-mono"
                      />
                    </div>

                    {/* Field 2: 4-digit PIN */}
                    <div>
                      <label className="text-[10px] text-slate-400 font-medium uppercase block mb-1">
                        Security PIN
                      </label>
                      <div className="relative">
                        <input
                          type={showPin ? 'text' : 'password'}
                          maxLength={4}
                          value={controlPin}
                          onChange={(e) => setControlPin(e.target.value.replace(/\D/g, ''))}
                          placeholder="••••"
                          required
                          className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:border-indigo-500/60 focus:outline-none text-xs tracking-widest text-center font-semibold font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPin(!showPin)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer transition-colors"
                          tabIndex={-1}
                          title={showPin ? 'Hide PIN' : 'Show PIN'}
                        >
                          {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* "Open" Button */}
                    <button
                      type="submit"
                      disabled={openingControl || !controlKey.trim() || controlPin.length !== 4}
                      className="w-full py-2 px-3 rounded-lg bg-indigo-600/90 hover:bg-indigo-600 active:bg-indigo-700 text-slate-100 font-semibold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer border border-indigo-400/20"
                    >
                      {openingControl ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ArrowRight className="w-3 h-3" />
                      )}
                      <span>Open Control</span>
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
