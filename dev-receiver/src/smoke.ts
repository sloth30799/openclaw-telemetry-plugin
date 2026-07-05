import { PLUGIN_ID, TELEMETRY_VERSION } from "../../src/constants.js";
import type { MissionControlTelemetryBatch } from "../../src/types.js";

const endpoint =
  process.env.MISSION_CONTROL_RECEIVER_ENDPOINT ?? "http://localhost:4319/events";

const batch: MissionControlTelemetryBatch = {
  source: "openclaw",
  pluginId: PLUGIN_ID,
  version: TELEMETRY_VERSION,
  events: [
    {
      id: "smoke-event-1",
      kind: "llm_output",
      occurredAt: new Date().toISOString(),
      runId: "smoke-run",
      sessionKey: "agent:main:main",
      model: {
        provider: "smoke",
        model: "fake-model",
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      },
      title: "Smoke LLM usage captured",
      summary: "Local receiver usage fixture",
    },
  ],
};

const headers: Record<string, string> = {
  "content-type": "application/json",
};

if (process.env.MISSION_CONTROL_PLUGIN_TOKEN) {
  headers["x-mission-control-plugin-token"] =
    process.env.MISSION_CONTROL_PLUGIN_TOKEN;
}

if (process.env.MISSION_CONTROL_VERCEL_BYPASS_TOKEN) {
  headers["x-vercel-protection-bypass"] =
    process.env.MISSION_CONTROL_VERCEL_BYPASS_TOKEN;
}

const response = await fetch(endpoint, {
  method: "POST",
  headers,
  body: JSON.stringify(batch),
});

const body = await response.text();
console.log(`${response.status} ${response.statusText} ${body}`);

if (!response.ok) {
  process.exitCode = 1;
}
