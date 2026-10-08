import express from "express";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { apiRouter } from "../src/server/api.js";
import { handleCloudflareApi } from "../src/server/cloudflareHandler.js";
import { getDbClient, initDatabaseSchema } from "../src/server/db.js";

let server: Server;
let baseUrl: string;
const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
};
let db: ReturnType<typeof getDbClient>;

before(async () => {
  process.env.NODE_ENV = "test";
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = "file::memory:";
  db = getDbClient();
  await initDatabaseSchema();

  const app = express();
  app.use("/api", apiRouter);
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
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

test("Node SDK download still returns the named ZIP attachment", async () => {
  const response = await fetch(`${baseUrl}/api/sdk/download/python`);
  const archive = Buffer.from(await response.arrayBuffer());

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/zip/);
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="x_license_python.zip"',
  );
  assert.deepEqual([...archive.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
});

test("Cloudflare SDK download still redirects to the public ZIP asset", async () => {
  const response = await handleCloudflareApi(
    new Request("https://licenx.test/sdk/download/python"),
    undefined,
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://licenx.test/x_license_python.zip",
  );
});
