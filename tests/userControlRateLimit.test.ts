import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createClient, type Client } from '@libsql/client';
import {
  clearUserControlPinAttempts,
  getUserControlPinRateLimit,
  recordFailedUserControlPinAttempt,
  USER_CONTROL_PIN_LOCKOUT_MS,
  USER_CONTROL_PIN_WINDOW_MS,
} from '../src/server/userControlRateLimit.js';

let db: Client;

before(async () => {
  db = createClient({ url: 'file::memory:' });
  await db.execute(`
    CREATE TABLE user_control_pin_attempts (
      attempt_key TEXT PRIMARY KEY,
      window_started_at INTEGER NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      blocked_until INTEGER NOT NULL DEFAULT 0
    )
  `);
});

beforeEach(async () => {
  await db.execute('DELETE FROM user_control_pin_attempts');
});

after(async () => {
  await db.close();
});

test('locks a license/IP pair for 15 minutes after the fifth wrong PIN', async () => {
  const now = 1_800_000_000_000;

  for (let attempt = 1; attempt < 5; attempt++) {
    const result = await recordFailedUserControlPinAttempt(db, 'LIC-1', '192.0.2.1', now + attempt);
    assert.equal(result.blocked, false);
  }

  const fifthAttempt = await recordFailedUserControlPinAttempt(db, 'LIC-1', '192.0.2.1', now + 5);
  assert.equal(fifthAttempt.blocked, true);
  assert.equal(fifthAttempt.retryAfterSeconds, USER_CONTROL_PIN_LOCKOUT_MS / 1000);
});

test('limits are shared by license/IP, but isolated from other pairs', async () => {
  const now = 1_800_000_000_000;

  for (let attempt = 0; attempt < 5; attempt++) {
    await recordFailedUserControlPinAttempt(db, 'LIC-1', '192.0.2.1', now + attempt);
  }

  assert.equal((await getUserControlPinRateLimit(db, 'LIC-1', '192.0.2.1', now + 6)).blocked, true);
  assert.equal((await getUserControlPinRateLimit(db, 'LIC-1', '192.0.2.2', now + 6)).blocked, false);
  assert.equal((await getUserControlPinRateLimit(db, 'LIC-2', '192.0.2.1', now + 6)).blocked, false);
});

test('starts a fresh failure window after 15 minutes', async () => {
  const now = 1_800_000_000_000;

  for (let attempt = 0; attempt < 4; attempt++) {
    await recordFailedUserControlPinAttempt(db, 'LIC-1', '192.0.2.1', now + attempt);
  }

  const afterWindow = await recordFailedUserControlPinAttempt(
    db,
    'LIC-1',
    '192.0.2.1',
    now + USER_CONTROL_PIN_WINDOW_MS + 1
  );
  assert.equal(afterWindow.blocked, false);

  for (let attempt = 1; attempt < 4; attempt++) {
    const result = await recordFailedUserControlPinAttempt(
      db,
      'LIC-1',
      '192.0.2.1',
      now + USER_CONTROL_PIN_WINDOW_MS + 1 + attempt
    );
    assert.equal(result.blocked, false);
  }

  const fifthInWindow = await recordFailedUserControlPinAttempt(
    db,
    'LIC-1',
    '192.0.2.1',
    now + USER_CONTROL_PIN_WINDOW_MS + 5
  );
  assert.equal(fifthInWindow.blocked, true);
});

test('allows a new session after lockout and clears attempts after successful PIN', async () => {
  const now = 1_800_000_000_000;

  for (let attempt = 0; attempt < 5; attempt++) {
    await recordFailedUserControlPinAttempt(db, 'LIC-1', '192.0.2.1', now + attempt);
  }
  assert.equal(
    (await getUserControlPinRateLimit(db, 'LIC-1', '192.0.2.1', now + USER_CONTROL_PIN_LOCKOUT_MS + 5)).blocked,
    false
  );

  for (let attempt = 0; attempt < 4; attempt++) {
    await recordFailedUserControlPinAttempt(
      db,
      'LIC-2',
      '192.0.2.1',
      now + USER_CONTROL_PIN_LOCKOUT_MS + attempt
    );
  }
  await clearUserControlPinAttempts(db, 'LIC-2', '192.0.2.1');

  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await recordFailedUserControlPinAttempt(
      db,
      'LIC-2',
      '192.0.2.1',
      now + USER_CONTROL_PIN_LOCKOUT_MS + 10 + attempt
    );
    assert.equal(result.blocked, false);
  }
});
