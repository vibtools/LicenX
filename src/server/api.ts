import * as archiverModule from "archiver";
import { NextFunction, Request, Response, Router } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  canonicalJson,
  createSessionToken,
  generateLicenseKey,
  generateLicensePin,
  generateRSAKeyPair,
  hashPassword,
  signPayload,
  verifyPassword,
  verifySessionToken,
} from "./crypto.js";
import { getDbClient, isTursoPlaceholder } from "./db.js";
import { bindDeviceWithinLimit } from "./deviceBinding.js";
import { isPublicAccessEnabled } from "./publicAccessSettings.js";
import { R2Config, testR2Connection, uploadToR2, getR2Object } from "./r2.js";
import {
  clearUserControlPinAttempts,
  getUserControlPinRateLimit,
  recordFailedUserControlPinAttempt,
} from "./userControlRateLimit.js";
const archiver = (archiverModule as any).default || archiverModule;

export const apiRouter = Router();

// In-memory admin auth caching to eliminate redundant DB queries on every request
let cachedAdminConfig: {
  jwtSecret: string;
  username: string;
  cachedAt: number;
} | null = null;
const ADMIN_CONFIG_CACHE_TTL = 60 * 1000; // 60 seconds

export function invalidateAdminConfigCache(): void {
  cachedAdminConfig = null;
}

// Middleware: Authenticate Admin using Bearer token (High Performance Cached)
async function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized: Missing token" });
      return;
    }

    const token = authHeader.split(" ")[1];
    const now = Date.now();
    let jwtSecret = "";
    let username = "";

    if (
      cachedAdminConfig &&
      now - cachedAdminConfig.cachedAt < ADMIN_CONFIG_CACHE_TTL
    ) {
      jwtSecret = cachedAdminConfig.jwtSecret;
      username = cachedAdminConfig.username;
    } else {
      const db = getDbClient();
      const configResult = await db.execute(
        "SELECT jwt_secret, username FROM admin_config LIMIT 1",
      );

      if (configResult.rows.length === 0) {
        res.status(401).json({ error: "System not initialized" });
        return;
      }

      const configRow = configResult.rows[0];
      jwtSecret = configRow.jwt_secret as string;
      username = configRow.username as string;
      cachedAdminConfig = { jwtSecret, username, cachedAt: now };
    }

    const session = verifySessionToken(token, jwtSecret);

    if (!session) {
      res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
      return;
    }

    (req as any).adminUser = session.username;
    next();
  } catch (error: any) {
    res.status(500).json({ error: "Authentication check failed" });
  }
}

// -------------------------------------------------------------
// SETUP & STATUS
// -------------------------------------------------------------

apiRouter.get("/setup/status", async (req: Request, res: Response) => {
  try {
    const db = getDbClient();
    const result = await db.execute(
      "SELECT id, username, ed25519_public_key, r2_config_json FROM admin_config LIMIT 1",
    );

    const isInitialized = result.rows.length > 0;
    let r2Configured = false;
    let hasTurso = !isTursoPlaceholder(
      process.env.TURSO_DATABASE_URL,
      process.env.TURSO_AUTH_TOKEN,
    );

    if (isInitialized) {
      const row = result.rows[0];
      if (row.r2_config_json) {
        try {
          const r2 = JSON.parse(row.r2_config_json as string);
          r2Configured = Boolean(
            r2.accountId &&
            r2.accessKeyId &&
            r2.secretAccessKey &&
            r2.bucketName,
          );
        } catch {
          // ignore
        }
      }
    }

    res.json({
      initialized: isInitialized,
      adminUsername: null,
      r2Configured,
      hasTursoEnv: hasTurso,
      serverTime: Date.now(),
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Failed to check setup status" });
  }
});

apiRouter.post("/setup/init", async (req: Request, res: Response) => {
  try {
    const db = getDbClient();
    const existing = await db.execute("SELECT id FROM admin_config LIMIT 1");
    if (existing.rows.length > 0) {
      res
        .status(400)
        .json({ error: "Admin is already initialized. Please login." });
      return;
    }

    const { username, password, r2Config } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const keypair = generateRSAKeyPair(2048);
    const jwtSecret = crypto.randomBytes(32).toString("hex");
    const passwordHash = hashPassword(password);
    const now = Date.now();
    const id = "admin_" + crypto.randomBytes(8).toString("hex");

    const r2Json = r2Config ? JSON.stringify(r2Config) : null;

    await db.execute({
      sql: `INSERT INTO admin_config (id, username, password_hash, jwt_secret, ed25519_private_key, ed25519_public_key, r2_config_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        username.trim(),
        passwordHash,
        jwtSecret,
        keypair.privateKeyPem,
        keypair.publicKeyPem,
        r2Json,
        now,
        now,
      ],
    });

    const token = createSessionToken(
      {
        username: username.trim(),
        exp: Math.floor(Date.now() / 1000) + 86400 * 30,
      },
      jwtSecret,
    );

    res.json({
      success: true,
      token,
      username: username.trim(),
      publicKeyPem: keypair.publicKeyPem,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Initialization failed" });
  }
});

// -------------------------------------------------------------
// AUTH
// -------------------------------------------------------------

apiRouter.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: "Username and password required" });
      return;
    }

    const db = getDbClient();
    const result = await db.execute({
      sql: "SELECT username, password_hash, jwt_secret FROM admin_config WHERE username = ? LIMIT 1",
      args: [username.trim()],
    });

    if (result.rows.length === 0) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const row = result.rows[0];
    const isValid = verifyPassword(password, row.password_hash as string);

    if (!isValid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = createSessionToken(
      {
        username: row.username as string,
        exp: Math.floor(Date.now() / 1000) + 86400 * 30,
      },
      row.jwt_secret as string,
    );

    res.json({
      success: true,
      token,
      username: row.username,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Login failed" });
  }
});

apiRouter.get(
  "/auth/me",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const username = (req as any).adminUser;
      const db = getDbClient();
      const configResult = await db.execute(
        "SELECT ed25519_public_key, r2_config_json FROM admin_config LIMIT 1",
      );
      const row = configResult.rows[0];

      res.json({
        authenticated: true,
        username,
        publicKeyPem: row ? row.ed25519_public_key : null,
        r2Configured: row && row.r2_config_json ? true : false,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch user" });
    }
  },
);

apiRouter.post(
  "/auth/update-credentials",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { currentPassword, newUsername, newPassword } = req.body;
      const db = getDbClient();
      const configResult = await db.execute(
        "SELECT id, username, password_hash, jwt_secret FROM admin_config LIMIT 1",
      );

      if (configResult.rows.length === 0) {
        res.status(400).json({ error: "Admin config not found" });
        return;
      }

      const row = configResult.rows[0];
      const isCurrentValid = verifyPassword(
        currentPassword,
        row.password_hash as string,
      );
      if (!isCurrentValid) {
        res.status(401).json({ error: "Current password incorrect" });
        return;
      }

      const targetUsername = newUsername
        ? newUsername.trim()
        : (row.username as string);
      const targetPasswordHash = newPassword
        ? hashPassword(newPassword)
        : (row.password_hash as string);
      const newJwtSecret = crypto.randomBytes(32).toString("hex");

      await db.execute({
        sql: "UPDATE admin_config SET username = ?, password_hash = ?, jwt_secret = ?, updated_at = ? WHERE id = ?",
        args: [
          targetUsername,
          targetPasswordHash,
          newJwtSecret,
          Date.now(),
          row.id as string,
        ],
      });

      const token = createSessionToken(
        {
          username: targetUsername,
          exp: Math.floor(Date.now() / 1000) + 86400 * 30,
        },
        newJwtSecret,
      );

      res.json({
        success: true,
        token,
        username: targetUsername,
      });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to update credentials" });
    }
  },
);

// -------------------------------------------------------------
// APPLICATIONS MANAGEMENT (MULTI-APP SCOPING)
// -------------------------------------------------------------

apiRouter.get(
  "/apps",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const db = getDbClient();
      const { search, status, limit = "50", offset = "0" } = req.query;

      let query = `
      SELECT a.*,
        (SELECT COUNT(*) FROM licenses l WHERE l.app_id = a.id) as licenses_count
      FROM apps a
      WHERE 1=1
    `;
      const args: any[] = [];

      if (search && typeof search === "string" && search.trim()) {
        query += ` AND (a.app_slug LIKE ? OR a.display_name LIKE ? OR a.description LIKE ?)`;
        const term = `%${search.trim()}%`;
        args.push(term, term, term);
      }

      if (status && typeof status === "string" && status !== "all") {
        query += ` AND a.status = ?`;
        args.push(status);
      }

      query += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
      args.push(Number(limit), Number(offset));

      const result = await db.execute({ sql: query, args });

      let countQuery = `SELECT COUNT(*) as total FROM apps a WHERE 1=1`;
      const countArgs: any[] = [];
      if (search && typeof search === "string" && search.trim()) {
        countQuery += ` AND (a.app_slug LIKE ? OR a.display_name LIKE ? OR a.description LIKE ?)`;
        const term = `%${search.trim()}%`;
        countArgs.push(term, term, term);
      }
      if (status && typeof status === "string" && status !== "all") {
        countQuery += ` AND a.status = ?`;
        countArgs.push(status);
      }

      const countResult = await db.execute({
        sql: countQuery,
        args: countArgs,
      });
      const total = Number(countResult.rows[0].total || 0);

      res.json({
        apps: result.rows,
        total,
        limit: Number(limit),
        offset: Number(offset),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch apps" });
    }
  },
);

apiRouter.post(
  "/apps",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const {
        app_slug,
        display_name,
        min_version = "1.0.0",
        description = "",
      } = req.body;

      if (!app_slug || !display_name) {
        res
          .status(400)
          .json({ error: "App name (slug) and Display Name are required" });
        return;
      }

      const sanitizedSlug = app_slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_");

      const db = getDbClient();

      // Check if slug exists
      const existing = await db.execute({
        sql: "SELECT id FROM apps WHERE app_slug = ? LIMIT 1",
        args: [sanitizedSlug],
      });

      if (existing.rows.length > 0) {
        res.status(400).json({
          error: `App with identifier "${sanitizedSlug}" already exists`,
        });
        return;
      }

      const id = "app_" + crypto.randomBytes(6).toString("hex");
      const appSecret = "sec_" + crypto.randomBytes(16).toString("hex");
      const now = Date.now();

      await db.execute({
        sql: `INSERT INTO apps (id, app_slug, display_name, min_version, status, app_secret, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
        args: [
          id,
          sanitizedSlug,
          display_name.trim(),
          (min_version || "1.0.0").trim(),
          appSecret,
          description.trim() || null,
          now,
          now,
        ],
      });

      res.json({
        success: true,
        app: {
          id,
          app_slug: sanitizedSlug,
          display_name: display_name.trim(),
          min_version: (min_version || "1.0.0").trim(),
          status: "active",
          app_secret: appSecret,
          description,
          created_at: now,
          updated_at: now,
          licenses_count: 0,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to create app" });
    }
  },
);

apiRouter.patch(
  "/apps/:id",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { display_name, min_version, status, description } = req.body;
      const db = getDbClient();

      const fields: string[] = [];
      const args: any[] = [];

      if (display_name !== undefined) {
        fields.push("display_name = ?");
        args.push(display_name.trim());
      }
      if (min_version !== undefined) {
        fields.push("min_version = ?");
        args.push(min_version.trim());
      }
      if (status !== undefined) {
        fields.push("status = ?");
        args.push(status);
      }
      if (description !== undefined) {
        fields.push("description = ?");
        args.push(description ? description.trim() : null);
      }

      if (fields.length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      fields.push("updated_at = ?");
      args.push(Date.now());
      args.push(id);

      await db.execute({
        sql: `UPDATE apps SET ${fields.join(", ")} WHERE id = ?`,
        args,
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to update app" });
    }
  },
);

apiRouter.delete(
  "/apps/:id",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const db = getDbClient();

      // Detach app_id from any linked licenses
      await db.execute({
        sql: "UPDATE licenses SET app_id = NULL WHERE app_id = ?",
        args: [id],
      });
      await db.execute({ sql: "DELETE FROM apps WHERE id = ?", args: [id] });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to delete app" });
    }
  },
);

apiRouter.post(
  "/apps/bulk-action",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { ids, action } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: "No app IDs provided" });
        return;
      }

      const db = getDbClient();
      const placeholders = ids.map(() => "?").join(",");

      if (action === "delete") {
        await db.execute({
          sql: `UPDATE licenses SET app_id = NULL WHERE app_id IN (${placeholders})`,
          args: ids,
        });
        await db.execute({
          sql: `DELETE FROM apps WHERE id IN (${placeholders})`,
          args: ids,
        });
      } else if (action === "deactivate") {
        await db.execute({
          sql: `UPDATE apps SET status = 'inactive', updated_at = ${Date.now()} WHERE id IN (${placeholders})`,
          args: ids,
        });
      } else if (action === "activate") {
        await db.execute({
          sql: `UPDATE apps SET status = 'active', updated_at = ${Date.now()} WHERE id IN (${placeholders})`,
          args: ids,
        });
      }

      res.json({ success: true, affected: ids.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Bulk action failed" });
    }
  },
);

// Download Client Configuration File
apiRouter.get(
  "/apps/:id/config",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const db = getDbClient();

      const [appRes, configRes] = await Promise.all([
        db.execute({
          sql: "SELECT * FROM apps WHERE id = ? LIMIT 1",
          args: [id],
        }),
        db.execute("SELECT ed25519_public_key FROM admin_config LIMIT 1"),
      ]);

      if (appRes.rows.length === 0) {
        res.status(404).json({ error: "App not found" });
        return;
      }

      const app = appRes.rows[0];
      const publicKeyPem =
        configRes.rows.length > 0
          ? (configRes.rows[0].ed25519_public_key as string)
          : "";

      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.get("host") || "localhost:3000";
      const serverUrl = process.env.APP_URL || `${protocol}://${host}`;

      const clientConfig = {
        server_url: serverUrl,
        app_name: app.app_slug,
        display_name: app.display_name,
        min_version: app.min_version,
        public_key_pem: publicKeyPem,
        generated_at: new Date().toISOString(),
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${app.app_slug}_vcon_config.json"`,
      );
      res.send(JSON.stringify(clientConfig, null, 2));
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to generate config" });
    }
  },
);

// -------------------------------------------------------------
// LICENSES MANAGEMENT (ADMIN)
// -------------------------------------------------------------

apiRouter.get(
  "/licenses",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const db = getDbClient();
      const {
        search,
        status,
        tier,
        app_id,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = `
      SELECT l.*,
        a.display_name as app_name,
        a.app_slug as app_slug,
        (SELECT COUNT(*) FROM devices d WHERE d.license_id = l.id AND d.status = 'active') AS bound_devices_count
      FROM licenses l
      LEFT JOIN apps a ON l.app_id = a.id
      WHERE 1=1
    `;
      const args: any[] = [];

      if (search && typeof search === "string" && search.trim()) {
        query += ` AND (l.key LIKE ? OR l.customer_name LIKE ? OR l.customer_email LIKE ? OR l.notes LIKE ?)`;
        const term = `%${search.trim()}%`;
        args.push(term, term, term, term);
      }

      if (status && typeof status === "string" && status !== "all") {
        query += ` AND l.status = ?`;
        args.push(status);
      }

      if (tier && typeof tier === "string" && tier !== "all") {
        query += ` AND l.tier = ?`;
        args.push(tier);
      }

      if (app_id && typeof app_id === "string" && app_id !== "all") {
        if (app_id === "global") {
          query += ` AND l.app_id IS NULL`;
        } else {
          query += ` AND l.app_id = ?`;
          args.push(app_id);
        }
      }

      query += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;
      args.push(Number(limit), Number(offset));

      const result = await db.execute({ sql: query, args });

      // Count total matching
      let countQuery = `SELECT COUNT(*) as total FROM licenses l WHERE 1=1`;
      const countArgs: any[] = [];
      if (search && typeof search === "string" && search.trim()) {
        countQuery += ` AND (l.key LIKE ? OR l.customer_name LIKE ? OR l.customer_email LIKE ? OR l.notes LIKE ?)`;
        const term = `%${search.trim()}%`;
        countArgs.push(term, term, term, term);
      }
      if (status && typeof status === "string" && status !== "all") {
        countQuery += ` AND l.status = ?`;
        countArgs.push(status);
      }
      if (tier && typeof tier === "string" && tier !== "all") {
        countQuery += ` AND l.tier = ?`;
        countArgs.push(tier);
      }
      if (app_id && typeof app_id === "string" && app_id !== "all") {
        if (app_id === "global") {
          countQuery += ` AND l.app_id IS NULL`;
        } else {
          countQuery += ` AND l.app_id = ?`;
          countArgs.push(app_id);
        }
      }

      const countResult = await db.execute({
        sql: countQuery,
        args: countArgs,
      });
      const total = Number(countResult.rows[0].total || 0);

      res.json({
        licenses: result.rows,
        total,
        limit: Number(limit),
        offset: Number(offset),
      });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to fetch licenses" });
    }
  },
);

// Single license creation
apiRouter.post(
  "/licenses",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const {
        key,
        prefix = "VCON",
        tier = "Standard",
        app_id = null,
        device_limit = 1,
        validity_type = "lifetime", // 'hourly' | 'daily' | 'lifetime'
        validity_value = 0,
        customer_name = "",
        customer_email = "",
        notes = "",
        expires_at = null,
      } = req.body;

      const db = getDbClient();
      const finalKey = key
        ? key.trim().toUpperCase()
        : generateLicenseKey(prefix);
      const pin = generateLicensePin();
      const id = "lic_" + crypto.randomBytes(8).toString("hex");
      const now = Date.now();

      let computedExpiresAt = expires_at;

      await db.execute({
        sql: `INSERT INTO licenses (
        id, key, status, tier, app_id, device_limit, validity_type, validity_value,
        activated_at, expires_at, created_at, customer_name, customer_email, notes, pin
      ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          finalKey,
          tier,
          app_id ? app_id.trim() : null,
          Number(device_limit),
          validity_type,
          Number(validity_value),
          computedExpiresAt,
          now,
          customer_name || null,
          customer_email || null,
          notes || null,
          pin,
        ],
      });

      res.json({
        success: true,
        license: {
          id,
          key: finalKey,
          pin,
          status: "active",
          tier,
          app_id: app_id || null,
          device_limit: Number(device_limit),
          validity_type,
          validity_value: Number(validity_value),
          created_at: now,
          customer_name,
          customer_email,
          notes,
        },
      });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to create license" });
    }
  },
);

// Bulk license generation with optional Cloudflare R2 backup
apiRouter.post(
  "/licenses/bulk",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const {
        count = 10,
        prefix = "VCON",
        tier = "Standard",
        app_id = null,
        device_limit = 1,
        validity_type = "lifetime",
        validity_value = 0,
        notes = "Bulk Generated",
        pin,
        backupToR2 = false,
      } = req.body;

      const totalCount = Math.min(Math.max(Number(count) || 1, 1), 2000);
      const db = getDbClient();
      const now = Date.now();
      const batchPin =
        pin && pin.toString().length === 4
          ? pin.toString()
          : generateLicensePin();
      const generatedKeys: string[] = [];
      const generatedRows: any[] = [];

      const statements: any[] = [];

      for (let i = 0; i < totalCount; i++) {
        const key = generateLicenseKey(prefix);
        const id = "lic_" + crypto.randomBytes(8).toString("hex");
        generatedKeys.push(key);

        generatedRows.push({
          id,
          key,
          pin: batchPin,
          status: "active",
          tier,
          app_id: app_id || null,
          device_limit: Number(device_limit),
          validity_type,
          validity_value: Number(validity_value),
          created_at: now,
          notes,
        });

        statements.push({
          sql: `INSERT INTO licenses (
          id, key, status, tier, app_id, device_limit, validity_type, validity_value,
          activated_at, expires_at, created_at, notes, pin
        ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
          args: [
            id,
            key,
            tier,
            app_id ? app_id.trim() : null,
            Number(device_limit),
            validity_type,
            Number(validity_value),
            now,
            notes,
            batchPin,
          ],
        });
      }

      // Execute in chunked batches (200 statements per chunk) for safe, high-speed execution
      for (let i = 0; i < statements.length; i += 200) {
        await db.batch(statements.slice(i, i + 200));
      }

      // Prepare CSV data
      let csvContent =
        "key,pin,tier,app_id,device_limit,validity_type,validity_value,created_at,notes\n";
      generatedRows.forEach((r) => {
        csvContent += `"${r.key}","${batchPin}","${r.tier}","${r.app_id || "GLOBAL"}",${r.device_limit},"${r.validity_type}",${r.validity_value},"${new Date(r.created_at).toISOString()}","${r.notes}"\n`;
      });

      let r2UploadResult: any = null;

      if (backupToR2) {
        const configRes = await db.execute(
          "SELECT r2_config_json FROM admin_config LIMIT 1",
        );
        if (configRes.rows.length > 0 && configRes.rows[0].r2_config_json) {
          const r2Config: R2Config = JSON.parse(
            configRes.rows[0].r2_config_json as string,
          );
          if (
            r2Config.accountId &&
            r2Config.accessKeyId &&
            r2Config.secretAccessKey &&
            r2Config.bucketName
          ) {
            const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `bulk_licenses_${prefix}_${timestampStr}.csv`;
            const uploadRes = await uploadToR2(
              r2Config,
              `licenses/${filename}`,
              csvContent,
              "text/csv",
            );

            if (uploadRes.success) {
              r2UploadResult = uploadRes;
              const backupId = "r2_" + crypto.randomBytes(6).toString("hex");
              await db.execute({
                sql: `INSERT INTO r2_backups (id, filename, record_count, file_size, r2_url, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                args: [
                  backupId,
                  filename,
                  totalCount,
                  Buffer.byteLength(csvContent),
                  uploadRes.url || null,
                  now,
                ],
              });
            }
          }
        }
      }

      res.json({
        success: true,
        count: totalCount,
        pin: batchPin,
        keys: generatedKeys,
        csv: csvContent,
        r2Backup: r2UploadResult,
      });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Bulk generation failed" });
    }
  },
);

// Update license
apiRouter.patch(
  "/licenses/:id",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        status,
        tier,
        app_id,
        device_limit,
        expires_at,
        notes,
        customer_name,
        customer_email,
        pin,
      } = req.body;
      const db = getDbClient();

      const fields: string[] = [];
      const args: any[] = [];

      if (status !== undefined) {
        fields.push("status = ?");
        args.push(status);
      }
      if (tier !== undefined) {
        fields.push("tier = ?");
        args.push(tier);
      }
      if (app_id !== undefined) {
        fields.push("app_id = ?");
        args.push(app_id ? app_id.trim() : null);
      }
      if (device_limit !== undefined) {
        fields.push("device_limit = ?");
        args.push(Number(device_limit));
      }
      if (expires_at !== undefined) {
        fields.push("expires_at = ?");
        args.push(expires_at ? Number(expires_at) : null);
      }
      if (notes !== undefined) {
        fields.push("notes = ?");
        args.push(notes);
      }
      if (customer_name !== undefined) {
        fields.push("customer_name = ?");
        args.push(customer_name);
      }
      if (customer_email !== undefined) {
        fields.push("customer_email = ?");
        args.push(customer_email);
      }
      if (pin !== undefined) {
        fields.push("pin = ?");
        args.push(pin ? String(pin).trim() : null);
      }

      if (fields.length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      args.push(id);
      await db.execute({
        sql: `UPDATE licenses SET ${fields.join(", ")} WHERE id = ?`,
        args,
      });

      res.json({ success: true });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to update license" });
    }
  },
);

// Delete single license
apiRouter.delete(
  "/licenses/:id",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const db = getDbClient();

      await db.execute({
        sql: "DELETE FROM devices WHERE license_id = ?",
        args: [id],
      });
      await db.execute({
        sql: "DELETE FROM licenses WHERE id = ?",
        args: [id],
      });

      res.json({ success: true });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to delete license" });
    }
  },
);

// Bulk Action (Revoke, Delete, Suspend, Extend)
apiRouter.post(
  "/licenses/bulk-action",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { ids, action, extendDays } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: "No license IDs provided" });
        return;
      }

      const db = getDbClient();
      const placeholders = ids.map(() => "?").join(",");

      if (action === "delete") {
        await db.execute({
          sql: `DELETE FROM devices WHERE license_id IN (${placeholders})`,
          args: ids,
        });
        await db.execute({
          sql: `DELETE FROM licenses WHERE id IN (${placeholders})`,
          args: ids,
        });
      } else if (action === "revoke") {
        await db.execute({
          sql: `UPDATE licenses SET status = 'revoked' WHERE id IN (${placeholders})`,
          args: ids,
        });
      } else if (action === "suspend") {
        await db.execute({
          sql: `UPDATE licenses SET status = 'suspended' WHERE id IN (${placeholders})`,
          args: ids,
        });
      } else if (action === "activate") {
        await db.execute({
          sql: `UPDATE licenses SET status = 'active' WHERE id IN (${placeholders})`,
          args: ids,
        });
      } else if (action === "reset") {
        await db.execute({
          sql: `DELETE FROM devices WHERE license_id IN (${placeholders})`,
          args: ids,
        });
      } else if (action === "extend" && extendDays) {
        const extraMs = Number(extendDays) * 86400 * 1000;
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

      res.json({ success: true, affected: ids.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Bulk action failed" });
    }
  },
);

// Get devices for a specific license
apiRouter.get(
  "/licenses/:id/devices",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const db = getDbClient();
      const result = await db.execute({
        sql: "SELECT * FROM devices WHERE license_id = ? ORDER BY first_bound_at DESC",
        args: [id],
      });

      res.json({ devices: result.rows });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to fetch devices" });
    }
  },
);

// Unbind/Reset all devices for a license
apiRouter.delete(
  "/licenses/:id/devices",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const db = getDbClient();
      await db.execute({
        sql: "DELETE FROM devices WHERE license_id = ?",
        args: [id],
      });
      res.json({ success: true });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to reset devices" });
    }
  },
);

// -------------------------------------------------------------
// GLOBAL DEVICES MANAGEMENT (ADMIN)
// -------------------------------------------------------------

apiRouter.get(
  "/devices",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const db = getDbClient();
      const { search, limit = "50", offset = "0" } = req.query;

      let query = `
      SELECT d.*, l.key as license_key, l.tier as license_tier, l.status as license_status, l.customer_name,
             a.display_name as app_name, a.app_slug as app_slug
      FROM devices d
      JOIN licenses l ON d.license_id = l.id
      LEFT JOIN apps a ON l.app_id = a.id
      WHERE 1=1
    `;
      const args: any[] = [];

      if (search && typeof search === "string" && search.trim()) {
        query += ` AND (d.hwid LIKE ? OR d.device_name LIKE ? OR d.ip_address LIKE ? OR l.key LIKE ?)`;
        const term = `%${search.trim()}%`;
        args.push(term, term, term, term);
      }

      query += ` ORDER BY d.last_ping_at DESC LIMIT ? OFFSET ?`;
      args.push(Number(limit), Number(offset));

      const result = await db.execute({ sql: query, args });

      let countQuery = `
      SELECT COUNT(*) as total
      FROM devices d
      JOIN licenses l ON d.license_id = l.id
      WHERE 1=1
    `;
      const countArgs: any[] = [];
      if (search && typeof search === "string" && search.trim()) {
        countQuery += ` AND (d.hwid LIKE ? OR d.device_name LIKE ? OR d.ip_address LIKE ? OR l.key LIKE ?)`;
        const term = `%${search.trim()}%`;
        countArgs.push(term, term, term, term);
      }

      const countResult = await db.execute({
        sql: countQuery,
        args: countArgs,
      });

      res.json({
        devices: result.rows,
        total: Number(countResult.rows[0].total || 0),
      });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to fetch devices" });
    }
  },
);

apiRouter.delete(
  "/devices/:id",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const db = getDbClient();
      await db.execute({ sql: "DELETE FROM devices WHERE id = ?", args: [id] });
      res.json({ success: true });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to unbind device" });
    }
  },
);

// -------------------------------------------------------------
// USER PUBLIC SELF-SERVICE & LICENSE CONTROL PORTAL
// -------------------------------------------------------------

// 1. Quick Check: returns status, device_limit, active_device_count only
apiRouter.post(
  "/v1/user/license/check",
  async (req: Request, res: Response) => {
    try {
      const { license_key } = req.body;
      if (!license_key || typeof license_key !== "string") {
        res.status(400).json({ error: "License key is required" });
        return;
      }

      const db = getDbClient();
      if (!(await isPublicAccessEnabled(db, "allowPublicCheck"))) {
        res.status(403).json({ error: "Public license check is disabled." });
        return;
      }

      const result = await db.execute({
        sql: `SELECT id, status, device_limit, expires_at,
            (SELECT COUNT(*) FROM devices d WHERE d.license_id = l.id AND d.status = 'active') as active_device_count
            FROM licenses l WHERE UPPER(l.key) = ? LIMIT 1`,
        args: [license_key.trim().toUpperCase()],
      });

      if (result.rows.length === 0) {
        res.status(404).json({ error: "License key not found" });
        return;
      }

      const row = result.rows[0];
      const now = Date.now();
      let currentStatus = row.status as string;
      if (
        row.expires_at &&
        now > Number(row.expires_at) &&
        currentStatus === "active"
      ) {
        currentStatus = "expired";
        await db.execute({
          sql: "UPDATE licenses SET status = 'expired' WHERE id = ?",
          args: [row.id],
        });
      }

      res.json({
        status: currentStatus,
        device_limit: Number(row.device_limit),
        active_device_count: Number(row.active_device_count || 0),
      });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to check license" });
    }
  },
);

// 2. Control Open: requires license_key & 4-digit PIN -> returns full analysis & devices
apiRouter.post("/v1/user/control/open", async (req: Request, res: Response) => {
  try {
    const { license_key, pin } = req.body;
    if (!license_key || !pin) {
      res
        .status(400)
        .json({ error: "License key and 4-digit PIN are required" });
      return;
    }

    const db = getDbClient();
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    const rateLimit = await getUserControlPinRateLimit(
      db,
      license_key,
      clientIp,
    );
    if (rateLimit.blocked) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      res
        .status(429)
        .json({ error: "Too many incorrect PIN attempts. Try again later." });
      return;
    }

    const result = await db.execute({
      sql: `SELECT l.*, a.display_name as app_name, a.app_slug as app_slug
            FROM licenses l
            LEFT JOIN apps a ON l.app_id = a.id
            WHERE UPPER(l.key) = ? LIMIT 1`,
      args: [license_key.trim().toUpperCase()],
    });

    if (result.rows.length === 0) {
      res.status(404).json({ error: "License key not found" });
      return;
    }

    const license = result.rows[0];
    if (!license.pin || String(license.pin).trim() !== String(pin).trim()) {
      const updatedRateLimit = await recordFailedUserControlPinAttempt(
        db,
        license_key,
        clientIp,
      );
      if (updatedRateLimit.blocked) {
        res.setHeader(
          "Retry-After",
          String(updatedRateLimit.retryAfterSeconds),
        );
        res
          .status(429)
          .json({ error: "Too many incorrect PIN attempts. Try again later." });
        return;
      }
      res.status(403).json({ error: "Incorrect PIN. Access denied." });
      return;
    }

    const finalRateLimitCheck = await getUserControlPinRateLimit(
      db,
      license_key,
      clientIp,
    );
    if (finalRateLimitCheck.blocked) {
      res.setHeader(
        "Retry-After",
        String(finalRateLimitCheck.retryAfterSeconds),
      );
      res
        .status(429)
        .json({ error: "Too many incorrect PIN attempts. Try again later." });
      return;
    }
    await clearUserControlPinAttempts(db, license_key, clientIp);
    const now = Date.now();
    let currentStatus = license.status as string;
    if (
      license.expires_at &&
      now > Number(license.expires_at) &&
      currentStatus === "active"
    ) {
      currentStatus = "expired";
      await db.execute({
        sql: "UPDATE licenses SET status = 'expired' WHERE id = ?",
        args: [license.id],
      });
    }

    // Fetch ONLY active bound devices
    const devicesResult = await db.execute({
      sql: `SELECT id, hwid, device_name, os_info, ip_address, first_bound_at, last_ping_at, status
            FROM devices WHERE license_id = ? AND status = 'active' ORDER BY last_ping_at DESC, first_bound_at DESC`,
      args: [license.id],
    });

    res.json({
      license: {
        id: license.id,
        key: license.key,
        status: currentStatus,
        tier: license.tier,
        app_name: license.app_name || null,
        app_slug: license.app_slug || (license.app_id ? "app" : "global"),
        device_limit: Number(license.device_limit),
        validity_type: license.validity_type,
        validity_value: Number(license.validity_value),
        created_at: Number(license.created_at),
        activated_at: license.activated_at
          ? Number(license.activated_at)
          : null,
        expires_at: license.expires_at ? Number(license.expires_at) : null,
        customer_name: license.customer_name || null,
        customer_email: license.customer_email || null,
        bound_devices_count: devicesResult.rows.length,
      },
      devices: devicesResult.rows,
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Failed to open license analysis" });
  }
});

// 3. Control Reset: requires license_key & 4-digit PIN -> logs out all devices and resets slots
apiRouter.post(
  "/v1/user/control/reset",
  async (req: Request, res: Response) => {
    try {
      const { license_key, pin } = req.body;
      if (!license_key || !pin) {
        res
          .status(400)
          .json({ error: "License key and 4-digit PIN are required" });
        return;
      }

      const db = getDbClient();
      if (!(await isPublicAccessEnabled(db, "allowPublicReset"))) {
        res
          .status(403)
          .json({ error: "Self-service device reset is disabled." });
        return;
      }

      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const rateLimit = await getUserControlPinRateLimit(
        db,
        license_key,
        clientIp,
      );
      if (rateLimit.blocked) {
        res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
        res
          .status(429)
          .json({ error: "Too many incorrect PIN attempts. Try again later." });
        return;
      }

      const result = await db.execute({
        sql: `SELECT id, pin, key FROM licenses WHERE UPPER(key) = ? LIMIT 1`,
        args: [license_key.trim().toUpperCase()],
      });

      if (result.rows.length === 0) {
        res.status(404).json({ error: "License key not found" });
        return;
      }

      const license = result.rows[0];
      if (!license.pin || String(license.pin).trim() !== String(pin).trim()) {
        const updatedRateLimit = await recordFailedUserControlPinAttempt(
          db,
          license_key,
          clientIp,
        );
        if (updatedRateLimit.blocked) {
          res.setHeader(
            "Retry-After",
            String(updatedRateLimit.retryAfterSeconds),
          );
          res.status(429).json({
            error: "Too many incorrect PIN attempts. Try again later.",
          });
          return;
        }
        res.status(403).json({ error: "Incorrect PIN. Reset rejected." });
        return;
      }

      const finalRateLimitCheck = await getUserControlPinRateLimit(
        db,
        license_key,
        clientIp,
      );
      if (finalRateLimitCheck.blocked) {
        res.setHeader(
          "Retry-After",
          String(finalRateLimitCheck.retryAfterSeconds),
        );
        res
          .status(429)
          .json({ error: "Too many incorrect PIN attempts. Try again later." });
        return;
      }
      await clearUserControlPinAttempts(db, license_key, clientIp);
      // Reset all device bindings to logged_out
      const now = Date.now();
      await db.execute({
        sql: "UPDATE devices SET status = 'logged_out', last_ping_at = ? WHERE license_id = ?",
        args: [now, license.id],
      });

      // Record audit log
      await db.execute({
        sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
            VALUES (?, ?, NULL, 'SELF_SERVICE_RESET', ?, 'reset', 200, 'User forced reset of all bound devices via PIN', ?)`,
        args: [
          "log_" + crypto.randomBytes(6).toString("hex"),
          license.key,
          (req.ip || "127.0.0.1") as string,
          now,
        ],
      });

      res.json({
        success: true,
        message:
          "All devices logged out and reset successfully. You can now login on another device.",
      });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to reset devices" });
    }
  },
);

// -------------------------------------------------------------
// PUBLIC CLIENT LICENSE VERIFICATION ENGINE (SERVERLESS)
// -------------------------------------------------------------

apiRouter.get("/v1/public-key", async (req: Request, res: Response) => {
  try {
    const db = getDbClient();
    const configResult = await db.execute(
      "SELECT ed25519_public_key FROM admin_config LIMIT 1",
    );

    if (configResult.rows.length === 0) {
      res.status(503).json({ error: "Server keypair not initialized" });
      return;
    }

    const publicKeyPem = configResult.rows[0].ed25519_public_key as string;

    const isRsa = publicKeyPem.includes("RSA") || publicKeyPem.length > 300;

    res.json({
      algorithm: isRsa ? "RSA-2048" : "Ed25519",
      publicKeyPem,
      serverTime: Date.now(),
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Failed to get public key" });
  }
});

/**
 * Validate and auto-bind device with Multi-App Scoping & Cryptographic Ed25519 Signature
 */
apiRouter.post("/v1/license/validate", async (req: Request, res: Response) => {
  const ip =
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "127.0.0.1";
  const now = Date.now();

  try {
    const {
      license_key,
      hwid,
      device_name = "Unknown",
      os_info = "Unknown",
      app_name, // can be app_slug (e.g. "dark_tool_pro") or app_id
      app_version = "1.0.0",
      client_time,
    } = req.body;

    if (!license_key || !hwid) {
      res.status(400).json({ error: "license_key and hwid are required" });
      return;
    }

    const db = getDbClient();

    // 1. Fetch server keys for signing
    const configResult = await db.execute(
      "SELECT ed25519_private_key, ed25519_public_key FROM admin_config LIMIT 1",
    );
    if (configResult.rows.length === 0) {
      res.status(503).json({ error: "License server uninitialized" });
      return;
    }
    const privateKeyPem = configResult.rows[0].ed25519_private_key as string;
    const publicKeyPem = configResult.rows[0].ed25519_public_key as string;

    // 2. Multi-App Scope Check if app_name is provided
    let matchedApp: any = null;
    if (app_name && typeof app_name === "string" && app_name.trim()) {
      const sanitizedSlug = app_name.trim().toLowerCase();
      const appResult = await db.execute({
        sql: "SELECT * FROM apps WHERE app_slug = ? OR id = ? LIMIT 1",
        args: [sanitizedSlug, app_name.trim()],
      });

      if (appResult.rows.length === 0) {
        await db.execute({
          sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
                VALUES (?, ?, ?, ?, ?, 'reject', 403, 'Application not registered on server', ?)`,
          args: [
            "log_" + crypto.randomBytes(6).toString("hex"),
            license_key,
            sanitizedSlug,
            hwid,
            ip,
            now,
          ],
        });
        res.status(403).json({
          valid: false,
          code: "APP_NOT_FOUND",
          message: `Application "${app_name}" is not registered on license server`,
        });
        return;
      }

      matchedApp = appResult.rows[0];

      // Check if App is active
      if (matchedApp.status !== "active") {
        await db.execute({
          sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
                VALUES (?, ?, ?, ?, ?, 'reject', 403, 'Application is inactive', ?)`,
          args: [
            "log_" + crypto.randomBytes(6).toString("hex"),
            license_key,
            matchedApp.app_slug,
            hwid,
            ip,
            now,
          ],
        });
        res.status(403).json({
          valid: false,
          code: "APP_INACTIVE",
          message: `Application "${matchedApp.display_name}" is currently disabled`,
        });
        return;
      }

      // Check min_version
      if (matchedApp.min_version && app_version) {
        // Simple semver compare helper: returns true if v1 < v2
        const isOutdated = (current: string, minRequired: string) => {
          const cParts = current.split(".").map((p) => parseInt(p) || 0);
          const mParts = minRequired.split(".").map((p) => parseInt(p) || 0);
          for (let i = 0; i < Math.max(cParts.length, mParts.length); i++) {
            const c = cParts[i] || 0;
            const m = mParts[i] || 0;
            if (c < m) return true;
            if (c > m) return false;
          }
          return false;
        };

        if (isOutdated(app_version, matchedApp.min_version)) {
          await db.execute({
            sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
                  VALUES (?, ?, ?, ?, ?, 'reject', 426, 'Application version outdated (${app_version} < ${matchedApp.min_version})', ?)`,
            args: [
              "log_" + crypto.randomBytes(6).toString("hex"),
              license_key,
              matchedApp.app_slug,
              hwid,
              ip,
              now,
            ],
          });
          res.status(426).json({
            valid: false,
            code: "APP_VERSION_OUTDATED",
            message: `Update required. Client version: ${app_version}, Minimum required: ${matchedApp.min_version}`,
            current_version: app_version,
            min_version: matchedApp.min_version,
          });
          return;
        }
      }
    }

    // 3. Fetch license record
    const licResult = await db.execute({
      sql: "SELECT * FROM licenses WHERE key = ? LIMIT 1",
      args: [license_key.trim().toUpperCase()],
    });

    if (licResult.rows.length === 0) {
      await db.execute({
        sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
              VALUES (?, ?, ?, ?, ?, 'validate', 404, 'License key not found', ?)`,
        args: [
          "log_" + crypto.randomBytes(6).toString("hex"),
          license_key,
          matchedApp?.app_slug || null,
          hwid,
          ip,
          now,
        ],
      });
      res.status(404).json({
        valid: false,
        code: "KEY_NOT_FOUND",
        message: "License key not found",
      });
      return;
    }

    const license = licResult.rows[0];

    // 4. App Isolation / Scope check
    if (license.app_id) {
      if (!matchedApp || matchedApp.id !== license.app_id) {
        await db.execute({
          sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
                VALUES (?, ?, ?, ?, ?, 'reject', 403, 'License key is not authorized for this app', ?)`,
          args: [
            "log_" + crypto.randomBytes(6).toString("hex"),
            license_key,
            matchedApp?.app_slug || null,
            hwid,
            ip,
            now,
          ],
        });
        res.status(403).json({
          valid: false,
          code: "LICENSE_APP_MISMATCH",
          message: "This license key is restricted to a different application",
        });
        return;
      }
    }

    // 5. Status check
    if (license.status === "revoked") {
      await db.execute({
        sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
              VALUES (?, ?, ?, ?, ?, 'reject', 403, 'License revoked by administrator', ?)`,
        args: [
          "log_" + crypto.randomBytes(6).toString("hex"),
          license_key,
          matchedApp?.app_slug || null,
          hwid,
          ip,
          now,
        ],
      });
      res.status(403).json({
        valid: false,
        code: "LICENSE_REVOKED",
        message: "License revoked by administrator",
      });
      return;
    }

    if (license.status === "suspended") {
      await db.execute({
        sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
              VALUES (?, ?, ?, ?, ?, 'reject', 403, 'License temporarily suspended', ?)`,
        args: [
          "log_" + crypto.randomBytes(6).toString("hex"),
          license_key,
          matchedApp?.app_slug || null,
          hwid,
          ip,
          now,
        ],
      });
      res.status(403).json({
        valid: false,
        code: "LICENSE_SUSPENDED",
        message: "License temporarily suspended",
      });
      return;
    }

    // 6. Expiry / First Activation Check
    let activatedAt = license.activated_at as number | null;
    let expiresAt = license.expires_at as number | null;

    if (!activatedAt) {
      activatedAt = now;
      if (
        license.validity_type === "hourly" &&
        (license.validity_value as number) > 0
      ) {
        expiresAt = now + (license.validity_value as number) * 3600 * 1000;
      } else if (
        license.validity_type === "daily" &&
        (license.validity_value as number) > 0
      ) {
        expiresAt = now + (license.validity_value as number) * 86400 * 1000;
      }

      await db.execute({
        sql: "UPDATE licenses SET activated_at = ?, expires_at = ? WHERE id = ?",
        args: [activatedAt, expiresAt, license.id as string],
      });
    }

    if (expiresAt && now > expiresAt) {
      await db.execute({
        sql: `UPDATE licenses SET status = 'expired' WHERE id = ?`,
        args: [license.id as string],
      });
      await db.execute({
        sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
              VALUES (?, ?, ?, ?, ?, 'reject', 403, 'License expired', ?)`,
        args: [
          "log_" + crypto.randomBytes(6).toString("hex"),
          license_key,
          matchedApp?.app_slug || null,
          hwid,
          ip,
          now,
        ],
      });
      res.status(403).json({
        valid: false,
        code: "LICENSE_EXPIRED",
        message: "License expired",
      });
      return;
    }

    const deviceLimit = Number(license.device_limit);
    const binding = await bindDeviceWithinLimit({
      db,
      licenseId: license.id as string,
      hwid,
      deviceId: "dev_" + crypto.randomBytes(6).toString("hex"),
      deviceName: device_name,
      osInfo: os_info,
      ipAddress: ip,
      now,
      deviceLimit,
      reactivationLimitPolicy: "all-inactive",
      rejectBlocked: false,
    });

    if (binding.status === "limit") {
      const message = binding.existingDevice
        ? `Device limit reached (${binding.activeDevicesCount}/${deviceLimit})`
        : `Device limit exceeded (${binding.activeDevicesCount}/${deviceLimit})`;
      await db.execute({
        sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
              VALUES (?, ?, ?, ?, ?, 'reject', 403, ?, ?)`,
        args: [
          "log_" + crypto.randomBytes(6).toString("hex"),
          license_key,
          matchedApp?.app_slug || null,
          hwid,
          ip,
          message,
          now,
        ],
      });
      res.status(403).json({
        valid: false,
        code: "DEVICE_LIMIT_REACHED",
        message: binding.existingDevice
          ? `Device limit reached (${binding.activeDevicesCount}/${deviceLimit}). License is currently active on another device.`
          : `Device limit reached. Max allowed devices: ${deviceLimit}`,
        activeDevicesCount: binding.activeDevicesCount,
        deviceLimit,
      });
      return;
    }

    // 8. Construct Cryptographically Signed Payload
    const signedData: Record<string, unknown> = {
      valid: true,
      license_key: license.key,
      status: "active",
      tier: license.tier || "Standard",
      app_slug: matchedApp ? matchedApp.app_slug : "global",
      app_name: matchedApp ? matchedApp.display_name : "Global",
      app_id: license.app_id || null,
      hwid: hwid,
      device_name: device_name,
      device_limit: deviceLimit,
      bound_devices_count: binding.boundDevicesCount,
      activated_at: activatedAt,
      expires_at: expiresAt,
      server_time: now,
      grace_period_hours: 72,
    };

    const canonicalPayload = canonicalJson(signedData);
    const signature = signPayload(canonicalPayload, privateKeyPem);

    // 9. Log success
    await db.execute({
      sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
            VALUES (?, ?, ?, ?, ?, 'validate', 200, 'Validated and signed successfully', ?)`,
      args: [
        "log_" + crypto.randomBytes(6).toString("hex"),
        license_key,
        matchedApp?.app_slug || null,
        hwid,
        ip,
        now,
      ],
    });

    res.json({
      ...signedData,
      signature,
      public_key: publicKeyPem,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Validation error" });
  }
});

// Ping Heartbeat
apiRouter.post("/v1/license/ping", async (req: Request, res: Response) => {
  try {
    const { license_key, hwid, app_name } = req.body;
    if (!license_key || !hwid) {
      res.status(400).json({ error: "license_key and hwid required" });
      return;
    }

    const db = getDbClient();
    const now = Date.now();

    const licRes = await db.execute({
      sql: "SELECT id, status, expires_at FROM licenses WHERE key = ? LIMIT 1",
      args: [license_key.trim().toUpperCase()],
    });

    if (licRes.rows.length === 0) {
      res.status(404).json({
        valid: false,
        code: "NOT_FOUND",
        message: "License not found",
      });
      return;
    }

    const license = licRes.rows[0];
    if (license.status !== "active") {
      res.status(403).json({
        valid: false,
        code: "LICENSE_INACTIVE",
        status: license.status,
        message: `License is ${license.status}`,
      });
      return;
    }

    if (license.expires_at && now > (license.expires_at as number)) {
      res.status(403).json({
        valid: false,
        code: "LICENSE_EXPIRED",
        status: "expired",
        message: "License has expired",
      });
      return;
    }

    // Check if device is still bound and active on this license
    const devCheck = await db.execute({
      sql: "SELECT id, status FROM devices WHERE license_id = ? AND hwid = ? LIMIT 1",
      args: [license.id as string, hwid],
    });

    if (devCheck.rows.length === 0 || devCheck.rows[0].status !== "active") {
      res.status(403).json({
        valid: false,
        code: "DEVICE_UNBOUND",
        message: "Device binding was logged out or unlinked by administrator",
      });
      return;
    }

    await db.execute({
      sql: "UPDATE devices SET last_ping_at = ? WHERE license_id = ? AND hwid = ?",
      args: [now, license.id as string, hwid],
    });

    res.json({
      valid: true,
      status: "active",
      server_time: now,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Ping failed" });
  }
});

// Logout / Deactivate device from client (Instant unbind to free device limit slot)
const handleLogoutOrDeactivate = async (req: Request, res: Response) => {
  try {
    const { license_key, hwid, app_name } = req.body;
    if (!license_key || !hwid) {
      res.status(400).json({ error: "license_key and hwid required" });
      return;
    }

    const db = getDbClient();
    const ip =
      req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
      req.socket.remoteAddress ||
      "127.0.0.1";
    const now = Date.now();

    const licRes = await db.execute({
      sql: "SELECT id FROM licenses WHERE key = ? LIMIT 1",
      args: [license_key.trim().toUpperCase()],
    });

    if (licRes.rows.length === 0) {
      res.status(404).json({ error: "License not found" });
      return;
    }

    const licId = licRes.rows[0].id as string;

    // Set device status to 'logged_out' so active device count frees up slot
    await db.execute({
      sql: "UPDATE devices SET status = 'logged_out', last_ping_at = ? WHERE license_id = ? AND hwid = ?",
      args: [now, licId, hwid],
    });

    // Log logout audit entry
    await db.execute({
      sql: `INSERT INTO validation_logs (id, license_key, app_slug, hwid, ip_address, action, status_code, message, created_at)
            VALUES (?, ?, ?, ?, ?, 'logout', 200, 'Device unbind / logout completed', ?)`,
      args: [
        "log_" + crypto.randomBytes(6).toString("hex"),
        license_key.trim().toUpperCase(),
        app_name || null,
        hwid,
        ip,
        now,
      ],
    });

    res.json({
      success: true,
      message: "Device logged out and HWID slot released successfully",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Logout failed" });
  }
};

apiRouter.post("/v1/license/logout", handleLogoutOrDeactivate);
apiRouter.post("/v1/license/deactivate", handleLogoutOrDeactivate);

// -------------------------------------------------------------
// SDK DOWNLOAD ENDPOINTS
// -------------------------------------------------------------

apiRouter.get("/sdk/download/python", (req: Request, res: Response) => {
  try {
    const sdkDir = path.resolve(process.cwd(), "SDK", "x_license_python");
    if (!fs.existsSync(sdkDir)) {
      res.status(404).json({ error: "Python SDK directory not found" });
      return;
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="x_license_python.zip"',
    );

    const ZipClass =
      (archiverModule as any).ZipArchive ||
      (archiverModule as any).default ||
      archiverModule;
    const archive =
      typeof ZipClass === "function" && ZipClass.prototype?.directory
        ? new ZipClass({ zlib: { level: 9 } })
        : (ZipClass as any)("zip", { zlib: { level: 9 } });

    archive.on("error", (err: any) => {
      res.status(500).send({ error: err.message });
    });

    archive.pipe(res);
    archive.directory(sdkDir, "x_license_python", (entry: any) => {
      if (
        entry.name &&
        (entry.name.includes("__pycache__") ||
          entry.name.endsWith(".pyc") ||
          entry.name.includes(".DS_Store"))
      ) {
        return false;
      }
      return entry;
    });
    archive.finalize();
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to download SDK" });
  }
});

// -------------------------------------------------------------
// STATS & AUDIT LOGS
// -------------------------------------------------------------

apiRouter.get(
  "/stats",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const db = getDbClient();

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

      res.json({
        totalApps: Number(sRow.total_apps || 0),
        totalLicenses: Number(sRow.total_licenses || 0),
        activeLicenses: Number(sRow.active_licenses || 0),
        expiredLicenses: Number(sRow.expired_licenses || 0),
        revokedLicenses: Number(sRow.revoked_licenses || 0),
        suspendedLicenses: Number(sRow.suspended_licenses || 0),
        activeDevices: Number(sRow.active_devices || 0),
        validations24h: Number(sRow.validations_24h || 0),
        serverTime: Date.now(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch stats" });
    }
  },
);

apiRouter.get(
  "/logs",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const db = getDbClient();
      const { limit = "100", offset = "0", action } = req.query;

      let query = "SELECT * FROM validation_logs WHERE 1=1";
      const args: any[] = [];

      if (action && typeof action === "string" && action !== "all") {
        query += " AND action = ?";
        args.push(action);
      }

      query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
      args.push(Number(limit), Number(offset));

      const result = await db.execute({ sql: query, args });

      res.json({ logs: result.rows });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch logs" });
    }
  },
);

apiRouter.delete(
  "/logs",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const db = getDbClient();
      await db.execute("DELETE FROM validation_logs");
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to clear logs" });
    }
  },
);

// -------------------------------------------------------------
// SETTINGS & STORAGE (CLOUDFLARE R2 & CRYPTO)
// -------------------------------------------------------------

apiRouter.get(
  "/settings",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const db = getDbClient();
      const configResult = await db.execute(
        "SELECT username, ed25519_public_key, r2_config_json, created_at FROM admin_config LIMIT 1",
      );

      if (configResult.rows.length === 0) {
        res.status(404).json({ error: "Config not found" });
        return;
      }

      const row = configResult.rows[0];
      let r2Config: Partial<R2Config> = {};
      if (row.r2_config_json) {
        try {
          const parsed = JSON.parse(row.r2_config_json as string);
          r2Config = {
            accountId: parsed.accountId || "",
            accessKeyId: parsed.accessKeyId || "",
            bucketName: parsed.bucketName || "",
            publicUrl: parsed.publicUrl || "",
            secretAccessKey: parsed.secretAccessKey ? "••••••••••••••••" : "",
          };
        } catch {
          // ignore
        }
      }

      res.json({
        username: row.username,
        publicKeyPem: row.ed25519_public_key,
        r2Config,
        hasTursoEnv: !isTursoPlaceholder(
          process.env.TURSO_DATABASE_URL,
          process.env.TURSO_AUTH_TOKEN,
        ),
        tursoUrl: !isTursoPlaceholder(
          process.env.TURSO_DATABASE_URL,
          process.env.TURSO_AUTH_TOKEN,
        )
          ? process.env.TURSO_DATABASE_URL || "file:vcon_data.db"
          : "file:vcon_data.db",
      });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to get settings" });
    }
  },
);

apiRouter.post(
  "/settings/r2",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl } =
        req.body;
      const db = getDbClient();

      let finalSecretKey = secretAccessKey;
      if (secretAccessKey === "••••••••••••••••" || !secretAccessKey) {
        const existing = await db.execute(
          "SELECT r2_config_json FROM admin_config LIMIT 1",
        );
        if (existing.rows.length > 0 && existing.rows[0].r2_config_json) {
          try {
            const parsed = JSON.parse(
              existing.rows[0].r2_config_json as string,
            );
            finalSecretKey = parsed.secretAccessKey;
          } catch {
            // ignore
          }
        }
      }

      const newR2Config: R2Config = {
        accountId: (accountId || "").trim(),
        accessKeyId: (accessKeyId || "").trim(),
        secretAccessKey: (finalSecretKey || "").trim(),
        bucketName: (bucketName || "").trim(),
        publicUrl: (publicUrl || "").trim(),
      };

      await db.execute({
        sql: "UPDATE admin_config SET r2_config_json = ?, updated_at = ?",
        args: [JSON.stringify(newR2Config), Date.now()],
      });

      res.json({ success: true, message: "R2 configuration saved" });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to save R2 config" });
    }
  },
);

apiRouter.post(
  "/settings/r2/test",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { accountId, accessKeyId, secretAccessKey, bucketName } = req.body;
      const db = getDbClient();

      let finalSecretKey = secretAccessKey;
      if (secretAccessKey === "••••••••••••••••" || !secretAccessKey) {
        const existing = await db.execute(
          "SELECT r2_config_json FROM admin_config LIMIT 1",
        );
        if (existing.rows.length > 0 && existing.rows[0].r2_config_json) {
          try {
            const parsed = JSON.parse(
              existing.rows[0].r2_config_json as string,
            );
            finalSecretKey = parsed.secretAccessKey;
          } catch {
            // ignore
          }
        }
      }

      const config: R2Config = {
        accountId: (accountId || "").trim(),
        accessKeyId: (accessKeyId || "").trim(),
        secretAccessKey: (finalSecretKey || "").trim(),
        bucketName: (bucketName || "").trim(),
      };

      const testResult = await testR2Connection(config);
      res.json(testResult);
    } catch (error: any) {
      res
        .status(500)
        .json({ success: false, message: error.message || "Test failed" });
    }
  },
);

apiRouter.get(
  "/r2/backups",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const db = getDbClient();
      const result = await db.execute(
        "SELECT * FROM r2_backups ORDER BY created_at DESC LIMIT 50",
      );
      res.json({ backups: result.rows });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to get backups" });
    }
  },
);

apiRouter.post(
  "/settings/crypto/rotate",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const keypair = generateRSAKeyPair(2048);
      const db = getDbClient();

      await db.execute({
        sql: "UPDATE admin_config SET ed25519_private_key = ?, ed25519_public_key = ?, updated_at = ?",
        args: [keypair.privateKeyPem, keypair.publicKeyPem, Date.now()],
      });

      res.json({
        success: true,
        publicKeyPem: keypair.publicKeyPem,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Key rotation failed" });
    }
  },
);

// -------------------------------------------------------------
// SITE SETTINGS & BRANDING CONTROL
// -------------------------------------------------------------

const DEFAULT_SITE_SETTINGS = {
  siteName: "LicenX",
  siteTagline: "Enterprise Software Licensing & Hardware Authorization Engine",
  siteTitle: "LicenX – Software Licensing & Device Verification Engine",
  metaDescription:
    "High-security RSA-2048 licensed distribution platform with hardware device fingerprinting and self-service device control.",
  logoUrl: "",
  faviconUrl: "",
  ogImageUrl: "",
  footerText:
    "© 2026 LicenX Open-Source Licensing Engine. All rights reserved.",
  supportEmail: "support@vcon.local",
  telegramUrl: "",
  discordUrl: "",
  docsUrl: "",
  buyLicenseUrl: "#",
  allowPublicCheck: true,
  allowPublicReset: true,
  noticeBanner: "",
  noticeBannerEnabled: false,
};

// Public endpoint for site settings (Accessible by user landing page, no auth needed)
apiRouter.get("/public/site-settings", async (req: Request, res: Response) => {
  try {
    const db = getDbClient();
    const configRes = await db.execute(
      "SELECT site_settings_json FROM admin_config LIMIT 1",
    );
    let siteSettings = { ...DEFAULT_SITE_SETTINGS };

    if (configRes.rows.length > 0 && configRes.rows[0].site_settings_json) {
      try {
        const parsed = JSON.parse(
          configRes.rows[0].site_settings_json as string,
        );
        siteSettings = { ...siteSettings, ...parsed };
      } catch {
        // ignore parse error
      }
    }

    res.json(siteSettings);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Failed to fetch public site settings" });
  }
});

// Admin endpoint to get full site settings + R2 configuration status
apiRouter.get(
  "/settings/site",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const db = getDbClient();
      const configRes = await db.execute(
        "SELECT site_settings_json, r2_config_json FROM admin_config LIMIT 1",
      );
      let siteSettings = { ...DEFAULT_SITE_SETTINGS };
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
            r2Configured = Boolean(
              r2.accountId &&
              r2.accessKeyId &&
              r2.secretAccessKey &&
              r2.bucketName,
            );
          } catch {}
        }
      }

      res.json({ siteSettings, r2Configured });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to fetch site settings" });
    }
  },
);

// Admin endpoint to update site settings
apiRouter.post(
  "/settings/site",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const db = getDbClient();
      const configRes = await db.execute(
        "SELECT site_settings_json FROM admin_config LIMIT 1",
      );
      let existingSettings = { ...DEFAULT_SITE_SETTINGS };

      if (configRes.rows.length > 0 && configRes.rows[0].site_settings_json) {
        try {
          existingSettings = {
            ...existingSettings,
            ...JSON.parse(configRes.rows[0].site_settings_json as string),
          };
        } catch {}
      }

      const updatedSettings = {
        ...existingSettings,
        ...req.body,
      };

      const jsonStr = JSON.stringify(updatedSettings);
      await db.execute({
        sql: "UPDATE admin_config SET site_settings_json = ?, updated_at = ?",
        args: [jsonStr, Date.now()],
      });

      res.json({ success: true, siteSettings: updatedSettings });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to save site settings" });
    }
  },
);

// Admin endpoint to upload site assets (Logo, Favicon, OG-image) to Cloudflare R2
apiRouter.post(
  "/settings/upload",
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const {
        filename,
        contentType = "image/png",
        dataBase64,
        folder = "branding",
      } = req.body;
      if (!dataBase64) {
        res.status(400).json({ error: "Missing file data" });
        return;
      }

      const db = getDbClient();
      const configRes = await db.execute(
        "SELECT r2_config_json FROM admin_config LIMIT 1",
      );
      if (configRes.rows.length === 0 || !configRes.rows[0].r2_config_json) {
        res.status(400).json({
          error:
            "Cloudflare R2 is not configured. Please configure your R2 credentials in the Storage & DB tab to enable asset uploads.",
        });
        return;
      }

      const r2Config: R2Config = JSON.parse(
        configRes.rows[0].r2_config_json as string,
      );
      if (
        !r2Config.accountId ||
        !r2Config.accessKeyId ||
        !r2Config.secretAccessKey ||
        !r2Config.bucketName
      ) {
        res.status(400).json({
          error:
            "Incomplete R2 credentials. Please verify your R2 configuration in Storage & DB.",
        });
        return;
      }

      const cleanExt = (filename || "asset.png").split(".").pop() || "png";
      const cleanName = (filename || "image")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .substring(0, 32);
      const key = `${folder}/${Date.now()}_${cleanName}.${cleanExt}`;

      const rawBase64 = dataBase64.replace(
        /^data:image\/[a-zA-Z+]+;base64,/,
        "",
      );
      const buffer = Buffer.from(rawBase64, "base64");
      const uploadRes = await uploadToR2(r2Config, key, buffer, contentType);

      if (!uploadRes.success) {
        res.status(500).json({
          error: uploadRes.error || "Failed to upload image to Cloudflare R2",
        });
        return;
      }

      res.json({
        success: true,
        url: uploadRes.url || uploadRes.signedUrl,
        signedUrl: uploadRes.signedUrl,
        key,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Upload failed" });
    }
  },
);

// Public Asset / S3 Storage Proxy (Permanent Non-Expiring Serving)
apiRouter.get(
  ["/public/assets/*", "/storage/file/*"],
  async (req: Request, res: Response) => {
    try {
      const fullPath = req.path;
      let assetKey = fullPath.replace(
        /^\/(public\/assets|storage\/file)\//,
        "",
      );
      try {
        assetKey = decodeURIComponent(assetKey);
      } catch {
        // ignore
      }

      if (
        !assetKey ||
        assetKey.includes("..") ||
        assetKey.startsWith("/") ||
        assetKey.startsWith("\\")
      ) {
        res.status(400).json({ error: "Invalid asset path" });
        return;
      }

      const db = getDbClient();
      const configRes = await db.execute(
        "SELECT r2_config_json FROM admin_config LIMIT 1",
      );
      if (configRes.rows.length === 0 || !configRes.rows[0].r2_config_json) {
        res.status(404).json({ error: "Cloudflare R2 storage not configured" });
        return;
      }

      const r2Config: R2Config = JSON.parse(
        configRes.rows[0].r2_config_json as string,
      );
      const fileRes = await getR2Object(r2Config, assetKey);
      if (!fileRes.success || !fileRes.data) {
        res.status(404).json({ error: fileRes.error || "Asset not found" });
        return;
      }

      res.setHeader(
        "Content-Type",
        fileRes.contentType || "application/octet-stream",
      );
      res.setHeader(
        "Cache-Control",
        "public, max-age=604800, stale-while-revalidate=86400",
      );
      res.send(Buffer.from(fileRes.data));
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch asset" });
    }
  },
);

