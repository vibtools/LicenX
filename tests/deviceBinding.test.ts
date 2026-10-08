import { createClient, type Client } from "@libsql/client";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { bindDeviceWithinLimit } from "../src/server/deviceBinding.js";

const databaseUrl = "file::memory:?cache=shared";
let db: Client;

before(async () => {
  db = createClient({ url: databaseUrl, timeout: 25 });
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
      status TEXT NOT NULL
    )
  `);
});

beforeEach(async () => {
  await db.execute("DELETE FROM devices");
});

after(async () => {
  db.close();
});

function bind(
  hwid: string,
  deviceLimit = 1,
  reactivationLimitPolicy: "all-inactive" | "logged-out-only" = "all-inactive",
  rejectBlocked = false,
) {
  const requestDb = createClient({ url: databaseUrl, timeout: 25 });
  return bindDeviceWithinLimit({
    db: requestDb,
    licenseId: "license-1",
    hwid,
    deviceId: `device-${hwid}`,
    deviceName: `Machine ${hwid}`,
    osInfo: "test-os",
    ipAddress: "127.0.0.1",
    now: Date.now(),
    deviceLimit,
    reactivationLimitPolicy,
    rejectBlocked,
  }).finally(() => requestDb.close());
}

test("concurrent activations never exceed a single-device license limit", async () => {
  const settled = await Promise.allSettled(
    Array.from({ length: 12 }, (_, index) => bind(`hwid-${index}`)),
  );
  const results = settled.map((result) => {
    assert.equal(result.status, "fulfilled");
    return result.value;
  });

  assert.equal(results.filter((result) => result.status === "bound").length, 1);
  assert.equal(
    results.filter((result) => result.status === "limit").length,
    11,
  );

  const activeRows = await db.execute({
    sql: "SELECT COUNT(*) AS active_count FROM devices WHERE license_id = ? AND status = 'active'",
    args: ["license-1"],
  });
  assert.equal(Number(activeRows.rows[0]?.active_count), 1);
});

test("reactivates a logged-out device when a slot is available", async () => {
  await db.execute({
    sql: `INSERT INTO devices (id, license_id, hwid, first_bound_at, last_ping_at, status)
          VALUES ('device-old', 'license-1', 'hwid-old', 1, 1, 'logged_out')`,
  });

  const result = await bind("hwid-old");
  assert.deepEqual(result, {
    status: "bound",
    existingDevice: true,
    activeDevicesCount: 0,
    boundDevicesCount: 1,
  });

  const row = await db.execute(
    "SELECT status FROM devices WHERE id = 'device-old'",
  );
  assert.equal(row.rows[0]?.status, "active");
});

test("rejects logged-out device reactivation when another device uses the slot", async () => {
  await db.execute({
    sql: `INSERT INTO devices (id, license_id, hwid, first_bound_at, last_ping_at, status)
          VALUES ('device-old', 'license-1', 'hwid-old', 1, 1, 'logged_out')`,
  });
  await db.execute({
    sql: `INSERT INTO devices (id, license_id, hwid, first_bound_at, last_ping_at, status)
          VALUES ('device-active', 'license-1', 'hwid-active', 1, 1, 'active')`,
  });

  const result = await bind("hwid-old");
  assert.deepEqual(result, {
    status: "limit",
    existingDevice: true,
    activeDevicesCount: 1,
    deviceLimit: 1,
  });

  const row = await db.execute(
    "SELECT status FROM devices WHERE id = 'device-old'",
  );
  assert.equal(row.rows[0]?.status, "logged_out");
});

test("refreshes an already active device without consuming another slot", async () => {
  await db.execute({
    sql: `INSERT INTO devices (id, license_id, hwid, first_bound_at, last_ping_at, status)
          VALUES ('device-hwid-active', 'license-1', 'hwid-active', 1, 1, 'active')`,
  });

  const result = await bind("hwid-active");
  assert.deepEqual(result, {
    status: "bound",
    existingDevice: true,
    activeDevicesCount: 1,
    boundDevicesCount: 1,
  });
});

test("preserves Cloudflare blocked-device rejection", async () => {
  await db.execute({
    sql: `INSERT INTO devices (id, license_id, hwid, first_bound_at, last_ping_at, status)
          VALUES ('device-blocked', 'license-1', 'hwid-blocked', 1, 1, 'blocked')`,
  });

  assert.deepEqual(await bind("hwid-blocked", 1, "logged-out-only", true), {
    status: "blocked",
  });
  const row = await db.execute(
    "SELECT status FROM devices WHERE id = 'device-blocked'",
  );
  assert.equal(row.rows[0]?.status, "blocked");
});

test("preserves Cloudflare limit handling for non-logged-out inactive states", async () => {
  await db.execute({
    sql: `INSERT INTO devices (id, license_id, hwid, first_bound_at, last_ping_at, status)
          VALUES ('device-inactive', 'license-1', 'hwid-inactive', 1, 1, 'inactive')`,
  });
  await db.execute({
    sql: `INSERT INTO devices (id, license_id, hwid, first_bound_at, last_ping_at, status)
          VALUES ('device-active', 'license-1', 'hwid-active', 1, 1, 'active')`,
  });

  const result = await bind("hwid-inactive", 1, "logged-out-only", true);
  assert.equal(result.status, "bound");
  const activeRows = await db.execute(
    "SELECT COUNT(*) AS active_count FROM devices WHERE license_id = ? AND status = 'active'",
    ["license-1"],
  );
  assert.equal(Number(activeRows.rows[0]?.active_count), 2);
});

test("preserves unlimited device binding", async () => {
  const settled = await Promise.allSettled(
    Array.from({ length: 12 }, (_, index) => bind(`hwid-${index}`, -1)),
  );
  const results = settled.map((result) => {
    assert.equal(result.status, "fulfilled");
    return result.value;
  });

  assert.equal(
    results.every((result) => result.status === "bound"),
    true,
  );
  const activeRows = await db.execute({
    sql: "SELECT COUNT(*) AS active_count FROM devices WHERE license_id = ? AND status = 'active'",
    args: ["license-1"],
  });
  assert.equal(Number(activeRows.rows[0]?.active_count), 12);
});
