import { createClient, type Client } from "@libsql/client";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { isPublicAccessEnabled } from "../src/server/publicAccessSettings.js";

let db: Client;

before(async () => {
  db = createClient({ url: "file::memory:" });
  await db.execute(
    "CREATE TABLE admin_config (id TEXT PRIMARY KEY, site_settings_json TEXT)",
  );
});

after(async () => {
  await db.close();
});

test("defaults public actions to enabled when settings are absent", async () => {
  assert.equal(await isPublicAccessEnabled(db, "allowPublicCheck"), true);
  assert.equal(await isPublicAccessEnabled(db, "allowPublicReset"), true);

  await db.execute({
    sql: "INSERT INTO admin_config (id, site_settings_json) VALUES (?, ?)",
    args: ["admin", JSON.stringify({ siteName: "LicenX" })],
  });

  assert.equal(await isPublicAccessEnabled(db, "allowPublicCheck"), true);
  assert.equal(await isPublicAccessEnabled(db, "allowPublicReset"), true);
});

test("honors only explicit boolean values for each setting", async () => {
  await db.execute({
    sql: "UPDATE admin_config SET site_settings_json = ? WHERE id = ?",
    args: [
      JSON.stringify({ allowPublicCheck: false, allowPublicReset: true }),
      "admin",
    ],
  });

  assert.equal(await isPublicAccessEnabled(db, "allowPublicCheck"), false);
  assert.equal(await isPublicAccessEnabled(db, "allowPublicReset"), true);

  await db.execute({
    sql: "UPDATE admin_config SET site_settings_json = ? WHERE id = ?",
    args: [JSON.stringify({ allowPublicCheck: "false" }), "admin"],
  });
  assert.equal(await isPublicAccessEnabled(db, "allowPublicCheck"), true);
});

test("uses default-on compatibility behavior for malformed settings JSON", async () => {
  await db.execute({
    sql: "UPDATE admin_config SET site_settings_json = ? WHERE id = ?",
    args: ["{invalid", "admin"],
  });

  assert.equal(await isPublicAccessEnabled(db, "allowPublicCheck"), true);
  assert.equal(await isPublicAccessEnabled(db, "allowPublicReset"), true);
});

test("does not suppress database read errors", async () => {
  await db.execute("DROP TABLE admin_config");
  await assert.rejects(isPublicAccessEnabled(db, "allowPublicCheck"));
});
