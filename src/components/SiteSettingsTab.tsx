import React, { useState, useEffect, useRef } from 'react';
import {
  Globe,
  Upload,
  Image,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  Share2,
  Eye,
  RefreshCw,
  Sparkles,
  Link2,
  Mail,
  Send,
  MessageSquare,
  FileText,
  Megaphone,
  Save,
  Check,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { SiteSettings, DEFAULT_SITE_SETTINGS } from '../types';
import { api } from '../services/apiClient';

interface SiteSettingsTabProps {
  onNavigateToTab?: (tab: 'settings') => void;
  onSettingsUpdated?: (newSettings: SiteSettings) => void;
}

export const SiteSettingsTab: React.FC<SiteSettingsTabProps> = ({
  onNavigateToTab,
  onSettingsUpdated,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [r2Configured, setR2Configured] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // File upload states
  const [uploadingField, setUploadingField] = useState<'logoUrl' | 'faviconUrl' | 'ogImageUrl' | null>(null);
  const [uploadSuccessField, setUploadSuccessField] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const ogInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await api.getSiteSettings();
      setSettings(res.siteSettings);
      setR2Configured(res.r2Configured);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load site settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setSaving(true);
      setErrorMessage(null);
      setSaveSuccess(false);

      const res = await api.saveSiteSettings(settings);
      setSettings(res.siteSettings);
      setSaveSuccess(true);
      if (onSettingsUpdated) {
        onSettingsUpdated(res.siteSettings);
      }
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save site settings');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('Are you sure you want to restore default site settings?')) {
      setSettings(DEFAULT_SITE_SETTINGS);
    }
  };

  const handleFileUpload = async (
    file: File,
    field: 'logoUrl' | 'faviconUrl' | 'ogImageUrl',
    folder = 'branding'
  ) => {
    if (!r2Configured) {
      setErrorMessage('Cloudflare R2 is not configured. Please setup your R2 bucket in the Storage & DB tab before uploading assets.');
      return;
    }

    try {
      setUploadingField(field);
      setErrorMessage(null);

      // Convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const dataBase64 = await base64Promise;

      const uploadRes = await api.uploadSiteAsset({
        filename: file.name,
        contentType: file.type || 'image/png',
        dataBase64,
        folder,
      });

      if (uploadRes.success && uploadRes.url) {
        const updated = {
          ...settings,
          [field]: uploadRes.url,
        };
        setSettings(updated);
        setUploadSuccessField(field);
        setTimeout(() => setUploadSuccessField(null), 3000);
      }
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to upload ${field} to Cloudflare R2`);
    } finally {
      setUploadingField(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <span className="text-sm font-medium">Loading Site Settings & Branding...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Globe className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Site Settings & Branding Control</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Live Sync
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Configure your platform logo, favicon, OpenGraph card, SEO tags, public portal links, and customer support details. Changes are instantly reflected across admin & user pages.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              Reset Defaults
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Site Settings'}
            </button>
          </div>
        </div>

        {/* R2 Storage Connection Badge */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Cloudflare R2 Asset Storage:</span>
            {r2Configured ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                R2 Bucket Connected (Instant Upload Active)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                R2 Not Configured (Direct image uploads disabled)
              </span>
            )}
          </div>

          {!r2Configured && onNavigateToTab && (
            <button
              onClick={() => onNavigateToTab('settings')}
              className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
            >
              Configure R2 in Storage Tab <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-3 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Site settings saved successfully! All user and admin interfaces are updated.</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-3 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* 1. General Branding & SEO */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">1. General Branding & SEO Metadata</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Site Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={settings.siteName}
                onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                placeholder="e.g. LicenX"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                required
              />
              <p className="text-[11px] text-slate-500 mt-1">Brand name displayed in headers, navigation, and badges.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Site Tagline
              </label>
              <input
                type="text"
                value={settings.siteTagline}
                onChange={(e) => setSettings({ ...settings, siteTagline: e.target.value })}
                placeholder="e.g. Enterprise Software Licensing & Device Engine"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">Subtitle displayed in header toolbars and hero headers.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Browser Page Title (<code className="text-indigo-400">&lt;title&gt;</code> & <code className="text-indigo-400">og:title</code>)
            </label>
            <input
              type="text"
              value={settings.siteTitle}
              onChange={(e) => setSettings({ ...settings, siteTitle: e.target.value })}
              placeholder="e.g. LicenX – Software Licensing & Device Verification Engine"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">Shown on browser tab titles and social media card headers.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Meta Description (Search Engines & Social Card Summary)
            </label>
            <textarea
              rows={2}
              value={settings.metaDescription}
              onChange={(e) => setSettings({ ...settings, metaDescription: e.target.value })}
              placeholder="Provide a 1-2 sentence description of your platform for Google and social previews..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
            />
            <p className="text-[11px] text-slate-500 mt-1">120–160 characters recommended for high search visibility.</p>
          </div>
        </div>

        {/* 2. Brand Visual Assets (Logo, Favicon, OG Card) */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Image className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">2. Visual Assets & Cloudflare R2 Uploads</h3>
            </div>
            <span className="text-[11px] text-slate-400">Logo, Favicon & Social Preview</span>
          </div>

          {/* Hidden File Inputs */}
          <input
            type="file"
            ref={logoInputRef}
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileUpload(e.target.files[0], 'logoUrl');
            }}
          />
          <input
            type="file"
            ref={faviconInputRef}
            accept="image/x-icon,image/png,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileUpload(e.target.files[0], 'faviconUrl');
            }}
          />
          <input
            type="file"
            ref={ogInputRef}
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileUpload(e.target.files[0], 'ogImageUrl');
            }}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Asset 1: App Logo */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white">App Logo</span>
                  {uploadSuccessField === 'logoUrl' && (
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                      <Check className="w-3 h-3" /> Uploaded to R2!
                    </span>
                  )}
                </div>

                {/* Preview Box */}
                <div className="h-28 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center p-3 relative overflow-hidden group">
                  {settings.logoUrl ? (
                    <img
                      src={settings.logoUrl}
                      alt="Logo Preview"
                      className="max-h-full max-w-full object-contain rounded"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-500">
                      <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold mb-1">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] text-slate-500">Default SVG Shield Logo</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={settings.logoUrl}
                  onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                  placeholder="https://.../logo.png"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                />

                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingField === 'logoUrl' || !r2Configured}
                  title={!r2Configured ? 'Configure R2 in Storage tab first' : 'Upload file to R2'}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 text-[11px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {uploadingField === 'logoUrl' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {uploadingField === 'logoUrl' ? 'Uploading to R2...' : 'Upload Logo to R2'}
                </button>
              </div>
            </div>

            {/* Asset 2: Favicon */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white">Browser Favicon</span>
                  {uploadSuccessField === 'faviconUrl' && (
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                      <Check className="w-3 h-3" /> Uploaded to R2!
                    </span>
                  )}
                </div>

                {/* Preview Box */}
                <div className="h-28 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center p-3">
                  {settings.faviconUrl ? (
                    <img
                      src={settings.faviconUrl}
                      alt="Favicon Preview"
                      className="w-10 h-10 object-contain rounded"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-500">
                      <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-slate-400 font-bold mb-1 text-xs">
                        ico
                      </div>
                      <span className="text-[10px] text-slate-500">Default Browser Favicon</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={settings.faviconUrl}
                  onChange={(e) => setSettings({ ...settings, faviconUrl: e.target.value })}
                  placeholder="https://.../favicon.ico"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                />

                <button
                  type="button"
                  onClick={() => faviconInputRef.current?.click()}
                  disabled={uploadingField === 'faviconUrl' || !r2Configured}
                  title={!r2Configured ? 'Configure R2 in Storage tab first' : 'Upload file to R2'}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 text-[11px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {uploadingField === 'faviconUrl' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {uploadingField === 'faviconUrl' ? 'Uploading to R2...' : 'Upload Favicon to R2'}
                </button>
              </div>
            </div>

            {/* Asset 3: OG Social Card Image */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white">OG Share Card Image</span>
                  {uploadSuccessField === 'ogImageUrl' && (
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                      <Check className="w-3 h-3" /> Uploaded to R2!
                    </span>
                  )}
                </div>

                {/* Preview Box */}
                <div className="h-28 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center p-2 relative overflow-hidden">
                  {settings.ogImageUrl ? (
                    <img
                      src={settings.ogImageUrl}
                      alt="OG Card Preview"
                      className="h-full w-full object-cover rounded"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-500 text-center px-2">
                      <Share2 className="w-6 h-6 mb-1 text-slate-500" />
                      <span className="text-[10px] text-slate-500">1200 x 630 Social Banner</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={settings.ogImageUrl}
                  onChange={(e) => setSettings({ ...settings, ogImageUrl: e.target.value })}
                  placeholder="https://.../og-preview.png"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                />

                <button
                  type="button"
                  onClick={() => ogInputRef.current?.click()}
                  disabled={uploadingField === 'ogImageUrl' || !r2Configured}
                  title={!r2Configured ? 'Configure R2 in Storage tab first' : 'Upload file to R2'}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 text-[11px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {uploadingField === 'ogImageUrl' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {uploadingField === 'ogImageUrl' ? 'Uploading to R2...' : 'Upload OG Image to R2'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Navigation & Contact Details */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Link2 className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">3. Public Navigation, CTA & Support Details</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                "Buy License" CTA URL (Public Landing Page Button)
              </label>
              <input
                type="text"
                value={settings.buyLicenseUrl}
                onChange={(e) => setSettings({ ...settings, buyLicenseUrl: e.target.value })}
                placeholder="e.g. https://yourstore.com/buy or #"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">Controls the destination URL for the top-right "Buy License" CTA button on the public page.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Documentation URL
              </label>
              <input
                type="text"
                value={settings.docsUrl}
                onChange={(e) => setSettings({ ...settings, docsUrl: e.target.value })}
                placeholder="e.g. https://docs.yourcompany.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">Link to client integration guides and SDK manuals.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" /> Support Email
              </label>
              <input
                type="email"
                value={settings.supportEmail}
                onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                placeholder="support@vcon.local"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-sky-400" /> Telegram Support Link / Username
              </label>
              <input
                type="text"
                value={settings.telegramUrl}
                onChange={(e) => setSettings({ ...settings, telegramUrl: e.target.value })}
                placeholder="e.g. https://t.me/vcon_support"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400" /> Discord Community Link
              </label>
              <input
                type="text"
                value={settings.discordUrl}
                onChange={(e) => setSettings({ ...settings, discordUrl: e.target.value })}
                placeholder="e.g. https://discord.gg/yourserver"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Footer Copyright Text
              </label>
              <input
                type="text"
                value={settings.footerText}
                onChange={(e) => setSettings({ ...settings, footerText: e.target.value })}
                placeholder="© 2026 LicenX Open-Source Licensing Engine. All rights reserved."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* 4. Public Portal Controls & Announcement Banner */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Megaphone className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">4. Public Portal Rules & Announcement Banner</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Toggle 1: Allow Quick Check */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">Allow Public License Check</span>
                <span className="text-[11px] text-slate-500">Permits users to check 3 metrics (status, limit, active devices).</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowPublicCheck}
                  onChange={(e) => setSettings({ ...settings, allowPublicCheck: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* Toggle 2: Allow Self-Service Device Reset */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">Allow Self-Service Device Reset</span>
                <span className="text-[11px] text-slate-500">Permits users with their 4-digit PIN to reset hardware locks.</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowPublicReset}
                  onChange={(e) => setSettings({ ...settings, allowPublicReset: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>

          {/* Announcement Banner Box */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white">Announcement / Notice Banner</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.noticeBannerEnabled}
                  onChange={(e) => setSettings({ ...settings, noticeBannerEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
              </label>
            </div>

            {settings.noticeBannerEnabled && (
              <div>
                <input
                  type="text"
                  value={settings.noticeBanner}
                  onChange={(e) => setSettings({ ...settings, noticeBanner: e.target.value })}
                  placeholder="e.g. 📢 Scheduled server maintenance on Sunday at 02:00 UTC. License validation remains cached locally."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">Displayed as an eye-catching banner at the top of the user portal.</p>
              </div>
            )}
          </div>
        </div>

        {/* 5. Live Preview Simulation Box */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Eye className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">5. Live Frontend Preview Simulation</h3>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-3">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">
              Public Portal Header Simulation:
            </span>

            {/* Header simulation bar */}
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {settings.logoUrl ? (
                  <img
                    src={settings.logoUrl}
                    alt={settings.siteName}
                    className="w-7 h-7 object-contain rounded-lg"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold shadow-sm">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                )}
                <div>
                  <span className="font-bold text-xs tracking-wide text-white block">
                    {settings.siteName || 'LicenX'}
                  </span>
                  {settings.siteTagline && (
                    <span className="text-[9px] text-slate-500 block -mt-0.5">
                      {settings.siteTagline}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold shadow-sm">
                  Buy License
                </span>
              </div>
            </div>

            {/* Announcement banner simulation */}
            {settings.noticeBannerEnabled && settings.noticeBanner && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                <Megaphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">{settings.noticeBanner}</span>
              </div>
            )}
          </div>
        </div>

        {/* Floating Bottom Save Action */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
          >
            Reset Defaults
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Site Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};
