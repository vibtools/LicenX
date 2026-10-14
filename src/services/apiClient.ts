import {
  AdminApiKeyRecord,
  AppItem,
  CreatedAdminApiKey,
  Device,
  License,
  R2Backup,
  R2Config,
  SetupStatus,
  SiteSettings,
  SystemStats,
  ValidationLog,
} from "../types";

export function clearAuthToken(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("vcon_admin_token");
  }
  invalidateCache();
}

// High Performance In-Memory Cache for Client-Side Runtime
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const clientCache = new Map<string, CacheEntry<any>>();
let csrfTokenPromise: Promise<string> | null = null;
const API_REQUEST_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function safeErrorMessage(status: number): string {
  if (status === 0)
    return "Unable to connect. Check your connection and try again.";
  if (status === 400 || status === 422) {
    return "The request could not be completed. Check the entered values and try again.";
  }
  if (status === 401)
    return "Authentication failed or your session has expired.";
  if (status === 403)
    return "You do not have permission to perform this action.";
  if (status === 404) return "The requested resource could not be found.";
  if (status === 409) return "The request conflicts with the current state.";
  if (status === 429) return "Too many requests. Please wait and try again.";
  if (status >= 500)
    return "The server could not complete the request. Please try again.";
  return "The request could not be completed. Please try again.";
}

function safeErrorCode(data: unknown, fallback: string): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    typeof data.code === "string" &&
    /^[A-Z0-9_]{1,64}$/.test(data.code)
  ) {
    return data.code;
  }
  return fallback;
}

const DIAGNOSTIC_REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ValidationDiagnostic {
  request_id: string;
  stage: string;
  error_name: string;
  error_message: string;
}

function isValidationDiagnostic(value: unknown): value is ValidationDiagnostic {
  if (typeof value !== "object" || value === null) return false;
  const diagnostic = value as Record<string, unknown>;
  return (
    typeof diagnostic.request_id === "string" &&
    DIAGNOSTIC_REQUEST_ID_PATTERN.test(diagnostic.request_id) &&
    typeof diagnostic.stage === "string" &&
    /^[a-z_]{1,64}$/.test(diagnostic.stage) &&
    typeof diagnostic.error_name === "string" &&
    diagnostic.error_name.length <= 128 &&
    typeof diagnostic.error_message === "string" &&
    diagnostic.error_message.length <= 2000
  );
}

async function fetchWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  readBody: (response: Response) => Promise<T>,
): Promise<{ response: Response; body: T }> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, API_REQUEST_TIMEOUT_MS);
  const externalSignal = init.signal;
  const abortFromCaller = () => controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted) {
    abortFromCaller();
  } else {
    externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return { response, body: await readBody(response) };
  } catch {
    if (timedOut) {
      throw new ApiError(
        "The request timed out. Please try again.",
        0,
        "TIMEOUT",
      );
    }
    if (externalSignal?.aborted) {
      throw new ApiError("The request was cancelled.", 0, "REQUEST_ABORTED");
    }
    throw new ApiError(safeErrorMessage(0), 0, "NETWORK_ERROR");
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

async function getCsrfToken(): Promise<string> {
  if (!csrfTokenPromise) {
    csrfTokenPromise = fetchWithTimeout(
      "/api/auth/csrf",
      {
        credentials: "same-origin",
      },
      (response) => response.text(),
    )
      .then(({ response: res, body }) => {
        let data: unknown;
        try {
          data = JSON.parse(body);
        } catch {
          throw new ApiError(
            safeErrorMessage(res.status),
            res.status,
            "INVALID_RESPONSE",
          );
        }
        if (
          !res.ok ||
          typeof data !== "object" ||
          data === null ||
          !("csrfToken" in data) ||
          typeof data.csrfToken !== "string"
        ) {
          throw new ApiError(
            safeErrorMessage(res.status),
            res.status,
            safeErrorCode(data, "CSRF_INITIALIZATION_FAILED"),
          );
        }
        return data.csrfToken;
      })
      .catch((error: unknown) => {
        csrfTokenPromise = null;
        throw error;
      });
  }
  return csrfTokenPromise;
}

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

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const method = (options.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("X-CSRF-Token", await getCsrfToken());
  }

  const { response: res, body } = await fetchWithTimeout(
    endpoint,
    {
      ...options,
      credentials: "same-origin",
      headers,
    },
    (response) => response.text(),
  );

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new ApiError(
      "The server returned an invalid response. Please try again.",
      res.status,
      "INVALID_RESPONSE",
    );
  }

  if (!res.ok) {
    throw new ApiError(
      safeErrorMessage(res.status),
      res.status,
      safeErrorCode(data, `HTTP_${res.status}`),
    );
  }

  if (typeof data !== "object" || data === null) {
    throw new ApiError(
      "The server returned an invalid response. Please try again.",
      res.status,
      "INVALID_RESPONSE",
    );
  }

  return data as T;
}

export const api = {
  // Cache Controller
  clearCache: () => invalidateCache(),

  // Setup & Auth
  getSetupStatus: async (force = false) => {
    const key = "setup_status";
    if (!force) {
      const cached = getCached<SetupStatus>(key, 30000);
      if (cached) return cached;
    }
    const data = await request<SetupStatus>("/api/setup/status");
    setCached(key, data);
    return data;
  },
  initSetup: async (data: {
    username: string;
    password: string;
    r2Config?: any;
  }) => {
    invalidateCache();
    return request<{
      success: boolean;
      username: string;
      publicKeyPem: string;
    }>("/api/setup/init", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  login: async (data: { username: string; password: string }) => {
    invalidateCache();
    return request<{ success: boolean; username: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  logout: async () => {
    invalidateCache();
    await request<{ success: boolean }>("/api/auth/logout", {
      method: "POST",
      body: "{}",
    });
  },
  getMe: async (force = false) => {
    const key = "auth_me";
    if (!force) {
      const cached = getCached<{
        authenticated: boolean;
        username: string;
        publicKeyPem: string;
        r2Configured: boolean;
      }>(key, 30000);
      if (cached) return cached;
    }
    const data = await request<{
      authenticated: boolean;
      username: string;
      publicKeyPem: string;
      r2Configured: boolean;
    }>("/api/auth/me");
    setCached(key, data);
    return data;
  },
  updateCredentials: async (data: {
    currentPassword: string;
    newUsername?: string;
    newPassword?: string;
  }) => {
    invalidateCache();
    return request<{ success: boolean; username: string }>(
      "/api/auth/update-credentials",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
  },

  // Stats & Logs
  getStats: async (force = false) => {
    const key = "system_stats";
    if (!force) {
      const cached = getCached<SystemStats>(key, 5000);
      if (cached) return cached;
    }
    const data = await request<SystemStats>("/api/stats");
    setCached(key, data);
    return data;
  },
  getLogs: async (
    params: { limit?: number; offset?: number; action?: string } = {},
    force = false,
  ) => {
    const q = new URLSearchParams();
    if (params.limit) q.set("limit", params.limit.toString());
    if (params.offset) q.set("offset", params.offset.toString());
    if (params.action) q.set("action", params.action);
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
    invalidateCache("logs");
    invalidateCache("system_stats");
    return request<{ success: boolean }>("/api/logs", { method: "DELETE" });
  },

  // Apps Management
  getApps: async (
    params: {
      search?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {},
    force = false,
  ) => {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    if (params.status) q.set("status", params.status);
    if (params.limit) q.set("limit", params.limit.toString());
    if (params.offset) q.set("offset", params.offset.toString());
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
      result = {
        apps: data,
        total: data.length,
        limit: params.limit || 50,
        offset: params.offset || 0,
      };
    } else {
      result = {
        apps: Array.isArray(data?.apps) ? data.apps : [],
        total:
          typeof data?.total === "number"
            ? data.total
            : data?.apps?.length || 0,
        limit: data?.limit || params.limit || 50,
        offset: data?.offset || params.offset || 0,
      };
    }
    setCached(key, result);
    return result;
  },
  createApp: async (data: {
    app_slug: string;
    display_name: string;
    min_version?: string;
    description?: string;
  }) => {
    invalidateCache("apps");
    invalidateCache("system_stats");
    return request<{ success: boolean; app: AppItem }>("/api/apps", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updateApp: async (id: string, data: Partial<AppItem>) => {
    invalidateCache("apps");
    invalidateCache("system_stats");
    return request<{ success: boolean }>(`/api/apps/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  deleteApp: async (id: string) => {
    invalidateCache("apps");
    invalidateCache("system_stats");
    return request<{ success: boolean }>(`/api/apps/${id}`, {
      method: "DELETE",
    });
  },
  bulkAppAction: async (data: { ids: string[]; action: string }) => {
    invalidateCache("apps");
    invalidateCache("system_stats");
    return request<{ success: boolean; affected: number }>(
      "/api/apps/bulk-action",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
  },
  downloadAppConfig: async (id: string, appSlug: string) => {
    const { response: res, body: blob } = await fetchWithTimeout(
      `/api/apps/${id}/config`,
      { credentials: "same-origin" },
      (response) => response.blob(),
    );
    if (!res.ok) {
      throw new ApiError(
        safeErrorMessage(res.status),
        res.status,
        `HTTP_${res.status}`,
      );
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${appSlug}_vcon_config.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // Licenses
  getLicenses: async (
    params: {
      search?: string;
      status?: string;
      tier?: string;
      app_id?: string;
      limit?: number;
      offset?: number;
    } = {},
    force = false,
  ) => {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    if (params.status) q.set("status", params.status);
    if (params.tier) q.set("tier", params.tier);
    if (params.app_id) q.set("app_id", params.app_id);
    if (params.limit) q.set("limit", params.limit.toString());
    if (params.offset) q.set("offset", params.offset.toString());
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
      result = {
        licenses: data,
        total: data.length,
        limit: params.limit || 50,
        offset: params.offset || 0,
      };
    } else {
      result = {
        licenses: Array.isArray(data?.licenses) ? data.licenses : [],
        total:
          typeof data?.total === "number"
            ? data.total
            : data?.licenses?.length || 0,
        limit: data?.limit || params.limit || 50,
        offset: data?.offset || params.offset || 0,
      };
    }
    setCached(key, result);
    return result;
  },
  createLicense: async (data: Partial<License> & { prefix?: string }) => {
    invalidateCache("licenses");
    invalidateCache("system_stats");
    return request<{ success: boolean; license: License }>("/api/licenses", {
      method: "POST",
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
    invalidateCache("licenses");
    invalidateCache("system_stats");
    return request<{
      success: boolean;
      count: number;
      pin: string;
      keys: string[];
      csv: string;
      r2Backup: any;
    }>("/api/licenses/bulk", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updateLicense: async (id: string, data: Partial<License>) => {
    invalidateCache("licenses");
    invalidateCache("system_stats");
    return request<{ success: boolean }>(`/api/licenses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  deleteLicense: async (id: string) => {
    invalidateCache("licenses");
    invalidateCache("devices");
    invalidateCache("system_stats");
    return request<{ success: boolean }>(`/api/licenses/${id}`, {
      method: "DELETE",
    });
  },
  bulkAction: async (data: {
    ids: string[];
    action: string;
    extendDays?: number;
  }) => {
    invalidateCache("licenses");
    invalidateCache("system_stats");
    return request<{ success: boolean; affected: number }>(
      "/api/licenses/bulk-action",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
  },
  getLicenseDevices: async (licenseId: string) => {
    const data = await request<any>(`/api/licenses/${licenseId}/devices`);
    if (Array.isArray(data)) {
      return { devices: data };
    }
    return { devices: Array.isArray(data?.devices) ? data.devices : [] };
  },
  resetLicenseDevices: async (licenseId: string) => {
    invalidateCache("licenses");
    invalidateCache("devices");
    invalidateCache("system_stats");
    return request<{ success: boolean }>(`/api/licenses/${licenseId}/devices`, {
      method: "DELETE",
    });
  },

  // Global Devices
  getDevices: async (
    params: { search?: string; limit?: number; offset?: number } = {},
    force = false,
  ) => {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    if (params.limit) q.set("limit", params.limit.toString());
    if (params.offset) q.set("offset", params.offset.toString());
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
        total:
          typeof data?.total === "number"
            ? data.total
            : data?.devices?.length || 0,
      };
    }
    setCached(key, result);
    return result;
  },
  unbindDevice: async (deviceId: string) => {
    invalidateCache("devices");
    invalidateCache("licenses");
    invalidateCache("system_stats");
    return request<{ success: boolean }>(`/api/devices/${deviceId}`, {
      method: "DELETE",
    });
  },

  // Settings & R2
  getSettings: () =>
    request<{
      username: string;
      publicKeyPem: string;
      r2Config: Partial<R2Config>;
      hasTursoEnv: boolean;
      tursoUrl: string;
    }>("/api/settings"),
  saveR2Config: async (config: R2Config) => {
    invalidateCache("settings");
    return request<{ success: boolean; message: string }>("/api/settings/r2", {
      method: "POST",
      body: JSON.stringify(config),
    });
  },
  testR2Config: (config: Partial<R2Config>) =>
    request<{ success: boolean; message: string }>("/api/settings/r2/test", {
      method: "POST",
      body: JSON.stringify(config),
    }),
  getR2Backups: () => request<{ backups: R2Backup[] }>("/api/r2/backups"),
  rotateCryptoKeys: async () => {
    invalidateCache();
    return request<{ success: boolean; publicKeyPem: string }>(
      "/api/settings/crypto/rotate",
      { method: "POST" },
    );
  },

  // Site Settings & Branding
  getPublicSiteSettings: async (force = false) => {
    const key = "public_site_settings";
    if (!force) {
      const cached = getCached<SiteSettings>(key, 5000);
      if (cached) return cached;
    }
    const data = await request<SiteSettings>("/api/public/site-settings");
    setCached(key, data);
    return data;
  },
  // Admin API Keys Management
  getAdminApiKeys: () =>
    request<{ success: boolean; keys: AdminApiKeyRecord[] }>(
      "/api/admin-api-keys",
    ),
  createAdminApiKey: (data: {
    name: string;
    prefix?: string;
    permissions?: string[];
    app_id?: string | null;
  }) =>
    request<{ success: boolean; key: CreatedAdminApiKey }>(
      "/api/admin-api-keys",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),
  deleteAdminApiKey: (id: string) =>
    request<{ success: boolean; message: string }>(
      `/api/admin-api-keys/${id}`,
      {
        method: "DELETE",
      },
    ),

  getSiteSettings: () =>
    request<{ siteSettings: SiteSettings; r2Configured: boolean }>(
      "/api/settings/site",
    ),
  saveSiteSettings: async (data: Partial<SiteSettings>) => {
    invalidateCache("public_site_settings");
    return request<{ success: boolean; siteSettings: SiteSettings }>(
      "/api/settings/site",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
  },
  uploadSiteAsset: (data: {
    filename: string;
    contentType: string;
    dataBase64: string;
    folder?: string;
  }) =>
    request<{ success: boolean; url: string; signedUrl?: string; key: string }>(
      "/api/settings/upload",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),

  // Public Client Endpoints
  validateLicense: async (data: {
    license_key: string;
    hwid: string;
    app_name?: string;
    app_version?: string;
    device_name?: string;
    os_info?: string;
  }) => {
    const requestId = globalThis.crypto.randomUUID();
    try {
      const csrfToken = await getCsrfToken();
      const { response: res, body } = await fetchWithTimeout(
        "/api/v1/license/validate",
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
            "X-LicenX-Diagnostic-Request-ID": requestId,
          },
          body: JSON.stringify({ ...data, client_time: Date.now() }),
        },
        (response) => response.text(),
      );
      let responseData: unknown;
      try {
        responseData = JSON.parse(body);
      } catch {
        throw new ApiError(
          "The server returned an invalid response. Please try again.",
          res.status,
          "INVALID_RESPONSE",
        );
      }
      const parsedResponse =
        typeof responseData === "object" && responseData !== null
          ? (responseData as Record<string, unknown>)
          : null;
      const responseRequestId =
        typeof parsedResponse?.request_id === "string" &&
        DIAGNOSTIC_REQUEST_ID_PATTERN.test(parsedResponse.request_id)
          ? parsedResponse.request_id
          : requestId;
      const diagnosticCandidate = parsedResponse?.diagnostic;
      const diagnostic = isValidationDiagnostic(diagnosticCandidate)
        ? {
            request_id: diagnosticCandidate.request_id,
            stage: diagnosticCandidate.stage,
            error_name: diagnosticCandidate.error_name,
            error_message: diagnosticCandidate.error_message,
          }
        : undefined;
      if (!res.ok) {
        responseData = {
          error: safeErrorMessage(res.status),
          code: safeErrorCode(responseData, `HTTP_${res.status}`),
          request_id: responseRequestId,
          ...(diagnostic && diagnostic.request_id === responseRequestId
            ? { diagnostic }
            : {}),
        };
      }
      return {
        status: res.status,
        ok: res.ok,
        requestId: responseRequestId,
        data: responseData,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw new ApiError(error.message, error.status, error.code, requestId);
      }
      throw error;
    }
  },
  getPublicKey: () =>
    request<{ algorithm: string; publicKeyPem: string; serverTime: number }>(
      "/api/v1/public-key",
    ),

  // Python SDK Download
  downloadPythonSdk: async () => {
    const { response: res, body: blob } = await fetchWithTimeout(
      "/api/sdk/download/python",
      {},
      (response) => response.blob(),
    );
    if (!res.ok) {
      throw new ApiError(
        safeErrorMessage(res.status),
        res.status,
        `HTTP_${res.status}`,
      );
    }
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "x_license_python.zip";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // User Public Self-Service Endpoints
  checkUserLicense: (license_key: string) =>
    request<{
      status: string;
      device_limit: number;
      active_device_count: number;
    }>("/api/v1/user/license/check", {
      method: "POST",
      body: JSON.stringify({ license_key }),
    }),
  openUserControl: (license_key: string, pin: string) =>
    request<{ license: any; devices: any[] }>("/api/v1/user/control/open", {
      method: "POST",
      body: JSON.stringify({ license_key, pin }),
    }),
  resetUserControl: (license_key: string, pin: string) =>
    request<{ success: boolean; message: string }>(
      "/api/v1/user/control/reset",
      {
        method: "POST",
        body: JSON.stringify({ license_key, pin }),
      },
    ),
};
