import express from "express";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { apiRouter } from "../src/server/api.js";
import { handleCloudflareApi } from "../src/server/cloudflareHandler.js";
import { getDbClient } from "../src/server/db.js";

const licenseId = "license-public-policy";
const licenseKey = "VCON-TEST-PUBLIC-POLICY";
const licensePin = "1234";
let db: ReturnType<typeof getDbClient>;
let server: Server;
let baseUrl: string;
const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
};

before(async () => {
  process.env.NODE_ENV = "test";
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = "file::memory:";
  db = getDbClient();

  await db.execute(
    "CREATE TABLE admin_config (id TEXT PRIMARY KEY, site_settings_json TEXT)",
  );
  await db.execute(
    "CREATE TABLE apps (id TEXT PRIMARY KEY, display_name TEXT, app_slug TEXT)",
  );
  await db.execute(`
    CREATE TABLE licenses (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      status TEXT NOT NULL,
      tier TEXT,
      app_id TEXT,
      device_limit INTEGER,
      validity_type TEXT,
      validity_value INTEGER,
      activated_at INTEGER,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      customer_name TEXT,
      customer_email TEXT,
      pin TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE devices (
      id TEXT PRIMARY KEY,
      license_id TEXT NOT NULL,
      hwid TEXT NOT NULL,
      device_name TEXT,
      os_info TEXT,
      ip_address TEXT,
      first_bound_at INTEGER NOT NULL,
      last_ping_at INTEGER NOT NULL,
      status TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE validation_logs (
      id TEXT PRIMARY KEY,
      license_key TEXT,
      app_slug TEXT,
      hwid TEXT,
      ip_address TEXT,
      action TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      message TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE user_control_pin_attempts (
      attempt_key TEXT PRIMARY KEY,
      window_started_at INTEGER NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      blocked_until INTEGER NOT NULL DEFAULT 0
    )
  `);

  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);
  app.use("/v1", (request, response, next) => {
    request.url = "/v1" + request.url;
    apiRouter(request, response, next);
  });
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  await db.execute("DELETE FROM devices");
  await db.execute("DELETE FROM validation_logs");
  await db.execute("DELETE FROM user_control_pin_attempts");
  await db.execute("DELETE FROM licenses");
  await db.execute("DELETE FROM admin_config");
  await db.execute({
    sql: "INSERT INTO admin_config (id, site_settings_json) VALUES (?, ?)",
    args: [
      "admin",
      JSON.stringify({ allowPublicCheck: true, allowPublicReset: true }),
    ],
  });
  await db.execute({
    sql: `INSERT INTO licenses
          (id, key, status, tier, device_limit, validity_type, validity_value, created_at, pin)
          VALUES (?, ?, 'active', 'Standard', 2, 'lifetime', 0, ?, ?)`,
    args: [licenseId, licenseKey, Date.now(), licensePin],
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await db.close();
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function setSiteSettings(
  settings: Record<string, unknown>,
): Promise<void> {
  await db.execute({
    sql: "UPDATE admin_config SET site_settings_json = ? WHERE id = ?",
    args: [JSON.stringify(settings), "admin"],
  });
}

async function postNode(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function postCloudflare(path: string, body: unknown): Promise<Response> {
  return handleCloudflareApi(
    new Request(`https://licenx.test${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    undefined,
  );
}

test("disabled public check returns matching denial before expiry mutation", async () => {
  await setSiteSettings({ allowPublicCheck: false, allowPublicReset: true });
  await db.execute("UPDATE licenses SET expires_at = 1 WHERE id = ?", [
    licenseId,
  ]);

  const nodeResponse = await postNode("/api/v1/user/license/check", {
    license_key: licenseKey,
  });
  const cloudflareResponse = await postCloudflare("/user/license/check", {
    license_key: licenseKey,
  });

  assert.equal(nodeResponse.status, 403);
  assert.equal(cloudflareResponse.status, 403);
  assert.deepEqual(await nodeResponse.json(), {
    error: "Public license check is disabled.",
  });
  assert.deepEqual(await cloudflareResponse.json(), {
    error: "Public license check is disabled.",
  });

  const license = await db.execute({
    sql: "SELECT status FROM licenses WHERE id = ?",
    args: [licenseId],
  });
  assert.equal(license.rows[0]?.status, "active");
});

test("missing check setting preserves the existing three-field response", async () => {
  await setSiteSettings({ allowPublicReset: true });
  await db.execute({
    sql: `INSERT INTO devices
          (id, license_id, hwid, first_bound_at, last_ping_at, status)
          VALUES ('device-1', ?, 'hwid-1', 1, 1, 'active')`,
    args: [licenseId],
  });

  const nodeResponse = await postNode("/v1/user/license/check", {
    license_key: licenseKey,
  });
  const cloudflareResponse = await postCloudflare("/v1/user/license/check", {
    license_key: licenseKey,
  });

  assert.equal(nodeResponse.status, 200);
  assert.equal(cloudflareResponse.status, 200);
  assert.deepEqual(await nodeResponse.json(), {
    status: "active",
    device_limit: 2,
    active_device_count: 1,
  });
  assert.deepEqual(await cloudflareResponse.json(), {
    status: "active",
    device_limit: 2,
    active_device_count: 1,
  });
});

test("disabled reset returns matching denial without attempts or device changes", async () => {
  await setSiteSettings({ allowPublicCheck: true, allowPublicReset: false });
  await db.execute({
    sql: `INSERT INTO devices
          (id, license_id, hwid, first_bound_at, last_ping_at, status)
          VALUES ('device-1', ?, 'hwid-1', 1, 1, 'active')`,
    args: [licenseId],
  });

  const nodeResponse = await postNode("/api/v1/user/control/reset", {
    license_key: licenseKey,
    pin: "0000",
  });
  const cloudflareResponse = await postCloudflare("/user/control/reset", {
    license_key: licenseKey,
    pin: licensePin,
  });

  assert.equal(nodeResponse.status, 403);
  assert.equal(cloudflareResponse.status, 403);
  assert.deepEqual(await nodeResponse.json(), {
    error: "Self-service device reset is disabled.",
  });
  assert.deepEqual(await cloudflareResponse.json(), {
    error: "Self-service device reset is disabled.",
  });

  const attempts = await db.execute(
    "SELECT COUNT(*) AS count FROM user_control_pin_attempts",
  );
  const devices = await db.execute(
    "SELECT status FROM devices WHERE id = 'device-1'",
  );
  const logs = await db.execute(
    "SELECT COUNT(*) AS count FROM validation_logs",
  );
  assert.equal(Number(attempts.rows[0]?.count), 0);
  assert.equal(devices.rows[0]?.status, "active");
  assert.equal(Number(logs.rows[0]?.count), 0);
});

test("reset-only policy leaves PIN-protected control-open available", async () => {
  await setSiteSettings({ allowPublicCheck: false, allowPublicReset: false });

  const nodeResponse = await postNode("/api/v1/user/control/open", {
    license_key: licenseKey,
    pin: licensePin,
  });
  const cloudflareResponse = await postCloudflare("/user/control/open", {
    license_key: licenseKey,
    pin: licensePin,
  });

  assert.equal(nodeResponse.status, 200);
  assert.equal(cloudflareResponse.status, 200);
});

test("enabled reset preserves Node and Cloudflare device-state behavior", async () => {
  await db.execute({
    sql: `INSERT INTO devices
          (id, license_id, hwid, first_bound_at, last_ping_at, status)
          VALUES ('device-1', ?, 'hwid-1', 1, 1, 'active')`,
    args: [licenseId],
  });

  const nodeResponse = await postNode("/api/v1/user/control/reset", {
    license_key: licenseKey,
    pin: licensePin,
  });
  assert.equal(nodeResponse.status, 200);
  const nodeDevice = await db.execute(
    "SELECT status FROM devices WHERE id = 'device-1'",
  );
  assert.equal(nodeDevice.rows[0]?.status, "logged_out");

  await db.execute(
    "UPDATE devices SET status = 'active' WHERE id = 'device-1'",
  );
  const cloudflareResponse = await postCloudflare("/v1/user/control/reset", {
    license_key: licenseKey,
    pin: licensePin,
  });
  assert.equal(cloudflareResponse.status, 200);
  const cloudflareDevice = await db.execute(
    "SELECT COUNT(*) AS count FROM devices WHERE id = 'device-1'",
  );
  assert.equal(Number(cloudflareDevice.rows[0]?.count), 0);
});
