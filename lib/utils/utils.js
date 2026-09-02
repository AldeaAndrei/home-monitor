import pool from "@/lib/db";
import { INTERVAL_MAP } from "@/constants";

export async function getDataByRange(deviceId, range = INTERVAL_MAP[0]) {
  const intervalValue = INTERVAL_MAP[range];

  if (!intervalValue) {
    throw new Error("Invalid range");
  }

  const query = `
      SELECT id, created_at, data
      FROM sensor_readings
      WHERE created_at >= NOW() - INTERVAL '${intervalValue}'
        AND data IS NOT NULL
        AND (data::jsonb)->>'device_id' = $1
      ORDER BY created_at DESC;
    `;

  const { rows } = await pool.query(query, [String(deviceId)]);

  return rows.map((row) => {
    const parsed = typeof row.data === "string" ? JSON.parse(row.data) : row.data;

    const flatData = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value ?? null]));

    return {
      created_at: row.created_at,
      ...flatData,
    };
  });
}

export async function getLastDeviceReading(deviceId, deviceType) {
  const query = `
    SELECT id, created_at, data
    FROM sensor_readings
    WHERE data IS NOT NULL
      AND (data::jsonb)->>'device_id' = $1
      -- AND (data::jsonb)->>'device_type' = $2
    ORDER BY created_at DESC
    LIMIT 1
  `;

  // const { rows } = await pool.query(query, [String(deviceId), deviceType]);
  const { rows } = await pool.query(query, [String(deviceId)]);

  if (rows.length === 0) return null;

  const row = rows[0];

  return {
    ...row,
    data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
  };
}

export async function getDevices() {
  const query = `
    SELECT *
    FROM sensor_config
    ORDER BY created_at ASC
  `;

  const { rows } = await pool.query(query);

  const lastReading = await getLastDeviceReading(rows[0].id);

  return rows.map((row) => ({
    id: row.id,
    board: row.board,
    name: row.name,
    fields: row.fields,
    last_seen_at: lastReading?.created_at,
  }));
}

export async function getDeviceConfig(deviceId) {
  const query = `
    SELECT *
    FROM sensor_config
    WHERE id = $1
  `;

  const { rows } = await pool.query(query, [String(deviceId)]);

  if (rows.length === 0) return null;

  const row = rows[0];

  return {
    id: row.id,
    board: row.board,
    name: row.name,
    fields: row.fields,
  };
}

export async function getDataSummaryForDevice(deviceId) {
  const { rows } = await pool.query(
    `SELECT id, created_at, date, fields
     FROM sensor_summary
     WHERE device_id = $1
     ORDER BY date DESC`,
    [String(deviceId)]
  );

  return {
    deviceId: String(deviceId),
    summaries: rows.map((row) => {
      const fields =
        typeof row.fields === "string" ? JSON.parse(row.fields) : row.fields;

      return {
        id: row.id,
        date:
          row.date instanceof Date
            ? row.date.toISOString().slice(0, 10)
            : String(row.date).slice(0, 10),
        created_at: row.created_at,
        compared_to: fields?.compared_to ?? null,
        sensors: fields?.sensors ?? [],
      };
    }),
  };
}
