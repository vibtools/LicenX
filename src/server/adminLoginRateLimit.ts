import { createHash } from "node:crypto";
import type { Client } from "@libsql/client";

export const ADMIN_LOGIN_MAX_FAILURES = 5;
export const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const ADMIN_LOGIN_BLOCK_MS = 15 * 60 * 1000;

export interface AdminLoginRateLimit {
  blocked: boolean;
  retryAfterSeconds: number;
}

export function createAdminLoginAttemptKey(
  username: string,
  clientIp: string,
): string {
  return createHash("sha256")
    .update(`${username.trim().toLowerCase()}\0${clientIp}`)
    .digest("hex");
}

export async function getAdminLoginRateLimit(
  db: Client,
  attemptKey: string,
  now = Date.now(),
): Promise<AdminLoginRateLimit> {
  await db.execute({
    sql: `DELETE FROM admin_login_attempts
          WHERE blocked_until <= ? AND window_started_at <= ?`,
    args: [now, now - ADMIN_LOGIN_WINDOW_MS],
  });
  const result = await db.execute({
    sql: "SELECT blocked_until FROM admin_login_attempts WHERE attempt_key = ? LIMIT 1",
    args: [attemptKey],
  });
  const blockedUntil = Number(result.rows[0]?.blocked_until || 0);
  if (blockedUntil <= now) return { blocked: false, retryAfterSeconds: 0 };

  return {
    blocked: true,
    retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil - now) / 1000)),
  };
}

export async function recordFailedAdminLoginAttempt(
  db: Client,
  attemptKey: string,
  now = Date.now(),
): Promise<AdminLoginRateLimit> {
  const windowThreshold = now - ADMIN_LOGIN_WINDOW_MS;
  await db.execute({
    sql: `INSERT INTO admin_login_attempts
            (attempt_key, window_started_at, failed_attempts, blocked_until)
          VALUES (?, ?, 1, 0)
          ON CONFLICT(attempt_key) DO UPDATE SET
            window_started_at = CASE
              WHEN admin_login_attempts.blocked_until > ?
                THEN admin_login_attempts.window_started_at
              WHEN admin_login_attempts.blocked_until > 0
                OR admin_login_attempts.window_started_at <= ?
                THEN ?
              ELSE admin_login_attempts.window_started_at
            END,
            failed_attempts = CASE
              WHEN admin_login_attempts.blocked_until > ?
                THEN admin_login_attempts.failed_attempts
              WHEN admin_login_attempts.blocked_until > 0
                OR admin_login_attempts.window_started_at <= ?
                THEN 1
              ELSE admin_login_attempts.failed_attempts + 1
            END,
            blocked_until = CASE
              WHEN admin_login_attempts.blocked_until > ?
                THEN admin_login_attempts.blocked_until
              WHEN admin_login_attempts.blocked_until > 0
                OR admin_login_attempts.window_started_at <= ?
                THEN 0
              WHEN admin_login_attempts.failed_attempts + 1 >= ?
                THEN ?
              ELSE 0
            END`,
    args: [
      attemptKey,
      now,
      now,
      windowThreshold,
      now,
      now,
      windowThreshold,
      now,
      windowThreshold,
      ADMIN_LOGIN_MAX_FAILURES,
      now + ADMIN_LOGIN_BLOCK_MS,
    ],
  });

  return getAdminLoginRateLimit(db, attemptKey, now);
}

export async function clearAdminLoginAttempts(
  db: Client,
  attemptKey: string,
): Promise<void> {
  await db.execute({
    sql: "DELETE FROM admin_login_attempts WHERE attempt_key = ?",
    args: [attemptKey],
  });
}
