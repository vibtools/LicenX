import assert from 'node:assert/strict';
import { test, before } from 'node:test';
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
    'CREATE TABLE IF NOT EXISTS admin_config (id TEXT PRIMARY KEY, r2_config_json TEXT, site_settings_json TEXT, updated_at INTEGER)'
  );
  await db.execute('DELETE FROM admin_config');
  await db.execute({
    sql: 'INSERT INTO admin_config (id, r2_config_json, site_settings_json, updated_at) VALUES (?, ?, ?, ?)',
    args: [
      'admin',
      JSON.stringify({
        accountId: 'test_acc',
        accessKeyId: 'test_key',
        secretAccessKey: 'test_secret',
        bucketName: 'test_bucket',
      }),
      JSON.stringify({
        siteName: 'VIbID.my',
        siteTagline: 'Enterprise Software Licensing Engine',
        logoUrl: 'https://x.vibid.my/branding/logo.png',
        faviconUrl: 'https://x.vibid.my/branding/fav.ico',
        allowPublicCheck: true,
        allowPublicReset: false,
      }),
      Date.now(),
    ],
  });
});

test('public site settings endpoint returns no-cache headers to eliminate stale edge caching', async () => {
  const req = new Request('http://localhost/api/public/site-settings', {
    method: 'GET',
  });
  const res = await handleCloudflareApi(req, undefined);
  assert.equal(res.status, 200);

  const cacheControl = res.headers.get('Cache-Control');
  assert.ok(cacheControl, 'Cache-Control header must be set');
  assert.match(cacheControl, /no-cache/, 'Must contain no-cache');
  assert.match(cacheControl, /no-store/, 'Must contain no-store');
  assert.match(cacheControl, /must-revalidate/, 'Must contain must-revalidate');

  const data = (await res.json()) as any;
  assert.equal(data.siteName, 'VIbID.my');
  assert.equal(data.siteTagline, 'Enterprise Software Licensing Engine');
  assert.equal(data.logoUrl, 'https://x.vibid.my/branding/logo.png');
  assert.equal(data.faviconUrl, 'https://x.vibid.my/branding/fav.ico');
  assert.equal(data.allowPublicCheck, true);
  assert.equal(data.allowPublicReset, false);

  // Security check: Must never leak storage or private admin config
  assert.equal(data.r2_config_json, undefined);
  assert.equal(data.secretAccessKey, undefined);
  assert.equal(data.accessKeyId, undefined);
});

test('changes to site settings in database are immediately reflected in next GET', async () => {
  await db.execute({
    sql: 'UPDATE admin_config SET site_settings_json = ? WHERE id = ?',
    args: [
      JSON.stringify({
        siteName: 'UpdatedBrand',
        siteTagline: 'Brand New Tagline',
        logoUrl: 'https://x.vibid.my/new-logo.png',
        allowPublicCheck: false,
        allowPublicReset: true,
      }),
      'admin',
    ],
  });

  const req = new Request('http://localhost/api/public/site-settings', {
    method: 'GET',
  });
  const res = await handleCloudflareApi(req, undefined);
  assert.equal(res.status, 200);
  const data = (await res.json()) as any;

  assert.equal(data.siteName, 'UpdatedBrand');
  assert.equal(data.siteTagline, 'Brand New Tagline');
  assert.equal(data.logoUrl, 'https://x.vibid.my/new-logo.png');
  assert.equal(data.allowPublicCheck, false);
  assert.equal(data.allowPublicReset, true);
});
