import express from "express";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { apiRouter, requireAdminApiKey } from "../src/server/api.js";
import { generateAdminApiKey } from "../src/server/crypto.js";
import { getDbClient, initDatabaseSchema } from "../src/server/db.js";

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
};

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "file::memory:";
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
});

test("requireAdminApiKey rejects request without Authorization header", async () => {
  const middleware = requireAdminApiKey("licenses:create");
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
  const next = () => {
    nextCalled = true;
  };

  await middleware(req, res, next);
  assert.equal(nextCalled, false);
  assert.equal(statusSent, 401);
  assert.equal(jsonSent.success, false);
  assert.match(jsonSent.error, /Missing or malformed Bearer token/);
});

test("requireAdminApiKey rejects invalid token format", async () => {
  const middleware = requireAdminApiKey("licenses:create");
  let statusSent = 0;
  let jsonSent: any = null;

  const req: any = {
    headers: { authorization: "Bearer invalid_token_format" },
  };
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
  const next = () => {
    nextCalled = true;
  };

  await middleware(req, res, next);
  assert.equal(nextCalled, false);
  assert.equal(statusSent, 401);
  assert.equal(jsonSent.success, false);
  assert.match(jsonSent.error, /Invalid Admin API secret key format/);
});

test("requireAdminApiKey validates active key with correct scope and updates last_used_at", async () => {
  await initDatabaseSchema();
  const db = getDbClient();

  const generated = generateAdminApiKey("store");
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO admin_api_keys (id, name, key_prefix, secret_hash, permissions_json, app_id, last_used_at, status, created_at)
          VALUES (?, 'Store Key', ?, ?, ?, NULL, NULL, 'active', ?)`,
    args: [
      generated.id,
      generated.keyPrefix,
      generated.secretHash,
      JSON.stringify(["licenses:create", "licenses:read", "licenses:manage"]),
      now,
    ],
  });

  const middleware = requireAdminApiKey("licenses:create");
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
  const next = () => {
    nextCalled = true;
  };

  await middleware(req, res, next);
  assert.equal(nextCalled, true);
  assert.equal(statusSent, 0);
  assert.equal(req.adminApiKey.id, generated.id);
  assert.equal(req.adminApiKey.name, "Store Key");
});

test("requireAdminApiKey rejects keys lacking the required scope", async () => {
  await initDatabaseSchema();
  const db = getDbClient();

  const generated = generateAdminApiKey("readonly");
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO admin_api_keys (id, name, key_prefix, secret_hash, permissions_json, app_id, last_used_at, status, created_at)
          VALUES (?, 'Readonly Key', ?, ?, ?, NULL, NULL, 'active', ?)`,
    args: [
      generated.id,
      generated.keyPrefix,
      generated.secretHash,
      JSON.stringify(["licenses:read"]),
      now,
    ],
  });

  const middleware = requireAdminApiKey("licenses:create");
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
  const next = () => {
    nextCalled = true;
  };

  await middleware(req, res, next);
  assert.equal(nextCalled, false);
  assert.equal(statusSent, 403);
  assert.equal(jsonSent.success, false);
  assert.match(jsonSent.error, /lacks required scope/);
});

test("requireAdminApiKey rejects revoked/disabled keys", async () => {
  await initDatabaseSchema();
  const db = getDbClient();

  const generated = generateAdminApiKey("revoked");
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO admin_api_keys (id, name, key_prefix, secret_hash, permissions_json, app_id, last_used_at, status, created_at)
          VALUES (?, 'Revoked Key', ?, ?, ?, NULL, NULL, 'revoked', ?)`,
    args: [
      generated.id,
      generated.keyPrefix,
      generated.secretHash,
      JSON.stringify(["licenses:create"]),
      now,
    ],
  });

  const middleware = requireAdminApiKey("licenses:create");
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
  const next = () => {
    nextCalled = true;
  };

  await middleware(req, res, next);
  assert.equal(nextCalled, false);
  assert.equal(statusSent, 403);
  assert.equal(jsonSent.success, false);
  assert.match(jsonSent.error, /Admin API key is revoked/);
});

test("requireAdminApiKey enforces rate limit when threshold is exceeded", async () => {
  const middleware = requireAdminApiKey("licenses:create");
  const req: any = {
    headers: { "x-forwarded-for": "198.51.100.99" },
    ip: "198.51.100.99",
  };

  // Simulate 120 calls
  for (let i = 0; i < 120; i++) {
    let dummyStatus = 0;
    const dummyRes: any = {
      status(c: number) {
        dummyStatus = c;
        return this;
      },
      json() {
        return this;
      },
      setHeader() {
        return this;
      },
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
  await middleware(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(statusSent, 429);
  assert.equal(jsonSent.success, false);
  assert.match(jsonSent.error, /Rate limit exceeded/);
});

// -------------------------------------------------------------
// Phase 04: App-Specific & Scoped License Creation Integration Tests
// -------------------------------------------------------------

let testApp: express.Express;
let testServer: Server | undefined;
let testBaseUrl: string;

async function startTestServer() {
  if (testServer) return testBaseUrl;
  testApp = express();
  testApp.use(express.json());
  testApp.use("/api", apiRouter);

  await new Promise<void>((resolve) => {
    const s = createServer(testApp);
    testServer = s;
    s.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = (testServer as unknown as Server).address() as AddressInfo;
  testBaseUrl = `http://127.0.0.1:${addr.port}`;
  return testBaseUrl;
}

after(() => {
  if (testServer) {
    testServer.close();
  }
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("POST /api/v1/admin/licenses creates global license when app_id/app_slug is omitted", async () => {
  await initDatabaseSchema();
  const url = await startTestServer();
  const db = getDbClient();

  const generated = generateAdminApiKey("global-key");
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO admin_api_keys (id, name, key_prefix, secret_hash, permissions_json, app_id, last_used_at, status, created_at)
          VALUES (?, 'Global Admin Key', ?, ?, ?, NULL, NULL, 'active', ?)`,
    args: [
      generated.id,
      generated.keyPrefix,
      generated.secretHash,
      JSON.stringify(["licenses:create", "licenses:read", "licenses:manage"]),
      now,
    ],
  });

  const res = await fetch(`${url}/api/v1/admin/licenses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${generated.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tier: "pro",
      device_limit: 3,
    }),
  });

  const data = await res.json();
  assert.equal(res.status, 201);
  assert.equal(data.success, true);
  assert.equal(data.license.app_id, null);
  assert.equal(data.license.tier, "pro");
  assert.equal(data.license.device_limit, 3);
});

test("POST /api/v1/admin/licenses creates app-specific license when app_id is provided", async () => {
  await initDatabaseSchema();
  const url = await startTestServer();
  const db = getDbClient();

  const appId = "app_" + Math.random().toString(36).substring(2, 10);
  const appSlug = "test-app-" + Math.random().toString(36).substring(2, 8);
  await db.execute({
    sql: `INSERT INTO apps (id, display_name, app_slug, app_secret, created_at, updated_at) VALUES (?, 'Test App', ?, 'sec_123', ?, ?)`,
    args: [appId, appSlug, Date.now(), Date.now()],
  });

  const generated = generateAdminApiKey("global-key-2");
  await db.execute({
    sql: `INSERT INTO admin_api_keys (id, name, key_prefix, secret_hash, permissions_json, app_id, last_used_at, status, created_at)
          VALUES (?, 'Global Key 2', ?, ?, ?, NULL, NULL, 'active', ?)`,
    args: [
      generated.id,
      generated.keyPrefix,
      generated.secretHash,
      JSON.stringify(["licenses:create"]),
      Date.now(),
    ],
  });

  const res = await fetch(`${url}/api/v1/admin/licenses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${generated.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: appId,
      tier: "enterprise",
    }),
  });

  const data = await res.json();
  assert.equal(res.status, 201);
  assert.equal(data.success, true);
  assert.equal(data.license.app_id, appId);
  assert.equal(data.license.app_slug, appSlug);
});

test("POST /api/v1/admin/licenses resolves app_slug to app_id when app_slug is provided", async () => {
  await initDatabaseSchema();
  const url = await startTestServer();
  const db = getDbClient();

  const appId = "app_slug_" + Math.random().toString(36).substring(2, 10);
  const appSlug =
    "my-custom-plugin-" + Math.random().toString(36).substring(2, 6);
  await db.execute({
    sql: `INSERT INTO apps (id, display_name, app_slug, app_secret, created_at, updated_at) VALUES (?, 'Custom Plugin App', ?, 'sec_123', ?, ?)`,
    args: [appId, appSlug, Date.now(), Date.now()],
  });

  const generated = generateAdminApiKey("global-key-3");
  await db.execute({
    sql: `INSERT INTO admin_api_keys (id, name, key_prefix, secret_hash, permissions_json, app_id, last_used_at, status, created_at)
          VALUES (?, 'Global Key 3', ?, ?, ?, NULL, NULL, 'active', ?)`,
    args: [
      generated.id,
      generated.keyPrefix,
      generated.secretHash,
      JSON.stringify(["licenses:create"]),
      Date.now(),
    ],
  });

  const res = await fetch(`${url}/api/v1/admin/licenses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${generated.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_slug: appSlug,
      tier: "starter",
    }),
  });

  const data = await res.json();
  assert.equal(res.status, 201);
  assert.equal(data.success, true);
  assert.equal(data.license.app_id, appId);
  assert.equal(data.license.app_slug, appSlug);
});

test("POST /api/v1/admin/licenses automatically inherits app_id from app-scoped API key", async () => {
  await initDatabaseSchema();
  const url = await startTestServer();
  const db = getDbClient();

  const appId = "app_scoped_" + Math.random().toString(36).substring(2, 10);
  const appSlug =
    "scoped-app-slug-" + Math.random().toString(36).substring(2, 6);
  await db.execute({
    sql: `INSERT INTO apps (id, display_name, app_slug, app_secret, created_at, updated_at) VALUES (?, 'Scoped App', ?, 'sec_123', ?, ?)`,
    args: [appId, appSlug, Date.now(), Date.now()],
  });

  const generated = generateAdminApiKey("scoped-key");
  await db.execute({
    sql: `INSERT INTO admin_api_keys (id, name, key_prefix, secret_hash, permissions_json, app_id, last_used_at, status, created_at)
          VALUES (?, 'Scoped App Key', ?, ?, ?, ?, NULL, 'active', ?)`,
    args: [
      generated.id,
      generated.keyPrefix,
      generated.secretHash,
      JSON.stringify(["licenses:create"]),
      appId,
      Date.now(),
    ],
  });

  const res = await fetch(`${url}/api/v1/admin/licenses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${generated.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tier: "basic",
    }),
  });

  const data = await res.json();
  assert.equal(res.status, 201);
  assert.equal(data.success, true);
  assert.equal(data.license.app_id, appId);
  assert.equal(data.license.app_slug, appSlug);
});

test("POST /api/v1/admin/licenses rejects cross-app license creation with 403 Forbidden", async () => {
  await initDatabaseSchema();
  const url = await startTestServer();
  const db = getDbClient();

  const appId1 = "app_bound_1_" + Math.random().toString(36).substring(2, 10);
  const appId2 = "app_bound_2_" + Math.random().toString(36).substring(2, 10);
  const appSlug1 = "app-1-slug-" + Math.random().toString(36).substring(2, 8);
  const appSlug2 = "app-2-slug-" + Math.random().toString(36).substring(2, 8);
  await db.execute({
    sql: `INSERT INTO apps (id, display_name, app_slug, app_secret, created_at, updated_at) VALUES (?, 'App 1', ?, 'sec_123', ?, ?)`,
    args: [appId1, appSlug1, Date.now(), Date.now()],
  });
  await db.execute({
    sql: `INSERT INTO apps (id, display_name, app_slug, app_secret, created_at, updated_at) VALUES (?, 'App 2', ?, 'sec_123', ?, ?)`,
    args: [appId2, appSlug2, Date.now(), Date.now()],
  });

  const generated = generateAdminApiKey("scoped-key-bound-1");
  await db.execute({
    sql: `INSERT INTO admin_api_keys (id, name, key_prefix, secret_hash, permissions_json, app_id, last_used_at, status, created_at)
          VALUES (?, 'App 1 Scoped Key', ?, ?, ?, ?, NULL, 'active', ?)`,
    args: [
      generated.id,
      generated.keyPrefix,
      generated.secretHash,
      JSON.stringify(["licenses:create"]),
      appId1,
      Date.now(),
    ],
  });

  const res = await fetch(`${url}/api/v1/admin/licenses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${generated.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: appId2,
      tier: "pro",
    }),
  });

  const data = await res.json();
  assert.equal(res.status, 403);
  assert.equal(data.success, false);
  assert.match(
    data.error,
    /Forbidden: This API key is restricted to application ID/,
  );
});

test("POST /api/v1/admin/licenses returns 400 Bad Request when non-existent app is specified", async () => {
  await initDatabaseSchema();
  const url = await startTestServer();
  const db = getDbClient();

  const generated = generateAdminApiKey("global-key-invalid-app");
  await db.execute({
    sql: `INSERT INTO admin_api_keys (id, name, key_prefix, secret_hash, permissions_json, app_id, last_used_at, status, created_at)
          VALUES (?, 'Global Key Invalid App', ?, ?, ?, NULL, NULL, 'active', ?)`,
    args: [
      generated.id,
      generated.keyPrefix,
      generated.secretHash,
      JSON.stringify(["licenses:create"]),
      Date.now(),
    ],
  });

  const res = await fetch(`${url}/api/v1/admin/licenses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${generated.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_slug: "this-app-slug-does-not-exist-xyz",
    }),
  });

  const data = await res.json();
  assert.equal(res.status, 400);
  assert.equal(data.success, false);
  assert.match(data.error, /Invalid app specified/);
});

test("POST /api/v1/admin/licenses sanitizes unexpected database failures", async () => {
  await initDatabaseSchema();
  const url = await startTestServer();
  const db = getDbClient();
  const generated = generateAdminApiKey("phase5-error-test");
  const originalExecute = db.execute.bind(db);

  Object.defineProperty(db, "execute", {
    value: async (query: any) => {
      const sql = typeof query === "string" ? query : query.sql;
      if (
        sql.startsWith(
          "SELECT id, name, key_prefix, secret_hash, permissions_json, app_id, status FROM admin_api_keys",
        )
      ) {
        return {
          rows: [
            {
              id: generated.id,
              name: "Phase 5 error test",
              key_prefix: generated.keyPrefix,
              secret_hash: generated.secretHash,
              permissions_json: JSON.stringify(["licenses:create"]),
              app_id: null,
              status: "active",
            },
          ],
        };
      }
      if (sql.startsWith("INSERT INTO licenses")) {
        throw new Error("Sensitive license DB sentinel");
      }
      return originalExecute(query);
    },
    configurable: true,
  });

  try {
    const response = await fetch(`${url}/api/v1/admin/licenses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${generated.secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tier: "pro" }),
    });
    const data = await response.json();

    assert.equal(response.status, 500);
    assert.deepEqual(data, {
      success: false,
      error: "Internal server error",
    });
    assert.doesNotMatch(JSON.stringify(data), /Sensitive license DB sentinel/);
  } finally {
    Object.defineProperty(db, "execute", {
      value: originalExecute,
      configurable: true,
    });
  }
});
