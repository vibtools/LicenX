export const DEFAULT_DEVICE_LEASE_SECONDS = 7200;
export const DEFAULT_PING_INTERVAL_SECONDS = 1200;
export const MIN_PING_INTERVAL_SECONDS = 60;
export const MAX_PING_INTERVAL_SECONDS = 1200;
export const DEFAULT_OFFLINE_GRACE_SECONDS = 0;
export const MAX_OFFLINE_GRACE_SECONDS = 3600;
export const HEARTBEAT_REQUEST_TIMEOUT_SECONDS = 10;

export interface AppLicensePolicy {
  device_lease_seconds: number;
  ping_interval_seconds: number;
  offline_grace_seconds: number;
}

export function isValidAppLicensePolicy(policy: AppLicensePolicy): boolean {
  const { device_lease_seconds, ping_interval_seconds, offline_grace_seconds } =
    policy;

  return (
    Number.isSafeInteger(device_lease_seconds) &&
    Number.isSafeInteger(ping_interval_seconds) &&
    Number.isSafeInteger(offline_grace_seconds) &&
    ping_interval_seconds >= MIN_PING_INTERVAL_SECONDS &&
    ping_interval_seconds <= MAX_PING_INTERVAL_SECONDS &&
    offline_grace_seconds >= 0 &&
    offline_grace_seconds <= MAX_OFFLINE_GRACE_SECONDS &&
    device_lease_seconds >
      ping_interval_seconds +
        offline_grace_seconds +
        HEARTBEAT_REQUEST_TIMEOUT_SECONDS
  );
}
