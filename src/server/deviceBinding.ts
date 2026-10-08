import type { Client, Transaction } from "@libsql/client";

type ReactivationLimitPolicy = "all-inactive" | "logged-out-only";
const MAX_TRANSACTION_ATTEMPTS = 12;

interface BindDeviceParams {
  db: Client;
  licenseId: string;
  hwid: string;
  deviceId: string;
  deviceName: string;
  osInfo: string;
  ipAddress: string;
  now: number;
  deviceLimit: number;
  reactivationLimitPolicy: ReactivationLimitPolicy;
  rejectBlocked: boolean;
}

export type BindDeviceResult =
  | {
      status: "bound";
      existingDevice: boolean;
      activeDevicesCount: number;
      boundDevicesCount: number;
    }
  | {
      status: "limit";
      existingDevice: boolean;
      activeDevicesCount: number;
      deviceLimit: number;
    }
  | { status: "blocked" };

export function bindDeviceWithinLimit(
  params: BindDeviceParams & { rejectBlocked: false },
): Promise<Exclude<BindDeviceResult, { status: "blocked" }>>;
export function bindDeviceWithinLimit(
  params: BindDeviceParams & { rejectBlocked: true },
): Promise<BindDeviceResult>;
export function bindDeviceWithinLimit(
  params: BindDeviceParams,
): Promise<BindDeviceResult>;
export async function bindDeviceWithinLimit({
  db,
  licenseId,
  hwid,
  deviceId,
  deviceName,
  osInfo,
  ipAddress,
  now,
  deviceLimit,
  reactivationLimitPolicy,
  rejectBlocked,
}: BindDeviceParams): Promise<BindDeviceResult> {
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt++) {
    let transaction: Transaction | undefined;

    try {
      transaction = await db.transaction("write");
      const existingResult = await transaction.execute({
        sql: "SELECT id, status FROM devices WHERE license_id = ? AND hwid = ? LIMIT 1",
        args: [licenseId, hwid],
      });
      const countResult = await transaction.execute({
        sql: "SELECT COUNT(*) AS active_count FROM devices WHERE license_id = ? AND status = 'active'",
        args: [licenseId],
      });

      const existingDevice = existingResult.rows[0];
      const existingStatus = existingDevice?.status as string | undefined;
      const activeDevicesCount = Number(countResult.rows[0]?.active_count || 0);

      if (rejectBlocked && existingStatus === "blocked") {
        await transaction.rollback();
        return { status: "blocked" };
      }

      const wasActive = existingStatus === "active";
      const shouldCheckLimit =
        !existingDevice ||
        (!wasActive &&
          (reactivationLimitPolicy === "all-inactive" ||
            existingStatus === "logged_out"));

      if (
        shouldCheckLimit &&
        deviceLimit !== -1 &&
        activeDevicesCount >= deviceLimit
      ) {
        await transaction.rollback();
        return {
          status: "limit",
          existingDevice: Boolean(existingDevice),
          activeDevicesCount,
          deviceLimit,
        };
      }

      if (existingDevice) {
        await transaction.execute({
          sql: "UPDATE devices SET status = 'active', last_ping_at = ?, device_name = ?, os_info = ?, ip_address = ? WHERE id = ?",
          args: [
            now,
            deviceName,
            osInfo,
            ipAddress,
            existingDevice.id as string,
          ],
        });
      } else {
        await transaction.execute({
          sql: `INSERT INTO devices (id, license_id, hwid, device_name, os_info, ip_address, first_bound_at, last_ping_at, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
          args: [
            deviceId,
            licenseId,
            hwid,
            deviceName,
            osInfo,
            ipAddress,
            now,
            now,
          ],
        });
      }

      await transaction.commit();
      return {
        status: "bound",
        existingDevice: Boolean(existingDevice),
        activeDevicesCount,
        boundDevicesCount: wasActive
          ? activeDevicesCount
          : activeDevicesCount + 1,
      };
    } catch (error) {
      if (transaction) await transaction.rollback();
      if (
        !isTransientLockError(error) ||
        attempt === MAX_TRANSACTION_ATTEMPTS - 1
      ) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          (attempt + 1) * 10 + Math.floor(Math.random() * 10),
        ),
      );
    } finally {
      transaction?.close();
    }
  }

  throw new Error("Device binding transaction retry limit reached");
}

function isTransientLockError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  const code = error.code;
  return (
    typeof code === "string" &&
    (code.startsWith("SQLITE_BUSY") || code.startsWith("SQLITE_LOCKED"))
  );
}
