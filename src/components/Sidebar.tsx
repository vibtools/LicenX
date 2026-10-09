import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Activity,
  Key,
  Laptop,
  Terminal,
  Code,
  UserCheck,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Database,
  Cloud,
  Cpu,
  Shield,
  AppWindow,
  Globe,
} from 'lucide-react';
import { ActiveTab, SiteSettings } from '../types';

interface NavItem {
  id: ActiveTab;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
}

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  username: string;
  onLogout: () => void;
  r2Configured: boolean;
  hasTursoEnv: boolean;
  collapsed: boolean;
  setCollapsed: (val: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (val: boolean) => void;
  stats?: {
    totalApps?: number;
    activeLicenses: number;
    activeDevices: number;
  };
  siteSettings?: SiteSettings;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  username,
  onLogout,
  r2Configured,
  hasTursoEnv,
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
  stats,
  siteSettings,
}) => {
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [siteSettings?.logoUrl]);
  const navGroups: NavGroup[] = [
    {
      id: 'license-hub',
      label: 'License Engine',
      icon: <Key className="w-3.5 h-3.5" />,
      items: [
        {
          id: 'overview',
          label: 'Overview',
          icon: <Activity className="w-3.5 h-3.5" />,
        },
        {
          id: 'apps',
          label: 'Applications',
          icon: <AppWindow className="w-3.5 h-3.5" />,
          badge: stats?.totalApps,
        },
        {
          id: 'licenses',
          label: 'License Keys',
          icon: <Key className="w-3.5 h-3.5" />,
          badge: stats?.activeLicenses,
        },
        {
          id: 'devices',
          label: 'HWID Locks',
          icon: <Laptop className="w-3.5 h-3.5" />,
          badge: stats?.activeDevices,
        },
      ],
    },
    {
      id: 'security-audit',
      label: 'Security & Audits',
      icon: <Shield className="w-3.5 h-3.5" />,
      items: [
        {
          id: 'logs',
          label: 'Audit Trail',
          icon: <Terminal className="w-3.5 h-3.5" />,
        },
        {
          id: 'simulator',
          label: 'Live Validator',
          icon: <ShieldCheck className="w-3.5 h-3.5" />,
        },
      ],
    },
    {
      id: 'client-sdk',
      label: 'Client Integration',
      icon: <Cpu className="w-3.5 h-3.5" />,
      items: [
        {
          id: 'code',
          label: 'Client SDK Hub',
          icon: <Code className="w-3.5 h-3.5" />,
        },
      ],
    },
    {
      id: 'system-admin',
      label: 'Administration',
      icon: <Settings className="w-3.5 h-3.5" />,
      items: [
        {
          id: 'profile',
          label: 'Admin Profile',
          icon: <UserCheck className="w-3.5 h-3.5" />,
        },
        {
          id: 'site-settings',
          label: 'Site Settings',
          icon: <Globe className="w-3.5 h-3.5" />,
        },
        {
          id: 'settings',
          label: 'Storage & DB',
          icon: <Settings className="w-3.5 h-3.5" />,
        },
      ],
    },
  ];

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navGroups.forEach((g) => {
      initial[g.id] = true;
    });
    return initial;
  });

  useEffect(() => {
    navGroups.forEach((group) => {
      if (group.items.some((item) => item.id === activeTab)) {
        setOpenGroups((prev) => ({ ...prev, [group.id]: true }));
      }
    });
  }, [activeTab]);

  const toggleGroup = (groupId: string) => {
    if (collapsed) {
      setCollapsed(false);
      setOpenGroups((prev) => ({ ...prev, [groupId]: true }));
      return;
    }
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const handleItemClick = (id: ActiveTab) => {
    setActiveTab(id);
    if (mobileOpen) setMobileOpen(false);
  };

  return (
    <>
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs lg:hidden"
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-slate-950 border-r border-slate-800/80 transition-all duration-200 ease-in-out font-sans select-none antialiased ${
          collapsed ? 'w-16' : 'w-56'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Brand Header */}
        <div className="h-12 border-b border-slate-800/80 flex items-center justify-between px-3">
          <div className="flex items-center gap-2 overflow-hidden">
            {siteSettings?.logoUrl && !logoError ? (
              <img
                src={siteSettings.logoUrl}
                alt={siteSettings.siteName || 'Logo'}
                className="w-6 h-6 shrink-0 rounded object-contain bg-slate-900 border border-slate-800"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="w-6 h-6 shrink-0 rounded bg-slate-900 border border-slate-700/80 flex items-center justify-center text-indigo-400">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
            )}
            {!collapsed && (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-xs tracking-normal text-slate-300 truncate">
                  {siteSettings?.siteName || 'LicenX'}
                </span>
                <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400">
                  ENGINE
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Navigation Dropdown Groups */}
        <div className="flex-1 overflow-y-auto px-2 py-2.5 space-y-2.5">
          {navGroups.map((group) => {
            const isOpen = Boolean(openGroups[group.id]);
            const isAnyChildActive = group.items.some((i) => i.id === activeTab);

            return (
              <div key={group.id} className="space-y-1">
                {/* Group Dropdown Header Button */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  title={collapsed ? group.label : undefined}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-[11px] font-medium transition-all ${
                    isAnyChildActive
                      ? 'text-slate-300 bg-slate-900/50'
                      : 'text-slate-400 hover:text-slate-300 hover:bg-slate-900/30'
                  } ${collapsed ? 'justify-center px-0' : ''}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={isAnyChildActive ? 'text-indigo-400' : 'text-slate-400'}>
                      {group.icon}
                    </span>
                    {!collapsed && <span className="truncate">{group.label}</span>}
                  </div>

                  {!collapsed && (
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${
                        isOpen ? 'rotate-0' : '-rotate-90'
                      }`}
                    />
                  )}
                </button>

                {/* Dropdown Sub-menu Items */}
                {(!collapsed ? isOpen : true) && (
                  <div
                    className={`${
                      !collapsed
                        ? 'border-l border-slate-800/80 ml-3.5 pl-2 space-y-0.5'
                        : 'space-y-1'
                    }`}
                  >
                    {group.items.map((item) => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleItemClick(item.id)}
                          title={collapsed ? item.label : undefined}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-all ${
                            isActive
                              ? 'bg-indigo-950/40 text-indigo-300 border border-indigo-800/40 font-medium'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent font-normal'
                          } ${collapsed ? 'justify-center px-0' : ''}`}
                        >
                          <span
                            className={`shrink-0 ${
                              isActive ? 'text-indigo-400' : 'text-slate-400'
                            }`}
                          >
                            {item.icon}
                          </span>

                          {!collapsed && (
                            <span className="flex-1 text-left truncate text-xs">
                              {item.label}
                            </span>
                          )}

                          {!collapsed && item.badge !== undefined && item.badge > 0 && (
                            <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400">
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* System Badges (Expanded View) */}
        {!collapsed && (
          <div className="p-2 mx-2 mb-2 rounded bg-slate-900/40 border border-slate-800/70 space-y-1 text-[11px] font-sans">
            <div className="flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-1">
                <Database className="w-3 h-3 text-slate-400" />
                Database:
              </span>
              <span className="font-mono text-slate-300">{hasTursoEnv ? 'Turso' : 'libSQL'}</span>
            </div>

            <div className="flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-1">
                <Cloud className="w-3 h-3 text-slate-400" />
                R2 Storage:
              </span>
              <span className={`font-mono ${r2Configured ? 'text-slate-300' : 'text-slate-500'}`}>
                {r2Configured ? 'Active' : 'Off'}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80"></span>
                Ed25519:
              </span>
              <span className="font-mono text-slate-300">Online</span>
            </div>
          </div>
        )}

        {/* Footer: User Profile & Logout */}
        <div className="p-2 border-t border-slate-800/80 bg-slate-950 font-sans">
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} gap-2`}>
            {!collapsed && (
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 font-medium text-[11px]">
                  {username.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-300 truncate">{username}</div>
                  <div className="text-[10px] text-slate-500 font-normal">Super Admin</div>
                </div>
              </div>
            )}

            <button
              onClick={onLogout}
              className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 border border-transparent hover:border-rose-900/30 transition-colors"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
