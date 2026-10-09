import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { handleCloudflareApi } from "../src/server/cloudflareHandler.js";
import {
  canonicalJson,
  generateEd25519KeyPair,
  generateRSAKeyPair,
  signPayloadForCloudflare,
  verifySignature,
} from "../src/server/crypto.js";
import { getDbClient, initDatabaseSchema } from "../src/server/db.js";

const licenseId = "license-cloudflare-signing-test";
const licenseKey = "VCON-CLOUDFLARE-SIGNING-TEST";
const hwid = "HWID-CLOUDFLARE-SIGNING-TEST";
let db: ReturnType<typeof getDbClient>;
let privateKeyPem: string;
let publicKeyPem: string;
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
  await initDatabaseSchema();
});

beforeEach(async () => {
  const keyPair = generateRSAKeyPair();
  privateKeyPem = keyPair.privateKeyPem;
  publicKeyPem = keyPair.publicKeyPem;

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
      "admin-test",
      "admin",
      "unused-test-hash",
      "unused-test-secret",
      privateKeyPem,
      publicKeyPem,
      Date.now(),
      Date.now(),
    ],
  });
  await db.execute({
    sql: `INSERT INTO licenses
          (id, key, status, tier, app_id, device_limit, validity_type,
           validity_value, created_at)
          VALUES (?, ?, 'active', 'Standard', ?, 2, 'lifetime', 0, ?)`,
    args: [licenseId, licenseKey, "app_vcon_default", Date.now()],
  });
});

after(async () => {
  if (db) await db.close();
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("Cloudflare license validation returns a verifiable RSA signature", async () => {
  const response = await handleCloudflareApi(
    new Request("https://licenx.test/api/v1/license/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: licenseKey,
        hwid,
        app_name: "vcon_default",
        app_version: "1.0.0",
        device_name: "Signing Test",
        os_info: "test",
      }),
    }),
    undefined,
  );

  assert.equal(response.status, 200);
  const responseBody = (await response.json()) as Record<string, unknown>;
  const signature = responseBody.signature;
  const responsePublicKey = responseBody.public_key;
  if (typeof signature !== "string" || typeof responsePublicKey !== "string") {
    assert.fail(
      "Cloudflare validation response omitted its signature or public key",
    );
  }
  const signedData = { ...responseBody };
  delete signedData.signature;
  delete signedData.public_key;

  assert.equal(responsePublicKey, publicKeyPem);
  assert.equal(
    verifySignature(canonicalJson(signedData), signature, publicKeyPem),
    true,
  );
  assert.equal(
    verifySignature(
      canonicalJson({ ...signedData, tier: "tampered" }),
      signature,
      publicKeyPem,
    ),
    false,
  );

  const device = await db.execute({
    sql: "SELECT status FROM devices WHERE license_id = ? AND hwid = ?",
    args: [licenseId, hwid],
  });
  assert.equal(device.rows[0]?.status, "active");
});

test("Cloudflare WebCrypto signer supports existing Ed25519 PKCS#8 keys", async () => {
  const keyPair = generateEd25519KeyPair();
  const payload = canonicalJson({ valid: true, license_key: licenseKey });
  const signature = await signPayloadForCloudflare(
    payload,
    keyPair.privateKeyPem,
  );

  assert.equal(verifySignature(payload, signature, keyPair.publicKeyPem), true);
  assert.equal(
    verifySignature(
      canonicalJson({ valid: false, license_key: licenseKey }),
      signature,
      keyPair.publicKeyPem,
    ),
    false,
  );
});
