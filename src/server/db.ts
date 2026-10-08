import { createClient, type Client } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

let dbClient: Client | null = null;
let currentDbUrl = '';
let currentAuthToken = '';

let isSchemaInitialized = false;
let schemaInitPromise: Promise<void> | null = null;

export function isTursoPlaceholder(url?: string, token?: string): boolean {
  if (!url) return true;
  const cleanUrl = url.trim().toLowerCase();
  if (
    cleanUrl.includes('your-database-name') ||
    cleanUrl.includes('example.com') ||
    cleanUrl.includes('placeholder') ||
    cleanUrl.includes('[database-name]') ||
    cleanUrl.includes('[org]') ||
    cleanUrl === 'libsql://' ||
    cleanUrl === 'https://'
  ) {
    return true;
  }
  if (token && (token.includes('your-turso-auth-token') || token.includes('placeholder') || token.includes('[auth-token]'))) {
    return true;
  }
  return false;
}

export function getDbClient(env?: any): Client {
  let url =
    env?.TURSO_DATABASE_URL ||
    env?.DATABASE_URL ||
    (typeof process !== 'undefined' ? process.env?.TURSO_DATABASE_URL || process.env?.DATABASE_URL : '') ||
    'file:vcon_data.db';

  let authToken =
    env?.TURSO_AUTH_TOKEN ||
    (typeof process !== 'undefined' ? process.env?.TURSO_AUTH_TOKEN : undefined) ||
    undefined;

  if (isTursoPlaceholder(url, authToken)) {
    url = 'file:vcon_data.db';
    authToken = undefined;
  }

  if (!dbClient || currentDbUrl !== url || currentAuthToken !== (authToken || '')) {
    // If it's a local file URL, make sure the directory exists (only in Node.js runtime)
    if (url.startsWith('file:') && typeof fs !== 'undefined' && typeof fs.existsSync === 'function') {
      try {
        const filePath = url.replace('file:', '');
        const dir = path.dirname(path.resolve(filePath));
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      } catch {
        // Ignored on edge / serverless runtimes
      }
    }

    try {
      dbClient = createClient({
        url,
        authToken,
      });
      currentDbUrl = url;
      currentAuthToken = authToken || '';
    } catch (err) {
      console.warn('[VCON] Error creating client for url, falling back to local file:vcon_data.db:', err);
      dbClient = createClient({ url: 'file:vcon_data.db' });
      currentDbUrl = 'file:vcon_data.db';
      currentAuthToken = '';
    }
  }

  return dbClient;
}

export async function initDatabaseSchema(env?: any): Promise<void> {
  if (isSchemaInitialized) return;
  if (schemaInitPromise) return schemaInitPromise;

  schemaInitPromise = (async () => {
    let db = getDbClient(env);

    try {
      // Fast probe: check if all 5 core tables exist
      const check = await db.execute(
        "SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name IN ('admin_config', 'apps', 'licenses', 'devices', 'validation_logs')"
      );
      const count = Number(check.rows[0]?.c || 0);
      if (count >= 5) {
        // Fast path: Database schema already exists!
        // Ensure high-performance indexes exist silently
        try {
          await db.execute('CREATE INDEX IF NOT EXISTS idx_licenses_created_at ON licenses(created_at DESC)');
          await db.execute('CREATE INDEX IF NOT EXISTS idx_devices_first_bound ON devices(first_bound_at DESC)');
        } catch {}
        isSchemaInitialized = true;
        return;
      }
    } catch (probeError) {
      console.warn('[VCON] Database connection probe check failed:', probeError);
    }

    // 1. Admin config table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS admin_config (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        jwt_secret TEXT NOT NULL,
        ed25519_private_key TEXT NOT NULL,
        ed25519_public_key TEXT NOT NULL,
        r2_config_json TEXT,
        site_settings_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

  try {
    await db.execute('ALTER TABLE admin_config ADD COLUMN site_settings_json TEXT');
  } catch {
    // Column already exists, ignore
  }

  // 2. Apps table (Multi-App Scoping & Config)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      app_slug TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      min_version TEXT NOT NULL DEFAULT '1.0.0',
      status TEXT NOT NULL DEFAULT 'active',
      app_secret TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_apps_slug ON apps(app_slug);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_apps_status ON apps(status);
  `);

  // 3. Licenses table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      tier TEXT DEFAULT 'Standard',
      app_id TEXT,
      device_limit INTEGER DEFAULT 1,
      validity_type TEXT DEFAULT 'lifetime',
      validity_value INTEGER DEFAULT 0,
      activated_at INTEGER,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      customer_name TEXT,
      customer_email TEXT,
      notes TEXT,
      metadata_json TEXT,
      r2_backup_id TEXT,
      pin TEXT
    );
  `);

  // Ensure app_id column exists if table existed previously without it
  try {
    await db.execute('ALTER TABLE licenses ADD COLUMN app_id TEXT');
  } catch {
    // Column already exists, ignore
  }

  // Ensure pin column exists if table existed previously without it
  try {
    await db.execute('ALTER TABLE licenses ADD COLUMN pin TEXT');
  } catch {
    // Column already exists, ignore
  }

  // Index on license key
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(key);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_licenses_app ON licenses(app_id);
  `);

  // 4. Devices table (HWID bindings)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      license_id TEXT NOT NULL,
      hwid TEXT NOT NULL,
      device_name TEXT,
      os_info TEXT,
      ip_address TEXT,
      first_bound_at INTEGER NOT NULL,
      last_ping_at INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_devices_license_id ON devices(license_id);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_devices_hwid ON devices(hwid);
  `);

  // 5. Validation logs table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS validation_logs (
      id TEXT PRIMARY KEY,
      license_key TEXT,
      app_slug TEXT,
      hwid TEXT,
      ip_address TEXT,
      action TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      message TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  try {
    await db.execute('ALTER TABLE validation_logs ADD COLUMN app_slug TEXT');
  } catch {
    // Column already exists, ignore
  }

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_logs_created_at ON validation_logs(created_at DESC);
  `);
  try {
    await db.execute('CREATE INDEX IF NOT EXISTS idx_logs_action ON validation_logs(action, created_at DESC);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_licenses_created_at ON licenses(created_at DESC);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_devices_first_bound ON devices(first_bound_at DESC);');
  } catch {}

  // 6. R2 Backups history
  await db.execute(`
    CREATE TABLE IF NOT EXISTS r2_backups (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      record_count INTEGER NOT NULL,
      file_size INTEGER NOT NULL,
      r2_url TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  // 7. Auto seed default app if no apps exist
  const existingApps = await db.execute('SELECT id FROM apps LIMIT 1');
  if (existingApps.rows.length === 0) {
    const now = Date.now();
    await db.execute({
      sql: `INSERT INTO apps (id, app_slug, display_name, min_version, status, app_secret, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      args: [
        'app_vcon_default',
        'vcon_default',
        'VCON Default Suite',
        '1.0.0',
        'sec_' + crypto.randomBytes(16).toString('hex'),
        'Default core application suite',
        now,
        now,
      ],
    });
  }

  isSchemaInitialized = true;
  })().finally(() => {
    schemaInitPromise = null;
  });

  return schemaInitPromise;
}
