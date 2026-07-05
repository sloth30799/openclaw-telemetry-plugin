import type {
  PluginHookAgentContext,
  PluginHookGatewayContext,
  PluginHookMessageContext,
  PluginHookSessionContext,
  PluginHookSubagentContext,
  PluginHookToolContext,
} from "./openclaw-types.js";

import type { PLUGIN_ID, TELEMETRY_VERSION } from "./constants.js";

export type TelemetryKind =
  | "session_started"
  | "session_ended"
  | "llm_output"
  | "model_call_started"
  | "model_call_ended"
  | "tool_call_completed"
  | "agent_ended"
  | "message_received"
  | "message_sent"
  | "subagent_spawned"
  | "subagent_ended"
  | "diagnostic_event";

export type MissionControlTelemetryBatch = {
  source: "openclaw";
  pluginId: typeof PLUGIN_ID;
  version: typeof TELEMETRY_VERSION;
  events: MissionControlTelemetryEvent[];
};

export type TraceInfo = {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  traceparent?: string;
};

export type CorrelationInfo = {
  source?: "hook_context" | "cron_job" | "manual_binding" | "runtime_route";
  runId?: string;
  jobId?: string;
  sessionKey?: string;
  traceId?: string;
  taskId?: string;
};

export type MissionControlTelemetryEvent = {
  id: string;
  kind: TelemetryKind;
  occurredAt: string;
  runId?: string;
  jobId?: string;
  sessionId?: string;
  sessionKey?: string;
  openclawAgentId?: string;
  taskId?: string;
  correlation?: CorrelationInfo;
  trace?: TraceInfo;
  tool?: {
    name?: string;
    callId?: string;
    durationMs?: number;
    outcome?: "completed" | "error";
    error?: string;
    paramsSummary?: Record<string, unknown>;
  };
  model?: {
    provider?: string;
    model?: string;
    resolvedRef?: string;
    harnessId?: string;
    api?: string;
    transport?: string;
    durationMs?: number;
    outcome?: "completed" | "error";
    errorCategory?: string;
    failureKind?: string;
    requestPayloadBytes?: number;
    responseStreamBytes?: number;
    timeToFirstByteMs?: number;
    upstreamRequestIdHash?: string;
    contextTokenBudget?: number;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
      cache_read_tokens?: number;
      cache_write_tokens?: number;
      total_tokens?: number;
      estimated_cost_usd?: number;
    };
  };
  message?: {
    direction?: "inbound" | "outbound";
    provider?: string;
    channelId?: string;
    chatId?: string;
    senderId?: string;
    success?: boolean;
  };
  subagent?: {
    childSessionKey?: string;
    targetSessionKey?: string;
    label?: string;
    targetKind?: "subagent" | "acp";
    resolvedModel?: string;
    resolvedProvider?: string;
    outcome?: string;
    error?: string;
  };
  title: string;
  summary?: string;
  metadata?: Record<string, unknown>;
};

export type ResolvedTelemetryConfig = {
  endpoint: string;
  endpointEnv: string;
  endpointSource: "config" | "env" | "fallback";
  tokenEnv: string;
  tokenHeader: string;
  token?: string;
  bypassTokenEnv?: string;
  bypassToken?: string;
  batchSize: number;
  flushIntervalMs: number;
  maxRetries: number;
  maxQueueSize: number;
  includeMessageText: boolean;
  includeToolParams: boolean;
  includeToolResults: boolean;
  enableDiagnosticEvents: boolean;
};

export type TelemetryQueueItem = {
  event: MissionControlTelemetryEvent;
  attempts: number;
};

export type TelemetrySender = (
  events: MissionControlTelemetryEvent[],
) => Promise<void>;

export type HookContext =
  | PluginHookAgentContext
  | PluginHookGatewayContext
  | PluginHookMessageContext
  | PluginHookSessionContext
  | PluginHookSubagentContext
  | PluginHookToolContext
  | undefined;

export type NormalizerOptions = {
  now?: () => Date;
  createId?: () => string;
  config?: Pick<
    ResolvedTelemetryConfig,
    "includeMessageText" | "includeToolParams" | "includeToolResults"
  >;
};
