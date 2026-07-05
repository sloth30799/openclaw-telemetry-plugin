import { describe, expect, it, vi } from "vitest";

import plugin from "../index.js";
import type { OpenClawPluginApi } from "../openclaw-types.js";

describe("plugin entry", () => {
  it("registers Milestone A telemetry hooks", () => {
    const hooks: string[] = [];
    const api = {
      pluginConfig: {
        endpoint: "http://localhost:4319/events",
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
      on: (hookName: string) => {
        hooks.push(hookName);
      },
    } as unknown as OpenClawPluginApi;

    plugin.register?.(api);

    expect(hooks).toEqual([
      "gateway_start",
      "gateway_stop",
      "session_start",
      "session_end",
      "model_call_started",
      "model_call_ended",
      "llm_output",
      "after_tool_call",
      "agent_end",
      "message_received",
      "message_sent",
      "subagent_spawned",
      "subagent_ended",
    ]);
  });
});
