import pool from "../../lib/db.js";

const BATCH_SIZE = 500;

function extractDeviceId(raw) {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const payload =
    parsed?.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)
      ? parsed.data
      : parsed;

  const value = payload?.device_id;
  if (value == null) return null;

  const deviceId = Number(value);
  return Number.isInteger(deviceId) ? deviceId : null;
}

async function getRowsMissingDeviceId() {
  const { rows } = await pool.query(
    `SELECT id, data
     FROM sensor_readings
     WHERE device_id IS NULL
       AND data IS NOT NULL
     ORDER BY id ASC`
  );
  return rows;
}

async function applyUpdates(updates) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);

      await client.query(
        `UPDATE sensor_readings AS r
         SET device_id = v.device_id
         FROM (
           SELECT unnest($1::bigint[]) AS id,
                  unnest($2::int[]) AS device_id
         ) AS v
         WHERE r.id = v.id`,
        [batch.map((u) => u.id), batch.map((u) => u.deviceId)]
      );

      console.log(`  updated ${Math.min(i + batch.length, updates.length)}/${updates.length}`);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function run() {
  const rows = await getRowsMissingDeviceId();
  console.log(`${rows.length} row(s) with a missing device_id`);

  if (rows.length === 0) return;

  const updates = [];
  const skipped = [];

  for (const row of rows) {
    let deviceId = null;

    try {
      deviceId = extractDeviceId(row.data);
    } catch {
      deviceId = null;
    }

    if (deviceId == null) skipped.push(row.id);
    else updates.push({ id: row.id, deviceId });
  }

  const perDevice = updates.reduce((acc, { deviceId }) => {
    acc[deviceId] = (acc[deviceId] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Resolved ${updates.length}, skipped ${skipped.length}`);
  for (const [deviceId, count] of Object.entries(perDevice)) {
    console.log(`  device ${deviceId}: ${count} row(s)`);
  }

  if (skipped.length > 0) {
    const preview = skipped.slice(0, 20).join(", ");
    const suffix = skipped.length > 20 ? `, ... (${skipped.length - 20} more)` : "";
    console.log(`Skipped ids: ${preview}${suffix}`);
  }

  if (updates.length > 0) await applyUpdates(updates);
}

try {
  await run();
  console.log("Done.");
} catch (err) {
  console.error("Device id backfill failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
