import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateAdminApiKey } from '../src/server/crypto.js';
import { getDbClient, initDatabaseSchema } from '../src/server/db.js';
import { requireAdminApiKey } from '../src/server/api.js';

test('requireAdminApiKey rejects request without Authorization header', async () => {
  const middleware = requireAdminApiKey('licenses:create');
  let statusSent = 0;
  let jsonSent: any = null;

  const req: any = { headers: {} };
  const res: any = {
    status(code: number) {
      statusSent = code;
      return this;
    },
    json(data: any) {
      jsonSent = data;
      return this;
    },
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, res, next);
  assert.equal(nextCalled, false);
  assert.equal(statusSent, 401);
  assert.equal(jsonSent.success, false);
  assert.match(jsonSent.error, /Missing or malformed Bearer token/);
});

test('requireAdminApiKey rejects invalid token format', async () => {
  const middleware = requireAdminApiKey('licenses:create');
  let statusSent = 0;
  let jsonSent: any = null;

  const req: any = { headers: { authorization: 'Bearer invalid_token_format' } };
  const res: any = {
    status(code: number) {
      statusSent = code;
      return this;
    },
    json(data: any) {
      jsonSent = data;
      return this;
    },
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, res, next);
  assert.equal(nextCalled, false);
  assert.equal(statusSent, 401);
  assert.equal(jsonSent.success, false);
  assert.match(jsonSent.error, /Invalid Admin API secret key format/);
});

test('requireAdminApiKey validates active key with correct scope and updates last_used_at', async () => {
  await initDatabaseSchema();
  const db = getDbClient();

  const generated = generateAdminApiKey('store');
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO admin_api_keys (id, name, key_prefix, secret_hash, permissions_json, app_id, last_used_at, status, created_at)
          VALUES (?, 'Store Key', ?, ?, ?, NULL, NULL, 'active', ?)`,
    args: [
      generated.id,
      generated.keyPrefix,
      generated.secretHash,
      JSON.stringify(['licenses:create', 'licenses:read', 'licenses:manage']),
      now,
    ],
  });

  const middleware = requireAdminApiKey('licenses:create');
  let statusSent = 0;
  let jsonSent: any = null;

  const req: any = { headers: { authorization: `Bearer ${generated.secret}` } };
  const res: any = {
    status(code: number) {
      statusSent = code;
      return this;
    },
    json(data: any) {
      jsonSent = data;
      return this;
    },
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, res, next);
  assert.equal(nextCalled, true);
  assert.equal(statusSent, 0);
  assert.equal(req.adminApiKey.id, generated.id);
  assert.equal(req.adminApiKey.name, 'Store Key');
});

test('requireAdminApiKey rejects keys lacking the required scope', async () => {
  await initDatabaseSchema();
  const db = getDbClient();

  const generated = generateAdminApiKey('readonly');
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO admin_api_keys (id, name, key_prefix, secret_hash, permissions_json, app_id, last_used_at, status, created_at)
          VALUES (?, 'Readonly Key', ?, ?, ?, NULL, NULL, 'active', ?)`,
    args: [
      generated.id,
      generated.keyPrefix,
      generated.secretHash,
      JSON.stringify(['licenses:read']),
      now,
    ],
  });

  const middleware = requireAdminApiKey('licenses:create');
  let statusSent = 0;
  let jsonSent: any = null;

  const req: any = { headers: { authorization: `Bearer ${generated.secret}` } };
  const res: any = {
    status(code: number) {
      statusSent = code;
      return this;
    },
    json(data: any) {
      jsonSent = data;
      return this;
    },
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, res, next);
  assert.equal(nextCalled, false);
  assert.equal(statusSent, 403);
  assert.equal(jsonSent.success, false);
  assert.match(jsonSent.error, /lacks required scope/);
});

test('requireAdminApiKey rejects revoked/disabled keys', async () => {
  await initDatabaseSchema();
  const db = getDbClient();

  const generated = generateAdminApiKey('revoked');
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO admin_api_keys (id, name, key_prefix, secret_hash, permissions_json, app_id, last_used_at, status, created_at)
          VALUES (?, 'Revoked Key', ?, ?, ?, NULL, NULL, 'revoked', ?)`,
    args: [
      generated.id,
      generated.keyPrefix,
      generated.secretHash,
      JSON.stringify(['licenses:create']),
      now,
    ],
  });

  const middleware = requireAdminApiKey('licenses:create');
  let statusSent = 0;
  let jsonSent: any = null;

  const req: any = { headers: { authorization: `Bearer ${generated.secret}` } };
  const res: any = {
    status(code: number) {
      statusSent = code;
      return this;
    },
    json(data: any) {
      jsonSent = data;
      return this;
    },
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, res, next);
  assert.equal(nextCalled, false);
  assert.equal(statusSent, 403);
  assert.equal(jsonSent.success, false);
  assert.match(jsonSent.error, /Admin API key is revoked/);
});

test('requireAdminApiKey enforces rate limit when threshold is exceeded', async () => {
  const middleware = requireAdminApiKey('licenses:create');
  const req: any = {
    headers: { 'x-forwarded-for': '198.51.100.99' },
    ip: '198.51.100.99',
  };

  // Simulate 120 calls
  for (let i = 0; i < 120; i++) {
    let dummyStatus = 0;
    const dummyRes: any = {
      status(c: number) { dummyStatus = c; return this; },
      json() { return this; },
      setHeader() { return this; },
    };
    await middleware(req, dummyRes, () => {});
  }

  // 121st request should trigger 429
  let statusSent = 0;
  let jsonSent: any = null;
  const res: any = {
    status(code: number) {
      statusSent = code;
      return this;
    },
    json(data: any) {
      jsonSent = data;
      return this;
    },
    setHeader() {
      return this;
    },
  };

  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(statusSent, 429);
  assert.equal(jsonSent.success, false);
  assert.match(jsonSent.error, /Rate limit exceeded/);
});
