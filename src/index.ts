import { postTelemetryBatch } from "./client.js";
import { PLUGIN_ID } from "./constants.js";
import { resolveTelemetryConfig } from "./config.js";
import {
  normalizeAfterToolCall,
  normalizeAgentEnd,
  normalizeLlmOutput,
  normalizeMessageReceived,
  normalizeMessageSent,
  normalizeModelCallEnded,
  normalizeModelCallStarted,
  normalizeSessionEnd,
  normalizeSessionStart,
  normalizeSubagentEnded,
  normalizeSubagentSpawned,
} from "./normalize.js";
import { TelemetryQueue } from "./queue.js";
import type { OpenClawPluginApi, OpenClawPluginEntry } from "./openclaw-types.js";
import type {
  MissionControlTelemetryEvent,
  ResolvedTelemetryConfig,
} from "./types.js";

let queue: TelemetryQueue | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let currentConfig: ResolvedTelemetryConfig | undefined;

const entry: OpenClawPluginEntry = {
  id: PLUGIN_ID,
  name: "Mission Control Telemetry Bridge",
  description:
    "Bridge sanitized OpenClaw runtime telemetry to an app API.",
  register(api) {
    const ensureQueue = (rawConfig?: unknown): TelemetryQueue => {
      if (!queue) {
        currentConfig = resolveTelemetryConfig(rawConfig ?? api.pluginConfig);
        queue = new TelemetryQueue({
          batchSize: currentConfig.batchSize,
          maxRetries: currentConfig.maxRetries,
          maxQueueSize: currentConfig.maxQueueSize,
          sender: (events) => postTelemetryBatch(events, currentConfig!),
        });
      }

      return queue;
    };

    const enqueue = (event: MissionControlTelemetryEvent, rawConfig?: unknown) => {
      try {
        ensureQueue(rawConfig).enqueue(event);
      } catch (error) {
        api.logger.warn(
          `Telemetry bridge enqueue failed: ${formatError(error)}`,
        );
      }
    };

    const hookConfig = (event: unknown): ResolvedTelemetryConfig => {
      const rawConfig = extractHookPluginConfig(event) ?? api.pluginConfig;
      return resolveTelemetryConfig(rawConfig);
    };

    api.on("gateway_start", (_event) => {
      const config = hookConfig(_event);
      ensureQueue(config);
      startTimer(config, api);
      logConfigDiagnostics(config, api);
      api.logger.info(
        `Telemetry bridge queue started: ${redactEndpoint(config.endpoint)}`,
      );
    });

    api.on("gateway_stop", async () => {
      stopTimer();
      if (queue) {
        await queue.flush();
      }
    });

    api.on("session_start", (event, ctx) => {
      enqueue(normalizeSessionStart(event, ctx), extractHookPluginConfig(event));
    });

    api.on("session_end", (event, ctx) => {
      enqueue(normalizeSessionEnd(event, ctx), extractHookPluginConfig(event));
    });

    api.on("model_call_started", (event, ctx) => {
      enqueue(normalizeModelCallStarted(event, ctx), extractHookPluginConfig(event));
    });

    api.on("model_call_ended", (event, ctx) => {
      enqueue(normalizeModelCallEnded(event, ctx), extractHookPluginConfig(event));
    });

    api.on("llm_output", (event, ctx) => {
      enqueue(normalizeLlmOutput(event, ctx), extractHookPluginConfig(event));
    });

    api.on("after_tool_call", (event, ctx) => {
      const config = hookConfig(event);
      enqueue(
        normalizeAfterToolCall(event, ctx, {
          config,
        }),
        config,
      );
    });

    api.on("agent_end", (event, ctx) => {
      enqueue(normalizeAgentEnd(event, ctx), extractHookPluginConfig(event));
    });

    api.on("message_received", (event, ctx) => {
      const config = hookConfig(event);
      enqueue(
        normalizeMessageReceived(event, ctx, {
          config,
        }),
        config,
      );
    });

    api.on("message_sent", (event, ctx) => {
      const config = hookConfig(event);
      enqueue(
        normalizeMessageSent(event, ctx, {
          config,
        }),
        config,
      );
    });

    api.on("subagent_spawned", (event, ctx) => {
      enqueue(normalizeSubagentSpawned(event, ctx), extractHookPluginConfig(event));
    });

    api.on("subagent_ended", (event, ctx) => {
      enqueue(normalizeSubagentEnded(event, ctx), extractHookPluginConfig(event));
    });
  },
};

export default entry;

function startTimer(config: ResolvedTelemetryConfig, api: OpenClawPluginApi): void {
  if (timer || !queue) {
    return;
  }

  timer = setInterval(() => {
    queue?.flush().catch((error: unknown) => {
      api.logger.warn(
        `Telemetry bridge flush failed: ${formatError(error)}`,
      );
    });
  }, config.flushIntervalMs);

  timer.unref?.();
}

function stopTimer(): void {
  if (!timer) {
    return;
  }

  clearInterval(timer);
  timer = undefined;
}

function logConfigDiagnostics(
  config: ResolvedTelemetryConfig,
  api: OpenClawPluginApi,
): void {
  if (config.endpointSource === "fallback") {
    api.logger.warn(
      `Telemetry bridge endpoint env ${config.endpointEnv} is missing; using local dev receiver fallback.`,
    );
  }

  if (config.bypassTokenEnv && !config.bypassToken) {
    api.logger.warn(
      `Telemetry bridge Vercel bypass env ${config.bypassTokenEnv} is missing; x-vercel-protection-bypass will be omitted.`,
    );
  }
}

function redactEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    if (url.searchParams.has("x-vercel-protection-bypass")) {
      url.searchParams.set("x-vercel-protection-bypass", "[redacted]");
    }
    return url.toString();
  } catch {
    return endpoint.replace(
      /(x-vercel-protection-bypass=)[^&\s]+/i,
      "$1[redacted]",
    );
  }
}

function extractHookPluginConfig(event: unknown): unknown {
  if (!isRecord(event)) {
    return undefined;
  }

  const context = event.context;
  if (!isRecord(context)) {
    return undefined;
  }

  return context.pluginConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
