import express from "express";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { apiRouter, invalidateAdminConfigCache as invalidateNodeAuthCache } from "../src/server/api.js";
import {
  handleCloudflareApi,
  invalidateAdminConfigCache as invalidateCloudflareAuthCache,
} from "../src/server/cloudflareHandler.js";
import { createSessionToken, hashPassword } from "../src/server/crypto.js";
import { getDbClient, initDatabaseSchema } from "../src/server/db.js";
import {
  ADMIN_LOGIN_WINDOW_MS,
  getAdminLoginRateLimit,
} from "../src/server/adminLoginRateLimit.js";

const ADMIN_USERNAME = "phase-four-admin";
const ADMIN_PASSWORD = "phase-four-passphrase";
const JWT_SECRET = "phase-four-test-jwt-secret";
let db: ReturnType<typeof getDbClient>;
let server: Server;
let nodeBaseUrl: string;
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
  nodeBaseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  await db.execute("DELETE FROM admin_login_attempts");
  await db.execute("DELETE FROM admin_config");
  invalidateNodeAuthCache();
  invalidateCloudflareAuthCache();
  await db.execute({
    sql: `INSERT INTO admin_config
          (id, username, password_hash, jwt_secret, ed25519_private_key,
           ed25519_public_key, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "phase-four-admin",
      ADMIN_USERNAME,
      hashPassword(ADMIN_PASSWORD),
      JWT_SECRET,
      "private-test-key",
      "public-test-key",
      Date.now(),
      Date.now(),
    ],
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

function cloudflareRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return handleCloudflareApi(
    new Request(`https://licenx.test${path}`, init),
    undefined,
  );
}

async function requestNode(path: string, init: RequestInit = {}) {
  return fetch(`${nodeBaseUrl}${path}`, init);
}

function cookieValue(response: Response, cookieName: string): string {
  const cookie = response.headers.get("set-cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|,\\s*)${cookieName}=([^;]+)`));
  assert.ok(match, `expected ${cookieName} cookie`);
  return match[1];
}

async function getCsrf(
  request: (path: string, init?: RequestInit) => Promise<Response>,
): Promise<string> {
  const response = await request("/api/auth/csrf");
  assert.equal(response.status, 200);
  const body = await response.json();
  const token = body.csrfToken as string;
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.match(
    response.headers.get("set-cookie") || "",
    /Secure; SameSite=Strict/,
  );
  return token;
}

function csrfHeaders(csrfToken: string, origin: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Cookie: `vcon_admin_csrf=${csrfToken}`,
    Origin: origin,
    "X-CSRF-Token": csrfToken,
  };
}

test("Node and Cloudflare require CSRF proof for browser login and setup", async () => {
  const nodeDenied = await requestNode("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: nodeBaseUrl },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  const cloudflareDenied = await cloudflareRequest("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://licenx.test",
    },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  assert.equal(nodeDenied.status, 403);
  assert.equal(cloudflareDenied.status, 403);

  const csrfNode = await getCsrf(requestNode);
  const csrfCloudflare = await getCsrf(cloudflareRequest);
  await db.execute("DELETE FROM admin_config");
  invalidateNodeAuthCache();
  invalidateCloudflareAuthCache();
  const setupNode = await requestNode("/api/setup/init", {
    method: "POST",
    headers: csrfHeaders(csrfNode, nodeBaseUrl),
    body: JSON.stringify({ username: "new-admin", password: "short-pass" }),
  });
  const setupCloudflare = await cloudflareRequest("/api/setup/init", {
    method: "POST",
    headers: csrfHeaders(csrfCloudflare, "https://licenx.test"),
    body: JSON.stringify({ username: "new-admin", password: "short-pass" }),
  });
  assert.equal(setupNode.status, 400);
  assert.equal(setupCloudflare.status, 400);
  assert.match((await setupNode.json()).error, /12 characters/);
  assert.match((await setupCloudflare.json()).error, /12 characters/);
});

test("Node and Cloudflare issue HttpOnly session cookies without returning tokens", async () => {
  const csrfNode = await getCsrf(requestNode);
  const csrfCloudflare = await getCsrf(cloudflareRequest);
  const nodeLogin = await requestNode("/api/auth/login", {
    method: "POST",
    headers: csrfHeaders(csrfNode, nodeBaseUrl),
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  const cloudflareLogin = await cloudflareRequest("/api/auth/login", {
    method: "POST",
    headers: csrfHeaders(csrfCloudflare, "https://licenx.test"),
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });

  for (const response of [nodeLogin, cloudflareLogin]) {
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.username, ADMIN_USERNAME);
    assert.equal("token" in body, false);
    assert.match(
      response.headers.get("set-cookie") || "",
      /HttpOnly; Secure; SameSite=Strict/,
    );
  }
  const nodeSession = cookieValue(nodeLogin, "vcon_admin_session");
  const cloudflareSession = cookieValue(cloudflareLogin, "vcon_admin_session");
  assert.ok(nodeSession);
  assert.ok(cloudflareSession);

  const nodeLogout = await requestNode("/api/auth/logout", {
    method: "POST",
    headers: {
      ...csrfHeaders(csrfNode, nodeBaseUrl),
      Cookie: `vcon_admin_session=${nodeSession}; vcon_admin_csrf=${csrfNode}`,
    },
    body: "{}",
  });
  const cloudflareLogout = await cloudflareRequest("/api/auth/logout", {
    method: "POST",
    headers: {
      ...csrfHeaders(csrfCloudflare, "https://licenx.test"),
      Cookie: `vcon_admin_session=${cloudflareSession}; vcon_admin_csrf=${csrfCloudflare}`,
    },
    body: "{}",
  });
  assert.equal(nodeLogout.status, 200);
  assert.equal(cloudflareLogout.status, 200);
  assert.match(
    nodeLogout.headers.get("set-cookie") || "",
    /vcon_admin_session=; Path=\/api; Max-Age=0/,
  );
  assert.match(
    cloudflareLogout.headers.get("set-cookie") || "",
    /vcon_admin_session=; Path=\/api; Max-Age=0/,
  );
});

test("Node and Cloudflare setup issues the browser session cookie", async () => {
  await db.execute("DELETE FROM admin_config");
  invalidateNodeAuthCache();
  invalidateCloudflareAuthCache();
  const nodeCsrf = await getCsrf(requestNode);
  const nodeSetup = await requestNode("/api/setup/init", {
    method: "POST",
    headers: csrfHeaders(nodeCsrf, nodeBaseUrl),
    body: JSON.stringify({
      username: "setup-node-admin",
      password: "secure-node-passphrase",
    }),
  });
  assert.equal(nodeSetup.status, 200);
  assert.equal("token" in (await nodeSetup.json()), false);
  assert.match(
    nodeSetup.headers.get("set-cookie") || "",
    /HttpOnly; Secure; SameSite=Strict/,
  );

  await db.execute("DELETE FROM admin_config");
  invalidateNodeAuthCache();
  invalidateCloudflareAuthCache();
  const cloudflareCsrf = await getCsrf(cloudflareRequest);
  const cloudflareSetup = await cloudflareRequest("/api/setup/init", {
    method: "POST",
    headers: csrfHeaders(cloudflareCsrf, "https://licenx.test"),
    body: JSON.stringify({
      username: "setup-cloudflare-admin",
      password: "secure-cloudflare-passphrase",
    }),
  });
  assert.equal(cloudflareSetup.status, 200);
  assert.equal("token" in (await cloudflareSetup.json()), false);
  assert.match(
    cloudflareSetup.headers.get("set-cookie") || "",
    /HttpOnly; Secure; SameSite=Strict/,
  );
});

test("Node and Cloudflare authenticate cookie sessions and enforce CSRF", async () => {
  const csrfNode = await getCsrf(requestNode);
  const csrfCloudflare = await getCsrf(cloudflareRequest);
  const nodeLogin = await requestNode("/api/auth/login", {
    method: "POST",
    headers: csrfHeaders(csrfNode, nodeBaseUrl),
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  const cloudflareLogin = await cloudflareRequest("/api/auth/login", {
    method: "POST",
    headers: csrfHeaders(csrfCloudflare, "https://licenx.test"),
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  const nodeSession = cookieValue(nodeLogin, "vcon_admin_session");
  const cloudflareSession = cookieValue(
    cloudflareLogin,
    "vcon_admin_session",
  );

  const nodeMe = await requestNode("/api/auth/me", {
    headers: { Cookie: `vcon_admin_session=${nodeSession}` },
  });
  const cloudflareMe = await cloudflareRequest("/api/auth/me", {
    headers: { Cookie: `vcon_admin_session=${cloudflareSession}` },
  });
  assert.equal(nodeMe.status, 200);
  assert.equal(cloudflareMe.status, 200);

  const legacyBearer = createSessionToken(
    {
      username: ADMIN_USERNAME,
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    JWT_SECRET,
  );
  const nodeBearerMe = await requestNode("/api/auth/me", {
    headers: { Authorization: `Bearer ${legacyBearer}` },
  });
  const cloudflareBearerMe = await cloudflareRequest("/api/auth/me", {
    headers: { Authorization: `Bearer ${legacyBearer}` },
  });
  assert.equal(nodeBearerMe.status, 200);
  assert.equal(cloudflareBearerMe.status, 200);

  const nodeMutation = await requestNode("/api/auth/update-credentials", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `vcon_admin_session=${nodeSession}`,
    },
    body: JSON.stringify({ currentPassword: ADMIN_PASSWORD, newPassword: "too-short" }),
  });
  const cloudflareMutation = await cloudflareRequest(
    "/api/auth/update-credentials",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `vcon_admin_session=${cloudflareSession}`,
      },
      body: JSON.stringify({ currentPassword: ADMIN_PASSWORD, newPassword: "too-short" }),
    },
  );
  assert.equal(nodeMutation.status, 403);
  assert.equal(cloudflareMutation.status, 403);

  const nodeCrossOriginMutation = await requestNode(
    "/api/auth/update-credentials",
    {
      method: "POST",
      headers: {
        ...csrfHeaders(csrfNode, "https://attacker.test"),
        Cookie: `vcon_admin_session=${nodeSession}; vcon_admin_csrf=${csrfNode}`,
      },
      body: JSON.stringify({
        currentPassword: ADMIN_PASSWORD,
        newPassword: "valid-passphrase",
      }),
    },
  );
  const cloudflareCrossOriginMutation = await cloudflareRequest(
    "/api/auth/update-credentials",
    {
      method: "POST",
      headers: {
        ...csrfHeaders(csrfCloudflare, "https://attacker.test"),
        Cookie: `vcon_admin_session=${cloudflareSession}; vcon_admin_csrf=${csrfCloudflare}`,
      },
      body: JSON.stringify({
        currentPassword: ADMIN_PASSWORD,
        newPassword: "valid-passphrase",
      }),
    },
  );
  assert.equal(nodeCrossOriginMutation.status, 403);
  assert.equal(cloudflareCrossOriginMutation.status, 403);

  const cloudflareShortPassword = await cloudflareRequest(
    "/api/auth/update-credentials",
    {
      method: "POST",
      headers: {
        ...csrfHeaders(csrfCloudflare, "https://licenx.test"),
        Cookie: `vcon_admin_session=${cloudflareSession}; vcon_admin_csrf=${csrfCloudflare}`,
      },
      body: JSON.stringify({
        currentPassword: ADMIN_PASSWORD,
        newPassword: "12345678901",
      }),
    },
  );
  assert.equal(cloudflareShortPassword.status, 400);

  const nodeShortPassword = await requestNode(
    "/api/auth/update-credentials",
    {
      method: "POST",
      headers: {
        ...csrfHeaders(csrfNode, nodeBaseUrl),
        Cookie: `vcon_admin_session=${nodeSession}; vcon_admin_csrf=${csrfNode}`,
      },
      body: JSON.stringify({
        currentPassword: ADMIN_PASSWORD,
        newPassword: "12345678901",
      }),
    },
  );
  assert.equal(nodeShortPassword.status, 400);
});

test("Node enforces and accepts the 12-character credential policy", async () => {
  const csrfNode = await getCsrf(requestNode);
  const nodeLogin = await requestNode("/api/auth/login", {
    method: "POST",
    headers: csrfHeaders(csrfNode, nodeBaseUrl),
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  const nodeSession = cookieValue(nodeLogin, "vcon_admin_session");
  const nodeShortPassword = await requestNode(
    "/api/auth/update-credentials",
    {
      method: "POST",
      headers: {
        ...csrfHeaders(csrfNode, nodeBaseUrl),
        Cookie: `vcon_admin_session=${nodeSession}; vcon_admin_csrf=${csrfNode}`,
      },
      body: JSON.stringify({
        currentPassword: ADMIN_PASSWORD,
        newPassword: "12345678901",
      }),
    },
  );
  assert.equal(nodeShortPassword.status, 400);

  const nodeUpdated = await requestNode("/api/auth/update-credentials", {
    method: "POST",
    headers: {
      ...csrfHeaders(csrfNode, nodeBaseUrl),
      Cookie: `vcon_admin_session=${nodeSession}; vcon_admin_csrf=${csrfNode}`,
    },
    body: JSON.stringify({
      currentPassword: ADMIN_PASSWORD,
      newPassword: "longer-passphrase",
    }),
  });
  assert.equal(nodeUpdated.status, 200);
  assert.equal("token" in (await nodeUpdated.json()), false);
  const nodeUpdatedSession = cookieValue(nodeUpdated, "vcon_admin_session");
  const nodeMeAfterUpdate = await requestNode("/api/auth/me", {
    headers: { Cookie: `vcon_admin_session=${nodeUpdatedSession}` },
  });
  assert.equal(nodeMeAfterUpdate.status, 200);
});

test("Cloudflare enforces and accepts the 12-character credential policy", async () => {
  const csrfCloudflare = await getCsrf(cloudflareRequest);
  const cloudflareLogin = await cloudflareRequest("/api/auth/login", {
    method: "POST",
    headers: csrfHeaders(csrfCloudflare, "https://licenx.test"),
    body: JSON.stringify({
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    }),
  });
  const cloudflareSession = cookieValue(cloudflareLogin, "vcon_admin_session");
  const cloudflareShortPassword = await cloudflareRequest(
    "/api/auth/update-credentials",
    {
      method: "POST",
      headers: {
        ...csrfHeaders(csrfCloudflare, "https://licenx.test"),
        Cookie: `vcon_admin_session=${cloudflareSession}; vcon_admin_csrf=${csrfCloudflare}`,
      },
      body: JSON.stringify({
        currentPassword: ADMIN_PASSWORD,
        newPassword: "12345678901",
      }),
    },
  );
  assert.equal(cloudflareShortPassword.status, 400);

  const cloudflareUpdated = await cloudflareRequest(
    "/api/auth/update-credentials",
    {
      method: "POST",
      headers: {
        ...csrfHeaders(csrfCloudflare, "https://licenx.test"),
        Cookie: `vcon_admin_session=${cloudflareSession}; vcon_admin_csrf=${csrfCloudflare}`,
      },
      body: JSON.stringify({
        currentPassword: ADMIN_PASSWORD,
        newPassword: "longer-passphrase",
      }),
    },
  );
  assert.equal(cloudflareUpdated.status, 200);
  assert.equal("token" in (await cloudflareUpdated.json()), false);
  const cloudflareUpdatedSession = cookieValue(
    cloudflareUpdated,
    "vcon_admin_session",
  );
  const cloudflareMeAfterUpdate = await cloudflareRequest("/api/auth/me", {
    headers: { Cookie: `vcon_admin_session=${cloudflareUpdatedSession}` },
  });
  assert.equal(cloudflareMeAfterUpdate.status, 200);
});

test("Node and Cloudflare throttle the fifth failed login and return Retry-After", async () => {
  const nodeStatuses: number[] = [];
  const cloudflareStatuses: number[] = [];
  let lastNodeResponse: Response | undefined;
  let lastCloudflareResponse: Response | undefined;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    lastNodeResponse = await requestNode("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: "incorrect" }),
    });
    lastCloudflareResponse = await cloudflareRequest("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-connecting-ip": "192.0.2.50",
      },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: "incorrect" }),
    });
    nodeStatuses.push(lastNodeResponse.status);
    cloudflareStatuses.push(lastCloudflareResponse.status);
  }

  assert.deepEqual(nodeStatuses, [401, 401, 401, 401, 429]);
  assert.deepEqual(cloudflareStatuses, [401, 401, 401, 401, 429]);
  assert.ok(Number(lastNodeResponse?.headers.get("retry-after")) > 0);
  assert.ok(Number(lastCloudflareResponse?.headers.get("retry-after")) > 0);
});

test("static Content Security Policy blocks inline scripts and plugins", async () => {
  const headers = await readFile(
    new URL("../public/_headers", import.meta.url),
    "utf8",
  );
  assert.match(headers, /script-src 'self'/);
  assert.match(headers, /object-src 'none'/);
  assert.match(headers, /frame-ancestors 'self'/);
  assert.doesNotMatch(
    headers.match(/script-src[^;]*/)?.[0] || "",
    /unsafe-inline/,
  );
});

test("Node and Cloudflare clear failed attempts after a successful login", async () => {
  const nodeCsrf = await getCsrf(requestNode);
  const cloudflareCsrf = await getCsrf(cloudflareRequest);
  const cloudflareIp = "192.0.2.51";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await requestNode("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: "wrong" }),
    });
    await cloudflareRequest("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-connecting-ip": cloudflareIp,
      },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: "wrong" }),
    });
  }

  await requestNode("/api/auth/login", {
    method: "POST",
    headers: csrfHeaders(nodeCsrf, nodeBaseUrl),
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  await cloudflareRequest("/api/auth/login", {
    method: "POST",
    headers: {
      ...csrfHeaders(cloudflareCsrf, "https://licenx.test"),
      "cf-connecting-ip": cloudflareIp,
    },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });

  const result = await db.execute(
    "SELECT COUNT(*) AS count FROM admin_login_attempts",
  );
  assert.equal(Number(result.rows[0].count), 0);
});

test("expired login-attempt keys are pruned while active blocks remain", async () => {
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO admin_login_attempts
          (attempt_key, window_started_at, failed_attempts, blocked_until)
          VALUES (?, ?, 1, 0), (?, ?, 5, ?)`,
    args: [
      "expired-attempt",
      now - ADMIN_LOGIN_WINDOW_MS * 2,
      "active-block",
      now - ADMIN_LOGIN_WINDOW_MS * 2,
      now + 60_000,
    ],
  });

  const rateLimit = await getAdminLoginRateLimit(db, "active-block", now);
  assert.equal(rateLimit.blocked, true);
  assert.ok(rateLimit.retryAfterSeconds > 0);
  const expired = await db.execute({
    sql: "SELECT attempt_key FROM admin_login_attempts WHERE attempt_key = ?",
    args: ["expired-attempt"],
  });
  assert.equal(expired.rows.length, 0);
});
