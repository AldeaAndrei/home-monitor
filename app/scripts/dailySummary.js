import pool from "../../lib/db.js";
import OpenAI from "openai";
const openai = new OpenAI();

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

function toIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateArg(arg) {
  if (arg) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) return arg;

    const ddMmYyyy = arg.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (ddMmYyyy) {
      const [, day, month, year] = ddMmYyyy.map(Number);
      return toIsoDate(year, month, day);
    }

    throw new Error(`Invalid date "${arg}". Use YYYY-MM-DD or DD-MM-YYYY.`);
  }

  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
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
    "SELECT id, name, fields FROM sensor_config ORDER BY id ASC"
  );
  return rows;
}

async function getReadingsForDay(deviceId, date) {
  const { rows } = await pool.query(
    `SELECT id, created_at, data
     FROM sensor_readings
     WHERE created_at >= $2::date
       AND created_at < ($2::date + INTERVAL '1 day')
       AND data IS NOT NULL
       AND (data::jsonb)->>'device_id' = $1
     ORDER BY created_at ASC`,
    [String(deviceId), date]
  );

  return rows.map((row) => ({
    created_at: row.created_at,
    ...parseRowData(row.data),
  }));
}

const AI_MODEL = "gpt-5.4-mini";
const PLANT_TYPE = "pothos";
const VALID_ACTIONS = new Set(["water", "fan", "shade"]);

const SYSTEM_PROMPT = `You are a plant care assistant for a ${PLANT_TYPE}. You receive a daily sensor summary and must assess the plant's situation and decide what actions to take.

Respond with ONLY valid JSON in this exact shape:
{
  "ai_summary": "<short objective paragraph>",
  "actions": []
}

Rules:
- "ai_summary": a short objective paragraph (2-4 sentences) about the plant situation and environment, based only on the provided summary.
- "actions": an array of actions you decide are needed. Each item MUST be exactly one of the allowed actions below. Use an empty array if none are needed.

Allowed actions:
- "water" — water the plant soil
- "fan" — start a fan that blows air on the plant
- "shade" — raise a shade over the plant

Do not invent sensor values. Do not output markdown or any text outside the JSON object.`;

function buildUserPrompt(summaryDate, deviceName, previousDate, sensors) {
  const summary = {
    compared_to: previousDate,
    sensors,
  };

  return `Date: ${summaryDate}
Device: ${deviceName}
Plant: ${PLANT_TYPE}

Summary:
${JSON.stringify(summary, null, 2)}`;
}

function parseAiResponse(rawContent) {
  const parsed = JSON.parse(rawContent);
  const summary =
    typeof parsed.ai_summary === "string" ? parsed.ai_summary.trim() : null;
  const actions = Array.isArray(parsed.actions)
    ? [...new Set(parsed.actions.filter((action) => VALID_ACTIONS.has(action)))]
    : [];

  if (!summary) {
    throw new Error("LLM response missing ai_summary string");
  }

  return { model: AI_MODEL, summary, actions };
}

async function generateAiSummary(summaryDate, previousDate, deviceName, sensors) {
  try {
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt(summaryDate, deviceName, previousDate, sensors),
        },
      ],
    });

    return parseAiResponse(response.choices[0].message.content);
  } catch (err) {
    console.warn(`  AI summary failed: ${err.message}`);
    return null;
  }
}

async function saveSummary(deviceId, summaryDate, previousDate, sensors, aiSummary) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `DELETE FROM sensor_summary
       WHERE device_id = $1
         AND date = $2::date`,
      [deviceId, summaryDate]
    );

    await client.query(
      `INSERT INTO sensor_summary (device_id, date, fields, ai_summary)
       VALUES ($1, $2::date, $3::json, $4::json)`,
      [
        deviceId,
        summaryDate,
        JSON.stringify({
          compared_to: previousDate,
          sensors,
        }),
        aiSummary ? JSON.stringify(aiSummary) : null,
      ]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function run(summaryDate) {
  const previousDate = addDays(summaryDate, -1);
  const devices = await getDeviceConfigs();

  console.log(`Summarizing ${summaryDate} (vs ${previousDate}) for ${devices.length} device(s)`);

  for (const device of devices) {
    const configFields = Array.isArray(device.fields) ? device.fields : [];
    const todayReadings = await getReadingsForDay(device.id, summaryDate);
    const yesterdayReadings = await getReadingsForDay(device.id, previousDate);

    console.log(
      `Device ${device.id} (${device.name}): ${todayReadings.length} readings today, ${yesterdayReadings.length} yesterday`
    );

    const sensors = [];

    for (const { field, title, type } of configFields) {
      const todayStats = fieldStats(todayReadings, field);
      if (!todayStats) {
        console.log(`  - ${field}: no readings, skipped`);
        continue;
      }

      const yesterdayStats = fieldStats(yesterdayReadings, field);
      const changePercent = yesterdayStats
        ? percentDelta(yesterdayStats.avg, todayStats.avg)
        : null;

      sensors.push({
        field,
        title,
        type,
        ...todayStats,
        previous_avg: yesterdayStats?.avg ?? null,
        change_percent: changePercent,
      });

      const changeLabel =
        changePercent == null ? "n/a" : `${changePercent > 0 ? "+" : ""}${changePercent}%`;

      console.log(
        `  - ${title}: avg ${todayStats.avg} (prev ${yesterdayStats?.avg ?? "n/a"}), change ${changeLabel}`
      );
    }

    if (sensors.length > 0) {
      const aiSummary = await generateAiSummary(
        summaryDate,
        previousDate,
        device.name,
        sensors
      );

      if (aiSummary) {
        console.log(
          `  AI: ${aiSummary.actions.length > 0 ? aiSummary.actions.join(", ") : "no actions"}`
        );
      }

      await saveSummary(device.id, summaryDate, previousDate, sensors, aiSummary);
    }
  }
}

const summaryDate = parseDateArg(process.argv[2]);

try {
  await run(summaryDate);
  console.log("Done.");
} catch (err) {
  console.error("Daily summary failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
