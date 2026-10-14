export const ADMIN_SESSION_COOKIE = "vcon_admin_session";
export const ADMIN_CSRF_COOKIE = "vcon_admin_csrf";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function getCookieValue(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    return cookie.slice(separator + 1).trim();
  }
  return null;
}

export function createAdminSessionCookie(token: string): string {
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/api; Max-Age=${ADMIN_SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearAdminSessionCookie(): string {
  return `${ADMIN_SESSION_COOKIE}=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function createAdminCsrfCookie(token: string): string {
  return `${ADMIN_CSRF_COOKIE}=${token}; Path=/api; Max-Age=${ADMIN_SESSION_MAX_AGE_SECONDS}; Secure; SameSite=Strict`;
}

export function isValidAdminCsrfRequest(request: Request): boolean {
  return isValidAdminCsrfValues(
    request.headers.get("cookie"),
    request.headers.get("x-csrf-token"),
    request.headers.get("origin"),
    request.url,
    request.headers.get("sec-fetch-site"),
  );
}

export function isValidAdminCsrfValues(
  cookieHeader: string | null | undefined,
  headerToken: string | null | undefined,
  origin: string | null | undefined,
  requestUrl: string,
  secFetchSite: string | null | undefined,
): boolean {
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(requestUrl).origin) return false;
    } catch {
      return false;
    }
  }

  if (secFetchSite === "cross-site") return false;

  const cookieToken = getCookieValue(cookieHeader, ADMIN_CSRF_COOKIE);
  return Boolean(cookieToken && headerToken && cookieToken === headerToken);
}

export function hasBrowserRequestHeaders(request: Request): boolean {
  return (
    request.headers.has("origin") ||
    request.headers.has("sec-fetch-site") ||
    request.headers.has("x-csrf-token") ||
    Boolean(
      getCookieValue(request.headers.get("cookie"), ADMIN_CSRF_COOKIE) ||
        getCookieValue(request.headers.get("cookie"), ADMIN_SESSION_COOKIE),
    )
  );
}
