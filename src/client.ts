import {
  DEFAULT_TOKEN_HEADER,
  PLUGIN_ID,
  TELEMETRY_VERSION,
} from "./constants.js";
import type {
  MissionControlTelemetryBatch,
  MissionControlTelemetryEvent,
  ResolvedTelemetryConfig,
} from "./types.js";

export type FetchLike = (
  input: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
}>;

export async function postTelemetryBatch(
  events: MissionControlTelemetryEvent[],
  config: Pick<ResolvedTelemetryConfig, "endpoint" | "token" | "bypassToken"> & {
    tokenHeader?: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const body: MissionControlTelemetryBatch = {
    source: "openclaw",
    pluginId: PLUGIN_ID,
    version: TELEMETRY_VERSION,
    events,
  };
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (config.token) {
    headers[config.tokenHeader ?? DEFAULT_TOKEN_HEADER] = config.token;
  }

  if (config.bypassToken) {
    headers["x-vercel-protection-bypass"] = config.bypassToken;
  }

  const response = await fetchImpl(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Telemetry receiver rejected telemetry: ${response.status} ${response.statusText}${detail ? ` ${detail}` : ""}`,
    );
  }
}
