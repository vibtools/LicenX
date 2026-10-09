import React, { useState, useEffect, useRef } from 'react';
import {
  Globe,
  Upload,
  Image,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Sparkles,
  Link2,
  Mail,
  Send,
  MessageSquare,
  Megaphone,
  Save,
  RotateCcw,
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
      if (res?.siteSettings) {
        setSettings({ ...DEFAULT_SITE_SETTINGS, ...res.siteSettings });
      }
      setR2Configured(Boolean(res?.r2Configured));
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
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save site settings');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('Reset to default site settings?')) {
      setSettings(DEFAULT_SITE_SETTINGS);
    }
  };

  const handleFileUpload = async (
    file: File,
    field: 'logoUrl' | 'faviconUrl' | 'ogImageUrl',
    folder = 'branding'
  ) => {
    if (!r2Configured) {
      setErrorMessage('Cloudflare R2 is not configured. Configure in Storage tab first.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage(`File "${file.name}" exceeds the 5MB size limit.`);
      return;
    }

    try {
      setUploadingField(field);
      setErrorMessage(null);

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read image file'));
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
        const nextSettings = {
          ...settings,
          [field]: uploadRes.url,
        };
        setSettings(nextSettings);
        // Automatically persist uploaded asset to database so it takes effect immediately
        try {
          const saveRes = await api.saveSiteSettings(nextSettings);
          if (saveRes?.siteSettings) {
            setSettings(saveRes.siteSettings);
            if (onSettingsUpdated) {
              onSettingsUpdated(saveRes.siteSettings);
            }
          }
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        } catch (saveErr: any) {
          console.warn('Auto-save after upload warning:', saveErr);
        }
      } else {
        throw new Error('Upload returned empty asset URL');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upload asset to Cloudflare R2');
    } finally {
      setUploadingField(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[260px] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-500 mb-1.5" />
        <span className="text-[11px] font-medium">Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-6 max-w-4xl font-mono">
      {/* Top Bar */}
      <div className="p-2.5 px-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
          <h2 className="text-xs font-semibold text-slate-300 tracking-tight">Site Settings</h2>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
              r2Configured
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
          >
            {r2Configured ? 'R2 Active' : 'R2 Inactive'}
          </span>
          {!r2Configured && onNavigateToTab && (
            <button
              type="button"
              onClick={() => onNavigateToTab('settings')}
              className="text-[10px] text-indigo-400 hover:text-indigo-300 underline underline-offset-2 cursor-pointer"
            >
              Configure
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 text-[11px] border border-slate-700 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-slate-300 text-[11px] font-medium transition-colors cursor-pointer"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Saved successfully</span>
        </div>
      )}

      {errorMessage && (
        <div className="px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSave} className="space-y-3">
        {/* 1. General & SEO */}
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2.5">
          <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-800">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">General & SEO</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1">
                Site Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={settings.siteName}
                onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                placeholder="Site Name"
                className="w-full px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1">
                Tagline
              </label>
              <input
                type="text"
                value={settings.siteTagline}
                onChange={(e) => setSettings({ ...settings, siteTagline: e.target.value })}
                placeholder="Tagline"
                className="w-full px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-slate-400 mb-1">
              Page Title
            </label>
            <input
              type="text"
              value={settings.siteTitle}
              onChange={(e) => setSettings({ ...settings, siteTitle: e.target.value })}
              placeholder="Page Title"
              className="w-full px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-slate-400 mb-1">
              Meta Description
            </label>
            <textarea
              rows={2}
              value={settings.metaDescription}
              onChange={(e) => setSettings({ ...settings, metaDescription: e.target.value })}
              placeholder="Meta description..."
              className="w-full px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
        </div>

        {/* 2. Visual Assets */}
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2.5">
          <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-800">
            <Image className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Visual Assets</span>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {/* Asset 1: Logo */}
            <div className="p-2 rounded bg-slate-950 border border-slate-800/80 flex flex-col justify-between space-y-2">
              <div>
                <span className="text-[10px] font-medium text-slate-400 block mb-1">Logo</span>
                <div className="h-16 rounded bg-slate-900 border border-slate-800 flex items-center justify-center p-1.5 relative overflow-hidden">
                  {settings.logoUrl ? (
                    <img
                      src={settings.logoUrl}
                      alt="Logo"
                      className="max-h-full max-w-full object-contain rounded"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <ShieldCheck className="w-5 h-5 text-indigo-400" />
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <input
                  type="text"
                  value={settings.logoUrl}
                  onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                  placeholder="URL"
                  className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingField === 'logoUrl' || !r2Configured}
                  className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-[10px] font-medium border border-indigo-500/30 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  {uploadingField === 'logoUrl' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Upload className="w-3 h-3" />
                  )}
                  {uploadingField === 'logoUrl' ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>

            {/* Asset 2: Favicon */}
            <div className="p-2 rounded bg-slate-950 border border-slate-800/80 flex flex-col justify-between space-y-2">
              <div>
                <span className="text-[10px] font-medium text-slate-400 block mb-1">Favicon</span>
                <div className="h-16 rounded bg-slate-900 border border-slate-800 flex items-center justify-center p-1.5">
                  {settings.faviconUrl ? (
                    <img
                      src={settings.faviconUrl}
                      alt="Favicon"
                      className="w-6 h-6 object-contain rounded"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Globe className="w-5 h-5 text-slate-500" />
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <input
                  type="text"
                  value={settings.faviconUrl}
                  onChange={(e) => setSettings({ ...settings, faviconUrl: e.target.value })}
                  placeholder="URL"
                  className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => faviconInputRef.current?.click()}
                  disabled={uploadingField === 'faviconUrl' || !r2Configured}
                  className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-[10px] font-medium border border-indigo-500/30 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  {uploadingField === 'faviconUrl' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Upload className="w-3 h-3" />
                  )}
                  {uploadingField === 'faviconUrl' ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>

            {/* Asset 3: Social Card */}
            <div className="p-2 rounded bg-slate-950 border border-slate-800/80 flex flex-col justify-between space-y-2">
              <div>
                <span className="text-[10px] font-medium text-slate-400 block mb-1">Social Card</span>
                <div className="h-16 rounded bg-slate-900 border border-slate-800 flex items-center justify-center p-1.5 relative overflow-hidden">
                  {settings.ogImageUrl ? (
                    <img
                      src={settings.ogImageUrl}
                      alt="Social Card"
                      className="h-full w-full object-cover rounded"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Image className="w-5 h-5 text-slate-500" />
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <input
                  type="text"
                  value={settings.ogImageUrl}
                  onChange={(e) => setSettings({ ...settings, ogImageUrl: e.target.value })}
                  placeholder="URL"
                  className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => ogInputRef.current?.click()}
                  disabled={uploadingField === 'ogImageUrl' || !r2Configured}
                  className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-[10px] font-medium border border-indigo-500/30 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  {uploadingField === 'ogImageUrl' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Upload className="w-3 h-3" />
                  )}
                  {uploadingField === 'ogImageUrl' ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Navigation & Links */}
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2.5">
          <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-800">
            <Link2 className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Navigation & Support</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1">
                "Buy License" URL
              </label>
              <input
                type="text"
                value={settings.buyLicenseUrl}
                onChange={(e) => setSettings({ ...settings, buyLicenseUrl: e.target.value })}
                placeholder="https://..."
                className="w-full px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1">
                Documentation URL
              </label>
              <input
                type="text"
                value={settings.docsUrl}
                onChange={(e) => setSettings({ ...settings, docsUrl: e.target.value })}
                placeholder="https://..."
                className="w-full px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                <Mail className="w-3 h-3 text-slate-400" /> Support Email
              </label>
              <input
                type="email"
                value={settings.supportEmail}
                onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                placeholder="support@domain.com"
                className="w-full px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                <Send className="w-3 h-3 text-sky-400" /> Telegram URL
              </label>
              <input
                type="text"
                value={settings.telegramUrl}
                onChange={(e) => setSettings({ ...settings, telegramUrl: e.target.value })}
                placeholder="https://t.me/..."
                className="w-full px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                <MessageSquare className="w-3 h-3 text-indigo-400" /> Discord URL
              </label>
              <input
                type="text"
                value={settings.discordUrl}
                onChange={(e) => setSettings({ ...settings, discordUrl: e.target.value })}
                placeholder="https://discord.gg/..."
                className="w-full px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1">
                Footer Copyright
              </label>
              <input
                type="text"
                value={settings.footerText}
                onChange={(e) => setSettings({ ...settings, footerText: e.target.value })}
                placeholder="© 2026..."
                className="w-full px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* 4. Portal & Notice */}
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2.5">
          <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-800">
            <Megaphone className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Portal & Notice</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-300">Public License Check</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowPublicCheck}
                  onChange={(e) => setSettings({ ...settings, allowPublicCheck: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-300">Self-Service Device Reset</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowPublicReset}
                  onChange={(e) => setSettings({ ...settings, allowPublicReset: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>

          <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-300">Notice Banner</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.noticeBannerEnabled}
                  onChange={(e) => setSettings({ ...settings, noticeBannerEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-600"></div>
              </label>
            </div>

            {settings.noticeBannerEnabled && (
              <input
                type="text"
                value={settings.noticeBanner}
                onChange={(e) => setSettings({ ...settings, noticeBanner: e.target.value })}
                placeholder="Notice text..."
                className="w-full px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
              />
            )}
          </div>
        </div>

        {/* 5. Minimal Preview */}
        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {settings.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt="Logo"
                className="w-5 h-5 object-contain rounded shrink-0"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
            )}
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-slate-300 truncate block">
                {settings.siteName || 'LicenX'}
              </span>
              {settings.siteTagline && (
                <span className="text-[10px] text-slate-500 truncate block">
                  {settings.siteTagline}
                </span>
              )}
            </div>
          </div>

          {settings.noticeBannerEnabled && settings.noticeBanner && (
            <div className="text-[10px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 truncate max-w-[240px]">
              {settings.noticeBanner}
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-end gap-1.5 pt-1">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 text-[11px] border border-slate-700 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1 px-3.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-slate-300 text-[11px] font-medium transition-colors cursor-pointer"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
};
