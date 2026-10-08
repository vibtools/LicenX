import assert from "node:assert/strict";
import { test } from "node:test";
import { handleCloudflareApi } from "../src/server/cloudflareHandler.js";
import {
  DatabaseConfigurationError,
  RemoteDatabaseInitializationError,
  getDbClient,
  initDatabaseSchema,
  resolveDatabaseConfig,
} from "../src/server/db.js";

test("keeps local SQLite as the development default", () => {
  assert.deepEqual(resolveDatabaseConfig(undefined, "development", {}), {
    url: "file:vcon_data.db",
    authToken: undefined,
    requireRemote: false,
    isRemoteUrl: false,
  });
});

test("requires remote database configuration for production Node startup", () => {
  assert.throws(
    () => resolveDatabaseConfig(undefined, "production", {}),
    DatabaseConfigurationError,
  );
  assert.throws(
    () =>
      resolveDatabaseConfig(undefined, "production", {
        TURSO_DATABASE_URL: "libsql://your-database-name-your-org.turso.io",
        TURSO_AUTH_TOKEN: "your-turso-auth-token",
      }),
    DatabaseConfigurationError,
  );
});

test("Node schema initialization fails in production without remote configuration", async () => {
  const originalValues = {
    NODE_ENV: process.env.NODE_ENV,
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
  };
  process.env.NODE_ENV = "production";
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;

  try {
    await assert.rejects(initDatabaseSchema(), DatabaseConfigurationError);
  } finally {
    for (const [key, value] of Object.entries(originalValues)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("requires Cloudflare bindings instead of falling back to process environment", () => {
  assert.throws(
    () =>
      resolveDatabaseConfig({}, "development", {
        TURSO_DATABASE_URL: "libsql://configured-in-node.turso.io",
        TURSO_AUTH_TOKEN: "node-token",
      }),
    DatabaseConfigurationError,
  );
});

test("Cloudflare request fails clearly when remote database bindings are missing", async () => {
  const response = await handleCloudflareApi(
    new Request("https://licenx.test/health"),
    {},
  );
  const body = (await response.json()) as { error?: string };

  assert.equal(response.status, 500);
  assert.match(body.error || "", /Remote database configuration is required/);
});

test("accepts remote configuration for Node production and Cloudflare", () => {
  const nodeConfig = resolveDatabaseConfig(undefined, "production", {
    TURSO_DATABASE_URL: "libsql://node-db.turso.io",
    TURSO_AUTH_TOKEN: "node-token",
  });
  const cloudflareConfig = resolveDatabaseConfig({
    DATABASE_URL: "https://cloudflare-db.customer-domain.net",
  });

  assert.equal(nodeConfig.url, "libsql://node-db.turso.io");
  assert.equal(nodeConfig.requireRemote, true);
  assert.equal(
    cloudflareConfig.url,
    "https://cloudflare-db.customer-domain.net",
  );
  assert.equal(cloudflareConfig.requireRemote, true);
});

test("rejects local-file URLs in production and serverless modes", () => {
  assert.throws(
    () =>
      resolveDatabaseConfig(undefined, "production", {
        DATABASE_URL: "file:local.db",
      }),
    DatabaseConfigurationError,
  );
  assert.throws(
    () => resolveDatabaseConfig({ DATABASE_URL: "file:local.db" }),
    DatabaseConfigurationError,
  );
});

test("does not fall back to SQLite when remote client construction fails", () => {
  assert.throws(
    () =>
      getDbClient({
        TURSO_DATABASE_URL: "libsql://[invalid",
        TURSO_AUTH_TOKEN: "test-token",
      }),
    RemoteDatabaseInitializationError,
  );

  const originalValues = {
    NODE_ENV: process.env.NODE_ENV,
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
  };
  process.env.NODE_ENV = "development";
  process.env.TURSO_DATABASE_URL = "libsql://[invalid";
  delete process.env.DATABASE_URL;
  process.env.TURSO_AUTH_TOKEN = "test-token";

  try {
    assert.throws(() => getDbClient(), RemoteDatabaseInitializationError);
  } finally {
    for (const [key, value] of Object.entries(originalValues)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("constructs a client for a valid remote URL without connecting eagerly", async () => {
  const client = getDbClient({
    TURSO_DATABASE_URL: "libsql://phase4-test.turso.io",
    TURSO_AUTH_TOKEN: "test-token",
  });

  assert.equal(typeof client.execute, "function");
  await client.close();
});

test("surfaces remote connectivity failures without switching to local SQLite", async () => {
  const client = getDbClient({ DATABASE_URL: "http://127.0.0.1:1" });

  try {
    await assert.rejects(client.execute("SELECT 1"));
  } finally {
    await client.close();
  }
});
