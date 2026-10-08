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
  // Setup & Auth
  getSetupStatus: () => request<SetupStatus>('/api/setup/status'),
  initSetup: (data: { username: string; password: string; r2Config?: any }) =>
    request<{ success: boolean; token: string; username: string; publicKeyPem: string }>('/api/setup/init', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  login: (data: { username: string; password: string }) =>
    request<{ success: boolean; token: string; username: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getMe: () =>
    request<{ authenticated: boolean; username: string; publicKeyPem: string; r2Configured: boolean }>('/api/auth/me'),
  updateCredentials: (data: { currentPassword: string; newUsername?: string; newPassword?: string }) =>
    request<{ success: boolean; token: string; username: string }>('/api/auth/update-credentials', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Stats & Logs
  getStats: () => request<SystemStats>('/api/stats'),
  getLogs: (params: { limit?: number; offset?: number; action?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.offset) q.set('offset', params.offset.toString());
    if (params.action) q.set('action', params.action);
    return request<{ logs: ValidationLog[] }>(`/api/logs?${q.toString()}`);
  },
  clearLogs: () => request<{ success: boolean }>('/api/logs', { method: 'DELETE' }),

  // Apps Management
  getApps: (params: { search?: string; status?: string; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.status) q.set('status', params.status);
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.offset) q.set('offset', params.offset.toString());
    return request<{ apps: AppItem[]; total: number; limit: number; offset: number }>(`/api/apps?${q.toString()}`);
  },
  createApp: (data: { app_slug: string; display_name: string; min_version?: string; description?: string }) =>
    request<{ success: boolean; app: AppItem }>('/api/apps', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateApp: (id: string, data: Partial<AppItem>) =>
    request<{ success: boolean }>(`/api/apps/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteApp: (id: string) => request<{ success: boolean }>(`/api/apps/${id}`, { method: 'DELETE' }),
  bulkAppAction: (data: { ids: string[]; action: string }) =>
    request<{ success: boolean; affected: number }>('/api/apps/bulk-action', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
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
  getLicenses: (params: { search?: string; status?: string; tier?: string; app_id?: string; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.status) q.set('status', params.status);
    if (params.tier) q.set('tier', params.tier);
    if (params.app_id) q.set('app_id', params.app_id);
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.offset) q.set('offset', params.offset.toString());
    return request<{ licenses: License[]; total: number; limit: number; offset: number }>(`/api/licenses?${q.toString()}`);
  },
  createLicense: (data: Partial<License> & { prefix?: string }) =>
    request<{ success: boolean; license: License }>('/api/licenses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  bulkCreateLicenses: (data: {
    count: number;
    prefix?: string;
    tier?: string;
    app_id?: string | null;
    device_limit?: number;
    validity_type?: string;
    validity_value?: number;
    notes?: string;
    backupToR2?: boolean;
  }) =>
    request<{ success: boolean; count: number; pin: string; keys: string[]; csv: string; r2Backup: any }>('/api/licenses/bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateLicense: (id: string, data: Partial<License>) =>
    request<{ success: boolean }>(`/api/licenses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteLicense: (id: string) => request<{ success: boolean }>(`/api/licenses/${id}`, { method: 'DELETE' }),
  bulkAction: (data: { ids: string[]; action: string; extendDays?: number }) =>
    request<{ success: boolean; affected: number }>('/api/licenses/bulk-action', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getLicenseDevices: (licenseId: string) =>
    request<{ devices: Device[] }>(`/api/licenses/${licenseId}/devices`),
  resetLicenseDevices: (licenseId: string) =>
    request<{ success: boolean }>(`/api/licenses/${licenseId}/devices`, { method: 'DELETE' }),

  // Global Devices
  getDevices: (params: { search?: string; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.offset) q.set('offset', params.offset.toString());
    return request<{ devices: Device[]; total: number }>(`/api/devices?${q.toString()}`);
  },
  unbindDevice: (deviceId: string) =>
    request<{ success: boolean }>(`/api/devices/${deviceId}`, { method: 'DELETE' }),

  // Settings & R2
  getSettings: () =>
    request<{
      username: string;
      publicKeyPem: string;
      r2Config: Partial<R2Config>;
      hasTursoEnv: boolean;
      tursoUrl: string;
    }>('/api/settings'),
  saveR2Config: (config: R2Config) =>
    request<{ success: boolean; message: string }>('/api/settings/r2', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
  testR2Config: (config: Partial<R2Config>) =>
    request<{ success: boolean; message: string }>('/api/settings/r2/test', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
  getR2Backups: () => request<{ backups: R2Backup[] }>('/api/r2/backups'),
  rotateCryptoKeys: () =>
    request<{ success: boolean; publicKeyPem: string }>('/api/settings/crypto/rotate', { method: 'POST' }),

  // Site Settings & Branding
  getPublicSiteSettings: () => request<SiteSettings>('/api/public/site-settings'),
  getSiteSettings: () => request<{ siteSettings: SiteSettings; r2Configured: boolean }>('/api/settings/site'),
  saveSiteSettings: (data: Partial<SiteSettings>) =>
    request<{ success: boolean; siteSettings: SiteSettings }>('/api/settings/site', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
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
