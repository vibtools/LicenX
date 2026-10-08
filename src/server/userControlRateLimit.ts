import { createHash } from 'node:crypto';
import type { Client } from '@libsql/client';

export const USER_CONTROL_PIN_MAX_FAILURES = 5;
export const USER_CONTROL_PIN_WINDOW_MS = 15 * 60 * 1000;
export const USER_CONTROL_PIN_LOCKOUT_MS = 15 * 60 * 1000;

export interface UserControlPinRateLimit {
  blocked: boolean;
  retryAfterSeconds: number;
}

function getAttemptKey(licenseKey: string, clientIp: string): string {
  return createHash('sha256')
    .update(`${licenseKey.trim().toUpperCase()}\0${clientIp.trim()}`)
    .digest('hex');
}

export async function getUserControlPinRateLimit(
  db: Client,
  licenseKey: string,
  clientIp: string,
  now = Date.now()
): Promise<UserControlPinRateLimit> {
  const attemptKey = getAttemptKey(licenseKey, clientIp);
  const result = await db.execute({
    sql: 'SELECT blocked_until FROM user_control_pin_attempts WHERE attempt_key = ? LIMIT 1',
    args: [attemptKey],
  });
  const blockedUntil = Number(result.rows[0]?.blocked_until || 0);
  const retryAfterSeconds = Math.max(0, Math.ceil((blockedUntil - now) / 1000));

  return {
    blocked: retryAfterSeconds > 0,
    retryAfterSeconds,
  };
}

export async function recordFailedUserControlPinAttempt(
  db: Client,
  licenseKey: string,
  clientIp: string,
  now = Date.now()
): Promise<UserControlPinRateLimit> {
  const attemptKey = getAttemptKey(licenseKey, clientIp);
  const windowStart = now - USER_CONTROL_PIN_WINDOW_MS;

  await db.execute({
    sql: `
      INSERT INTO user_control_pin_attempts (
        attempt_key, window_started_at, failed_attempts, blocked_until
      ) VALUES (?, ?, 1, 0)
      ON CONFLICT(attempt_key) DO UPDATE SET
        window_started_at = CASE
          WHEN user_control_pin_attempts.blocked_until > ?
            THEN user_control_pin_attempts.window_started_at
          WHEN user_control_pin_attempts.window_started_at <= ?
            OR user_control_pin_attempts.blocked_until > 0
            THEN ?
          ELSE user_control_pin_attempts.window_started_at
        END,
        failed_attempts = CASE
          WHEN user_control_pin_attempts.blocked_until > ?
            THEN user_control_pin_attempts.failed_attempts
          WHEN user_control_pin_attempts.window_started_at <= ?
            OR user_control_pin_attempts.blocked_until > 0
            THEN 1
          ELSE user_control_pin_attempts.failed_attempts + 1
        END,
        blocked_until = CASE
          WHEN user_control_pin_attempts.blocked_until > ?
            THEN user_control_pin_attempts.blocked_until
          WHEN user_control_pin_attempts.window_started_at <= ?
            OR user_control_pin_attempts.blocked_until > 0
            THEN 0
          WHEN user_control_pin_attempts.failed_attempts + 1 >= ?
            THEN ? + ?
          ELSE 0
        END
    `,
    args: [
      attemptKey,
      now,
      now,
      windowStart,
      now,
      now,
      windowStart,
      now,
      windowStart,
      USER_CONTROL_PIN_MAX_FAILURES,
      now,
      USER_CONTROL_PIN_LOCKOUT_MS,
    ],
  });

  await db.execute({
    sql: `DELETE FROM user_control_pin_attempts
          WHERE window_started_at <= ?
            AND blocked_until <= ?`,
    args: [now - USER_CONTROL_PIN_WINDOW_MS * 4, now],
  });

  return getUserControlPinRateLimit(db, licenseKey, clientIp, now);
}

export async function clearUserControlPinAttempts(
  db: Client,
  licenseKey: string,
  clientIp: string
): Promise<void> {
  await db.execute({
    sql: 'DELETE FROM user_control_pin_attempts WHERE attempt_key = ?',
    args: [getAttemptKey(licenseKey, clientIp)],
  });
}
