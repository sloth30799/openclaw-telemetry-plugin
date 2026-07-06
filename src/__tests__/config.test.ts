import { describe, expect, it } from "vitest";

import { resolveTelemetryConfig } from "../config.js";

describe("resolveTelemetryConfig", () => {
  it("uses endpointEnv as the default endpoint source", () => {
    const config = resolveTelemetryConfig(
      {},
      {
        MISSION_CONTROL_RECEIVER_ENDPOINT:
          "http://localhost:3000/api/openclaw/plugin/events",
      },
    );

    expect(config.endpointEnv).toBe("MISSION_CONTROL_RECEIVER_ENDPOINT");
    expect(config.endpoint).toBe(
      "http://localhost:3000/api/openclaw/plugin/events",
    );
    expect(config.endpointSource).toBe("env");
  });

  it("keeps direct endpoint as an explicit override", () => {
    const config = resolveTelemetryConfig(
      {
        endpoint: "http://localhost:4319/events",
        endpointEnv: "MISSION_CONTROL_RECEIVER_ENDPOINT",
      },
      {
        MISSION_CONTROL_RECEIVER_ENDPOINT:
          "https://production.example.com/api/openclaw/plugin/events",
      },
    );

    expect(config.endpoint).toBe("http://localhost:4319/events");
    expect(config.endpointSource).toBe("config");
  });

  it("falls back to the local dev receiver when endpoint env is missing", () => {
    const config = resolveTelemetryConfig(
      {
        endpointEnv: "MISSION_CONTROL_RECEIVER_ENDPOINT",
      },
      {},
    );

    expect(config.endpoint).toBe("http://localhost:4319/events");
    expect(config.endpointSource).toBe("fallback");
  });

  it("resolves plugin and bypass tokens from configured env names", () => {
    const config = resolveTelemetryConfig(
      {
        tokenEnv: "PLUGIN_TOKEN",
        bypassTokenEnv: "VERCEL_BYPASS_TOKEN",
      },
      {
        MISSION_CONTROL_RECEIVER_ENDPOINT:
          "https://production.example.com/api/openclaw/plugin/events",
        PLUGIN_TOKEN: "plugin-secret",
        VERCEL_BYPASS_TOKEN: "bypass-secret",
      },
    );

    expect(config.token).toBe("plugin-secret");
    expect(config.tokenHeader).toBe("x-mission-control-plugin-token");
    expect(config.bypassTokenEnv).toBe("VERCEL_BYPASS_TOKEN");
    expect(config.bypassToken).toBe("bypass-secret");
  });

  it("uses the default Vercel bypass token env when present", () => {
    const config = resolveTelemetryConfig(
      {},
      {
        MISSION_CONTROL_VERCEL_BYPASS_TOKEN: "bypass-secret",
      },
    );

    expect(config.bypassTokenEnv).toBe("MISSION_CONTROL_VERCEL_BYPASS_TOKEN");
    expect(config.bypassToken).toBe("bypass-secret");
  });

  it("supports custom receiver token header names", () => {
    const config = resolveTelemetryConfig(
      {
        tokenEnv: "OPENCLAW_TELEMETRY_TOKEN",
        tokenHeader: "x-openclaw-telemetry-token",
      },
      {
        OPENCLAW_TELEMETRY_TOKEN: "plugin-secret",
      },
    );

    expect(config.tokenEnv).toBe("OPENCLAW_TELEMETRY_TOKEN");
    expect(config.tokenHeader).toBe("x-openclaw-telemetry-token");
    expect(config.token).toBe("plugin-secret");
  });

  it("omits missing bypass token values without leaking placeholders", () => {
    const config = resolveTelemetryConfig(
      {
        bypassTokenEnv: "MISSING_BYPASS_TOKEN",
      },
      {
        MISSION_CONTROL_RECEIVER_ENDPOINT:
          "https://production.example.com/api/openclaw/plugin/events",
      },
    );

    expect(config.bypassTokenEnv).toBe("MISSING_BYPASS_TOKEN");
    expect(config.bypassToken).toBeUndefined();
  });
});
