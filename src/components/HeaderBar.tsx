import React, { useEffect, useState } from 'react';
import {
  Menu,
  Plus,
  Layers,
  ExternalLink,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { ActiveTab } from '../types';

interface HeaderBarProps {
  activeTab: ActiveTab;
  onOpenCreate: () => void;
  onOpenBulk: () => void;
  onRefresh: () => void;
  onToggleMobileSidebar: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  activeTab,
  onOpenCreate,
  onOpenBulk,
  onRefresh,
  onToggleMobileSidebar,
}) => {
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    const update = () => {
      setTime(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  const titles: Record<ActiveTab, string> = {
    overview: 'System Overview',
    apps: 'Applications',
    licenses: 'License Keys',
    devices: 'HWID Locks',
    logs: 'Audit Logs',
    simulator: 'API Simulator',
    code: 'SDK Hub',
    profile: 'Admin Profile',
    'site-settings': 'Site Settings',
    settings: 'System Settings',
  };

  return (
    <header className="h-12 border-b border-slate-800/80 bg-slate-950/80 sticky top-0 z-30 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between font-sans text-xs select-none">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800"
          title="Toggle Navigation"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-slate-300 tracking-normal text-xs">
            {titles[activeTab] || 'LicenX Dashboard'}
          </span>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        {/* Live Clock */}
        <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400">
          <Clock className="w-3 h-3 text-slate-400" />
          <span className="font-mono">{time}</span>
          <span>UTC</span>
        </div>

        {/* Refresh */}
        <button
          onClick={onRefresh}
          className="p-1.5 rounded bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
          title="Refresh Current View"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {/* Public Landing Link */}
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors text-[11px]"
        >
          <ExternalLink className="w-3 h-3" />
          API Root
        </a>

        {/* Quick Bulk Modal */}
        <button
          onClick={onOpenBulk}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-750 hover:border-slate-700 transition-colors text-xs"
        >
          <Layers className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">Bulk Engine</span>
        </button>

        {/* Quick Issue Key */}
        <button
          onClick={onOpenCreate}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-600/90 hover:bg-indigo-600 text-slate-100 font-medium transition-colors text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Issue Key</span>
        </button>
      </div>
    </header>
  );
};
