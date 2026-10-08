export interface AppItem {
  id: string;
  app_slug: string;
  display_name: string;
  min_version: string;
  status: 'active' | 'inactive';
  app_secret?: string;
  description?: string | null;
  created_at: number;
  updated_at: number;
  licenses_count?: number;
}

export interface License {
  id: string;
  key: string;
  status: 'active' | 'suspended' | 'expired' | 'revoked';
  tier: string;
  app_id?: string | null;
  app_name?: string | null;
  app_slug?: string | null;
  device_limit: number;
  validity_type: 'hourly' | 'daily' | 'lifetime';
  validity_value: number;
  activated_at: number | null;
  expires_at: number | null;
  created_at: number;
  customer_name?: string | null;
  customer_email?: string | null;
  notes?: string | null;
  metadata_json?: string | null;
  bound_devices_count?: number;
  pin?: string | null;
}

export interface Device {
  id: string;
  license_id: string;
  hwid: string;
  device_name: string;
  os_info: string;
  ip_address: string;
  first_bound_at: number;
  last_ping_at: number;
  status: 'active' | 'blocked';
  license_key?: string;
  license_tier?: string;
  license_status?: string;
  customer_name?: string;
}

export interface ValidationLog {
  id: string;
  license_key: string;
  app_slug?: string | null;
  hwid: string;
  ip_address: string;
  action: string;
  status_code: number;
  message: string;
  created_at: number;
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl?: string;
}

export interface R2Backup {
  id: string;
  filename: string;
  record_count: number;
  file_size: number;
  r2_url: string;
  created_at: number;
}

export interface SystemStats {
  totalApps: number;
  totalLicenses: number;
  activeLicenses: number;
  expiredLicenses: number;
  revokedLicenses: number;
  suspendedLicenses: number;
  activeDevices: number;
  validations24h: number;
  serverTime: number;
}

export interface SetupStatus {
  initialized: boolean;
  adminUsername: string | null;
  r2Configured: boolean;
  hasTursoEnv: boolean;
  serverTime: number;
}

export type ActiveTab =
  | 'overview'
  | 'apps'
  | 'licenses'
  | 'devices'
  | 'logs'
  | 'simulator'
  | 'code'
  | 'profile'
  | 'site-settings'
  | 'settings';

export interface SiteSettings {
  siteName: string;
  siteTagline: string;
  siteTitle: string;
  metaDescription: string;
  logoUrl: string;
  faviconUrl: string;
  ogImageUrl: string;
  footerText: string;
  supportEmail: string;
  telegramUrl: string;
  discordUrl: string;
  docsUrl: string;
  buyLicenseUrl: string;
  allowPublicCheck: boolean;
  allowPublicReset: boolean;
  noticeBanner: string;
  noticeBannerEnabled: boolean;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  siteName: 'LicenX',
  siteTagline: 'Enterprise Software Licensing & Hardware Authorization Engine',
  siteTitle: 'LicenX – Software Licensing & Device Verification Engine',
  metaDescription: 'High-security RSA-2048 licensed distribution platform with hardware device fingerprinting and self-service device control.',
  logoUrl: '',
  faviconUrl: '',
  ogImageUrl: '',
  footerText: '© 2026 LicenX Open-Source Licensing Engine. All rights reserved.',
  supportEmail: 'support@vcon.local',
  telegramUrl: '',
  discordUrl: '',
  docsUrl: '',
  buyLicenseUrl: '#',
  allowPublicCheck: true,
  allowPublicReset: true,
  noticeBanner: '',
  noticeBannerEnabled: false,
};
