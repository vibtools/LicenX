import { getDbClient, initDatabaseSchema } from "../src/server/db.js";

const apps = [
  {
    id: 'app_vcon_default',
    app_slug: 'vcon_default',
    display_name: 'VCON Default Suite',
    min_version: '1.0.0',
    status: 'active',
    app_secret: 'sec_1172c0ff41f9c93b9f99c6d412b86401',
    description: 'Default core application suite',
    created_at: 1791403629503,
    updated_at: 1791403629503,
    device_lease_seconds: 7200,
    ping_interval_seconds: 1200,
    offline_grace_seconds: 0
  },
  {
    id: 'app_14c4c263843d9069',
    app_slug: 'testapp',
    display_name: 'testapp',
    min_version: '1.0.0',
    status: 'active',
    app_secret: 'sec_f30b2b34c8c152c5056682865abb0679',
    description: 'testapp',
    created_at: 1792016921116,
    updated_at: 1792029363481,
    device_lease_seconds: 7200,
    ping_interval_seconds: 1200,
    offline_grace_seconds: 0
  },
  {
    id: 'app_16cf955656302556',
    app_slug: 'goldmailer',
    display_name: 'Gold Mailer',
    min_version: '1.0.0',
    status: 'active',
    app_secret: 'sec_dae53a7465966136ae00f620d5c6c7f4',
    description: 'GoldMailer runner app license syetm',
    created_at: 1792049502601,
    updated_at: 1792049502601,
    device_lease_seconds: 7200,
    ping_interval_seconds: 1200,
    offline_grace_seconds: 0
  },
  {
    id: 'app_c3a2692defa44622',
    app_slug: 'gmmailer',
    display_name: 'GM Mailer',
    min_version: '1.0.0',
    status: 'active',
    app_secret: 'sec_23a3b7e5b9ae0af9bf71fe3bdcebb540',
    description: 'GM Mailer license',
    created_at: 1792059962776,
    updated_at: 1792059962776,
    device_lease_seconds: 7200,
    ping_interval_seconds: 1200,
    offline_grace_seconds: 0
  }
];

const licenses = [
  {
    id: 'lic_4b8b315cf30ff2ae',
    key: 'VCON-GZ79-5YZ7-5YBM',
    status: 'active',
    tier: 'Standard',
    device_limit: 1,
    validity_type: 'daily',
    validity_value: 30,
    activated_at: 1792018119254,
    expires_at: 1794610119254,
    created_at: 1792017026044,
    customer_name: null,
    customer_email: null,
    notes: null,
    metadata_json: null,
    r2_backup_id: null,
    app_id: 'app_14c4c263843d9069',
    pin: '2996'
  },
  {
    id: 'lic_bf2262de95aeca50',
    key: 'VCON-W7L4-B7MX-JSVB',
    status: 'revoked',
    tier: 'Standard',
    device_limit: 1,
    validity_type: 'hourly',
    validity_value: 5,
    activated_at: 1792017059896,
    expires_at: 1792035059896,
    created_at: 1792017046387,
    customer_name: null,
    customer_email: null,
    notes: '',
    metadata_json: null,
    r2_backup_id: null,
    app_id: 'app_14c4c263843d9069',
    pin: '7194'
  },
  {
    id: 'lic_515278bc43331f10',
    key: 'TEST-7BUB-MZQP-2REE',
    status: 'active',
    tier: 'Standard',
    device_limit: 1,
    validity_type: 'hourly',
    validity_value: 30,
    activated_at: 1792017527702,
    expires_at: 1792125527702,
    created_at: 1792017317256,
    customer_name: null,
    customer_email: null,
    notes: null,
    metadata_json: null,
    r2_backup_id: null,
    app_id: 'app_14c4c263843d9069',
    pin: '3152'
  },
  {
    id: 'lic_cc01957a61fecdee',
    key: 'GOLD-K4ZJ-DDUN-GPWF',
    status: 'active',
    tier: 'Standard',
    device_limit: 1,
    validity_type: 'hourly',
    validity_value: 12,
    activated_at: 1792058081406,
    expires_at: 1792101281406,
    created_at: 1792055527366,
    customer_name: null,
    customer_email: null,
    notes: null,
    metadata_json: null,
    r2_backup_id: null,
    app_id: 'app_16cf955656302556',
    pin: '1607'
  },
  {
    id: 'lic_79666a9dd32e6771',
    key: 'VCON-47DN-TFEK-WB6Y',
    status: 'active',
    tier: 'Standard',
    device_limit: 1,
    validity_type: 'hourly',
    validity_value: 12,
    activated_at: 1792074590640,
    expires_at: 1792117790640,
    created_at: 1792068353094,
    customer_name: null,
    customer_email: null,
    notes: null,
    metadata_json: null,
    r2_backup_id: null,
    app_id: 'app_c3a2692defa44622',
    pin: '8291'
  },
  {
    id: 'lic_c9452d02250b20d3',
    key: 'GM-FM4F-VGTF-GZ95',
    status: 'active',
    tier: 'Standard',
    device_limit: 1,
    validity_type: 'hourly',
    validity_value: 1,
    activated_at: 1792140706294,
    expires_at: 1792144306294,
    created_at: 1792140399482,
    customer_name: null,
    customer_email: null,
    notes: null,
    metadata_json: null,
    r2_backup_id: null,
    app_id: 'app_c3a2692defa44622',
    pin: '8569'
  },
  {
    id: 'lic_713e2e438d1365ea',
    key: 'GM8-TS4A-CSSN-X5HA',
    status: 'active',
    tier: 'Standard',
    device_limit: 1,
    validity_type: 'hourly',
    validity_value: 12,
    activated_at: null,
    expires_at: null,
    created_at: 1792143728781,
    customer_name: null,
    customer_email: null,
    notes: 'Ovinas 8 license key',
    metadata_json: null,
    r2_backup_id: null,
    app_id: 'app_c3a2692defa44622',
    pin: '5540'
  },
  {
    id: 'lic_cb0c31b6a6b9f522',
    key: 'GM8-68JM-Y9RF-XC97',
    status: 'active',
    tier: 'Standard',
    device_limit: 1,
    validity_type: 'hourly',
    validity_value: 12,
    activated_at: null,
    expires_at: null,
    created_at: 1792143728781,
    customer_name: null,
    customer_email: null,
    notes: 'Ovinas 8 license key',
    metadata_json: null,
    r2_backup_id: null,
    app_id: 'app_c3a2692defa44622',
    pin: '5540'
  },
  {
    id: 'lic_6e319868a69a3996',
    key: 'GM8-V2M6-B4VG-QST4',
    status: 'active',
    tier: 'Standard',
    device_limit: 1,
    validity_type: 'hourly',
    validity_value: 12,
    activated_at: null,
    expires_at: null,
    created_at: 1792143728781,
    customer_name: null,
    customer_email: null,
    notes: 'Ovinas 8 license key',
    metadata_json: null,
    r2_backup_id: null,
    app_id: 'app_c3a2692defa44622',
    pin: '5540'
  },
  {
    id: 'lic_3b1a04297fe7b434',
    key: 'GM8-3W4E-DZEY-9CWQ',
    status: 'active',
    tier: 'Standard',
    device_limit: 1,
    validity_type: 'hourly',
    validity_value: 12,
    activated_at: null,
    expires_at: null,
    created_at: 1792143728781,
    customer_name: null,
    customer_email: null,
    notes: 'Ovinas 8 license key',
    metadata_json: null,
    r2_backup_id: null,
    app_id: 'app_c3a2692defa44622',
    pin: '5540'
  },
  {
    id: 'lic_1085e401fb6d8dbc',
    key: 'GM8-AJL2-4FCT-6ZYH',
    status: 'active',
    tier: 'Standard',
    device_limit: 1,
    validity_type: 'hourly',
    validity_value: 12,
    activated_at: null,
    expires_at: null,
    created_at: 1792143728781,
    customer_name: null,
    customer_email: null,
    notes: 'Ovinas 8 license key',
    metadata_json: null,
    r2_backup_id: null,
    app_id: 'app_c3a2692defa44622',
    pin: '5540'
  },
  {
    id: 'lic_cd85421d4ff7ef01',
    key: 'GM8-9QDD-CPMW-Z2HP',
    status: 'active',
    tier: 'Standard',
    device_limit: 1,
    validity_type: 'hourly',
    validity_value: 12,
    activated_at: null,
    expires_at: null,
    created_at: 1792143728781,
    customer_name: null,
    customer_email: null,
    notes: 'Ovinas 8 license key',
    metadata_json: null,
    r2_backup_id: null,
    app_id: 'app_c3a2692defa44622',
    pin: '5540'
  },
  {
    id: 'lic_342573cc29cca898',
    key: 'GM8-VZJX-SWGQ-FVQE',
    status: 'active',
    tier: 'Standard',
    device_limit: 1,
    validity_type: 'hourly',
    validity_value: 12,
    activated_at: null,
    expires_at: null,
    created_at: 1792143728781,
    customer_name: null,
    customer_email: null,
    notes: 'Ovinas 8 license key',
    metadata_json: null,
    r2_backup_id: null,
    app_id: 'app_c3a2692defa44622',
    pin: '5540'
  },
  {
    id: 'lic_7c90891a384a10bc',
    key: 'GM8-2F9J-G9AW-ZRRU',
    status: 'active',
    tier: 'Standard',
    device_limit: 1,
    validity_type: 'hourly',
    validity_value: 12,
    activated_at: null,
    expires_at: null,
    created_at: 1792143728781,
    customer_name: null,
    customer_email: null,
    notes: 'Ovinas 8 license key',
    metadata_json: null,
    r2_backup_id: null,
    app_id: 'app_c3a2692defa44622',
    pin: '5540'
  }
];

export async function restoreAll() {
  await initDatabaseSchema();
  const db = getDbClient();

  console.log("Restoring applications...");
  for (const app of apps) {
    await db.execute({
      sql: `INSERT OR REPLACE INTO apps (id, app_slug, display_name, min_version, status, app_secret, description, created_at, updated_at, device_lease_seconds, ping_interval_seconds, offline_grace_seconds)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        app.id,
        app.app_slug,
        app.display_name,
        app.min_version,
        app.status,
        app.app_secret,
        app.description,
        app.created_at,
        app.updated_at,
        app.device_lease_seconds,
        app.ping_interval_seconds,
        app.offline_grace_seconds
      ]
    });
  }

  console.log("Restoring licenses...");
  for (const lic of licenses) {
    await db.execute({
      sql: `INSERT OR REPLACE INTO licenses (id, key, status, tier, app_id, device_limit, validity_type, validity_value, activated_at, expires_at, created_at, customer_name, customer_email, notes, metadata_json, r2_backup_id, pin)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        lic.id,
        lic.key,
        lic.status,
        lic.tier,
        lic.app_id,
        lic.device_limit,
        lic.validity_type,
        lic.validity_value,
        lic.activated_at,
        lic.expires_at,
        lic.created_at,
        lic.customer_name,
        lic.customer_email,
        lic.notes,
        lic.metadata_json,
        lic.r2_backup_id,
        lic.pin
      ]
    });
  }

  const appCount = await db.execute("SELECT COUNT(*) as c FROM apps");
  const licCount = await db.execute("SELECT COUNT(*) as c FROM licenses");
  console.log(`Successfully restored ${appCount.rows[0].c} apps and ${licCount.rows[0].c} licenses!`);
}

if (process.argv[1]?.endsWith('restoreData.mjs')) {
  restoreAll().catch(console.error);
}
