import express from "express";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { apiRouter } from "../src/server/api.js";
import { handleCloudflareApi } from "../src/server/cloudflareHandler.js";
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
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Internal server error" });
  } finally {
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
        "Sensitive Admin DB sentinel: connection credentials leaked",
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
    const cloudflareResponse = await handleCloudflareApi(
      new Request("https://licenx.test/api/v1/admin/licenses", {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tier: "pro" }),
      }),
      undefined,
    );
    const nodeBody = await nodeResponse.json();
    const cloudflareBody = await cloudflareResponse.json();

    assert.equal(nodeResponse.status, 500);
    assert.equal(cloudflareResponse.status, 500);
    assert.equal(nodeBody.error, "Internal server error");
    assert.equal(cloudflareBody.error, "Internal server error");
    assert.doesNotMatch(
      JSON.stringify(nodeBody),
      /Sensitive Admin DB sentinel/,
    );
    assert.doesNotMatch(
      JSON.stringify(cloudflareBody),
      /Sensitive Admin DB sentinel/,
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
