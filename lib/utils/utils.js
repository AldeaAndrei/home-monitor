import pool from "@/lib/db";
import { unstable_cache } from "next/cache";

export const getLast48hData = unstable_cache(
  async (deviceId) => {
    const query = `
      SELECT id, created_at, data
      FROM sensor_readings
      WHERE created_at >= NOW() - INTERVAL '48 hours'
        AND data IS NOT NULL
        AND (data::jsonb)->>'device_id' = $1
      ORDER BY created_at DESC
      LIMIT 40;
    `;

    const { rows } = await pool.query(query, [String(deviceId)]);

    return rows.map((row) => ({
      ...row,
      data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
    }));
  },
  (deviceId) => ["sensor-data-last-48h", deviceId],
  {
    revalidate: 25 * 60,
  }
);

export async function getLastDeviceReading(deviceId, deviceType) {
  const query = `
    SELECT id, created_at, data
    FROM sensor_readings
    WHERE data IS NOT NULL
      AND (data::jsonb)->>'device_id' = $1
      AND (data::jsonb)->>'device_type' = $2
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const { rows } = await pool.query(query, [String(deviceId), deviceType]);

  if (rows.length === 0) return null;

  const row = rows[0];

  return {
    ...row,
    data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
  };
}

export async function getDevices() {
  const query = `
    SELECT
      (data::jsonb)->>'device_id'   AS device_id,
      (data::jsonb)->>'device_type' AS device_type,
      MAX(created_at)               AS last_seen_at
    FROM sensor_readings
    WHERE data IS NOT NULL
    GROUP BY
      (data::jsonb)->>'device_id',
      (data::jsonb)->>'device_type'
    ORDER BY last_seen_at DESC
  `;

  const { rows } = await pool.query(query);

  return rows.map((row) => ({
    device_id: row.device_id,
    device_type: row.device_type,
    last_seen_at: row.last_seen_at,
  }));
}
