import crypto from 'node:crypto';
import { getDbClient, initDatabaseSchema, isTursoPlaceholder } from './db.js';
import {
  generateRSAKeyPair,
  generateEd25519KeyPair,
  canonicalJson,
  signPayload,
  hashPassword,
  verifyPassword,
  generateLicenseKey,
  createSessionToken,
  verifySessionToken,
} from './crypto.js';
import { testR2Connection, uploadToR2, R2Config } from './r2.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// In-memory admin auth caching to prevent redundant DB roundtrips on every request
let cachedAdminConfig: { jwtSecret: string; username: string; cachedAt: number } | null = null;
const ADMIN_CONFIG_CACHE_TTL = 60 * 1000; // 60 seconds cache

export function invalidateAdminConfigCache(): void {
  cachedAdminConfig = null;
}

// Admin Bearer Authentication (High Performance Cached)
async function verifyAdminAuth(request: Request, env: any): Promise<{ authorized: boolean; username?: string; error?: string }> {
  try {
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { authorized: false, error: 'Unauthorized: Missing token' };
    }

    const token = authHeader.split(' ')[1];
    const now = Date.now();
    let jwtSecret = '';
    let username = '';

    if (cachedAdminConfig && (now - cachedAdminConfig.cachedAt < ADMIN_CONFIG_CACHE_TTL)) {
      jwtSecret = cachedAdminConfig.jwtSecret;
      username = cachedAdminConfig.username;
    } else {
      const db = getDbClient(env);
      const configResult = await db.execute('SELECT jwt_secret, username FROM admin_config LIMIT 1');

      if (configResult.rows.length === 0) {
        return { authorized: false, error: 'System not initialized' };
      }

      const configRow = configResult.rows[0];
      jwtSecret = configRow.jwt_secret as string;
      username = configRow.username as string;
      cachedAdminConfig = { jwtSecret, username, cachedAt: now };
    }

    const session = verifySessionToken(token, jwtSecret);

    if (!session) {
      return { authorized: false, error: 'Unauthorized: Invalid or expired token' };
    }

    return { authorized: true, username: session.username };
  } catch (error: any) {
    return { authorized: false, error: error.message || 'Authentication check failed' };
  }
}

// Generate 4-digit numeric PIN
function generate4DigitPin(): string {
  const pinNum = Math.floor(1000 + Math.random() * 9000);
  return pinNum.toString();
}

/**
 * Main Cloudflare Pages Functions Request Handler
 * Handles all /api/* and /v1/* endpoints seamlessly on Edge runtimes
 */
export async function handleCloudflareApi(request: Request, env: any): Promise<Response> {
  // 1. Handle CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // 2. Parse URL and Method
  const url = new URL(request.url);
  let pathname = url.pathname;
  const method = request.method.toUpperCase();

  // Normalize path by stripping /api if present, but preserving /v1
  let normalizedPath = pathname;
  if (normalizedPath.startsWith('/api/')) {
    normalizedPath = normalizedPath.substring(4); // '/api/v1/...' -> '/v1/...' or '/api/setup' -> '/setup'
  }
  if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
    normalizedPath = normalizedPath.replace(/\/+$/, '');
  }

  // Parse Body for non-GET requests
  let body: any = {};
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      const text = await request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      body = {};
    }
  }

  // Extract client IP
  const ip = request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    '127.0.0.1';

  try {
    const db = getDbClient(env);

    // Auto-initialize schema on first request if needed
    try {
      await initDatabaseSchema(env);
    } catch {
      // Ignore if already initialized
    }

    // -----------------------------------------------------------------
    // HEALTH CHECK
    // -----------------------------------------------------------------
    if (normalizedPath === '/health') {
      return jsonResponse({
        status: 'online',
        system: 'VCON License Engine',
        time: Date.now(),
      });
    }

    // -----------------------------------------------------------------
    // PYTHON SDK DOWNLOAD
    // -----------------------------------------------------------------
    if (normalizedPath === '/sdk/download/python') {
      // Redirect to static zip asset deployed in dist/
      const zipUrl = new URL('/x_license_python.zip', request.url).toString();
      return Response.redirect(zipUrl, 302);
    }

    // -----------------------------------------------------------------
    // SETUP & INITIALIZATION
    // -----------------------------------------------------------------
    if (normalizedPath === '/setup/status' && method === 'GET') {
      const result = await db.execute('SELECT id, username, ed25519_public_key, r2_config_json FROM admin_config LIMIT 1');
      const isInitialized = result.rows.length > 0;
      let r2Configured = false;
      const rawUrl = env?.TURSO_DATABASE_URL || env?.DATABASE_URL || (typeof process !== 'undefined' ? process.env?.TURSO_DATABASE_URL : '') || '';
      const rawToken = env?.TURSO_AUTH_TOKEN || (typeof process !== 'undefined' ? process.env?.TURSO_AUTH_TOKEN : '') || '';
      const hasTurso = !isTursoPlaceholder(rawUrl, rawToken);

      if (isInitialized) {
        const row = result.rows[0];
        if (row.r2_config_json) {
          try {
            const r2 = JSON.parse(row.r2_config_json as string);
            r2Configured = Boolean(r2.accountId && r2.accessKeyId && r2.secretAccessKey && r2.bucketName);
          } catch {
            // ignore
          }
        }
      }

      return jsonResponse({
        initialized: isInitialized,
        adminUsername: null, // do not leak admin username
        r2Configured,
        hasTursoEnv: hasTurso,
        serverTime: Date.now(),
      });
    }

    if (normalizedPath === '/setup/init' && method === 'POST') {
      const existing = await db.execute('SELECT id FROM admin_config LIMIT 1');
      if (existing.rows.length > 0) {
        return errorResponse('Admin is already initialized. Please login.');
      }

      const { username, password, r2Config } = body;
      if (!username || !password) {
        return errorResponse('Username and password are required');
      }

      if (password.length < 6) {
        return errorResponse('Password must be at least 6 characters');
      }

      const keypair = generateRSAKeyPair(2048);
      const jwtSecret = crypto.randomBytes(32).toString('hex');
      const passwordHash = hashPassword(password);
      const now = Date.now();
      const id = 'admin_' + crypto.randomBytes(8).toString('hex');
      const r2Json = r2Config ? JSON.stringify(r2Config) : null;

      await db.execute({
        sql: `INSERT INTO admin_config (id, username, password_hash, jwt_secret, ed25519_private_key, ed25519_public_key, r2_config_json, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, username.trim(), passwordHash, jwtSecret, keypair.privateKeyPem, keypair.publicKeyPem, r2Json, now, now],
      });

      invalidateAdminConfigCache();

      const token = createSessionToken(
        { username: username.trim(), exp: Math.floor(Date.now() / 1000) + 86400 * 30 },
        jwtSecret
      );

      return jsonResponse({
        success: true,
        token,
        username: username.trim(),
        publicKeyPem: keypair.publicKeyPem,
      });
    }

    // -----------------------------------------------------------------
    // AUTHENTICATION
    // -----------------------------------------------------------------
    if (normalizedPath === '/auth/login' && method === 'POST') {
      const { username, password } = body;
      if (!username || !password) {
        return errorResponse('Username and password required');
      }

      const result = await db.execute({
        sql: 'SELECT username, password_hash, jwt_secret FROM admin_config WHERE username = ? LIMIT 1',
        args: [username.trim()],
      });

      if (result.rows.length === 0) {
        return errorResponse('Invalid credentials', 401);
      }

      const row = result.rows[0];
      const isValid = verifyPassword(password, row.password_hash as string);
      if (!isValid) {
        return errorResponse('Invalid credentials', 401);
      }

      const token = createSessionToken(
        { username: row.username as string, exp: Math.floor(Date.now() / 1000) + 86400 * 30 },
        row.jwt_secret as string
      );

      return jsonResponse({
        success: true,
        token,
        username: row.username,
      });
    }

    if (normalizedPath === '/auth/me' && method === 'GET') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const configResult = await db.execute('SELECT ed25519_public_key, r2_config_json FROM admin_config LIMIT 1');
      const row = configResult.rows[0];

      return jsonResponse({
        authenticated: true,
        username: auth.username,
        publicKeyPem: row ? row.ed25519_public_key : null,
        r2Configured: row && row.r2_config_json ? true : false,
      });
    }

    if (normalizedPath === '/auth/update-credentials' && method === 'POST') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const { currentPassword, newUsername, newPassword } = body;
      const configResult = await db.execute('SELECT id, username, password_hash, jwt_secret FROM admin_config LIMIT 1');
      if (configResult.rows.length === 0) return errorResponse('Admin config not found');

      const row = configResult.rows[0];
      const isCurrentValid = verifyPassword(currentPassword, row.password_hash as string);
      if (!isCurrentValid) return errorResponse('Current password incorrect', 401);

      const targetUsername = newUsername ? newUsername.trim() : (row.username as string);
      const targetPasswordHash = newPassword ? hashPassword(newPassword) : (row.password_hash as string);
      const newJwtSecret = crypto.randomBytes(32).toString('hex');

      await db.execute({
        sql: 'UPDATE admin_config SET username = ?, password_hash = ?, jwt_secret = ?, updated_at = ? WHERE id = ?',
        args: [targetUsername, targetPasswordHash, newJwtSecret, Date.now(), row.id as string],
      });

      invalidateAdminConfigCache();

      const token = createSessionToken(
        { username: targetUsername, exp: Math.floor(Date.now() / 1000) + 86400 * 30 },
        newJwtSecret
      );

      return jsonResponse({
        success: true,
        token,
        username: targetUsername,
      });
    }

    // -----------------------------------------------------------------
    // APPLICATIONS
    // -----------------------------------------------------------------
    if (normalizedPath === '/apps' && method === 'GET') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const search = url.searchParams.get('search');
      const status = url.searchParams.get('status');
      const limit = Number(url.searchParams.get('limit') || '50');
      const offset = Number(url.searchParams.get('offset') || '0');

      let query = `
        SELECT a.*,
          (SELECT COUNT(*) FROM licenses l WHERE l.app_id = a.id) as licenses_count
        FROM apps a
        WHERE 1=1
      `;
      const args: any[] = [];

      if (search && search.trim()) {
        query += ` AND (a.app_slug LIKE ? OR a.display_name LIKE ? OR a.description LIKE ?)`;
        const term = `%${search.trim()}%`;
        args.push(term, term, term);
      }

      if (status && status !== 'all') {
        query += ` AND a.status = ?`;
        args.push(status);
      }

      query += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
      args.push(limit, offset);

      let countQuery = `SELECT COUNT(*) as total FROM apps a WHERE 1=1`;
      const countArgs: any[] = [];
      if (search && search.trim()) {
        countQuery += ` AND (a.app_slug LIKE ? OR a.display_name LIKE ? OR a.description LIKE ?)`;
        const term = `%${search.trim()}%`;
        countArgs.push(term, term, term);
      }
      if (status && status !== 'all') {
        countQuery += ` AND a.status = ?`;
        countArgs.push(status);
      }

      const [result, countRes] = await Promise.all([
        db.execute({ sql: query, args }),
        db.execute({ sql: countQuery, args: countArgs }),
      ]);
      const total = Number(countRes.rows[0]?.total || 0);

      return jsonResponse({
        apps: result.rows,
        total,
        limit,
        offset,
      });
    }

    if (normalizedPath === '/apps' && method === 'POST') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const { app_slug, display_name, min_version, app_secret, description } = body;
      if (!app_slug || !display_name) return errorResponse('app_slug and display_name are required');

      const cleanSlug = app_slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');

      // Check if slug exists
      const existing = await db.execute({
        sql: 'SELECT id FROM apps WHERE app_slug = ? LIMIT 1',
        args: [cleanSlug],
      });
      if (existing.rows.length > 0) {
        return errorResponse(`App with identifier "${cleanSlug}" already exists`, 400);
      }

      const now = Date.now();
      const id = 'app_' + crypto.randomBytes(8).toString('hex');
      const secret = app_secret ? app_secret.trim() : 'sec_' + crypto.randomBytes(16).toString('hex');

      await db.execute({
        sql: `INSERT INTO apps (id, app_slug, display_name, min_version, status, app_secret, description, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
        args: [id, cleanSlug, display_name.trim(), min_version || '1.0.0', secret, description || null, now, now],
      });

      const createdApp = {
        id,
        app_slug: cleanSlug,
        display_name: display_name.trim(),
        min_version: min_version || '1.0.0',
        status: 'active',
        app_secret: secret,
        description: description || null,
        created_at: now,
        updated_at: now,
        licenses_count: 0,
      };

      return jsonResponse({
        success: true,
        app: createdApp,
        ...createdApp,
      });
    }

    if (normalizedPath.startsWith('/apps/') && normalizedPath !== '/apps/bulk-action') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      // GET /apps/:id/config
      if (normalizedPath.endsWith('/config') && method === 'GET') {
        const appId = normalizedPath.replace('/apps/', '').replace('/config', '');
        const [appRes, configRes] = await Promise.all([
          db.execute({ sql: 'SELECT * FROM apps WHERE id = ? LIMIT 1', args: [appId] }),
          db.execute('SELECT ed25519_public_key FROM admin_config LIMIT 1'),
        ]);

        if (appRes.rows.length === 0) {
          return errorResponse('App not found', 404);
        }

        const app = appRes.rows[0];
        const publicKeyPem = configRes.rows.length > 0 ? (configRes.rows[0].ed25519_public_key as string) : '';
        const serverUrl = env?.APP_URL || url.origin;

        const clientConfig = {
          server_url: serverUrl,
          app_name: app.app_slug,
          display_name: app.display_name,
          min_version: app.min_version,
          public_key_pem: publicKeyPem,
          generated_at: new Date().toISOString(),
        };

        return new Response(JSON.stringify(clientConfig, null, 2), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${app.app_slug}_vcon_config.json"`,
            ...corsHeaders,
          },
        });
      }

      // PATCH /apps/:id
      if (method === 'PATCH') {
        const appId = normalizedPath.replace('/apps/', '');
        const { display_name, min_version, status, description } = body;

        const fields: string[] = [];
        const args: any[] = [];

        if (display_name !== undefined) {
          fields.push('display_name = ?');
          args.push(display_name.trim());
        }
        if (min_version !== undefined) {
          fields.push('min_version = ?');
          args.push(min_version.trim());
        }
        if (status !== undefined) {
          fields.push('status = ?');
          args.push(status);
        }
        if (description !== undefined) {
          fields.push('description = ?');
          args.push(description ? description.trim() : null);
        }

        if (fields.length === 0) {
          return errorResponse('No fields to update', 400);
        }

        fields.push('updated_at = ?');
        args.push(Date.now());
        args.push(appId);

        await db.execute({
          sql: `UPDATE apps SET ${fields.join(', ')} WHERE id = ?`,
          args,
        });

        return jsonResponse({ success: true });
      }

      // DELETE /apps/:id
      if (method === 'DELETE') {
        const appId = normalizedPath.replace('/apps/', '');
        await db.execute({ sql: 'UPDATE licenses SET app_id = NULL WHERE app_id = ?', args: [appId] });
        await db.execute({ sql: 'DELETE FROM apps WHERE id = ?', args: [appId] });
        return jsonResponse({ success: true, message: 'Application deleted' });
      }
    }

    if (normalizedPath === '/apps/bulk-action' && method === 'POST') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const action = body.action;
      const ids = body.ids || body.app_ids;
      if (!action || !Array.isArray(ids) || ids.length === 0) {
        return errorResponse('Invalid bulk action payload');
      }

      const placeholders = ids.map(() => '?').join(',');
      const now = Date.now();
      if (action === 'delete') {
        await db.execute({ sql: `UPDATE licenses SET app_id = NULL WHERE app_id IN (${placeholders})`, args: ids });
        await db.execute({ sql: `DELETE FROM apps WHERE id IN (${placeholders})`, args: ids });
      } else if (action === 'deactivate') {
        await db.execute({ sql: `UPDATE apps SET status = 'inactive', updated_at = ? WHERE id IN (${placeholders})`, args: [now, ...ids] });
      } else if (action === 'activate') {
        await db.execute({ sql: `UPDATE apps SET status = 'active', updated_at = ? WHERE id IN (${placeholders})`, args: [now, ...ids] });
      }

      return jsonResponse({ success: true, affected: ids.length, modified: ids.length });
    }

    // -----------------------------------------------------------------
    // LICENSES MANAGEMENT
    // -----------------------------------------------------------------
    if (normalizedPath === '/licenses' && method === 'GET') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const status = url.searchParams.get('status');
      const appId = url.searchParams.get('app_id');
      const tier = url.searchParams.get('tier');
      const search = url.searchParams.get('search');
      const limit = Number(url.searchParams.get('limit') || '50');
      const offset = Number(url.searchParams.get('offset') || '0');

      let sql = `
        SELECT l.*, a.display_name as app_name, a.app_slug as app_slug,
               (SELECT COUNT(*) FROM devices d WHERE d.license_id = l.id AND d.status = 'active') as bound_devices_count
        FROM licenses l
        LEFT JOIN apps a ON l.app_id = a.id
        WHERE 1=1
      `;
      const args: any[] = [];

      if (status && status !== 'all') {
        sql += ' AND l.status = ?';
        args.push(status);
      }
      if (tier && tier !== 'all') {
        sql += ' AND l.tier = ?';
        args.push(tier);
      }
      if (appId && appId !== 'all') {
        if (appId === 'global') {
          sql += ' AND l.app_id IS NULL';
        } else {
          sql += ' AND l.app_id = ?';
          args.push(appId);
        }
      }
      if (search && search.trim()) {
        sql += ' AND (l.key LIKE ? OR l.customer_name LIKE ? OR l.customer_email LIKE ? OR l.pin LIKE ?)';
        const query = `%${search.trim()}%`;
        args.push(query, query, query, query);
      }

      sql += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
      args.push(limit, offset);

      // Count total
      let countSql = `SELECT COUNT(*) as total FROM licenses l WHERE 1=1`;
      const countArgs: any[] = [];
      if (status && status !== 'all') {
        countSql += ' AND l.status = ?';
        countArgs.push(status);
      }
      if (tier && tier !== 'all') {
        countSql += ' AND l.tier = ?';
        countArgs.push(tier);
      }
      if (appId && appId !== 'all') {
        if (appId === 'global') {
          countSql += ' AND l.app_id IS NULL';
        } else {
          countSql += ' AND l.app_id = ?';
          countArgs.push(appId);
        }
      }
      if (search && search.trim()) {
        countSql += ' AND (l.key LIKE ? OR l.customer_name LIKE ? OR l.customer_email LIKE ? OR l.pin LIKE ?)';
        const query = `%${search.trim()}%`;
        countArgs.push(query, query, query, query);
      }

      const [result, countRes] = await Promise.all([
        db.execute({ sql, args }),
        db.execute({ sql: countSql, args: countArgs }),
      ]);
      const total = Number(countRes.rows[0]?.total || 0);

      return jsonResponse({
        licenses: result.rows,
        total,
        limit,
        offset,
      });
    }

    if (normalizedPath === '/licenses' && method === 'POST') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const {
        key,
        tier = 'Standard',
        app_id,
        device_limit = 1,
        validity_type = 'lifetime',
        validity_value = 0,
        customer_name,
        customer_email,
        notes,
        metadata_json,
        pin,
      } = body;

      const finalKey = key ? key.trim().toUpperCase() : generateLicenseKey(body.prefix || 'VCON');
      const finalPin = pin && pin.toString().length === 4 ? pin.toString() : generate4DigitPin();
      const now = Date.now();
      const id = 'lic_' + crypto.randomBytes(8).toString('hex');

      await db.execute({
        sql: `INSERT INTO licenses (id, key, status, tier, app_id, device_limit, validity_type, validity_value, created_at, customer_name, customer_email, notes, metadata_json, pin)
              VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          finalKey,
          tier,
          app_id || null,
          Number(device_limit),
          validity_type,
          Number(validity_value),
          now,
          customer_name || null,
          customer_email || null,
          notes || null,
          metadata_json ? JSON.stringify(metadata_json) : null,
          finalPin,
        ],
      });

      const createdLicense = {
        id,
        key: finalKey,
        pin: finalPin,
        status: 'active',
        tier,
        app_id: app_id || null,
        device_limit: Number(device_limit),
        validity_type,
        validity_value: Number(validity_value),
        created_at: now,
        customer_name: customer_name || null,
        customer_email: customer_email || null,
        bound_devices_count: 0,
      };

      return jsonResponse({
        success: true,
        license: createdLicense,
        ...createdLicense,
      });
    }

    if (normalizedPath === '/licenses/bulk' && method === 'POST') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const {
        count = 10,
        prefix = 'VCON',
        tier = 'Standard',
        app_id,
        device_limit = 1,
        validity_type = 'lifetime',
        validity_value = 0,
        notes,
        pin,
        backupToR2 = false,
      } = body;

      const numCount = Math.min(Math.max(1, Number(count)), 2000);
      const batchPin = pin && pin.toString().length === 4 ? pin.toString() : generate4DigitPin();
      const now = Date.now();
      const createdLicenses: any[] = [];
      const generatedKeys: string[] = [];
      const statements: any[] = [];

      let csvContent = 'key,pin,tier,app_id,device_limit,validity_type,validity_value,created_at,notes\n';

      for (let i = 0; i < numCount; i++) {
        const id = 'lic_' + crypto.randomBytes(8).toString('hex');
        const key = generateLicenseKey(prefix);
        generatedKeys.push(key);

        statements.push({
          sql: `INSERT INTO licenses (id, key, status, tier, app_id, device_limit, validity_type, validity_value, created_at, notes, pin)
                VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            key,
            tier,
            app_id ? app_id.trim() : null,
            Number(device_limit),
            validity_type,
            Number(validity_value),
            now,
            notes || null,
            batchPin,
          ],
        });

        csvContent += `"${key}","${batchPin}","${tier}","${app_id || 'GLOBAL'}",${Number(device_limit)},"${validity_type}",${Number(validity_value)},"${new Date(now).toISOString()}","${notes || ''}"\n`;

        createdLicenses.push({
          id,
          key,
          pin: batchPin,
          tier,
          app_id: app_id || null,
          device_limit: Number(device_limit),
          validity_type,
          validity_value: Number(validity_value),
          created_at: now,
        });
      }

      // Execute in chunked batches (200 statements per chunk) for safe, high-speed execution
      for (let i = 0; i < statements.length; i += 200) {
        await db.batch(statements.slice(i, i + 200));
      }

      let r2UploadResult: any = null;
      if (backupToR2) {
        const configRes = await db.execute('SELECT r2_config_json FROM admin_config LIMIT 1');
        if (configRes.rows.length > 0 && configRes.rows[0].r2_config_json) {
          try {
            const r2Config: R2Config = JSON.parse(configRes.rows[0].r2_config_json as string);
            if (r2Config.accountId && r2Config.accessKeyId && r2Config.secretAccessKey && r2Config.bucketName) {
              const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
              const filename = `bulk_licenses_${prefix}_${timestampStr}.csv`;
              const uploadRes = await uploadToR2(r2Config, `licenses/${filename}`, csvContent, 'text/csv');
              if (uploadRes.success) {
                r2UploadResult = uploadRes;
                const backupId = 'r2_' + crypto.randomBytes(6).toString('hex');
                await db.execute({
                  sql: `INSERT INTO r2_backups (id, filename, record_count, file_size, r2_url, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)`,
                  args: [backupId, filename, numCount, csvContent.length, uploadRes.url || null, now],
                });
              }
            }
          } catch {
            // ignore
          }
        }
      }

      return jsonResponse({
        success: true,
        count: numCount,
        pin: batchPin,
        keys: generatedKeys,
        csv: csvContent,
        licenses: createdLicenses,
        r2Backup: r2UploadResult,
      });
    }

    if (normalizedPath === '/licenses/bulk-action' && method === 'POST') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const action = body.action;
      const ids = body.ids || body.license_ids;
      if (!action || !Array.isArray(ids) || ids.length === 0) {
        return errorResponse('Invalid bulk action payload');
      }

      const placeholders = ids.map(() => '?').join(',');

      if (action === 'delete') {
        await db.execute({ sql: `DELETE FROM devices WHERE license_id IN (${placeholders})`, args: ids });
        await db.execute({ sql: `DELETE FROM licenses WHERE id IN (${placeholders})`, args: ids });
      } else if (action === 'reset') {
        await db.execute({ sql: `DELETE FROM devices WHERE license_id IN (${placeholders})`, args: ids });
      } else if (['activate', 'suspend', 'revoke'].includes(action)) {
        const statusMap: Record<string, string> = {
          activate: 'active',
          suspend: 'suspended',
          revoke: 'revoked',
        };
        const newStatus = statusMap[action];
        await db.execute({
          sql: `UPDATE licenses SET status = ? WHERE id IN (${placeholders})`,
          args: [newStatus, ...ids],
        });
      } else if (action === 'extend' && body.extendDays) {
        const extraMs = Number(body.extendDays) * 86400 * 1000;
        await db.execute({
          sql: `UPDATE licenses 
                SET expires_at = CASE 
                  WHEN expires_at IS NULL THEN ${Date.now() + extraMs} 
                  ELSE expires_at + ${extraMs} 
                END 
                WHERE id IN (${placeholders})`,
          args: ids,
        });
      }

      return jsonResponse({ success: true, affected: ids.length, modified: ids.length });
    }

    if (
      normalizedPath.startsWith('/licenses/') &&
      !normalizedPath.includes('/devices') &&
      normalizedPath !== '/licenses/bulk-action' &&
      normalizedPath !== '/licenses/bulk'
    ) {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const licenseId = normalizedPath.replace('/licenses/', '');

      if (method === 'PATCH') {
        const { status, tier, app_id, device_limit, expires_at, notes, customer_name, customer_email } = body;
        const fields: string[] = [];
        const args: any[] = [];

        if (status !== undefined) {
          fields.push('status = ?');
          args.push(status);
        }
        if (tier !== undefined) {
          fields.push('tier = ?');
          args.push(tier);
        }
        if (app_id !== undefined) {
          fields.push('app_id = ?');
          args.push(app_id ? app_id.trim() : null);
        }
        if (device_limit !== undefined) {
          fields.push('device_limit = ?');
          args.push(Number(device_limit));
        }
        if (expires_at !== undefined) {
          fields.push('expires_at = ?');
          args.push(expires_at ? Number(expires_at) : null);
        }
        if (notes !== undefined) {
          fields.push('notes = ?');
          args.push(notes);
        }
        if (customer_name !== undefined) {
          fields.push('customer_name = ?');
          args.push(customer_name);
        }
        if (customer_email !== undefined) {
          fields.push('customer_email = ?');
          args.push(customer_email);
        }
        if (body.pin !== undefined) {
          fields.push('pin = ?');
          args.push(body.pin ? String(body.pin).trim() : null);
        }

        if (fields.length === 0) {
          return errorResponse('No fields to update', 400);
        }

        args.push(licenseId);
        await db.execute({
          sql: `UPDATE licenses SET ${fields.join(', ')} WHERE id = ?`,
          args,
        });

        return jsonResponse({ success: true });
      }

      if (method === 'DELETE') {
        await db.execute({ sql: 'DELETE FROM devices WHERE license_id = ?', args: [licenseId] });
        await db.execute({ sql: 'DELETE FROM licenses WHERE id = ?', args: [licenseId] });
        return jsonResponse({ success: true, message: 'License deleted' });
      }
    }

    if (normalizedPath.includes('/devices') && normalizedPath.startsWith('/licenses/')) {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const licId = normalizedPath.split('/')[2];

      if (method === 'GET') {
        const devices = await db.execute({
          sql: 'SELECT * FROM devices WHERE license_id = ? ORDER BY first_bound_at DESC',
          args: [licId],
        });
        return jsonResponse({ devices: devices.rows });
      }

      if (method === 'DELETE') {
        await db.execute({
          sql: `UPDATE devices SET status = 'logged_out' WHERE license_id = ?`,
          args: [licId],
        });
        await db.execute({
          sql: 'DELETE FROM devices WHERE license_id = ?',
          args: [licId],
        });
        return jsonResponse({ success: true, message: 'All devices disconnected and reset' });
      }
    }

    // -----------------------------------------------------------------
    // DEVICES TAB
    // -----------------------------------------------------------------
    if (normalizedPath === '/devices' && method === 'GET') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const search = url.searchParams.get('search');
      const limit = Number(url.searchParams.get('limit') || '50');
      const offset = Number(url.searchParams.get('offset') || '0');

      let query = `
        SELECT d.*, l.key as license_key, l.tier as license_tier, l.status as license_status, l.customer_name,
               a.display_name as app_name, a.app_slug as app_slug
        FROM devices d
        JOIN licenses l ON d.license_id = l.id
        LEFT JOIN apps a ON l.app_id = a.id
        WHERE 1=1
      `;
      const args: any[] = [];
      if (search && search.trim()) {
        query += ` AND (d.hwid LIKE ? OR d.device_name LIKE ? OR d.ip_address LIKE ? OR l.key LIKE ?)`;
        const term = `%${search.trim()}%`;
        args.push(term, term, term, term);
      }
      query += ` ORDER BY d.last_ping_at DESC LIMIT ? OFFSET ?`;
      args.push(limit, offset);

      let countSql = `
        SELECT COUNT(*) as total
        FROM devices d
        JOIN licenses l ON d.license_id = l.id
        WHERE 1=1
      `;
      const countArgs: any[] = [];
      if (search && search.trim()) {
        countSql += ` AND (d.hwid LIKE ? OR d.device_name LIKE ? OR d.ip_address LIKE ? OR l.key LIKE ?)`;
        const term = `%${search.trim()}%`;
        countArgs.push(term, term, term, term);
      }

      const [result, countRes] = await Promise.all([
        db.execute({ sql: query, args }),
        db.execute({ sql: countSql, args: countArgs }),
      ]);

      return jsonResponse({
        devices: result.rows,
        total: Number(countRes.rows[0].total || 0),
      });
    }

    if (normalizedPath.startsWith('/devices/') && method === 'DELETE') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const devId = normalizedPath.replace('/devices/', '');
      await db.execute({ sql: 'DELETE FROM devices WHERE id = ?', args: [devId] });
      return jsonResponse({ success: true, message: 'Device unbind completed' });
    }

    // -----------------------------------------------------------------
    // USER SELF-SERVICE PUBLIC PORTAL ENDPOINTS
    // -----------------------------------------------------------------
    // 1. Quick Check (ONLY 3 INFO: status, device_limit, active_device_count)
    if ((normalizedPath === '/v1/user/license/check' || normalizedPath === '/user/license/check') && method === 'POST') {
      const { license_key } = body;
      if (!license_key || !license_key.trim()) return errorResponse('License key is required');

      const result = await db.execute({
        sql: `SELECT id, status, device_limit,
              (SELECT COUNT(*) FROM devices d WHERE d.license_id = l.id AND d.status = 'active') as active_devices
              FROM licenses l WHERE l.key = ? LIMIT 1`,
        args: [license_key.trim().toUpperCase()],
      });

      if (result.rows.length === 0) {
        return errorResponse('License key not found or invalid.', 404);
      }

      const lic = result.rows[0];
      return jsonResponse({
        status: lic.status as string,
        device_limit: Number(lic.device_limit),
        active_device_count: Number(lic.active_devices || 0),
      });
    }

    // 2. Control Open (Requires License Key & 4-Digit PIN)
    if ((normalizedPath === '/v1/user/control/open' || normalizedPath === '/user/control/open') && method === 'POST') {
      const { license_key, pin } = body;
      if (!license_key || !license_key.trim()) return errorResponse('License key required');
      if (!pin || pin.toString().length !== 4) return errorResponse('4-digit PIN required');

      const result = await db.execute({
        sql: `SELECT l.*, a.display_name as app_name,
              (SELECT COUNT(*) FROM devices d WHERE d.license_id = l.id AND d.status = 'active') as active_devices
              FROM licenses l
              LEFT JOIN apps a ON l.app_id = a.id
              WHERE l.key = ? LIMIT 1`,
        args: [license_key.trim().toUpperCase()],
      });

      if (result.rows.length === 0) return errorResponse('License not found', 404);

      const lic = result.rows[0];
      if (!lic.pin || String(lic.pin).trim() !== String(pin).trim()) {
        return errorResponse('Invalid Security PIN. Access denied.', 401);
      }

      const now = Date.now();
      let currentStatus = lic.status as string;
      if (lic.expires_at && now > Number(lic.expires_at) && currentStatus === 'active') {
        currentStatus = 'expired';
        await db.execute({
          sql: "UPDATE licenses SET status = 'expired' WHERE id = ?",
          args: [lic.id as string],
        });
      }

      const devicesResult = await db.execute({
        sql: `SELECT id, hwid, device_name, os_info, ip_address, first_bound_at, last_ping_at, status
              FROM devices WHERE license_id = ? AND status = 'active'
              ORDER BY last_ping_at DESC, first_bound_at DESC`,
        args: [lic.id as string],
      });

      return jsonResponse({
        license: {
          id: lic.id,
          key: lic.key,
          status: currentStatus,
          tier: lic.tier,
          app_name: lic.app_name || null,
          app_slug: lic.app_slug || (lic.app_id ? 'app' : 'global'),
          device_limit: Number(lic.device_limit),
          validity_type: lic.validity_type,
          validity_value: Number(lic.validity_value),
          created_at: Number(lic.created_at),
          activated_at: lic.activated_at ? Number(lic.activated_at) : null,
          expires_at: lic.expires_at ? Number(lic.expires_at) : null,
          customer_name: lic.customer_name || null,
          customer_email: lic.customer_email || null,
          bound_devices_count: devicesResult.rows.length,
        },
        devices: devicesResult.rows,
      });
    }

    // 3. User Self-Service Device Reset (Requires License Key & 4-Digit PIN)
    if ((normalizedPath === '/v1/user/control/reset' || normalizedPath === '/user/control/reset') && method === 'POST') {
      const { license_key, pin } = body;
      if (!license_key || !license_key.trim()) return errorResponse('License key required');
      if (!pin || pin.toString().length !== 4) return errorResponse('4-digit PIN required');

      const result = await db.execute({
        sql: 'SELECT id, pin FROM licenses WHERE key = ? LIMIT 1',
        args: [license_key.trim().toUpperCase()],
      });

      if (result.rows.length === 0) return errorResponse('License not found', 404);

      const lic = result.rows[0];
      if (!lic.pin || String(lic.pin).trim() !== String(pin).trim()) {
        return errorResponse('Invalid Security PIN. Reset unauthorized.', 401);
      }

      // Reset all bound machines
      await db.execute({
        sql: "UPDATE devices SET status = 'logged_out', last_ping_at = ? WHERE license_id = ?",
        args: [Date.now(), lic.id as string],
      });
      await db.execute({
        sql: 'DELETE FROM devices WHERE license_id = ?',
        args: [lic.id as string],
      });

      return jsonResponse({
        success: true,
        message: 'All bound devices successfully reset. You may now activate this license on a fresh device.',
      });
    }

    // -----------------------------------------------------------------
    // CRYPTOGRAPHIC VALIDATION & CLIENT SDK APIS
    // -----------------------------------------------------------------
    if (normalizedPath === '/v1/public-key' && method === 'GET') {
      const configRes = await db.execute('SELECT ed25519_public_key FROM admin_config LIMIT 1');
      if (configRes.rows.length === 0) return errorResponse('Server not initialized', 503);

      const pubKey = configRes.rows[0].ed25519_public_key as string;
      const isRsa = pubKey.includes('RSA') || pubKey.length > 300;

      return jsonResponse({
        algorithm: isRsa ? 'RSA-2048' : 'Ed25519',
        format: 'spki-pem',
        publicKeyPem: pubKey,
        serverTime: Date.now(),
      });
    }

    if (normalizedPath === '/v1/license/validate' && method === 'POST') {
      const { license_key, hwid, app_name, device_name = 'Unknown', os_info = 'Generic-OS', client_version, nonce, pin } = body;
      if (!license_key || !hwid) return errorResponse('Missing license_key or hwid');

      const cleanKey = license_key.trim().toUpperCase();
      const cleanHwid = hwid.trim();
      const now = Date.now();

      // 1. Fetch server keys for signing
      const configRes = await db.execute('SELECT ed25519_private_key, ed25519_public_key FROM admin_config LIMIT 1');
      if (configRes.rows.length === 0) return errorResponse('Server not initialized', 503);
      const privKey = configRes.rows[0].ed25519_private_key as string;
      const pubKey = configRes.rows[0].ed25519_public_key as string;

      // 2. Multi-App Scope Check if app_name is provided
      let matchedApp: any = null;
      if (app_name && typeof app_name === 'string' && app_name.trim()) {
        const sanitizedSlug = app_name.trim().toLowerCase();
        const appResult = await db.execute({
          sql: 'SELECT * FROM apps WHERE app_slug = ? OR id = ? LIMIT 1',
          args: [sanitizedSlug, app_name.trim()],
        });

        if (appResult.rows.length === 0) {
          await db.execute({
            sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
                  VALUES (?, ?, ?, ?, ?, 'reject', 403, 'Application not registered on server', ?)`,
            args: ['log_' + crypto.randomBytes(6).toString('hex'), cleanKey, sanitizedSlug, cleanHwid, ip, now],
          });
          return jsonResponse({ valid: false, code: 'APP_NOT_FOUND', message: `Application "${app_name}" is not registered on license server` }, 403);
        }

        matchedApp = appResult.rows[0];

        if (matchedApp.status !== 'active') {
          await db.execute({
            sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
                  VALUES (?, ?, ?, ?, ?, 'reject', 403, 'Application is inactive', ?)`,
            args: ['log_' + crypto.randomBytes(6).toString('hex'), cleanKey, matchedApp.app_slug, cleanHwid, ip, now],
          });
          return jsonResponse({ valid: false, code: 'APP_INACTIVE', message: `Application "${matchedApp.display_name}" is currently disabled` }, 403);
        }

        const appVersion = body.app_version || client_version;
        if (matchedApp.min_version && appVersion) {
          const isOutdated = (current: string, minRequired: string) => {
            const cParts = current.split('.').map((p) => parseInt(p) || 0);
            const mParts = minRequired.split('.').map((p) => parseInt(p) || 0);
            for (let i = 0; i < Math.max(cParts.length, mParts.length); i++) {
              const c = cParts[i] || 0;
              const m = mParts[i] || 0;
              if (c < m) return true;
              if (c > m) return false;
            }
            return false;
          };

          if (isOutdated(appVersion, matchedApp.min_version)) {
            await db.execute({
              sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
                    VALUES (?, ?, ?, ?, ?, 'reject', 426, 'Application version outdated (${appVersion} < ${matchedApp.min_version})', ?)`,
              args: ['log_' + crypto.randomBytes(6).toString('hex'), cleanKey, matchedApp.app_slug, cleanHwid, ip, now],
            });
            return jsonResponse({
              valid: false,
              code: 'APP_VERSION_OUTDATED',
              message: `Update required. Client version: ${appVersion}, Minimum required: ${matchedApp.min_version}`,
              current_version: appVersion,
              min_version: matchedApp.min_version,
            }, 426);
          }
        }
      }

      // 3. Fetch license record
      const licRes = await db.execute({
        sql: `SELECT l.*, a.status as app_status, a.app_slug, a.display_name
              FROM licenses l
              LEFT JOIN apps a ON l.app_id = a.id
              WHERE l.key = ? LIMIT 1`,
        args: [cleanKey],
      });

      if (licRes.rows.length === 0) {
        await db.execute({
          sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
                VALUES (?, ?, ?, ?, ?, 'validate', 404, 'License key not found', ?)`,
          args: ['log_' + crypto.randomBytes(6).toString('hex'), cleanKey, matchedApp?.app_slug || null, cleanHwid, ip, now],
        });
        return jsonResponse({ valid: false, code: 'KEY_NOT_FOUND', message: 'License key not found' }, 404);
      }

      const lic = licRes.rows[0];

      // 4. App Isolation / Scope check
      if (lic.app_id) {
        if (!matchedApp || matchedApp.id !== lic.app_id) {
          await db.execute({
            sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
                  VALUES (?, ?, ?, ?, ?, 'reject', 403, 'License key is not authorized for this app', ?)`,
            args: ['log_' + crypto.randomBytes(6).toString('hex'), cleanKey, matchedApp?.app_slug || null, cleanHwid, ip, now],
          });
          return jsonResponse({
            valid: false,
            code: 'LICENSE_APP_MISMATCH',
            message: 'This license key is restricted to a different application',
          }, 403);
        }
      }

      // 5. Status checks
      if (lic.status === 'revoked') {
        await db.execute({
          sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
                VALUES (?, ?, ?, ?, ?, 'reject', 403, 'License revoked by administrator', ?)`,
          args: ['log_' + crypto.randomBytes(6).toString('hex'), cleanKey, matchedApp?.app_slug || null, cleanHwid, ip, now],
        });
        return jsonResponse({ valid: false, code: 'LICENSE_REVOKED', message: 'License revoked by administrator' }, 403);
      }
      if (lic.status === 'suspended') {
        await db.execute({
          sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
                VALUES (?, ?, ?, ?, ?, 'reject', 403, 'License temporarily suspended', ?)`,
          args: ['log_' + crypto.randomBytes(6).toString('hex'), cleanKey, matchedApp?.app_slug || null, cleanHwid, ip, now],
        });
        return jsonResponse({ valid: false, code: 'LICENSE_SUSPENDED', message: 'License temporarily suspended' }, 403);
      }
      if (lic.status !== 'active') {
        return jsonResponse({
          valid: false,
          code: `LICENSE_${(lic.status as string).toUpperCase()}`,
          message: `License is currently ${lic.status}`,
        }, 403);
      }

      // Optional PIN security check
      if (lic.pin && pin && pin.toString().trim() !== (lic.pin as string).trim()) {
        await db.execute({
          sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
                VALUES (?, ?, ?, ?, ?, 'reject', 403, 'Invalid 4-digit PIN', ?)`,
          args: ['log_' + crypto.randomBytes(6).toString('hex'), cleanKey, matchedApp?.app_slug || null, cleanHwid, ip, now],
        });
        return jsonResponse({ valid: false, code: 'INVALID_PIN', message: 'Invalid 4-digit PIN for this license' }, 403);
      }

      // 6. Activate license if first activation & verify expiration
      let activatedAt = lic.activated_at ? Number(lic.activated_at) : null;
      let expiresAt = lic.expires_at ? Number(lic.expires_at) : null;
      if (!activatedAt) {
        activatedAt = now;
        const validityType = lic.validity_type as string;
        const validityValue = Number(lic.validity_value);

        if (validityType === 'hourly' && validityValue > 0) {
          expiresAt = now + validityValue * 3600 * 1000;
        } else if (validityType === 'daily' && validityValue > 0) {
          expiresAt = now + validityValue * 86400 * 1000;
        }

        await db.execute({
          sql: 'UPDATE licenses SET activated_at = ?, expires_at = ? WHERE id = ?',
          args: [activatedAt, expiresAt, lic.id as string],
        });
      }

      // Check expiry BEFORE device binding
      if (expiresAt && now > expiresAt) {
        await db.execute({ sql: "UPDATE licenses SET status = 'expired' WHERE id = ?", args: [lic.id as string] });
        await db.execute({
          sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
                VALUES (?, ?, ?, ?, ?, 'reject', 403, 'License expired', ?)`,
          args: ['log_' + crypto.randomBytes(6).toString('hex'), cleanKey, matchedApp?.app_slug || null, cleanHwid, ip, now],
        });
        return jsonResponse({ valid: false, code: 'LICENSE_EXPIRED', message: 'License has expired' }, 403);
      }

      // 7. Check device binding and active counts
      const devRes = await db.execute({
        sql: 'SELECT * FROM devices WHERE license_id = ? AND hwid = ? LIMIT 1',
        args: [lic.id as string, cleanHwid],
      });

      const countRes = await db.execute({
        sql: "SELECT id FROM devices WHERE license_id = ? AND status = 'active'",
        args: [lic.id as string],
      });
      const activeDevices = countRes.rows;
      const deviceLimit = Number(lic.device_limit);

      const existingDevice = devRes.rows.length > 0 ? devRes.rows[0] : null;

      if (existingDevice) {
        if (existingDevice.status === 'blocked') {
          return jsonResponse({ valid: false, code: 'DEVICE_BLOCKED', message: 'This machine is blocked' }, 403);
        }
        if (existingDevice.status === 'logged_out') {
          if (deviceLimit !== -1 && activeDevices.length >= deviceLimit) {
            await db.execute({
              sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
                    VALUES (?, ?, ?, ?, ?, 'reject', 403, 'Device limit reached (${activeDevices.length}/${deviceLimit})', ?)`,
              args: ['log_' + crypto.randomBytes(6).toString('hex'), cleanKey, matchedApp?.app_slug || null, cleanHwid, ip, now],
            });
            return jsonResponse({
              valid: false,
              code: 'DEVICE_LIMIT_REACHED',
              message: `Device limit reached (${activeDevices.length}/${deviceLimit}). License is currently active on another device.`,
              activeDevicesCount: activeDevices.length,
              deviceLimit,
            }, 403);
          }
        }
        await db.execute({
          sql: "UPDATE devices SET status = 'active', last_ping_at = ?, device_name = ?, os_info = ?, ip_address = ? WHERE id = ?",
          args: [now, device_name, os_info, ip, existingDevice.id as string],
        });
      } else {
        if (deviceLimit !== -1 && activeDevices.length >= deviceLimit) {
          await db.execute({
            sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
                  VALUES (?, ?, ?, ?, ?, 'reject', 403, 'Device limit exceeded (${activeDevices.length}/${deviceLimit})', ?)`,
            args: ['log_' + crypto.randomBytes(6).toString('hex'), cleanKey, matchedApp?.app_slug || null, cleanHwid, ip, now],
          });
          return jsonResponse({
            valid: false,
            code: 'DEVICE_LIMIT_REACHED',
            message: `Device limit reached. Max allowed devices: ${deviceLimit}`,
            activeDevicesCount: activeDevices.length,
            deviceLimit,
          }, 403);
        }

        const devId = 'dev_' + crypto.randomBytes(6).toString('hex');
        await db.execute({
          sql: `INSERT INTO devices (id, license_id, hwid, device_name, os_info, ip_address, first_bound_at, last_ping_at, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
          args: [devId, lic.id as string, cleanHwid, device_name, os_info, ip, now, now],
        });
      }

      // 9. Sign payload with server private key
      const boundCount = existingDevice && existingDevice.status === 'active' ? activeDevices.length : activeDevices.length + 1;

      const signedData: Record<string, unknown> = {
        valid: true,
        license_key: cleanKey,
        status: 'active',
        tier: lic.tier || 'Standard',
        app_slug: matchedApp ? matchedApp.app_slug : (lic.app_slug || 'global'),
        app_name: matchedApp ? matchedApp.display_name : (lic.display_name || app_name || 'Global'),
        app_id: lic.app_id || null,
        hwid: cleanHwid,
        device_name: device_name,
        device_limit: deviceLimit,
        bound_devices_count: boundCount,
        activated_at: activatedAt,
        expires_at: expiresAt,
        server_time: now,
        grace_period_hours: 72,
      };

      const canonicalPayload = canonicalJson(signedData);
      const signature = signPayload(canonicalPayload, privKey);

      // Audit log
      await db.execute({
        sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
              VALUES (?, ?, ?, ?, ?, 'validate', 200, 'Validated and signed successfully', ?)`,
        args: ['log_' + crypto.randomBytes(6).toString('hex'), cleanKey, matchedApp?.app_slug || null, cleanHwid, ip, now],
      });

      return jsonResponse({
        ...signedData,
        signature,
        public_key: pubKey,
      });
    }

    if (normalizedPath === '/v1/license/ping' && method === 'POST') {
      const { license_key, hwid, nonce } = body;
      if (!license_key || !hwid) return errorResponse('Missing license_key or hwid');

      const cleanKey = license_key.trim().toUpperCase();
      const cleanHwid = hwid.trim();
      const now = Date.now();

      const licRes = await db.execute({
        sql: 'SELECT id, status, expires_at FROM licenses WHERE key = ? LIMIT 1',
        args: [cleanKey],
      });

      if (licRes.rows.length === 0) return errorResponse('License not found', 404);

      const lic = licRes.rows[0];
      if (lic.status !== 'active') return jsonResponse({ valid: false, code: 'LICENSE_INACTIVE', status: lic.status }, 403);

      if (lic.expires_at && now > Number(lic.expires_at)) {
        return jsonResponse({ valid: false, code: 'LICENSE_EXPIRED', status: 'expired' }, 403);
      }

      const devCheck = await db.execute({
        sql: 'SELECT id, status FROM devices WHERE license_id = ? AND hwid = ? LIMIT 1',
        args: [lic.id as string, cleanHwid],
      });

      if (devCheck.rows.length === 0 || devCheck.rows[0].status !== 'active') {
        return jsonResponse({
          valid: false,
          code: 'DEVICE_UNBOUND',
          message: 'Device binding was logged out or unlinked by administrator',
        }, 403);
      }

      await db.execute({
        sql: 'UPDATE devices SET last_ping_at = ? WHERE license_id = ? AND hwid = ?',
        args: [now, lic.id as string, cleanHwid],
      });

      return jsonResponse({
        valid: true,
        status: 'active',
        server_time: now,
      });
    }

    if ((normalizedPath === '/v1/license/logout' || normalizedPath === '/v1/license/deactivate') && method === 'POST') {
      const { license_key, hwid, app_name } = body;
      if (!license_key || !hwid) return errorResponse('Missing license_key or hwid');

      const cleanKey = license_key.trim().toUpperCase();
      const cleanHwid = hwid.trim();
      const now = Date.now();

      const licRes = await db.execute({
        sql: 'SELECT id FROM licenses WHERE key = ? LIMIT 1',
        args: [cleanKey],
      });

      if (licRes.rows.length === 0) return errorResponse('License not found', 404);

      const licId = licRes.rows[0].id as string;
      await db.execute({
        sql: "UPDATE devices SET status = 'logged_out', last_ping_at = ? WHERE license_id = ? AND hwid = ?",
        args: [now, licId, cleanHwid],
      });

      // Log logout audit entry
      await db.execute({
        sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
              VALUES (?, ?, ?, ?, ?, 'logout', 200, 'Device unbind / logout completed', ?)`,
        args: ['log_' + crypto.randomBytes(6).toString('hex'), cleanKey, app_name || null, cleanHwid, ip, now],
      });

      return jsonResponse({
        success: true,
        message: 'Device logged out and HWID slot released successfully',
      });
    }

    // -----------------------------------------------------------------
    // STATS & AUDIT LOGS
    // -----------------------------------------------------------------
    if (normalizedPath === '/stats' && method === 'GET') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const oneDayAgo = Date.now() - 86400 * 1000;
      const statsRes = await db.execute({
        sql: `SELECT
          (SELECT COUNT(*) FROM apps) as total_apps,
          (SELECT COUNT(*) FROM licenses) as total_licenses,
          (SELECT COUNT(*) FROM licenses WHERE status = 'active') as active_licenses,
          (SELECT COUNT(*) FROM licenses WHERE status = 'expired') as expired_licenses,
          (SELECT COUNT(*) FROM licenses WHERE status = 'revoked') as revoked_licenses,
          (SELECT COUNT(*) FROM licenses WHERE status = 'suspended') as suspended_licenses,
          (SELECT COUNT(*) FROM devices WHERE status = 'active') as active_devices,
          (SELECT COUNT(*) FROM validation_logs WHERE created_at >= ?) as validations_24h`,
        args: [oneDayAgo],
      });

      const sRow = (statsRes.rows[0] as any) || {};

      return jsonResponse({
        totalApps: Number(sRow.total_apps || 0),
        totalLicenses: Number(sRow.total_licenses || 0),
        activeLicenses: Number(sRow.active_licenses || 0),
        expiredLicenses: Number(sRow.expired_licenses || 0),
        revokedLicenses: Number(sRow.revoked_licenses || 0),
        suspendedLicenses: Number(sRow.suspended_licenses || 0),
        activeDevices: Number(sRow.active_devices || 0),
        validations24h: Number(sRow.validations_24h || 0),
        uptime: 99.99,
        serverTime: Date.now(),
      });
    }

    if (normalizedPath === '/logs' && method === 'GET') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const limit = Number(url.searchParams.get('limit') || '100');
      const offset = Number(url.searchParams.get('offset') || '0');
      const action = url.searchParams.get('action');

      let query = 'SELECT * FROM validation_logs WHERE 1=1';
      const args: any[] = [];
      if (action && action !== 'all') {
        query += ' AND action = ?';
        args.push(action);
      }
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      args.push(limit, offset);

      const result = await db.execute({ sql: query, args });
      return jsonResponse({ logs: result.rows });
    }

    if (normalizedPath === '/logs' && method === 'DELETE') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      await db.execute('DELETE FROM validation_logs');
      return jsonResponse({ success: true, message: 'All logs cleared' });
    }

    // -----------------------------------------------------------------
    // SETTINGS & R2
    // -----------------------------------------------------------------
    if (normalizedPath === '/settings' && method === 'GET') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const configRes = await db.execute('SELECT username, ed25519_public_key, r2_config_json FROM admin_config LIMIT 1');
      if (configRes.rows.length === 0) {
        return errorResponse('Config not found', 404);
      }

      const row = configRes.rows[0];
      let r2Config: any = {};
      if (row.r2_config_json) {
        try {
          const parsed = JSON.parse(row.r2_config_json as string);
          r2Config = {
            accountId: parsed.accountId || '',
            accessKeyId: parsed.accessKeyId || '',
            bucketName: parsed.bucketName || '',
            publicUrl: parsed.publicUrl || '',
            secretAccessKey: parsed.secretAccessKey ? '••••••••••••••••' : '',
          };
        } catch {}
      }

      const rawUrl = env?.TURSO_DATABASE_URL || env?.DATABASE_URL || (typeof process !== 'undefined' ? process.env?.TURSO_DATABASE_URL : '') || '';
      const rawToken = env?.TURSO_AUTH_TOKEN || (typeof process !== 'undefined' ? process.env?.TURSO_AUTH_TOKEN : '') || '';
      const hasTurso = !isTursoPlaceholder(rawUrl, rawToken);
      const tursoDbUrl = hasTurso ? rawUrl : 'file:vcon_data.db';

      return jsonResponse({
        username: row.username,
        publicKeyPem: row.ed25519_public_key || null,
        r2Config,
        hasTursoEnv: hasTurso,
        tursoUrl: tursoDbUrl,
      });
    }

    if (normalizedPath === '/settings/r2' && method === 'POST') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const r2Json = JSON.stringify(body);
      await db.execute({
        sql: 'UPDATE admin_config SET r2_config_json = ?, updated_at = ?',
        args: [r2Json, Date.now()],
      });

      return jsonResponse({ success: true, message: 'R2 configuration updated' });
    }

    if (normalizedPath === '/settings/r2/test' && method === 'POST') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const testRes = await testR2Connection(body as R2Config);
      return jsonResponse(testRes);
    }

    if (normalizedPath === '/r2/backups' && method === 'GET') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const result = await db.execute('SELECT * FROM r2_backups ORDER BY created_at DESC LIMIT 50');
      return jsonResponse({ backups: result.rows });
    }

    if (normalizedPath === '/settings/crypto/rotate' && method === 'POST') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const newKeypair = generateRSAKeyPair(2048);
      await db.execute({
        sql: 'UPDATE admin_config SET ed25519_private_key = ?, ed25519_public_key = ?, updated_at = ?',
        args: [newKeypair.privateKeyPem, newKeypair.publicKeyPem, Date.now()],
      });

      return jsonResponse({
        success: true,
        message: 'Enterprise RSA 2048-bit keys rotated successfully',
        publicKeyPem: newKeypair.publicKeyPem,
      });
    }

    // -----------------------------------------------------------------
    // SITE SETTINGS & BRANDING CONTROL
    // -----------------------------------------------------------------
    const defaultSiteSettings = {
      siteName: 'LicenX',
      siteTagline: 'Enterprise Software Licensing & Hardware Authorization Engine',
      siteTitle: 'LicenX – Software Licensing & Device Verification Engine',
      metaDescription: 'High-security RSA-2048 licensed distribution platform with hardware device fingerprinting and self-service device control.',
      logoUrl: '',
      faviconUrl: '',
      ogImageUrl: '',
      footerText: '© 2026 LicenX Open-Source Licensing Engine. All rights reserved.',
      supportEmail: 'support@vcon.local',
      telegramUrl: '',
      discordUrl: '',
      docsUrl: '',
      buyLicenseUrl: '#',
      allowPublicCheck: true,
      allowPublicReset: true,
      noticeBanner: '',
      noticeBannerEnabled: false,
    };

    if ((normalizedPath === '/public/site-settings' || normalizedPath === '/v1/public/site-settings') && method === 'GET') {
      const configRes = await db.execute('SELECT site_settings_json FROM admin_config LIMIT 1');
      let siteSettings = { ...defaultSiteSettings };

      if (configRes.rows.length > 0 && configRes.rows[0].site_settings_json) {
        try {
          const parsed = JSON.parse(configRes.rows[0].site_settings_json as string);
          siteSettings = { ...siteSettings, ...parsed };
        } catch {}
      }

      return jsonResponse(siteSettings, 200, {
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
      });
    }

    if (normalizedPath === '/settings/site' && method === 'GET') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const configRes = await db.execute('SELECT site_settings_json, r2_config_json FROM admin_config LIMIT 1');
      let siteSettings = { ...defaultSiteSettings };
      let r2Configured = false;

      if (configRes.rows.length > 0) {
        const row = configRes.rows[0];
        if (row.site_settings_json) {
          try {
            const parsed = JSON.parse(row.site_settings_json as string);
            siteSettings = { ...siteSettings, ...parsed };
          } catch {}
        }
        if (row.r2_config_json) {
          try {
            const r2 = JSON.parse(row.r2_config_json as string);
            r2Configured = Boolean(r2.accountId && r2.accessKeyId && r2.secretAccessKey && r2.bucketName);
          } catch {}
        }
      }

      return jsonResponse({ siteSettings, r2Configured });
    }

    if (normalizedPath === '/settings/site' && method === 'POST') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const configRes = await db.execute('SELECT site_settings_json FROM admin_config LIMIT 1');
      let existingSettings = { ...defaultSiteSettings };

      if (configRes.rows.length > 0 && configRes.rows[0].site_settings_json) {
        try {
          existingSettings = { ...existingSettings, ...JSON.parse(configRes.rows[0].site_settings_json as string) };
        } catch {}
      }

      const updatedSettings = {
        ...existingSettings,
        ...body,
      };

      const jsonStr = JSON.stringify(updatedSettings);
      await db.execute({
        sql: 'UPDATE admin_config SET site_settings_json = ?, updated_at = ?',
        args: [jsonStr, Date.now()],
      });

      return jsonResponse({ success: true, siteSettings: updatedSettings });
    }

    if (normalizedPath === '/settings/upload' && method === 'POST') {
      const auth = await verifyAdminAuth(request, env);
      if (!auth.authorized) return errorResponse(auth.error || 'Unauthorized', 401);

      const { filename, contentType = 'image/png', dataBase64, folder = 'branding' } = body;
      if (!dataBase64) {
        return errorResponse('Missing file data', 400);
      }

      const configRes = await db.execute('SELECT r2_config_json FROM admin_config LIMIT 1');
      if (configRes.rows.length === 0 || !configRes.rows[0].r2_config_json) {
        return errorResponse('Cloudflare R2 is not configured. Please configure your R2 credentials in Storage & DB.', 400);
      }

      const r2Config: R2Config = JSON.parse(configRes.rows[0].r2_config_json as string);
      if (!r2Config.accountId || !r2Config.accessKeyId || !r2Config.secretAccessKey || !r2Config.bucketName) {
        return errorResponse('Incomplete R2 credentials. Please verify your R2 configuration in Storage & DB.', 400);
      }

      const cleanExt = (filename || 'asset.png').split('.').pop() || 'png';
      const cleanName = (filename || 'image').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 32);
      const key = `${folder}/${Date.now()}_${cleanName}.${cleanExt}`;

      const rawBase64 = dataBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
      const buffer = Buffer.from(rawBase64, 'base64');
      const uploadRes = await uploadToR2(r2Config, key, buffer, contentType);

      if (!uploadRes.success) {
        return errorResponse(uploadRes.error || 'Failed to upload image to Cloudflare R2', 500);
      }

      return jsonResponse({
        success: true,
        url: uploadRes.url || uploadRes.signedUrl,
        signedUrl: uploadRes.signedUrl,
        key,
      });
    }

    // If path is not recognized
    return jsonResponse({ error: `Endpoint not found: ${method} ${pathname}` }, 404);
  } catch (error: any) {
    console.error('[Cloudflare API Error]:', error);
    return jsonResponse({ error: error.message || 'Internal server error' }, 500);
  }
}
