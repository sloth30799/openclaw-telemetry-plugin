import {
  DEFAULT_BYPASS_TOKEN_ENV,
  DEFAULT_ENDPOINT,
  DEFAULT_ENDPOINT_ENV,
  DEFAULT_TOKEN_ENV,
  DEFAULT_TOKEN_HEADER,
} from "./constants.js";
import type { ResolvedTelemetryConfig } from "./types.js";
import { isRecord } from "./sanitize.js";

type Env = Record<string, string | undefined>;

const DEFAULTS = {
  batchSize: 20,
  flushIntervalMs: 1000,
  maxRetries: 3,
  maxQueueSize: 1000,
  includeMessageText: false,
  includeToolParams: false,
  includeToolResults: false,
  enableDiagnosticEvents: false,
};

export function resolveTelemetryConfig(
  raw: unknown,
  env: Env = process.env,
): ResolvedTelemetryConfig {
  const input = isRecord(raw) ? raw : {};
  const endpointEnv = readString(input.endpointEnv, DEFAULT_ENDPOINT_ENV);
  const directEndpoint = readOptionalString(input.endpoint);
  const envEndpoint = readOptionalString(env[endpointEnv]);
  const tokenEnv = readString(input.tokenEnv, DEFAULT_TOKEN_ENV);
  const tokenHeader = readString(input.tokenHeader, DEFAULT_TOKEN_HEADER);
  const bypassTokenEnv = readString(
    input.bypassTokenEnv,
    DEFAULT_BYPASS_TOKEN_ENV,
  );

  return {
    endpoint: directEndpoint ?? envEndpoint ?? DEFAULT_ENDPOINT,
    endpointEnv,
    endpointSource: directEndpoint ? "config" : envEndpoint ? "env" : "fallback",
    tokenEnv,
    tokenHeader,
    token: env[tokenEnv] || undefined,
    bypassTokenEnv,
    bypassToken: bypassTokenEnv ? env[bypassTokenEnv] || undefined : undefined,
    batchSize: readInteger(input.batchSize, DEFAULTS.batchSize, 1, 100),
    flushIntervalMs: readInteger(
      input.flushIntervalMs,
      DEFAULTS.flushIntervalMs,
      100,
      60000,
    ),
    maxRetries: readInteger(input.maxRetries, DEFAULTS.maxRetries, 0, 20),
    maxQueueSize: readInteger(input.maxQueueSize, DEFAULTS.maxQueueSize, 1, 10000),
    includeMessageText: readBoolean(
      input.includeMessageText,
      DEFAULTS.includeMessageText,
    ),
    includeToolParams: readBoolean(
      input.includeToolParams,
      DEFAULTS.includeToolParams,
    ),
    includeToolResults: readBoolean(
      input.includeToolResults,
      DEFAULTS.includeToolResults,
    ),
    enableDiagnosticEvents: readBoolean(
      input.enableDiagnosticEvents,
      DEFAULTS.enableDiagnosticEvents,
    ),
  };
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readString(value: unknown, fallback: string): string {
  return readOptionalString(value) ?? fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, min), max);
}
