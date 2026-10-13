import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  generateAdminApiKey,
  hashAdminApiSecret,
  verifyAdminApiSecret,
} from '../src/server/crypto.js';
import { getDbClient, initDatabaseSchema } from '../src/server/db.js';

test('generates Admin API Key pair with secure prefixes and hashes', () => {
  const generated = generateAdminApiKey('live');

  assert.ok(generated.id.startsWith('apk_'));
  assert.ok(generated.keyPrefix.startsWith('vcon_live_'));
  assert.ok(generated.secret.startsWith('vcon_sec_'));
  assert.equal(generated.secretHash.length, 64); // SHA-256 hex string
  assert.match(generated.secretHash, /^[0-9a-f]{64}$/);

  // Verification succeeds with original secret
  assert.equal(verifyAdminApiSecret(generated.secret, generated.secretHash), true);

  // Verification fails with altered secret
  assert.equal(verifyAdminApiSecret(generated.secret + 'invalid', generated.secretHash), false);
  assert.equal(verifyAdminApiSecret('vcon_sec_wrongtoken', generated.secretHash), false);
});

test('handles custom prefixes safely', () => {
  const generatedStore = generateAdminApiKey('woo_store$#@');
  assert.ok(generatedStore.keyPrefix.startsWith('vcon_woo_store_'));
  assert.equal(verifyAdminApiSecret(generatedStore.secret, generatedStore.secretHash), true);
});

test('initializes admin_api_keys table and executes CRUD queries', async () => {
  await initDatabaseSchema();
  const db = getDbClient();

  // Verify table exists by inserting a test key
  const testKey = generateAdminApiKey('test');
  const now = Date.now();
  const testPermissions = JSON.stringify(['licenses:create', 'licenses:read', 'licenses:manage']);

  await db.execute({
    sql: `INSERT INTO admin_api_keys (id, name, key_prefix, secret_hash, permissions_json, app_id, last_used_at, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    args: [
      testKey.id,
      'Integration Test Key',
      testKey.keyPrefix,
      testKey.secretHash,
      testPermissions,
      'app_vcon_default',
      null,
      now,
    ],
  });

  // Query by secret_hash
  const result = await db.execute({
    sql: `SELECT * FROM admin_api_keys WHERE secret_hash = ? AND status = 'active'`,
    args: [testKey.secretHash],
  });

  assert.equal(result.rows.length, 1);
  const row = result.rows[0];
  assert.equal(row.id, testKey.id);
  assert.equal(row.name, 'Integration Test Key');
  assert.equal(row.key_prefix, testKey.keyPrefix);
  assert.equal(row.status, 'active');

  // Verify permissions can be parsed back
  const parsedPermissions = JSON.parse(row.permissions_json as string);
  assert.deepEqual(parsedPermissions, ['licenses:create', 'licenses:read', 'licenses:manage']);

  // Clean up test key
  await db.execute({
    sql: `DELETE FROM admin_api_keys WHERE id = ?`,
    args: [testKey.id],
  });
});
