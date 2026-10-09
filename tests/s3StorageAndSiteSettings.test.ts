import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { ensureDOMParser, extractS3ErrorMessage, validateR2Config } from '../src/server/r2.js';
import { handleCloudflareApi } from '../src/server/cloudflareHandler.js';
import { getDbClient } from '../src/server/db.js';

let db: ReturnType<typeof getDbClient>;

before(async () => {
  process.env.NODE_ENV = 'test';
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = 'file::memory:';
  db = getDbClient();

  await db.execute(
    'CREATE TABLE IF NOT EXISTS admin_config (id TEXT PRIMARY KEY, r2_config_json TEXT, site_settings_json TEXT)'
  );
  await db.execute('DELETE FROM admin_config');
  await db.execute({
    sql: 'INSERT INTO admin_config (id, r2_config_json, site_settings_json) VALUES (?, ?, ?)',
    args: ['admin', null, null],
  });
});

test('DOMParser and Node are globally defined and compliant with AWS SDK XML parser', async () => {
  ensureDOMParser();

  assert.equal(typeof globalThis.DOMParser, 'function');
  assert.equal(typeof (globalThis as any).Node, 'object');
  assert.equal((globalThis as any).Node.ELEMENT_NODE, 1);
  assert.equal((globalThis as any).Node.TEXT_NODE, 3);

  const parser = new (globalThis as any).DOMParser();
  const xml = '<Error><Code>InvalidAccessKeyId</Code><Message>The key is invalid</Message></Error>';
  const doc = parser.parseFromString(xml, 'application/xml');

  assert.ok(doc.documentElement);
  assert.equal(doc.documentElement.nodeName, 'Error');
  assert.equal(doc.documentElement.childNodes.length, 2);
  assert.equal(doc.documentElement.childNodes[0].nodeName, 'Code');
  assert.equal(doc.documentElement.childNodes[0].textContent, 'InvalidAccessKeyId');
  assert.equal(doc.documentElement.childNodes[1].nodeName, 'Message');
  assert.equal(doc.documentElement.childNodes[1].textContent, 'The key is invalid');
});

test('extractS3ErrorMessage extracts clear diagnostic message instead of deserialization crash', () => {
  const customError = {
    Code: 'AccessDenied',
    Message: 'User is not authorized to perform PutObject',
  };
  assert.equal(
    extractS3ErrorMessage(customError),
    'AccessDenied: User is not authorized to perform PutObject'
  );

  const response403Error = {
    message: 'DOMParser is not defined Deserialization error',
    $response: { statusCode: 403 },
  };
  assert.equal(
    extractS3ErrorMessage(response403Error),
    'Cloudflare R2 Access Denied (Check Access Key & Secret Permissions)'
  );

  const response404Error = {
    message: 'Some error',
    $response: { statusCode: 404 },
  };
  assert.equal(
    extractS3ErrorMessage(response404Error),
    'Cloudflare R2 Bucket Not Found (Check Bucket Name)'
  );
});

test('Cloudflare asset proxy rejects path traversal with HTTP 400', async () => {
  const req = new Request(
    'https://license.test/api/public/assets/branding/test/..%2fsecrets.txt',
    {
      method: 'GET',
    }
  );
  const res = await handleCloudflareApi(req, undefined);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match((data as any).error, /Invalid asset path/i);
});

test('Cloudflare asset proxy returns 404 when storage is unconfigured', async () => {
  const req = new Request('https://license.test/api/public/assets/branding/logo.png', {
    method: 'GET',
  });
  const res = await handleCloudflareApi(req, undefined);
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.match((data as any).error, /storage not configured/i);
});

test('SignatureDoesNotMatch provides clear instruction to re-enter secret key', () => {
  const sigError = {
    Code: 'SignatureDoesNotMatch',
    Message: 'The request signature we calculated does not match',
  };
  const msg = extractS3ErrorMessage(sigError);
  assert.match(msg, /SignatureDoesNotMatch/);
  assert.match(msg, /Storage & DB tab/);
});

test('validateR2Config rejects placeholder bullets and invalid credentials', () => {
  const bulletConfig = {
    accountId: 'acc',
    accessKeyId: 'key',
    secretAccessKey: '••••••••••••••••',
    bucketName: 'bucket',
  };
  const res = validateR2Config(bulletConfig);
  assert.equal(res.valid, false);
  assert.match(res.error || '', /masked placeholder/i);
});
