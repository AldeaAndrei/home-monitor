export const MAX_OPENAI_CALLS = 20;
export const AI_MODEL = "gpt-5.4-mini";
export const PLANT_TYPE = "pothos";
export const TIME_ZONE = "Europe/Bucharest";

const ACTION_DESCRIPTIONS = {
  water: "water the plant soil",
  fan: "start a fan that blows air on the plant",
  shade: "raise a shade over the plant",
};

const UNITS = {
  temperature: "C",
  humidity: "%",
  pressure: "hPa",
  light: "lux",
  uv: "idx",
  soil: "%",
  cpu: "%",
  battery: "V",
};

const TOOL_NAMES = [
  "get_current_conditions",
  "get_sensor_history",
  "get_recent_events",
  "get_previous_analyses",
];

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

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Extract a human-readable conclusion from old (string) or new (array) ai_summary.summary. */
export function extractConclusionText(summary) {
  if (typeof summary === "string") return summary.trim();
  if (!Array.isArray(summary)) return null;

  for (let i = summary.length - 1; i >= 0; i -= 1) {
    const step = summary[i];
    if (step?.kind === "conclusion" && typeof step.text === "string") {
      const text = step.text.trim();
      if (text) return text;
    }
  }
  return null;
}

function compactAnalysis(aiSummary) {
  if (!aiSummary) return null;
  return {
    actions: Array.isArray(aiSummary.actions) ? aiSummary.actions : [],
    conclusion: extractConclusionText(aiSummary.summary),
  };
}

export function buildSystemPrompt(allowedActions) {
  const actionLines = allowedActions
    .map((action) => `- "${action}" - ${ACTION_DESCRIPTIONS[action] ?? action}`)
    .join("\n");

  const toolLines = [
    '- "get_current_conditions" — current segment sensor averages/min/max (no arguments). Already provided at the start of the run; do not call again unless you have a specific reason.',
    '- "get_sensor_history" — prior segment averages; arguments: { "hours": 1-72 }',
    '- "get_recent_events" — recent queued plant actions; arguments: { "limit": 1-20 }',
    '- "get_previous_analyses" — prior AI conclusions; arguments: { "limit": 1-8 }',
  ].join("\n");

  return `You are a plant care assistant for a ${PLANT_TYPE}. You investigate using tools, then conclude.

Call budget:
- You have a hard maximum of ${MAX_OPENAI_CALLS} LLM turns for this run.
- Each reply you produce counts as one turn.
- Use the fewest tools needed. Always leave room to return status "complete" before the budget is exhausted.
- The user messages include "OpenAI calls remaining: N". Respect that budget.

Respond with ONLY valid JSON in one of these shapes:

When you need data:
{
  "status": "need_data",
  "reason": "<1 short sentence: why you need this tool next>",
  "tool": {
    "name": "<tool name>",
    "arguments": {}
  }
}

When you are done:
{
  "status": "complete",
  "conclusion": "<1-3 sentences focused on what matters for care decisions>",
  "actions": []
}

Starting context:
- get_current_conditions has already been executed for you. Its result is in the first tool message. Use that as your baseline.
- Do not call get_current_conditions again unless you have a specific reason.

Investigation priorities (use tools; do not guess):
1. Read the provided current conditions first.
2. If soil moisture is unusual, trending, near a decision threshold, or looks stuck (e.g. flat 0% or 100%), call get_sensor_history and/or get_recent_events.
3. If recent watering/fan/shade may explain the state, or prior conclusions might be stale, call get_recent_events and get_previous_analyses.
4. Prefer insight over ritual: skip tools that would only restate the obvious. If current conditions alone are enough, return complete immediately.

Conclusion quality (critical — avoid boilerplate):
- Do NOT open with a weather-report template like "The pothos is in a warm [segment] environment with low light...". Night/low light/UV≈0 is normal; omit unless abnormal.
- Write what changed vs recent history, what that implies for care, and any anomaly (sensor stuck, watering not reflected in soil moisture, persistently saturated soil).
- Prefer specific numbers and deltas only when they support the decision (e.g. "soil 28% after three waterings still unread/dry").
- Do not restate every sensor. Skip humidity/temp/light unless they drive an action or a real concern.
- Do not repeat the same conclusion as a previous analysis; add what is new this segment.
- If watering was already queued/done recently but moisture stays near 0% or does not respond, say actuation or sensor failure is likely and be cautious about endlessly recommending water.
- If soil stays ~100% for many segments, prefer fan / no water and say the mix is still saturated.

Actions:
- "actions": only what is needed now. Each item MUST be one of the allowed actions below. Empty array if none.
- On every need_data turn, "reason" is required: one clear sentence explaining why that tool is next.
- Do not invent sensor values. Base conclusions only on tool results.
- Do not call tools blindly. Do not output markdown or any text outside the JSON object.

Allowed actions:
${actionLines}

Available tools:
${toolLines}

Day segments (local ${TIME_ZONE}): night 00:00-06:00, morning 06:00-12:00, afternoon 12:00-18:00, evening 18:00-00:00.
Light and UV are naturally near zero at night — that alone is not noteworthy.`;
}

export function buildBootstrapPrompt({ device, date, segment, nowLabel, callsRemaining }) {
  const startLabel = `${String(segment.startHour).padStart(2, "0")}:00`;
  const endLabel = `${String(segment.endHour % 24).padStart(2, "0")}:00`;

  return [
    `Device: ${device.name} (${PLANT_TYPE})`,
    `Segment: ${segment.name} ${startLabel}-${endLabel} on ${date} (${TIME_ZONE})`,
    `Local now: ${nowLabel}`,
    `OpenAI calls remaining: ${callsRemaining} (max ${MAX_OPENAI_CALLS})`,
    "",
    "Current segment conditions were fetched for you before this turn (see next message).",
    "Request more tools only if needed, then return status complete.",
    "Conclusion must be decision-focused and non-repetitive: what changed, what it means, any anomaly — not a full environment recap.",
  ].join("\n");
}

function formatToolResultMessage(toolName, arguments_, result, callsRemaining) {
  return [
    `Tool result for ${toolName}:`,
    JSON.stringify({ arguments: arguments_, result }),
    "",
    `OpenAI calls remaining: ${callsRemaining} (max ${MAX_OPENAI_CALLS})`,
  ].join("\n");
}

function sensorPayload(sensors) {
  return sensors.map((sensor) => ({
    field: sensor.field,
    title: sensor.title,
    type: sensor.type,
    unit: UNITS[sensor.type] ?? "",
    avg: sensor.avg,
    min: sensor.min,
    max: sensor.max,
    readings_count: sensor.readings_count,
    previous_avg: sensor.previous_avg ?? null,
    change_percent: sensor.change_percent ?? null,
  }));
}

async function getSensorHistory(ctx, hours) {
  const { default: pool } = await import("../../lib/db.js");
  const { rows } = await pool.query(
    `SELECT date, timeframe, fields, starts_at, ends_at
     FROM sensor_summary
     WHERE device_id = $1
       AND ends_at > ($2::timestamptz - ($3 || ' hours')::interval)
       AND starts_at < $2
     ORDER BY starts_at ASC`,
    [ctx.device.id, ctx.startsAt, String(hours)]
  );

  return {
    hours,
    segments: rows.map((row) => ({
      date: toDateString(row.date),
      timeframe: row.timeframe,
      sensors: (parseJsonColumn(row.fields)?.sensors ?? []).map((sensor) => ({
        field: sensor.field,
        title: sensor.title,
        type: sensor.type,
        unit: UNITS[sensor.type] ?? "",
        avg: sensor.avg,
        min: sensor.min,
        max: sensor.max,
        readings_count: sensor.readings_count,
      })),
    })),
  };
}

async function getRecentEvents(ctx, limit) {
  const { default: pool } = await import("../../lib/db.js");
  const { rows } = await pool.query(
    `SELECT id, actions, used, created_at, summary_id
     FROM sensor_actions
     WHERE device_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [ctx.device.id, limit]
  );

  return {
    events: rows.map((row) => ({
      id: row.id,
      actions: parseJsonColumn(row.actions) ?? [],
      used: row.used === true,
      created_at: row.created_at,
      summary_id: row.summary_id,
    })),
  };
}

async function getPreviousAnalyses(ctx, limit) {
  const { default: pool } = await import("../../lib/db.js");
  const { rows } = await pool.query(
    `SELECT date, timeframe, ai_summary, starts_at
     FROM sensor_summary
     WHERE device_id = $1
       AND starts_at < $2
       AND ai_summary IS NOT NULL
     ORDER BY starts_at DESC
     LIMIT $3`,
    [ctx.device.id, ctx.startsAt, limit]
  );

  return {
    analyses: rows
      .map((row) => {
        const ai = parseJsonColumn(row.ai_summary);
        const compact = compactAnalysis(ai);
        return {
          date: toDateString(row.date),
          timeframe: row.timeframe,
          actions: compact?.actions ?? [],
          conclusion: compact?.conclusion ?? null,
        };
      })
      .reverse(),
  };
}

export function validateToolRequest(rawTool) {
  if (!rawTool || typeof rawTool !== "object" || Array.isArray(rawTool)) {
    return { ok: false, error: "tool must be an object with name and arguments" };
  }

  const name = rawTool.name;
  if (!TOOL_NAMES.includes(name)) {
    return {
      ok: false,
      error: `unknown tool "${name}". Allowed: ${TOOL_NAMES.join(", ")}`,
    };
  }

  const arguments_ =
    rawTool.arguments == null
      ? {}
      : typeof rawTool.arguments === "object" && !Array.isArray(rawTool.arguments)
        ? rawTool.arguments
        : null;

  if (arguments_ == null) {
    return { ok: false, error: "tool.arguments must be an object" };
  }

  if (name === "get_current_conditions") {
    return { ok: true, name, arguments: {} };
  }

  if (name === "get_sensor_history") {
    return {
      ok: true,
      name,
      arguments: { hours: clampInt(arguments_.hours, 1, 72, 24) },
    };
  }

  if (name === "get_recent_events") {
    return {
      ok: true,
      name,
      arguments: { limit: clampInt(arguments_.limit, 1, 20, 5) },
    };
  }

  if (name === "get_previous_analyses") {
    return {
      ok: true,
      name,
      arguments: { limit: clampInt(arguments_.limit, 1, 8, 4) },
    };
  }

  return { ok: false, error: `unhandled tool "${name}"` };
}

export async function executeTool(name, arguments_, ctx) {
  switch (name) {
    case "get_current_conditions":
      return {
        segment: ctx.segment.name,
        date: ctx.date,
        sensors: sensorPayload(ctx.sensors),
      };
    case "get_sensor_history":
      return getSensorHistory(ctx, arguments_.hours);
    case "get_recent_events":
      return getRecentEvents(ctx, arguments_.limit);
    case "get_previous_analyses":
      return getPreviousAnalyses(ctx, arguments_.limit);
    default:
      throw new Error(`unknown tool "${name}"`);
  }
}

export function parseAgentTurn(rawContent, allowedActions) {
  const parsed = JSON.parse(rawContent);

  if (parsed.status === "need_data") {
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
    if (!reason) {
      throw new Error('LLM need_data response missing "reason" string');
    }

    const validated = validateToolRequest(parsed.tool);
    if (!validated.ok) {
      return { kind: "invalid_tool", error: validated.error, reason };
    }
    return {
      kind: "need_data",
      reason,
      tool: { name: validated.name, arguments: validated.arguments },
    };
  }

  if (parsed.status === "complete") {
    const conclusion =
      typeof parsed.conclusion === "string" ? parsed.conclusion.trim() : "";
    if (!conclusion) {
      throw new Error('LLM complete response missing "conclusion" string');
    }

    const allowed = new Set(allowedActions);
    const actions = Array.isArray(parsed.actions)
      ? [...new Set(parsed.actions.filter((action) => allowed.has(action)))]
      : [];

    return { kind: "complete", conclusion, actions };
  }

  throw new Error(`LLM response has invalid status "${parsed.status}"`);
}

function localNowLabel(instant = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

function logAiError(err) {
  const label = [err.status, err.type, err.code].filter(Boolean).join(" ");
  console.warn(`    AI agent failed${label ? ` (${label})` : ""}: ${err.message}`);

  if (err.error) {
    console.warn(`    api error: ${JSON.stringify(err.error)}`);
  }

  if (err instanceof SyntaxError) {
    console.warn("    the model returned content that is not valid JSON");
  }

  if (!err.status && !err.error) {
    console.warn(err.stack ?? err);
  }
}

/**
 * @param {object} options
 * @param {object} options.context - device, date, segment, startsAt, endsAt, sensors
 * @param {string[]} options.allowedActions
 * @param {(messages: object[]) => Promise<string>} [options.askLlm] - injectable for tests
 * @param {(name: string, args: object, ctx: object) => Promise<object>} [options.executeToolFn]
 * @param {number} [options.maxCalls]
 */
export async function runPlantAgent({
  context,
  allowedActions,
  askLlm,
  executeToolFn,
  maxCalls = MAX_OPENAI_CALLS,
}) {
  const summaryTrail = [];
  let callsMade = 0;

  const defaultAskLlm = async (messages) => {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI();
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      messages,
    });
    return response.choices[0].message.content;
  };

  const callLlm = askLlm ?? defaultAskLlm;
  const runTool = executeToolFn ?? executeTool;

  const messages = [
    { role: "system", content: buildSystemPrompt(allowedActions) },
    {
      role: "user",
      content: buildBootstrapPrompt({
        device: context.device,
        date: context.date,
        segment: context.segment,
        nowLabel: localNowLabel(),
        callsRemaining: maxCalls,
      }),
    },
  ];

  try {
    // Always seed current conditions so the model does not waste a turn on them.
    const baselineArgs = {};
    let baselineResult;
    try {
      baselineResult = await runTool("get_current_conditions", baselineArgs, context);
    } catch (err) {
      baselineResult = { error: err.message };
    }

    summaryTrail.push({
      step: 1,
      kind: "reason",
      text: "System provided current segment conditions as the starting context.",
    });
    summaryTrail.push({
      step: 2,
      kind: "tool",
      tool: "get_current_conditions",
      arguments: baselineArgs,
      result: baselineResult,
    });
    messages.push({
      role: "user",
      content: formatToolResultMessage(
        "get_current_conditions",
        baselineArgs,
        baselineResult,
        maxCalls
      ),
    });

    while (callsMade < maxCalls) {
      const rawContent = await callLlm(messages);
      callsMade += 1;

      const remaining = maxCalls - callsMade;
      messages.push({ role: "assistant", content: rawContent });

      let turn;
      try {
        turn = parseAgentTurn(rawContent, allowedActions);
      } catch (err) {
        if (remaining <= 0) {
          console.warn(
            `    AI agent exhausted ${maxCalls} OpenAI calls without a valid complete`
          );
          return null;
        }
        messages.push({
          role: "user",
          content: [
            `Invalid response: ${err.message}`,
            "Reply again with valid JSON (need_data or complete).",
            `OpenAI calls remaining: ${remaining} (max ${maxCalls})`,
          ].join("\n"),
        });
        continue;
      }

      if (turn.kind === "invalid_tool") {
        if (remaining <= 0) {
          console.warn(
            `    AI agent exhausted ${maxCalls} OpenAI calls without a valid complete`
          );
          return null;
        }
        messages.push({
          role: "user",
          content: [
            `Invalid tool request: ${turn.error}`,
            "Choose an allowed tool or return status complete.",
            `OpenAI calls remaining: ${remaining} (max ${maxCalls})`,
          ].join("\n"),
        });
        continue;
      }

      if (turn.kind === "complete") {
        summaryTrail.push({
          step: summaryTrail.length + 1,
          kind: "conclusion",
          text: turn.conclusion,
        });

        return {
          model: AI_MODEL,
          actions: turn.actions,
          summary: summaryTrail,
        };
      }

      // need_data
      summaryTrail.push({
        step: summaryTrail.length + 1,
        kind: "reason",
        text: turn.reason,
      });

      let result;
      try {
        result = await runTool(turn.tool.name, turn.tool.arguments, context);
      } catch (err) {
        result = { error: err.message };
      }

      summaryTrail.push({
        step: summaryTrail.length + 1,
        kind: "tool",
        tool: turn.tool.name,
        arguments: turn.tool.arguments,
        result,
      });

      if (remaining <= 0) {
        console.warn(
          `    AI agent exhausted ${maxCalls} OpenAI calls without a valid complete`
        );
        return null;
      }

      messages.push({
        role: "user",
        content: formatToolResultMessage(
          turn.tool.name,
          turn.tool.arguments,
          result,
          remaining
        ),
      });
    }

    console.warn(
      `    AI agent exhausted ${maxCalls} OpenAI calls without a valid complete`
    );
    return null;
  } catch (err) {
    logAiError(err);
    return null;
  }
}
