import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_MODEL,
  MAX_OPENAI_CALLS,
  extractConclusionText,
  parseAgentTurn,
  runPlantAgent,
  validateToolRequest,
} from "./plantAgent.js";

const baseContext = {
  device: { id: 3, name: "plant" },
  date: "2026-09-22",
  segment: { name: "evening", startHour: 18, endHour: 24 },
  startsAt: new Date("2026-09-22T15:00:00.000Z"),
  endsAt: new Date("2026-09-22T21:00:00.000Z"),
  sensors: [
    {
      field: "soil_moisture",
      title: "Soil",
      type: "soil",
      avg: 53.8,
      min: 50,
      max: 56,
      readings_count: 12,
      previous_avg: 55,
      change_percent: -2.18,
    },
  ],
};

const allowedActions = ["water", "fan", "shade"];

function scriptedAskLlm(replies) {
  let i = 0;
  return async () => {
    if (i >= replies.length) {
      throw new Error(`askLlm called more times than scripted (${replies.length})`);
    }
    const reply = replies[i];
    i += 1;
    return typeof reply === "string" ? reply : JSON.stringify(reply);
  };
}

describe("validateToolRequest", () => {
  it("rejects unknown tools", () => {
    const result = validateToolRequest({ name: "drop_tables", arguments: {} });
    assert.equal(result.ok, false);
    assert.match(result.error, /unknown tool/i);
  });

  it("clamps get_sensor_history hours", () => {
    const result = validateToolRequest({
      name: "get_sensor_history",
      arguments: { hours: 999 },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.arguments, { hours: 72 });
  });
});

describe("parseAgentTurn", () => {
  it("strips unknown actions on complete", () => {
    const turn = parseAgentTurn(
      JSON.stringify({
        status: "complete",
        conclusion: "All good.",
        actions: ["water", "explode", "fan"],
      }),
      allowedActions
    );
    assert.equal(turn.kind, "complete");
    assert.deepEqual(turn.actions, ["water", "fan"]);
  });

  it("requires reason on need_data", () => {
    assert.throws(
      () =>
        parseAgentTurn(
          JSON.stringify({
            status: "need_data",
            tool: { name: "get_current_conditions", arguments: {} },
          }),
          allowedActions
        ),
      /reason/
    );
  });

  it("flags invalid tool requests without throwing", () => {
    const turn = parseAgentTurn(
      JSON.stringify({
        status: "need_data",
        reason: "Trying something invalid.",
        tool: { name: "hack", arguments: {} },
      }),
      allowedActions
    );
    assert.equal(turn.kind, "invalid_tool");
  });
});

describe("extractConclusionText", () => {
  it("supports legacy string summaries", () => {
    assert.equal(extractConclusionText("Hello plant"), "Hello plant");
  });

  it("reads the last conclusion step", () => {
    assert.equal(
      extractConclusionText([
        { kind: "reason", text: "Check soil." },
        { kind: "tool", tool: "get_current_conditions" },
        { kind: "conclusion", text: "Done." },
      ]),
      "Done."
    );
  });
});

describe("runPlantAgent", () => {
  it("completes immediately with baseline conditions already in the trail", async () => {
    let toolCalls = 0;
    const result = await runPlantAgent({
      context: baseContext,
      allowedActions,
      askLlm: scriptedAskLlm([
        {
          status: "complete",
          conclusion: "Conditions look stable.",
          actions: [],
        },
      ]),
      executeToolFn: async (name) => {
        toolCalls += 1;
        assert.equal(name, "get_current_conditions");
        return { sensors: [{ field: "soil_moisture", avg: 53.8 }] };
      },
    });

    assert.ok(result);
    assert.equal(result.model, AI_MODEL);
    assert.deepEqual(result.actions, []);
    assert.equal(toolCalls, 1);
    assert.ok(Array.isArray(result.summary));
    assert.deepEqual(
      result.summary.map((s) => s.kind),
      ["reason", "tool", "conclusion"]
    );
    assert.equal(result.summary[1].tool, "get_current_conditions");
    assert.deepEqual(result.summary[2], {
      step: 3,
      kind: "conclusion",
      text: "Conditions look stable.",
    });
  });

  it("requests one extra tool then completes", async () => {
    const toolCalls = [];
    const result = await runPlantAgent({
      context: baseContext,
      allowedActions,
      askLlm: scriptedAskLlm([
        {
          status: "need_data",
          reason: "Need recent watering history.",
          tool: { name: "get_recent_events", arguments: { limit: 5 } },
        },
        {
          status: "complete",
          conclusion: "Soil moisture is moderate.",
          actions: [],
        },
      ]),
      executeToolFn: async (name, args) => {
        toolCalls.push({ name, args });
        return { ok: true, name, args };
      },
    });

    assert.deepEqual(
      toolCalls.map((c) => c.name),
      ["get_current_conditions", "get_recent_events"]
    );
    assert.deepEqual(
      result.summary.map((s) => s.kind),
      ["reason", "tool", "reason", "tool", "conclusion"]
    );
    assert.equal(result.summary[3].tool, "get_recent_events");
    assert.equal(result.summary[4].kind, "conclusion");
  });

  it("requests multiple tools sequentially with interleaved reasons", async () => {
    const toolCalls = [];
    const result = await runPlantAgent({
      context: baseContext,
      allowedActions,
      askLlm: scriptedAskLlm([
        {
          status: "need_data",
          reason: "Check recent watering.",
          tool: { name: "get_recent_events", arguments: { limit: 5 } },
        },
        {
          status: "need_data",
          reason: "Confirm 24h moisture trend.",
          tool: { name: "get_sensor_history", arguments: { hours: 24 } },
        },
        {
          status: "complete",
          conclusion: "Moisture falling but last water was recent.",
          actions: [],
        },
      ]),
      executeToolFn: async (name, args) => {
        toolCalls.push({ name, args });
        return { ok: true, name, args };
      },
    });

    assert.deepEqual(
      toolCalls.map((c) => c.name),
      ["get_current_conditions", "get_recent_events", "get_sensor_history"]
    );
    assert.deepEqual(
      result.summary.map((s) => s.kind),
      ["reason", "tool", "reason", "tool", "reason", "tool", "conclusion"]
    );
  });

  it("rejects invalid tool requests and continues until complete", async () => {
    const result = await runPlantAgent({
      context: baseContext,
      allowedActions,
      askLlm: scriptedAskLlm([
        {
          status: "need_data",
          reason: "Trying a bad tool.",
          tool: { name: "not_a_tool", arguments: {} },
        },
        {
          status: "complete",
          conclusion: "Recovered after invalid tool.",
          actions: ["water"],
        },
      ]),
      executeToolFn: async (name) => {
        if (name !== "get_current_conditions") {
          throw new Error("should not run");
        }
        return { sensors: [] };
      },
    });

    assert.deepEqual(
      result.summary.map((s) => s.kind),
      ["reason", "tool", "conclusion"]
    );
    assert.deepEqual(result.actions, ["water"]);
  });

  it("strips unknown actions from the final result", async () => {
    const result = await runPlantAgent({
      context: baseContext,
      allowedActions,
      askLlm: scriptedAskLlm([
        {
          status: "complete",
          conclusion: "Needs water only.",
          actions: ["water", "laser", "shade"],
        },
      ]),
      executeToolFn: async () => ({ sensors: [] }),
    });

    assert.deepEqual(result.actions, ["water", "shade"]);
  });

  it("enforces the OpenAI call budget and never exceeds maxCalls", async () => {
    let calls = 0;
    const result = await runPlantAgent({
      context: baseContext,
      allowedActions,
      maxCalls: 3,
      askLlm: async () => {
        calls += 1;
        return JSON.stringify({
          status: "need_data",
          reason: "Keep probing.",
          tool: { name: "get_sensor_history", arguments: { hours: 24 } },
        });
      },
      executeToolFn: async () => ({ ok: true }),
    });

    assert.equal(result, null);
    assert.equal(calls, 3);
    assert.ok(calls <= MAX_OPENAI_CALLS);
  });
});
