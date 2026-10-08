import React from 'react';
import {
  ShieldCheck,
  FileQuestion,
  ArrowLeft,
  Search,
  ExternalLink,
  ShieldAlert,
  Home,
} from 'lucide-react';

import { SiteSettings } from '../types';

interface NotFoundPageProps {
  currentPath?: string;
  onGoHome: () => void;
  siteSettings?: SiteSettings;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ currentPath, onGoHome, siteSettings }) => {
  const displayPath = currentPath || (typeof window !== 'undefined' ? window.location.pathname : '');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-mono text-xs selection:bg-indigo-600/30">
      {/* Header: Clean & Compact Branding */}
      <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo & Site Name (Clickable to go home) */}
          <button
            onClick={onGoHome}
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity cursor-pointer text-left"
          >
            {siteSettings?.logoUrl ? (
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
            <span className="font-bold text-sm tracking-wide text-slate-100">
              {siteSettings?.siteName || 'VCON'}
            </span>
          </button>

          {/* Right Side: Return to Home Link */}
          <button
            onClick={onGoHome}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-slate-200 font-medium text-xs transition-colors cursor-pointer"
          >
            <Home className="w-3.5 h-3.5 text-indigo-400" />
            <span>Portal Home</span>
          </button>
        </div>
      </header>

      {/* Main Content Area - Mobile-Friendly, Compact & Centered */}
      <main className="max-w-md w-full mx-auto px-4 py-12 flex-1 flex flex-col items-center justify-center">
        <div className="w-full p-6 sm:p-7 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-2xl space-y-5 text-center animate-in fade-in zoom-in-95 duration-200">
          {/* Stylized 404 Status Badge */}
          <div className="inline-flex items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-950/30 border border-rose-900/50 flex items-center justify-center text-rose-400 shadow-inner">
              <FileQuestion className="w-8 h-8" />
            </div>
          </div>

          {/* Headline & Description */}
          <div className="space-y-1.5">
            <div className="inline-block px-2.5 py-0.5 rounded-full bg-rose-950/40 border border-rose-900/60 text-rose-300 text-[10px] font-extrabold uppercase tracking-widest">
              Error 404
            </div>
            <h1 className="text-lg font-bold text-slate-100 tracking-tight">
              Page Not Found
            </h1>
            <p className="text-[11px] text-slate-400 leading-relaxed max-w-xs mx-auto">
              The requested address or resource does not exist on this portal or has been relocated.
            </p>
          </div>

          {/* Requested Path Box */}
          {displayPath && (
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-850 text-[11px] text-slate-400 flex items-center justify-between font-mono">
              <span className="text-[10px] text-slate-500 uppercase">Path</span>
              <span className="text-slate-300 truncate max-w-[200px]" title={displayPath}>
                {displayPath}
              </span>
            </div>
          )}

          {/* Action CTAs */}
          <div className="space-y-2 pt-2">
            {/* Primary Action Button: Back to Home */}
            <button
              onClick={onGoHome}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 active:scale-[0.98] text-slate-200 font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 border border-indigo-400/30 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to License Portal</span>
            </button>

            {/* Secondary Action: Direct Check Key Shortcut */}
            <button
              onClick={onGoHome}
              className="w-full py-2.5 px-3 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-slate-200 font-medium text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-indigo-400" />
              <span>Check License Key</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-3 text-center text-slate-600 text-[10px]">
        VCON License Portal • Secure Hardware Fingerprinting & License Management
      </footer>
    </div>
  );
};
