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
import { getDeviceLeaseSeconds } from "../src/server/deviceBinding.js";

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
  const body = (await response.json()) as {
    error?: string;
    request_id?: string;
  };

  assert.equal(response.status, 500);
  assert.equal(body.error, "Internal server error");
  assert.match(body.request_id || "", /^[0-9a-f-]{36}$/i);
});

test("Cloudflare health does not succeed when schema initialization fails", async () => {
  const env = { DATABASE_URL: "http://127.0.0.1:1" };
  const client = getDbClient(env);

  try {
    const response = await handleCloudflareApi(
      new Request("https://licenx.test/health"),
      env,
    );
    const body = (await response.json()) as {
      error?: string;
      request_id?: string;
    };

    assert.equal(response.status, 500);
    assert.equal(body.error, "Internal server error");
    assert.match(body.request_id || "", /^[0-9a-f-]{36}$/i);
  } finally {
    await client.close();
  }
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

test("migrates missing lease columns before returning from the existing-schema fast path", async () => {
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
  };
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "file::memory:?cache=shared";
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  const client = getDbClient();

  try {
    await client.execute(`
      CREATE TABLE admin_config (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        jwt_secret TEXT NOT NULL,
        ed25519_private_key TEXT NOT NULL,
        ed25519_public_key TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    await client.execute(`
      CREATE TABLE apps (
        id TEXT PRIMARY KEY,
        app_slug TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        min_version TEXT NOT NULL DEFAULT '1.0.0',
        status TEXT NOT NULL DEFAULT 'active',
        app_secret TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    await client.execute(
      "CREATE TABLE licenses (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)",
    );
    await client.execute(
      "CREATE TABLE devices (id TEXT PRIMARY KEY, first_bound_at INTEGER NOT NULL)",
    );
    await client.execute("CREATE TABLE validation_logs (id TEXT PRIMARY KEY)");
    await client.execute({
      sql: `INSERT INTO apps
            (id, app_slug, display_name, app_secret, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: ["legacy-app", "legacy-app", "Legacy App", "test-secret", 1, 1],
    });

    await initDatabaseSchema();

    const appColumns = await client.execute("PRAGMA table_info(apps)");
    assert.ok(
      appColumns.rows.some(
        (column) => String(column.name) === "device_lease_seconds",
      ),
    );
    assert.equal(await getDeviceLeaseSeconds(client, "legacy-app"), 7200);
  } finally {
    await client.close();
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
