import { SetupStatus, SystemStats, License, Device, ValidationLog, R2Config, R2Backup, AppItem, SiteSettings } from '../types';

const TOKEN_KEY = 'vcon_admin_token';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  invalidateCache();
}

// High Performance In-Memory Cache for Client-Side Runtime
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const clientCache = new Map<string, CacheEntry<any>>();

export function getCached<T>(key: string, maxAgeMs: number): T | null {
  const entry = clientCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > maxAgeMs) {
    clientCache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T): void {
  clientCache.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    clientCache.clear();
    return;
  }
  for (const key of clientCache.keys()) {
    if (key.startsWith(prefix) || key.includes(prefix)) {
      clientCache.delete(key);
    }
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed with status ${res.status}`);
  }

  return data as T;
}

export const api = {
  // Cache Controller
  clearCache: () => invalidateCache(),

  // Setup & Auth
  getSetupStatus: async (force = false) => {
    const key = 'setup_status';
    if (!force) {
      const cached = getCached<SetupStatus>(key, 30000);
      if (cached) return cached;
    }
    const data = await request<SetupStatus>('/api/setup/status');
    setCached(key, data);
    return data;
  },
  initSetup: async (data: { username: string; password: string; r2Config?: any }) => {
    invalidateCache();
    return request<{ success: boolean; token: string; username: string; publicKeyPem: string }>('/api/setup/init', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  login: async (data: { username: string; password: string }) => {
    invalidateCache();
    return request<{ success: boolean; token: string; username: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  getMe: async (force = false) => {
    const key = 'auth_me';
    if (!force) {
      const cached = getCached<{ authenticated: boolean; username: string; publicKeyPem: string; r2Configured: boolean }>(key, 30000);
      if (cached) return cached;
    }
    const data = await request<{ authenticated: boolean; username: string; publicKeyPem: string; r2Configured: boolean }>('/api/auth/me');
    setCached(key, data);
    return data;
  },
  updateCredentials: async (data: { currentPassword: string; newUsername?: string; newPassword?: string }) => {
    invalidateCache();
    return request<{ success: boolean; token: string; username: string }>('/api/auth/update-credentials', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Stats & Logs
  getStats: async (force = false) => {
    const key = 'system_stats';
    if (!force) {
      const cached = getCached<SystemStats>(key, 5000);
      if (cached) return cached;
    }
    const data = await request<SystemStats>('/api/stats');
    setCached(key, data);
    return data;
  },
  getLogs: async (params: { limit?: number; offset?: number; action?: string } = {}, force = false) => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.offset) q.set('offset', params.offset.toString());
    if (params.action) q.set('action', params.action);
    const key = `logs_${q.toString()}`;
    if (!force) {
      const cached = getCached<any>(key, 10000);
      if (cached) return cached;
    }
    const data = await request<any>(`/api/logs?${q.toString()}`);
    let result = { logs: [] as ValidationLog[] };
    if (Array.isArray(data)) {
      result = { logs: data };
    } else {
      result = { logs: Array.isArray(data?.logs) ? data.logs : [] };
    }
    setCached(key, result);
    return result;
  },
  clearLogs: async () => {
    invalidateCache('logs');
    invalidateCache('system_stats');
    return request<{ success: boolean }>('/api/logs', { method: 'DELETE' });
  },

  // Apps Management
  getApps: async (params: { search?: string; status?: string; limit?: number; offset?: number } = {}, force = false) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.status) q.set('status', params.status);
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.offset) q.set('offset', params.offset.toString());
    const key = `apps_${q.toString()}`;
    if (!force) {
      const cached = getCached<any>(key, 15000);
      if (cached) return cached;
    }
    const data = await request<any>(`/api/apps?${q.toString()}`);
    let result = {
      apps: [] as AppItem[],
      total: 0,
      limit: params.limit || 50,
      offset: params.offset || 0,
    };
    if (Array.isArray(data)) {
      result = { apps: data, total: data.length, limit: params.limit || 50, offset: params.offset || 0 };
    } else {
      result = {
        apps: Array.isArray(data?.apps) ? data.apps : [],
        total: typeof data?.total === 'number' ? data.total : (data?.apps?.length || 0),
        limit: data?.limit || params.limit || 50,
        offset: data?.offset || params.offset || 0,
      };
    }
    setCached(key, result);
    return result;
  },
  createApp: async (data: { app_slug: string; display_name: string; min_version?: string; description?: string }) => {
    invalidateCache('apps');
    invalidateCache('system_stats');
    return request<{ success: boolean; app: AppItem }>('/api/apps', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateApp: async (id: string, data: Partial<AppItem>) => {
    invalidateCache('apps');
    invalidateCache('system_stats');
    return request<{ success: boolean }>(`/api/apps/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  deleteApp: async (id: string) => {
    invalidateCache('apps');
    invalidateCache('system_stats');
    return request<{ success: boolean }>(`/api/apps/${id}`, { method: 'DELETE' });
  },
  bulkAppAction: async (data: { ids: string[]; action: string }) => {
    invalidateCache('apps');
    invalidateCache('system_stats');
    return request<{ success: boolean; affected: number }>('/api/apps/bulk-action', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  downloadAppConfig: async (id: string, appSlug: string) => {
    const token = getAuthToken();
    const res = await fetch(`/api/apps/${id}/config`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Failed to download config');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${appSlug}_vcon_config.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // Licenses
  getLicenses: async (params: { search?: string; status?: string; tier?: string; app_id?: string; limit?: number; offset?: number } = {}, force = false) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.status) q.set('status', params.status);
    if (params.tier) q.set('tier', params.tier);
    if (params.app_id) q.set('app_id', params.app_id);
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.offset) q.set('offset', params.offset.toString());
    const key = `licenses_${q.toString()}`;
    if (!force) {
      const cached = getCached<any>(key, 15000);
      if (cached) return cached;
    }
    const data = await request<any>(`/api/licenses?${q.toString()}`);
    let result = {
      licenses: [] as License[],
      total: 0,
      limit: params.limit || 50,
      offset: params.offset || 0,
    };
    if (Array.isArray(data)) {
      result = { licenses: data, total: data.length, limit: params.limit || 50, offset: params.offset || 0 };
    } else {
      result = {
        licenses: Array.isArray(data?.licenses) ? data.licenses : [],
        total: typeof data?.total === 'number' ? data.total : (data?.licenses?.length || 0),
        limit: data?.limit || params.limit || 50,
        offset: data?.offset || params.offset || 0,
      };
    }
    setCached(key, result);
    return result;
  },
  createLicense: async (data: Partial<License> & { prefix?: string }) => {
    invalidateCache('licenses');
    invalidateCache('system_stats');
    return request<{ success: boolean; license: License }>('/api/licenses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  bulkCreateLicenses: async (data: {
    count: number;
    prefix?: string;
    tier?: string;
    app_id?: string | null;
    device_limit?: number;
    validity_type?: string;
    validity_value?: number;
    notes?: string;
    backupToR2?: boolean;
  }) => {
    invalidateCache('licenses');
    invalidateCache('system_stats');
    return request<{ success: boolean; count: number; pin: string; keys: string[]; csv: string; r2Backup: any }>('/api/licenses/bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateLicense: async (id: string, data: Partial<License>) => {
    invalidateCache('licenses');
    invalidateCache('system_stats');
    return request<{ success: boolean }>(`/api/licenses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  deleteLicense: async (id: string) => {
    invalidateCache('licenses');
    invalidateCache('devices');
    invalidateCache('system_stats');
    return request<{ success: boolean }>(`/api/licenses/${id}`, { method: 'DELETE' });
  },
  bulkAction: async (data: { ids: string[]; action: string; extendDays?: number }) => {
    invalidateCache('licenses');
    invalidateCache('system_stats');
    return request<{ success: boolean; affected: number }>('/api/licenses/bulk-action', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  getLicenseDevices: async (licenseId: string) => {
    const data = await request<any>(`/api/licenses/${licenseId}/devices`);
    if (Array.isArray(data)) {
      return { devices: data };
    }
    return { devices: Array.isArray(data?.devices) ? data.devices : [] };
  },
  resetLicenseDevices: async (licenseId: string) => {
    invalidateCache('licenses');
    invalidateCache('devices');
    invalidateCache('system_stats');
    return request<{ success: boolean }>(`/api/licenses/${licenseId}/devices`, { method: 'DELETE' });
  },

  // Global Devices
  getDevices: async (params: { search?: string; limit?: number; offset?: number } = {}, force = false) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.offset) q.set('offset', params.offset.toString());
    const key = `devices_${q.toString()}`;
    if (!force) {
      const cached = getCached<any>(key, 15000);
      if (cached) return cached;
    }
    const data = await request<any>(`/api/devices?${q.toString()}`);
    let result = {
      devices: [] as Device[],
      total: 0,
    };
    if (Array.isArray(data)) {
      result = { devices: data, total: data.length };
    } else {
      result = {
        devices: Array.isArray(data?.devices) ? data.devices : [],
        total: typeof data?.total === 'number' ? data.total : (data?.devices?.length || 0),
      };
    }
    setCached(key, result);
    return result;
  },
  unbindDevice: async (deviceId: string) => {
    invalidateCache('devices');
    invalidateCache('licenses');
    invalidateCache('system_stats');
    return request<{ success: boolean }>(`/api/devices/${deviceId}`, { method: 'DELETE' });
  },

  // Settings & R2
  getSettings: () =>
    request<{
      username: string;
      publicKeyPem: string;
      r2Config: Partial<R2Config>;
      hasTursoEnv: boolean;
      tursoUrl: string;
    }>('/api/settings'),
  saveR2Config: async (config: R2Config) => {
    invalidateCache('settings');
    return request<{ success: boolean; message: string }>('/api/settings/r2', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },
  testR2Config: (config: Partial<R2Config>) =>
    request<{ success: boolean; message: string }>('/api/settings/r2/test', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
  getR2Backups: () => request<{ backups: R2Backup[] }>('/api/r2/backups'),
  rotateCryptoKeys: async () => {
    invalidateCache();
    return request<{ success: boolean; publicKeyPem: string }>('/api/settings/crypto/rotate', { method: 'POST' });
  },

  // Site Settings & Branding
  getPublicSiteSettings: async (force = false) => {
    const key = 'public_site_settings';
    if (!force) {
      const cached = getCached<SiteSettings>(key, 60000);
      if (cached) return cached;
    }
    const data = await request<SiteSettings>('/api/public/site-settings');
    setCached(key, data);
    return data;
  },
  getSiteSettings: () => request<{ siteSettings: SiteSettings; r2Configured: boolean }>('/api/settings/site'),
  saveSiteSettings: async (data: Partial<SiteSettings>) => {
    invalidateCache('public_site_settings');
    return request<{ success: boolean; siteSettings: SiteSettings }>('/api/settings/site', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  uploadSiteAsset: (data: { filename: string; contentType: string; dataBase64: string; folder?: string }) =>
    request<{ success: boolean; url: string; signedUrl?: string; key: string }>('/api/settings/upload', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Public Client Endpoints
  validateLicense: (data: {
    license_key: string;
    hwid: string;
    app_name?: string;
    app_version?: string;
    device_name?: string;
    os_info?: string;
  }) =>
    fetch('/api/v1/license/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, client_time: Date.now() }),
    }).then(async (res) => {
      const body = await res.json();
      return { status: res.status, ok: res.ok, data: body };
    }),
  getPublicKey: () =>
    request<{ algorithm: string; publicKeyPem: string; serverTime: number }>('/api/v1/public-key'),

  // Python SDK Download
  downloadPythonSdk: async () => {
    const res = await fetch('/api/sdk/download/python');
    if (!res.ok) throw new Error('Failed to download Python SDK');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'x_license_python.zip';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // User Public Self-Service Endpoints
  checkUserLicense: (license_key: string) =>
    request<{ status: string; device_limit: number; active_device_count: number }>('/api/v1/user/license/check', {
      method: 'POST',
      body: JSON.stringify({ license_key }),
    }),
  openUserControl: (license_key: string, pin: string) =>
    request<{ license: any; devices: any[] }>('/api/v1/user/control/open', {
      method: 'POST',
      body: JSON.stringify({ license_key, pin }),
    }),
  resetUserControl: (license_key: string, pin: string) =>
    request<{ success: boolean; message: string }>('/api/v1/user/control/reset', {
      method: 'POST',
      body: JSON.stringify({ license_key, pin }),
    }),
};
