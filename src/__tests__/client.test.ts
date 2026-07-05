import { describe, expect, it } from "vitest";

import { postTelemetryBatch, type FetchLike } from "../client.js";
import type { MissionControlTelemetryEvent } from "../types.js";

describe("postTelemetryBatch", () => {
  it("sends plugin and Vercel bypass headers without changing endpoint URL", async () => {
    const calls: Array<Parameters<FetchLike>> = [];
    const fetchImpl: FetchLike = async (...args) => {
      calls.push(args);
      return {
        ok: true,
        status: 202,
        statusText: "Accepted",
        text: async () => "",
      };
    };

    await postTelemetryBatch(
      [makeEvent()],
      {
        endpoint: "https://production.example.com/api/openclaw/plugin/events",
        token: "plugin-secret",
        bypassToken: "bypass-secret",
      },
      fetchImpl,
    );

    expect(calls).toEqual([
      [
        "https://production.example.com/api/openclaw/plugin/events",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "content-type": "application/json",
            "x-mission-control-plugin-token": "plugin-secret",
            "x-vercel-protection-bypass": "bypass-secret",
          }),
        }),
      ],
    ]);
    expect(calls[0]?.[0]).not.toContain("bypass-secret");
    expect(calls[0]?.[1].body).not.toContain("bypass-secret");
  });

  it("omits optional auth headers when tokens are not configured", async () => {
    const calls: Array<Parameters<FetchLike>> = [];
    const fetchImpl: FetchLike = async (...args) => {
      calls.push(args);
      return {
        ok: true,
        status: 202,
        statusText: "Accepted",
        text: async () => "",
      };
    };

    await postTelemetryBatch(
      [makeEvent()],
      {
        endpoint: "http://localhost:4319/events",
      },
      fetchImpl,
    );

    expect(calls[0]?.[1].headers).toEqual({
      "content-type": "application/json",
    });
  });

  it("supports a custom receiver token header", async () => {
    const calls: Array<Parameters<FetchLike>> = [];
    const fetchImpl: FetchLike = async (...args) => {
      calls.push(args);
      return {
        ok: true,
        status: 202,
        statusText: "Accepted",
        text: async () => "",
      };
    };

    await postTelemetryBatch(
      [makeEvent()],
      {
        endpoint: "https://receiver.example.com/events",
        token: "plugin-secret",
        tokenHeader: "x-openclaw-telemetry-token",
      },
      fetchImpl,
    );

    expect(calls[0]?.[1].headers).toEqual({
      "content-type": "application/json",
      "x-openclaw-telemetry-token": "plugin-secret",
    });
  });
});

function makeEvent(): MissionControlTelemetryEvent {
  return {
    id: "client-test-event",
    kind: "llm_output",
    occurredAt: "2026-07-04T20:00:00.000Z",
    title: "Client test event",
  };
}
