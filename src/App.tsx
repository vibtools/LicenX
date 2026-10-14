import React, { useEffect, useState } from 'react';
import { api, clearAuthToken } from './services/apiClient';
import { SetupStatus, License, ActiveTab, SystemStats } from './types';
import { Sidebar } from './components/Sidebar';
import { HeaderBar } from './components/HeaderBar';
import { SetupModal } from './components/SetupModal';
import { LoginModal } from './components/LoginModal';
import { OverviewTab } from './components/OverviewTab';
import { AppsTab } from './components/AppsTab';
import { LicensesTab } from './components/LicensesTab';
import { DevicesTab } from './components/DevicesTab';
import { LogsTab } from './components/LogsTab';
import { SimulatorTab } from './components/SimulatorTab';
import { ClientCodeTab } from './components/ClientCodeTab';
import { ProfileTab } from './components/ProfileTab';
import { AdminApisTab } from './components/AdminApisTab';
import { SiteSettingsTab } from './components/SiteSettingsTab';
import { SettingsTab } from './components/SettingsTab';
import { CreateLicenseModal } from './components/CreateLicenseModal';
import { BulkLicenseModal } from './components/BulkLicenseModal';
import { ManageDevicesModal } from './components/ManageDevicesModal';
import { LandingPage } from './components/LandingPage';
import { NotFoundPage } from './components/NotFoundPage';
import { SiteSettings, DEFAULT_SITE_SETTINGS } from './types';
import { Loader2 } from 'lucide-react';
import { ConfirmProvider } from './context/ConfirmContext';

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const isAdminRoute = currentPath.startsWith('/vcon');
  const isPublicHome =
    currentPath === '/' ||
    currentPath === '' ||
    currentPath === '/index.html' ||
    currentPath === '/home' ||
    currentPath === '/check';

  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [publicKeyPem, setPublicKeyPem] = useState('');

  const VALID_TABS: ActiveTab[] = [
    'overview',
    'apps',
    'licenses',
    'devices',
    'logs',
    'simulator',
    'code',
    'profile',
    'admin-apis',
    'site-settings',
    'settings',
  ];

  const resolveActiveTab = (): ActiveTab => {
    if (typeof window === 'undefined') return 'overview';
    const path = window.location.pathname.toLowerCase();

    // 1. Pathname matches
    if (path.includes('/site-settings')) return 'site-settings';
    if (path.includes('/settings')) return 'settings';
    if (path.includes('/apps') || path.includes('/app')) return 'apps';
    if (path.includes('/licenses') || path.includes('/license')) return 'licenses';
    if (path.includes('/devices') || path.includes('/device') || path.includes('/hwid')) return 'devices';
    if (path.includes('/logs') || path.includes('/log') || path.includes('/audit')) return 'logs';
    if (path.includes('/simulator') || path.includes('/validator')) return 'simulator';
    if (path.includes('/code') || path.includes('/sdk')) return 'code';
    if (path.includes('/admin-apis') || path.includes('/api-keys')) return 'admin-apis';
    if (path.includes('/profile')) return 'profile';
    if (path.includes('/overview') || path.includes('/dashboard')) return 'overview';

    // 2. Query param ?tab=...
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab')?.toLowerCase() as ActiveTab;
      if (tabParam && VALID_TABS.includes(tabParam)) return tabParam;
    } catch {}

    // 3. Hash #...
    try {
      const hash = window.location.hash.replace('#', '').toLowerCase() as ActiveTab;
      if (hash && VALID_TABS.includes(hash)) return hash;
    } catch {}

    // 4. Session / local storage fallback (preserves tab across page reload on /vcon)
    try {
      const sessionTab = sessionStorage.getItem('vcon_admin_active_tab') as ActiveTab;
      if (sessionTab && VALID_TABS.includes(sessionTab)) return sessionTab;
      const localTab = localStorage.getItem('vcon_admin_active_tab') as ActiveTab;
      if (localTab && VALID_TABS.includes(localTab)) return localTab;
    } catch {}

    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<ActiveTab>(resolveActiveTab);
  const [stats, setStats] = useState<SystemStats | null>(null);

  // Tab change handler with URL and storage sync
  const handleTabChange = (tab: ActiveTab, updateHistory = true) => {
    setActiveTab(tab);
    try {
      sessionStorage.setItem('vcon_admin_active_tab', tab);
      localStorage.setItem('vcon_admin_active_tab', tab);
    } catch {}

    if (updateHistory && typeof window !== 'undefined') {
      const targetPath = tab === 'overview' ? '/vcon' : `/vcon/${tab}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ tab }, '', targetPath);
        setCurrentPath(targetPath);
      }
    }
  };

  // Sync browser URL and storage whenever activeTab or auth state updates
  useEffect(() => {
    if (isAdminRoute && authenticated) {
      const targetPath = activeTab === 'overview' ? '/vcon' : `/vcon/${activeTab}`;
      if (window.location.pathname !== targetPath) {
        window.history.replaceState({ tab: activeTab }, '', targetPath);
        setCurrentPath(targetPath);
      }
      try {
        sessionStorage.setItem('vcon_admin_active_tab', activeTab);
        localStorage.setItem('vcon_admin_active_tab', activeTab);
      } catch {}
    }
  }, [activeTab, isAdminRoute, authenticated]);

  // Site Settings & Branding State
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);

  useEffect(() => {
    api.getPublicSiteSettings().then((s) => {
      if (s && s.siteName) setSiteSettings(s);
    }).catch(() => {});
  }, []);

  // Synchronize Site Title, Favicon, OG Tags and Meta description dynamically
  useEffect(() => {
    if (siteSettings.siteTitle) {
      document.title = siteSettings.siteTitle;
    }
    if (siteSettings.metaDescription) {
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', siteSettings.metaDescription);
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute('content', siteSettings.metaDescription);
    }
    if (siteSettings.siteTitle) {
      let ogTitle = document.querySelector('meta[property="og:title"]');
      if (!ogTitle) {
        ogTitle = document.createElement('meta');
        ogTitle.setAttribute('property', 'og:title');
        document.head.appendChild(ogTitle);
      }
      ogTitle.setAttribute('content', siteSettings.siteTitle);
    }
    if (siteSettings.ogImageUrl) {
      let ogImg = document.querySelector('meta[property="og:image"]');
      if (!ogImg) {
        ogImg = document.createElement('meta');
        ogImg.setAttribute('property', 'og:image');
        document.head.appendChild(ogImg);
      }
      ogImg.setAttribute('content', siteSettings.ogImageUrl);
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

  // Sidebar Layout State with persistence
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('vcon_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const handleSetSidebarCollapsed = (val: boolean) => {
    setSidebarCollapsed(val);
    try {
      localStorage.setItem('vcon_sidebar_collapsed', String(val));
    } catch {}
  };

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [deviceInspectorLicense, setDeviceInspectorLicense] = useState<License | null>(null);

  // Refresh trigger counter
  const [refreshKey, setRefreshKey] = useState(0);

  // Sync route and active tab on popstate (browser back / forward buttons)
  useEffect(() => {
    const handleLocationChange = () => {
      const newPath = window.location.pathname;
      setCurrentPath(newPath);
      if (newPath.startsWith('/vcon')) {
        const resolved = resolveActiveTab();
        setActiveTab(resolved);
      }
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const checkAuthAndStatus = async (isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true);
      }
      clearAuthToken();
      const status = await api.getSetupStatus(true);
      setSetupStatus(status);

      if (!status.initialized) {
        setAuthenticated(false);
        return;
      }

      const [meRes, statsRes] = await Promise.all([
        api.getMe(true).catch(() => null),
        api.getStats(true).catch(() => null),
      ]);

      if (meRes?.authenticated) {
        setAuthenticated(true);
        setUsername(meRes.username);
        setPublicKeyPem(meRes.publicKeyPem);
        if (statsRes) setStats(statsRes);
      } else {
        setAuthenticated(false);
      }
    } catch (err) {
      console.error('Failed to initialize app', err);
    } finally {
      if (isInitial) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    checkAuthAndStatus(true);
  }, []);

  useEffect(() => {
    if (refreshKey > 0) {
      checkAuthAndStatus(false);
    }
  }, [refreshKey]);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Could not end the admin session', error);
      window.alert('Could not end the admin session. Please try again.');
      return;
    }
    clearAuthToken();
    setAuthenticated(false);
    setUsername('');
    try {
      sessionStorage.removeItem('vcon_admin_active_tab');
    } catch {}
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/vcon');
      setCurrentPath('/vcon');
    }
    setActiveTab('overview');
  };

  const handleRefresh = async () => {
    api.clearCache();
    setRefreshKey((k) => k + 1);
    try {
      const st = await api.getStats(true);
      setStats(st);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center font-sans text-xs text-slate-400 gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
        Initializing VCON Engine...
      </div>
    );
  }

  // User 404 Route -> Any non-admin path that is not the public home
  if (!isAdminRoute && !isPublicHome) {
    return (
      <NotFoundPage
        currentPath={currentPath}
        onGoHome={() => {
          window.history.pushState({}, '', '/');
          setCurrentPath('/');
        }}
        siteSettings={siteSettings}
      />
    );
  }

  // Root Public URL -> Landing Page
  if (!isAdminRoute) {
    return (
      <LandingPage
        siteSettings={siteSettings}
        onSettingsUpdated={(newS) => setSiteSettings(newS)}
      />
    );
  }

  // Admin Route (/vcon) -> Check if system is initialized
  if (setupStatus && !setupStatus.initialized) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <SetupModal
          hasTursoEnv={setupStatus.hasTursoEnv}
          onCompleted={(user) => {
            setUsername(user);
            setAuthenticated(true);
            setSetupStatus((prev) => (prev ? { ...prev, initialized: true, adminUsername: user } : null));
          }}
        />
      </div>
    );
  }

  // Admin Route (/vcon) -> If initialized but not logged in
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <LoginModal
          onLoginSuccess={async (user) => {
            setUsername(user);
            setAuthenticated(true);
            try {
              const me = await api.getMe();
              if (me?.publicKeyPem) setPublicKeyPem(me.publicKeyPem);
            } catch (err) {
              console.warn('Could not load profile details immediately:', err);
            }
            try {
              const st = await api.getStats();
              if (st) setStats(st);
            } catch (err) {
              console.warn('Could not load stats immediately:', err);
            }
          }}
        />
      </div>
    );
  }

  // Authenticated Admin Dashboard with Sidebar Layout
  return (
    <ConfirmProvider>
      <div className="min-h-screen bg-slate-950 text-slate-300 flex font-sans text-xs selection:bg-indigo-950/80 selection:text-slate-200 antialiased">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        username={username}
        onLogout={handleLogout}
        r2Configured={setupStatus?.r2Configured ?? false}
        hasTursoEnv={setupStatus?.hasTursoEnv ?? false}
        collapsed={sidebarCollapsed}
        setCollapsed={handleSetSidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        setMobileOpen={setMobileSidebarOpen}
        stats={
          stats
            ? {
                totalApps: stats.totalApps,
                activeLicenses: stats.activeLicenses,
                activeDevices: stats.activeDevices,
              }
            : undefined
        }
        siteSettings={siteSettings}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ease-in-out ${
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-56'
        }`}
      >
        {/* Top Header Bar */}
        <HeaderBar
          activeTab={activeTab}
          onOpenCreate={() => setShowCreateModal(true)}
          onOpenBulk={() => setShowBulkModal(true)}
          onRefresh={handleRefresh}
          onToggleMobileSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        />

        {/* Page Content Shell */}
        <main className="p-3 sm:p-4 md:p-5 flex-1 w-full max-w-7xl mx-auto">
          {activeTab === 'overview' && (
            <OverviewTab
              onOpenCreate={() => setShowCreateModal(true)}
              onOpenBulk={() => setShowBulkModal(true)}
              onNavigateTab={(tab) => handleTabChange(tab)}
            />
          )}

          {activeTab === 'apps' && (
            <AppsTab key={`apps-${refreshKey}`} />
          )}

          {activeTab === 'licenses' && (
            <LicensesTab
              key={`licenses-${refreshKey}`}
              onOpenCreate={() => setShowCreateModal(true)}
              onOpenBulk={() => setShowBulkModal(true)}
              onManageDevices={(lic) => setDeviceInspectorLicense(lic)}
            />
          )}

          {activeTab === 'devices' && <DevicesTab key={`devices-${refreshKey}`} />}

          {activeTab === 'logs' && <LogsTab key={`logs-${refreshKey}`} />}

          {activeTab === 'simulator' && <SimulatorTab />}

          {activeTab === 'code' && <ClientCodeTab publicKeyPem={publicKeyPem} />}

          {activeTab === 'profile' && (
            <ProfileTab
              username={username}
              onUsernameUpdated={(newU) => setUsername(newU)}
            />
          )}

          {activeTab === 'admin-apis' && (
            <AdminApisTab
              onNavigateToTab={(tab) => handleTabChange(tab as ActiveTab)}
            />
          )}

          {activeTab === 'site-settings' && (
            <SiteSettingsTab
              onNavigateToTab={(tab) => handleTabChange(tab)}
              onSettingsUpdated={(newS) => setSiteSettings(newS)}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              publicKeyPem={publicKeyPem}
              onPublicKeyUpdated={(key) => setPublicKeyPem(key)}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateLicenseModal
          onClose={() => {
            setShowCreateModal(false);
            handleRefresh();
          }}
          onCreated={() => {
            // Keep modal open so the user sees the success message, created license list, and copy button
            api.clearCache();
            api.getStats(true).then((st) => setStats(st)).catch(() => {});
          }}
        />
      )}

      {showBulkModal && (
        <BulkLicenseModal
          r2Configured={setupStatus?.r2Configured ?? false}
          onClose={() => {
            setShowBulkModal(false);
            handleRefresh();
          }}
          onCompleted={() => {
            // Keep modal open so user can inspect created list and copy credentials
            api.clearCache();
            api.getStats(true).then((st) => setStats(st)).catch(() => {});
          }}
        />
      )}

      {deviceInspectorLicense && (
        <ManageDevicesModal
          license={deviceInspectorLicense}
          onClose={() => setDeviceInspectorLicense(null)}
          onDevicesUpdated={() => {
            handleRefresh();
          }}
        />
      )}
      </div>
    </ConfirmProvider>
  );
}
