import express from "express";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { apiRouter } from "../src/server/api.js";
import {
  handleCloudflareApi,
  invalidateAdminConfigCache,
} from "../src/server/cloudflareHandler.js";
import { getDbClient } from "../src/server/db.js";

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
    "CREATE TABLE admin_config (id TEXT PRIMARY KEY, username TEXT, password_hash TEXT, jwt_secret TEXT, site_settings_json TEXT)",
  );
  await db.execute(`
    CREATE TABLE admin_login_attempts (
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
  await db.execute("DELETE FROM admin_config");
  await db.execute({
    sql: "INSERT INTO admin_config (id, username, password_hash, jwt_secret, site_settings_json) VALUES (?, ?, ?, ?, ?)",
    args: [
      "admin",
      "admin",
      "hash",
      "jwt-secret",
      JSON.stringify({ allowPublicCheck: true, allowPublicReset: true }),
    ],
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

async function getNode(path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

async function postNode(path: string, body?: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function getCloudflare(path: string): Promise<Response> {
  return handleCloudflareApi(
    new Request(`https://licenx.test${path}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }),
    undefined,
  );
}

async function postCloudflare(path: string, body?: unknown): Promise<Response> {
  return handleCloudflareApi(
    new Request(`https://licenx.test${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    undefined,
  );
}

test("Node unexpected errors are sanitized to a generic 5xx message", async () => {
  const originalExecute = db.execute.bind(db);
  Object.defineProperty(db, "execute", {
    value: async () => {
      throw new Error(
        "Sensitive DB info: file /var/lib/vcon/app.db has SQL leak",
      );
    },
    configurable: true,
  });

  try {
    const response = await getNode("/api/setup/status");
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Internal server error" });
  } finally {
    Object.defineProperty(db, "execute", {
      value: originalExecute,
      configurable: true,
    });
  }
});

test("Cloudflare unexpected errors are sanitized to a generic 5xx message", async () => {
  const originalExecute = db.execute.bind(db);
  Object.defineProperty(db, "execute", {
    value: async () => {
      throw new Error(
        "Sensitive Cloudflare env values: DSN postgres://prod-secret",
      );
    },
    configurable: true,
  });

  try {
    const response = await getCloudflare("/setup/status");
    const body = (await response.json()) as {
      error?: string;
      request_id?: string;
    };
    assert.equal(response.status, 500);
    assert.equal(body.error, "Internal server error");
    assert.match(body.request_id || "", /^[0-9a-f-]{36}$/i);
  } finally {
    Object.defineProperty(db, "execute", {
      value: originalExecute,
      configurable: true,
    });
  }
});

test("Cloudflare admin-session DB failures reach the correlated server catch", async () => {
  const originalExecute = db.execute.bind(db);
  Object.defineProperty(db, "execute", {
    value: async () => {
      throw new Error("Sensitive auth DB sentinel: auth-token-sentinel");
    },
    configurable: true,
  });
  invalidateAdminConfigCache();

  const loggedErrors: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...values: unknown[]) => {
    loggedErrors.push(values.map(String).join(" "));
  };

  try {
    const response = await handleCloudflareApi(
      new Request("https://licenx.test/api/settings/site", {
        headers: { Authorization: "Bearer auth-token-sentinel" },
      }),
      undefined,
    );
    const body = (await response.json()) as {
      error?: string;
      request_id?: string;
    };

    assert.equal(response.status, 500);
    assert.equal(body.error, "Internal server error");
    assert.match(body.request_id || "", /^[0-9a-f-]{36}$/i);
    assert.ok(
      loggedErrors.some((entry) =>
        entry.includes("Sensitive auth DB sentinel"),
      ),
    );
    assert.ok(
      loggedErrors.some((entry) => entry.includes(String(body.request_id))),
    );
    assert.ok(
      loggedErrors.every((entry) => !entry.includes("auth-token-sentinel")),
    );
  } finally {
    console.error = originalConsoleError;
    Object.defineProperty(db, "execute", {
      value: originalExecute,
      configurable: true,
    });
    invalidateAdminConfigCache();
  }
});

test("Cloudflare API-key timestamp failures are non-fatal and redacted", async () => {
  const originalExecute = db.execute.bind(db);
  const apiSecret = "vcon_sec_timestamp-sentinel";
  const databaseUrl = "postgres://user:password@database.example/private";
  Object.defineProperty(db, "execute", {
    value: async (query: string | { sql: string }) => {
      const sql = typeof query === "string" ? query : query.sql;
      if (sql.startsWith("SELECT id, name, key_prefix, secret_hash")) {
        return {
          rows: [
            {
              id: "api-key-test",
              name: "Test API key",
              key_prefix: "vcon_test_",
              secret_hash: "unused-hash",
              permissions_json: '["licenses:manage"]',
              app_id: null,
              status: "active",
            },
          ],
        };
      }
      if (sql.startsWith("UPDATE admin_api_keys SET last_used_at")) {
        throw new Error(`Timestamp DB failure ${apiSecret} ${databaseUrl}`);
      }
      return { rows: [] };
    },
    configurable: true,
  });

  const loggedErrors: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...values: unknown[]) => {
    loggedErrors.push(values.map(String).join(" "));
  };

  try {
    const response = await handleCloudflareApi(
      new Request("https://licenx.test/api/v1/admin/licenses/TEST/status", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${apiSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "active" }),
      }),
      undefined,
    );
    const body = (await response.json()) as { error?: string };

    assert.equal(response.status, 404);
    assert.equal(body.error, "License not found");
    assert.ok(
      loggedErrors.some((entry) => entry.includes("Timestamp DB failure")),
    );
    assert.ok(loggedErrors.every((entry) => !entry.includes(apiSecret)));
    assert.ok(loggedErrors.every((entry) => !entry.includes(databaseUrl)));
  } finally {
    console.error = originalConsoleError;
    Object.defineProperty(db, "execute", {
      value: originalExecute,
      configurable: true,
    });
  }
});

test("Node and Cloudflare Admin API-key failures hide internal exception text", async () => {
  const originalExecute = db.execute.bind(db);
  Object.defineProperty(db, "execute", {
    value: async () => {
      throw new Error(
        "Sensitive Admin DB sentinel: vcon_sec_phase5-sentinel body-secret-sentinel credentials leaked",
      );
    },
    configurable: true,
  });

  try {
    const authorization = "Bearer vcon_sec_phase5-sentinel";
    const nodeResponse = await fetch(`${baseUrl}/api/v1/admin/licenses`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tier: "pro" }),
    });
    const nodeBody = await nodeResponse.json();
    const loggedErrors: string[] = [];
    const originalConsoleError = console.error;
    console.error = (...values: unknown[]) => {
      loggedErrors.push(values.map(String).join(" "));
    };

    let cloudflareResponse: Response;
    let cloudflareBody: Record<string, unknown>;
    try {
      cloudflareResponse = await handleCloudflareApi(
        new Request("https://licenx.test/api/v1/admin/licenses", {
          method: "POST",
          headers: {
            Authorization: authorization,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tier: "pro",
            r2Config: { secretAccessKey: "body-secret-sentinel" },
          }),
        }),
        undefined,
      );
      cloudflareBody = await cloudflareResponse.json();
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(nodeResponse.status, 500);
    assert.equal(cloudflareResponse.status, 500);
    assert.equal(nodeBody.error, "Internal server error");
    assert.equal(cloudflareBody.error, "Internal server error");
    assert.equal(typeof cloudflareBody.request_id, "string");
    assert.doesNotMatch(
      JSON.stringify(nodeBody),
      /Sensitive Admin DB sentinel/,
    );
    assert.doesNotMatch(
      JSON.stringify(cloudflareBody),
      /Sensitive Admin DB sentinel/,
    );
    assert.ok(
      loggedErrors.some((entry) =>
        entry.includes("Sensitive Admin DB sentinel"),
      ),
    );
    assert.ok(
      loggedErrors.some((entry) =>
        entry.includes(String(cloudflareBody.request_id)),
      ),
    );
    assert.ok(loggedErrors.some((entry) => entry.includes("[REDACTED]")));
    assert.ok(
      loggedErrors.every(
        (entry) => !entry.includes("vcon_sec_phase5-sentinel"),
      ),
    );
    assert.ok(
      loggedErrors.every((entry) => !entry.includes("body-secret-sentinel")),
    );
  } finally {
    Object.defineProperty(db, "execute", {
      value: originalExecute,
      configurable: true,
    });
  }
});

test("Expected 4xx auth failures stay unchanged", async () => {
  const nodeResponse = await postNode("/api/auth/login", {
    username: "missing-user",
    password: "wrong-password",
  });
  const cloudflareResponse = await postCloudflare("/auth/login", {
    username: "missing-user",
    password: "wrong-password",
  });

  assert.equal(nodeResponse.status, 401);
  assert.equal(cloudflareResponse.status, 401);
  assert.deepEqual(await nodeResponse.json(), { error: "Invalid credentials" });
  assert.deepEqual(await cloudflareResponse.json(), {
    error: "Invalid credentials",
  });
});
