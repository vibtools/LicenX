import express from "express";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { apiRouter } from "../src/server/api.js";
import { handleCloudflareApi } from "../src/server/cloudflareHandler.js";
import { generateRSAKeyPair } from "../src/server/crypto.js";
import { getDbClient, initDatabaseSchema } from "../src/server/db.js";

const licenseId = "license-runtime-parity-test";
const licenseKey = "LICX-RUNTIME-PARITY-TEST";
const requestHwid = "HWID-RUNTIME-PARITY-REQUEST";
let db: ReturnType<typeof getDbClient>;
let server: Server;
let baseUrl: string;
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

  db = getDbClient();
  await initDatabaseSchema();

  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  const keyPair = generateRSAKeyPair();
  await db.execute("DELETE FROM devices");
  await db.execute("DELETE FROM validation_logs");
  await db.execute("DELETE FROM licenses");
  await db.execute("DELETE FROM admin_config");
  await db.execute({
    sql: `INSERT INTO admin_config
          (id, username, password_hash, jwt_secret, ed25519_private_key,
           ed25519_public_key, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "admin-runtime-parity-test",
      "test-admin",
      "unused-test-hash",
      "unused-test-secret",
      keyPair.privateKeyPem,
      keyPair.publicKeyPem,
      Date.now(),
      Date.now(),
    ],
  });
  await db.execute({
    sql: `INSERT INTO licenses
          (id, key, status, tier, app_id, device_limit, validity_type,
           validity_value, activated_at, expires_at, created_at)
          VALUES (?, ?, 'active', 'Standard', NULL, 1, 'lifetime', 0, ?, NULL, ?)`,
    args: [licenseId, licenseKey, Date.now(), Date.now()],
  });
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  if (db) await db.close();

  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function validateWithNode() {
  const response = await fetch(`${baseUrl}/api/v1/license/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ license_key: licenseKey, hwid: requestHwid }),
  });
  return { status: response.status, body: await response.json() };
}

async function validateWithCloudflare() {
  const response = await handleCloudflareApi(
    new Request("https://licenx.test/api/v1/license/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: licenseKey, hwid: requestHwid }),
    }),
    undefined,
  );
  return { status: response.status, body: await response.json() };
}

async function assertRuntimeDenial(expectedCode: string) {
  const nodeResult = await validateWithNode();
  const cloudflareResult = await validateWithCloudflare();

  assert.equal(nodeResult.status, 403);
  assert.equal(cloudflareResult.status, 403);
  assert.equal(nodeResult.body.valid, false);
  assert.equal(cloudflareResult.body.valid, false);
  assert.equal(nodeResult.body.code, expectedCode);
  assert.equal(cloudflareResult.body.code, expectedCode);
}

for (const [status, expectedCode] of [
  ["revoked", "LICENSE_REVOKED"],
  ["suspended", "LICENSE_SUSPENDED"],
  ["expired", "LICENSE_EXPIRED"],
  ["inactive", "LICENSE_INACTIVE"],
  ["pending", "LICENSE_PENDING"],
] as const) {
  test(`Node and Cloudflare reject ${status} licenses consistently`, async () => {
    await db.execute({
      sql: "UPDATE licenses SET status = ? WHERE id = ?",
      args: [status, licenseId],
    });

    await assertRuntimeDenial(expectedCode);

    const bindings = await db.execute(
      "SELECT COUNT(*) AS count FROM devices WHERE license_id = ?",
      [licenseId],
    );
    assert.equal(Number(bindings.rows[0]?.count), 0);
  });
}

test("Node and Cloudflare enforce the limit before inactive-device reactivation", async () => {
  await db.execute({
    sql: `INSERT INTO devices
          (id, license_id, hwid, device_name, os_info, ip_address,
           first_bound_at, last_ping_at, status)
          VALUES ('active-device', ?, 'HWID-ACTIVE', 'Active', 'test', '127.0.0.1', ?, ?, 'active')`,
    args: [licenseId, Date.now(), Date.now()],
  });
  await db.execute({
    sql: `INSERT INTO devices
          (id, license_id, hwid, device_name, os_info, ip_address,
           first_bound_at, last_ping_at, status)
          VALUES ('inactive-device', ?, ?, 'Inactive', 'test', '127.0.0.1', ?, ?, 'inactive')`,
    args: [licenseId, requestHwid, Date.now(), Date.now()],
  });

  await assertRuntimeDenial("DEVICE_LIMIT_REACHED");

  const rows = await db.execute({
    sql: "SELECT status FROM devices WHERE license_id = ? ORDER BY id",
    args: [licenseId],
  });
  assert.deepEqual(
    rows.rows.map((row) => row.status),
    ["active", "inactive"],
  );
});

test("Node and Cloudflare both reject blocked devices", async () => {
  await db.execute({
    sql: `INSERT INTO devices
          (id, license_id, hwid, device_name, os_info, ip_address,
           first_bound_at, last_ping_at, status)
          VALUES ('blocked-device', ?, ?, 'Blocked', 'test', '127.0.0.1', ?, ?, 'blocked')`,
    args: [licenseId, requestHwid, Date.now(), Date.now()],
  });

  await assertRuntimeDenial("DEVICE_BLOCKED");

  const row = await db.execute({
    sql: "SELECT status FROM devices WHERE id = 'blocked-device'",
  });
  assert.equal(row.rows[0]?.status, "blocked");
});

test("Node and Cloudflare both accept an active license within its limit", async () => {
  const nodeResult = await validateWithNode();
  const cloudflareResult = await validateWithCloudflare();

  assert.equal(nodeResult.status, 200);
  assert.equal(cloudflareResult.status, 200);
  assert.equal(nodeResult.body.valid, true);
  assert.equal(cloudflareResult.body.valid, true);
});
