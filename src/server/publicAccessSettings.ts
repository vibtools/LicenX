import type { Client } from "@libsql/client";

export type PublicAccessSetting = "allowPublicCheck" | "allowPublicReset";

export async function isPublicAccessEnabled(
  db: Client,
  setting: PublicAccessSetting,
): Promise<boolean> {
  const result = await db.execute(
    "SELECT site_settings_json FROM admin_config LIMIT 1",
  );
  const settingsJson = result.rows[0]?.site_settings_json;
  if (typeof settingsJson !== "string" || !settingsJson) return true;

  let settings: unknown;
  try {
    settings = JSON.parse(settingsJson);
  } catch {
    return true;
  }

  if (typeof settings !== "object" || settings === null) return true;
  const value = (settings as Record<string, unknown>)[setting];
  return typeof value === "boolean" ? value : true;
}
