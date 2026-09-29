import pool from "../../lib/db.js";
import { AI_MODEL, PLANT_TYPE, TIME_ZONE, runPlantAgent } from "./plantAgent.js";

const AI_ENABLED = true;
const CONTEXT_SEGMENTS = 4;
const DEFAULT_ACTIONS = ["water", "fan", "shade"];

const SEGMENTS = [
  { name: "night", startHour: 0, endHour: 6 },
  { name: "morning", startHour: 6, endHour: 12 },
  { name: "afternoon", startHour: 12, endHour: 18 },
  { name: "evening", startHour: 18, endHour: 24 },
];

function parseRowData(raw) {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const payload =
    parsed?.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)
      ? parsed.data
      : parsed;

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, value ?? null])
  );
}

function parseJsonColumn(value) {
  if (value == null) return null;
  return typeof value === "string" ? JSON.parse(value) : value;
}

function toIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toDateString(value) {
  if (value instanceof Date) {
    return toIsoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  return String(value).slice(0, 10);
}

function isDateArg(arg) {
  return /^\d{4}-\d{2}-\d{2}$/.test(arg) || /^\d{2}-\d{2}-\d{4}$/.test(arg);
}

function parseDateArg(arg) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) return arg;

  const ddMmYyyy = arg.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddMmYyyy) {
    const [, day, month, year] = ddMmYyyy.map(Number);
    return toIsoDate(year, month, day);
  }

  throw new Error(`Invalid date "${arg}". Use YYYY-MM-DD or DD-MM-YYYY.`);
}

function addDays(dateStr, days) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

function localDateTimeParts(instant = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

// The segment that just ended is the one closing at the most recent boundary
// at or before local now. Tolerates a late run by up to a full segment.
function resolveLastEndedSegment(instant = new Date()) {
  const { date, hour } = localDateTimeParts(instant);
  const boundary = Math.floor(hour / 6) * 6;

  if (boundary === 0) {
    return { date: addDays(date, -1), segment: SEGMENTS[SEGMENTS.length - 1] };
  }

  return { date, segment: SEGMENTS.find((segment) => segment.endHour === boundary) };
}

function percentDelta(previous, current) {
  if (previous == null || current == null || previous === 0) return null;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2));
}

function fieldStats(readings, field) {
  const values = readings
    .map((reading) => reading[field])
    .filter((value) => typeof value === "number" && !Number.isNaN(value));

  if (values.length === 0) return null;

  const sum = values.reduce((acc, value) => acc + value, 0);

  return {
    avg: Number((sum / values.length).toFixed(2)),
    min: Number(Math.min(...values).toFixed(2)),
    max: Number(Math.max(...values).toFixed(2)),
    readings_count: values.length,
  };
}

async function getDeviceConfigs() {
  const { rows } = await pool.query(
    "SELECT id, name, fields, allowed_actions, use_ai FROM sensor_config ORDER BY id ASC"
  );
  return rows;
}

// Postgres owns the local-to-UTC conversion so DST transitions resolve correctly.
async function getSegmentBounds(date, segment) {
  const { rows } = await pool.query(
    `SELECT ($1::date + ($2 || ' hours')::interval) AT TIME ZONE $4 AS starts_at,
            ($1::date + ($3 || ' hours')::interval) AT TIME ZONE $4 AS ends_at`,
    [date, String(segment.startHour), String(segment.endHour), TIME_ZONE]
  );
  return rows[0];
}

async function getReadingsForSegment(deviceId, startsAt, endsAt) {
  const { rows } = await pool.query(
    `SELECT created_at, data
     FROM sensor_readings
     WHERE device_id = $1
       AND created_at >= $2
       AND created_at < $3
       AND data IS NOT NULL
     ORDER BY created_at ASC`,
    [Number(deviceId), startsAt, endsAt]
  );

  return rows.map((row) => ({
    created_at: row.created_at,
    ...parseRowData(row.data),
  }));
}

async function getPreviousSummaries(deviceId, startsAt) {
  const { rows } = await pool.query(
    `SELECT date, timeframe, fields, ai_summary
     FROM sensor_summary
     WHERE device_id = $1
       AND starts_at < $2
     ORDER BY starts_at DESC
     LIMIT $3`,
    [deviceId, startsAt, CONTEXT_SEGMENTS]
  );

  return rows
    .map((row) => ({
      date: toDateString(row.date),
      timeframe: row.timeframe,
      sensors: parseJsonColumn(row.fields)?.sensors ?? [],
      ai_summary: parseJsonColumn(row.ai_summary),
    }))
    .reverse();
}

function resolveAllowedActions(device) {
  const configured = device.allowed_actions;
  return Array.isArray(configured) && configured.length > 0 ? configured : DEFAULT_ACTIONS;
}

async function saveSummary({
  deviceId,
  date,
  segment,
  startsAt,
  endsAt,
  comparedTo,
  sensors,
  aiSummary,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `DELETE FROM sensor_actions
       WHERE summary_id IN (
         SELECT id FROM sensor_summary
         WHERE device_id = $1
           AND starts_at = $2
       )`,
      [deviceId, startsAt]
    );

    await client.query(
      `DELETE FROM sensor_summary
       WHERE device_id = $1
         AND starts_at = $2`,
      [deviceId, startsAt]
    );

    const { rows: inserted } = await client.query(
      `INSERT INTO sensor_summary
         (device_id, date, timeframe, starts_at, ends_at, fields, ai_summary)
       VALUES ($1, $2::date, $3, $4, $5, $6::json, $7::json)
       RETURNING id`,
      [
        deviceId,
        date,
        segment.name,
        startsAt,
        endsAt,
        JSON.stringify({
          compared_to: comparedTo,
          sensors,
        }),
        aiSummary ? JSON.stringify(aiSummary) : null,
      ]
    );

    const summaryId = inserted[0].id;

    // Device polls sensor_actions for unused rows; empty lists are not queued.
    const pendingActions = Array.isArray(aiSummary?.actions) ? aiSummary.actions : [];
    if (pendingActions.length > 0) {
      await client.query(
        `INSERT INTO sensor_actions (device_id, summary_id, actions, used)
         VALUES ($1, $2, $3::jsonb, false)`,
        [deviceId, summaryId, JSON.stringify(pendingActions)]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function summarizeSegment(device, date, segment, bounds) {
  const { starts_at: startsAt, ends_at: endsAt } = bounds;

  const readings = await getReadingsForSegment(device.id, startsAt, endsAt);
  const previousSummaries = await getPreviousSummaries(device.id, startsAt);
  const sameSegment =
    previousSummaries.find((previous) => previous.timeframe === segment.name) ?? null;

  const configFields = Array.isArray(device.fields) ? device.fields : [];
  const sensors = [];

  for (const { field, title, type } of configFields) {
    const stats = fieldStats(readings, field);
    if (!stats) continue;

    const previous = sameSegment?.sensors.find((sensor) => sensor.field === field) ?? null;

    sensors.push({
      field,
      title,
      type,
      ...stats,
      previous_avg: previous?.avg ?? null,
      change_percent: percentDelta(previous?.avg, stats.avg),
    });
  }

  const useAi = AI_ENABLED && device.use_ai === true && sensors.length > 0;
  const aiSummary = useAi
    ? await runPlantAgent({
        context: {
          device,
          date,
          segment,
          startsAt,
          endsAt,
          sensors,
        },
        allowedActions: resolveAllowedActions(device),
      })
    : null;

  await saveSummary({
    deviceId: device.id,
    date,
    segment,
    startsAt,
    endsAt,
    comparedTo: sameSegment
      ? { date: sameSegment.date, timeframe: sameSegment.timeframe }
      : null,
    sensors,
    aiSummary,
  });

  return { readings: readings.length, sensors, aiSummary };
}

function resolveTargets(args) {
  const [first, second] = args;

  if (!first) {
    return [resolveLastEndedSegment()];
  }

  const fromDate = parseDateArg(first);

  if (second && isDateArg(second)) {
    const toDate = parseDateArg(second);
    const targets = [];

    for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
      for (const segment of SEGMENTS) targets.push({ date, segment });
    }

    return targets;
  }

  if (second) {
    const segment = SEGMENTS.find((entry) => entry.name === second.toLowerCase());
    if (!segment) {
      throw new Error(
        `Unknown segment "${second}". Use ${SEGMENTS.map((entry) => entry.name).join(", ")}.`
      );
    }
    return [{ date: fromDate, segment }];
  }

  return SEGMENTS.map((segment) => ({ date: fromDate, segment }));
}

async function withBounds(targets) {
  const now = new Date();
  const resolved = [];

  for (const target of targets) {
    const bounds = await getSegmentBounds(target.date, target.segment);

    if (new Date(bounds.ends_at) > now) {
      console.log(`Skipping ${target.date} ${target.segment.name}: not finished yet`);
      continue;
    }

    resolved.push({ ...target, bounds });
  }

  return resolved;
}

async function run(args) {
  const targets = await withBounds(resolveTargets(args));
  const devices = await getDeviceConfigs();

  console.log(
    `${targets.length} segment(s) x ${devices.length} device(s), AI ${AI_ENABLED ? "on" : "off"} (${AI_MODEL}, ${PLANT_TYPE})`
  );

  for (const { date, segment, bounds } of targets) {
    console.log(`\n${date} ${segment.name}`);

    for (const device of devices) {
      // Header first so warnings raised inside summarizeSegment land under the right device
      console.log(`  device ${device.id} (${device.name})`);

      const { readings, sensors, aiSummary } = await summarizeSegment(
        device,
        date,
        segment,
        bounds
      );

      console.log(`    ${readings} reading(s), ${sensors.length} sensor(s)`);

      for (const sensor of sensors) {
        const change =
          sensor.change_percent == null
            ? "n/a"
            : `${sensor.change_percent > 0 ? "+" : ""}${sensor.change_percent}%`;
        console.log(
          `    - ${sensor.title}: avg ${sensor.avg} (prev ${sensor.previous_avg ?? "n/a"}), change ${change}`
        );
      }

      if (aiSummary) {
        const toolSteps = Array.isArray(aiSummary.summary)
          ? aiSummary.summary.filter((step) => step.kind === "tool").length
          : 0;
        console.log(
          `    AI: ${aiSummary.actions.length > 0 ? aiSummary.actions.join(", ") : "no actions"} (${toolSteps} tool step(s))`
        );
        if (aiSummary.actions.length > 0) {
          console.log(`    queued sensor_actions: ${JSON.stringify(aiSummary.actions)}`);
        }
      }
    }
  }
}

try {
  await run(process.argv.slice(2));
  console.log("\nDone.");
} catch (err) {
  console.error("Daily summary failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
