import React, { useEffect, useState } from 'react';
import { api, getAuthToken, clearAuthToken } from './services/apiClient';
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
import { SiteSettingsTab } from './components/SiteSettingsTab';
import { SettingsTab } from './components/SettingsTab';
import { CreateLicenseModal } from './components/CreateLicenseModal';
import { BulkLicenseModal } from './components/BulkLicenseModal';
import { ManageDevicesModal } from './components/ManageDevicesModal';
import { LandingPage } from './components/LandingPage';
import { NotFoundPage } from './components/NotFoundPage';
import { SiteSettings, DEFAULT_SITE_SETTINGS } from './types';
import { Loader2 } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const path = window.location.pathname;
    if (path.includes('/apps') || path.includes('/app')) return 'apps';
    if (path.includes('/licenses')) return 'licenses';
    if (path.includes('/devices')) return 'devices';
    if (path.includes('/logs')) return 'logs';
    if (path.includes('/simulator')) return 'simulator';
    if (path.includes('/code')) return 'code';
    if (path.includes('/profile')) return 'profile';
    if (path.includes('/site-settings')) return 'site-settings';
    if (path.includes('/settings')) return 'settings';
    return 'overview';
  });
  const [stats, setStats] = useState<SystemStats | null>(null);

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

  // Sidebar Layout State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [deviceInspectorLicense, setDeviceInspectorLicense] = useState<License | null>(null);

  // Refresh trigger counter
  const [refreshKey, setRefreshKey] = useState(0);

  // Sync route on popstate
  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const checkAuthAndStatus = async () => {
    try {
      setLoading(true);
      const token = getAuthToken();

      if (token) {
        // Parallel execution on boot for blazing fast initial load
        const [statusRes, meRes, statsRes] = await Promise.all([
          api.getSetupStatus().catch(() => null),
          api.getMe().catch(() => null),
          api.getStats().catch(() => null),
        ]);

        if (statusRes) {
          setSetupStatus(statusRes);
        }

        if (meRes && meRes.authenticated) {
          setAuthenticated(true);
          setUsername(meRes.username);
          setPublicKeyPem(meRes.publicKeyPem);
          if (statsRes) setStats(statsRes);
        } else {
          clearAuthToken();
          setAuthenticated(false);
        }
      } else {
        const status = await api.getSetupStatus();
        setSetupStatus(status);
      }
    } catch (err) {
      console.error('Failed to initialize app', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuthAndStatus();
  }, [refreshKey]);

  const handleLogout = () => {
    clearAuthToken();
    setAuthenticated(false);
    setUsername('');
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
      />
    );
  }

  // Root Public URL -> Landing Page
  if (!isAdminRoute) {
    return <LandingPage />;
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
    <div className="min-h-screen bg-slate-950 text-slate-300 flex font-sans text-xs selection:bg-indigo-950/80 selection:text-slate-200 antialiased">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        username={username}
        onLogout={handleLogout}
        r2Configured={setupStatus?.r2Configured ?? false}
        hasTursoEnv={setupStatus?.hasTursoEnv ?? false}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
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
              onNavigateTab={(tab) => setActiveTab(tab)}
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

          {activeTab === 'site-settings' && (
            <SiteSettingsTab
              onNavigateToTab={(tab) => setActiveTab(tab)}
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
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            handleRefresh();
          }}
        />
      )}

      {showBulkModal && (
        <BulkLicenseModal
          r2Configured={setupStatus?.r2Configured ?? false}
          onClose={() => setShowBulkModal(false)}
          onCompleted={() => {
            handleRefresh();
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
  );
}
