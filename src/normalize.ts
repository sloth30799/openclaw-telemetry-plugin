import { randomUUID } from "node:crypto";

import type {
  PluginHookAfterToolCallEvent,
  PluginHookAgentContext,
  PluginHookAgentEndEvent,
  PluginHookMessageContext,
  PluginHookMessageReceivedEvent,
  PluginHookMessageSentEvent,
  PluginHookLlmOutputEvent,
  PluginHookModelCallEndedEvent,
  PluginHookModelCallStartedEvent,
  PluginHookSessionContext,
  PluginHookSessionEndEvent,
  PluginHookSessionStartEvent,
  PluginHookSubagentContext,
  PluginHookSubagentEndedEvent,
  PluginHookSubagentSpawnedEvent,
  PluginHookToolContext,
} from "./openclaw-types.js";

import {
  asRecord,
  compactError,
  readNumber,
  readString,
  sanitizeJsonValue,
  summarizeToolParams,
  summarizeToolResult,
} from "./sanitize.js";
import type {
  CorrelationInfo,
  HookContext,
  MissionControlTelemetryEvent,
  NormalizerOptions,
  ResolvedTelemetryConfig,
  TelemetryKind,
  TraceInfo,
} from "./types.js";

type AnyRecord = Record<string, unknown>;
type NormalizedUsage = NonNullable<
  NonNullable<MissionControlTelemetryEvent["model"]>["usage"]
>;

const DEFAULT_NORMALIZER_CONFIG: Pick<
  ResolvedTelemetryConfig,
  "includeMessageText" | "includeToolParams" | "includeToolResults"
> = {
  includeMessageText: false,
  includeToolParams: false,
  includeToolResults: false,
};

export function normalizeSessionStart(
  event: PluginHookSessionStartEvent,
  ctx?: PluginHookSessionContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  const eventRecord = asRecord(event);
  const resumedFrom = readString(eventRecord?.resumedFrom);

  return buildBaseEvent("session_started", "OpenClaw session started", event, ctx, options, {
    summary: resumedFrom ? `Session resumed from ${resumedFrom}` : "Session opened",
    metadata: {
      resumedFrom,
    },
  });
}

export function normalizeSessionEnd(
  event: PluginHookSessionEndEvent,
  ctx?: PluginHookSessionContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  const eventRecord = asRecord(event);
  const reason = readString(eventRecord?.reason) ?? "unknown";

  return buildBaseEvent("session_ended", "OpenClaw session ended", event, ctx, options, {
    summary: `Session ended: ${reason}`,
    metadata: {
      reason,
      durationMs: readNumber(eventRecord?.durationMs),
      messageCount: readNumber(eventRecord?.messageCount),
      transcriptArchived: readBoolean(eventRecord?.transcriptArchived),
      nextSessionId: readString(eventRecord?.nextSessionId),
      nextSessionKey: readString(eventRecord?.nextSessionKey),
    },
  });
}

export function normalizeModelCallStarted(
  event: PluginHookModelCallStartedEvent,
  ctx?: PluginHookAgentContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  const eventRecord = asRecord(event);
  const provider = readString(eventRecord?.provider);
  const model = readString(eventRecord?.model);

  return buildBaseEvent(
    "model_call_started",
    `Model call started: ${describeModel(provider, model)}`,
    event,
    ctx,
    options,
    {
      model: {
        provider,
        model,
        api: readString(eventRecord?.api),
        transport: readString(eventRecord?.transport),
        contextTokenBudget: readNumber(eventRecord?.contextTokenBudget),
      },
      metadata: contextWindowMetadata(event),
    },
  );
}

export function normalizeModelCallEnded(
  event: PluginHookModelCallEndedEvent,
  ctx?: PluginHookAgentContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  const eventRecord = asRecord(event);
  const provider = readString(eventRecord?.provider);
  const model = readString(eventRecord?.model);
  const outcome = readOutcome(eventRecord?.outcome);
  const durationMs = readNumber(eventRecord?.durationMs);

  return buildBaseEvent(
    "model_call_ended",
    `Model call ${outcome ?? "ended"}: ${describeModel(provider, model)}`,
    event,
    ctx,
    options,
    {
      model: {
        provider,
        model,
        api: readString(eventRecord?.api),
        transport: readString(eventRecord?.transport),
        durationMs,
        outcome,
        errorCategory: readString(eventRecord?.errorCategory),
        failureKind: readString(eventRecord?.failureKind),
        requestPayloadBytes: readNumber(eventRecord?.requestPayloadBytes),
        responseStreamBytes: readNumber(eventRecord?.responseStreamBytes),
        timeToFirstByteMs: readNumber(eventRecord?.timeToFirstByteMs),
        upstreamRequestIdHash: readString(eventRecord?.upstreamRequestIdHash),
        contextTokenBudget: readNumber(eventRecord?.contextTokenBudget),
      },
      summary: durationMs === undefined ? undefined : `Duration ${durationMs}ms`,
      metadata: contextWindowMetadata(event),
    },
  );
}

export function normalizeLlmOutput(
  event: PluginHookLlmOutputEvent,
  ctx?: PluginHookAgentContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  const eventRecord = asRecord(event);
  const provider = readString(eventRecord?.provider);
  const model = readString(eventRecord?.model);

  return buildBaseEvent(
    "llm_output",
    `LLM output: ${describeModel(provider, model)}`,
    event,
    ctx,
    options,
    {
      model: {
        provider,
        model,
        resolvedRef: readString(eventRecord?.resolvedRef),
        harnessId: readString(eventRecord?.harnessId),
        contextTokenBudget: readNumber(eventRecord?.contextTokenBudget),
        usage: normalizeUsage(eventRecord?.usage),
      },
      metadata: {
        ...contextWindowMetadata(event),
        reasoningEffort: eventRecord?.reasoningEffort,
        fastMode: readBoolean(eventRecord?.fastMode),
      },
    },
  );
}

export function normalizeAfterToolCall(
  event: PluginHookAfterToolCallEvent,
  ctx?: PluginHookToolContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  const config = withDefaultConfig(options.config);
  const eventRecord = asRecord(event);
  const toolName =
    readString(eventRecord?.toolName) ?? readString(ctx?.toolName);
  const hasError = hasValue(eventRecord?.error);
  const outcome = hasError ? "error" : "completed";
  const hasResult = eventRecord?.result !== undefined;

  return buildBaseEvent(
    "tool_call_completed",
    `Tool call ${outcome}: ${toolName ?? "unknown tool"}`,
    event,
    ctx,
    options,
    {
      tool: {
        name: toolName,
        callId:
          readString(eventRecord?.toolCallId) ?? readString(ctx?.toolCallId),
        durationMs: readNumber(eventRecord?.durationMs),
        outcome,
        error: compactError(eventRecord?.error),
        paramsSummary: summarizeToolParams(
          eventRecord?.params,
          config.includeToolParams,
        ),
      },
      metadata: {
        toolKind: ctx?.toolKind,
        toolInputKind: ctx?.toolInputKind,
        resultSummary: hasResult
          ? summarizeToolResult(eventRecord?.result, config.includeToolResults)
          : undefined,
      },
    },
  );
}

export function normalizeAgentEnd(
  event: PluginHookAgentEndEvent,
  ctx?: PluginHookAgentContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  const eventRecord = asRecord(event);
  const success = readBoolean(eventRecord?.success);
  const title = success === false ? "Agent run failed" : "Agent run completed";

  return buildBaseEvent(
    "agent_ended",
    title,
    event,
    ctx,
    options,
    {
      summary: success === false ? "Run failed" : "Run completed",
      metadata: {
        success,
        error: compactError(eventRecord?.error),
        durationMs: readNumber(eventRecord?.durationMs),
        messageCount: readArrayLength(eventRecord?.messages),
      },
    },
  );
}

export function normalizeMessageReceived(
  event: PluginHookMessageReceivedEvent,
  ctx?: PluginHookMessageContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  const config = withDefaultConfig(options.config);
  const eventRecord = asRecord(event);
  const contentLength = readStringLength(eventRecord?.content);

  return buildBaseEvent("message_received", "Message received", event, ctx, options, {
    message: {
      direction: "inbound",
      provider: readString(eventRecord?.from),
      channelId: ctx?.channelId,
      chatId: ctx?.conversationId,
      senderId: readString(eventRecord?.senderId) ?? ctx?.senderId,
    },
    metadata: {
      messageId: readString(eventRecord?.messageId) ?? ctx?.messageId,
      threadId: readString(eventRecord?.threadId),
      hasContent:
        contentLength === undefined ? undefined : contentLength > 0,
      contentLength,
      content: config.includeMessageText
        ? readString(eventRecord?.content)
        : undefined,
      metadata: sanitizeJsonValue(eventRecord?.metadata, 2),
    },
  });
}

export function normalizeMessageSent(
  event: PluginHookMessageSentEvent,
  ctx?: PluginHookMessageContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  const config = withDefaultConfig(options.config);
  const eventRecord = asRecord(event);
  const success = readBoolean(eventRecord?.success);
  const contentLength = readStringLength(eventRecord?.content);
  const title = success === false ? "Message send failed" : "Message sent";

  return buildBaseEvent(
    "message_sent",
    title,
    event,
    ctx,
    options,
    {
      message: {
        direction: "outbound",
        provider: readString(eventRecord?.to),
        channelId: ctx?.channelId,
        chatId: ctx?.conversationId,
        senderId: ctx?.senderId,
        success,
      },
      metadata: {
        messageId: readString(eventRecord?.messageId),
        error: compactError(eventRecord?.error),
        hasContent:
          contentLength === undefined ? undefined : contentLength > 0,
        contentLength,
        content: config.includeMessageText
          ? readString(eventRecord?.content)
          : undefined,
      },
    },
  );
}

export function normalizeSubagentSpawned(
  event: PluginHookSubagentSpawnedEvent,
  ctx?: PluginHookSubagentContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  const eventRecord = asRecord(event);
  const agentId = readString(eventRecord?.agentId);
  const label = readString(eventRecord?.label);

  return buildBaseEvent(
    "subagent_spawned",
    `Subagent spawned: ${label ?? agentId ?? "unknown subagent"}`,
    event,
    ctx,
    options,
    {
      openclawAgentId: agentId,
      subagent: {
        childSessionKey: readString(eventRecord?.childSessionKey),
        label,
        resolvedModel: readString(eventRecord?.resolvedModel),
        resolvedProvider: readString(eventRecord?.resolvedProvider),
      },
      metadata: {
        mode: readString(eventRecord?.mode),
        threadRequested: readBoolean(eventRecord?.threadRequested),
        requester: sanitizeJsonValue(eventRecord?.requester, 2),
      },
    },
  );
}

export function normalizeSubagentEnded(
  event: PluginHookSubagentEndedEvent,
  ctx?: PluginHookSubagentContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  const eventRecord = asRecord(event);
  const targetSessionKey = readString(eventRecord?.targetSessionKey);

  return buildBaseEvent(
    "subagent_ended",
    `Subagent ended: ${targetSessionKey ?? "unknown subagent"}`,
    event,
    ctx,
    options,
    {
      subagent: {
        targetSessionKey,
        targetKind: readTargetKind(eventRecord?.targetKind),
        outcome: readString(eventRecord?.outcome),
        error: compactError(eventRecord?.error),
      },
      metadata: {
        reason: readString(eventRecord?.reason),
        sendFarewell: readBoolean(eventRecord?.sendFarewell),
        accountId: readString(eventRecord?.accountId),
        endedAt: readString(eventRecord?.endedAt),
      },
    },
  );
}

function buildBaseEvent(
  kind: TelemetryKind,
  title: string,
  event: unknown,
  ctx: HookContext,
  options: NormalizerOptions,
  fields: Partial<MissionControlTelemetryEvent> = {},
): MissionControlTelemetryEvent {
  const eventRecord = asRecord(event);
  const ctxRecord = asRecord(ctx);
  const trace = extractTrace(eventRecord, ctxRecord);
  const runId = pickString(eventRecord, ctxRecord, "runId");
  const jobId = readString(ctxRecord?.jobId);
  const sessionId = pickString(eventRecord, ctxRecord, "sessionId");
  const sessionKey = pickString(eventRecord, ctxRecord, "sessionKey");
  const openclawAgentId =
    fields.openclawAgentId ??
    readString(ctxRecord?.agentId) ??
    readString(eventRecord?.agentId);
  const taskId = readString(eventRecord?.taskId) ?? readString(ctxRecord?.taskId);
  const occurredAt = (options.now ?? (() => new Date()))().toISOString();
  const id = (options.createId ?? randomUUID)();
  const correlation = buildCorrelation({
    runId,
    jobId,
    sessionKey,
    taskId,
    traceId: trace?.traceId,
  });

  return removeUndefined({
    id,
    kind,
    occurredAt,
    runId,
    jobId,
    sessionId,
    sessionKey,
    openclawAgentId,
    taskId,
    correlation,
    trace,
    ...fields,
    title,
  });
}

function pickString(
  eventRecord: AnyRecord | undefined,
  ctxRecord: AnyRecord | undefined,
  key: string,
): string | undefined {
  return readString(eventRecord?.[key]) ?? readString(ctxRecord?.[key]);
}

function buildCorrelation(input: {
  runId?: string;
  jobId?: string;
  sessionKey?: string;
  taskId?: string;
  traceId?: string;
}): CorrelationInfo | undefined {
  if (
    !input.runId &&
    !input.jobId &&
    !input.sessionKey &&
    !input.taskId &&
    !input.traceId
  ) {
    return undefined;
  }

  const correlation: CorrelationInfo = {
    source: input.jobId ? "cron_job" : "hook_context",
  };

  if (input.runId) {
    correlation.runId = input.runId;
  }
  if (input.jobId) {
    correlation.jobId = input.jobId;
  }
  if (input.sessionKey) {
    correlation.sessionKey = input.sessionKey;
  }
  if (input.traceId) {
    correlation.traceId = input.traceId;
  }
  if (input.taskId) {
    correlation.taskId = input.taskId;
  }

  return correlation;
}

function extractTrace(
  eventRecord: AnyRecord | undefined,
  ctxRecord: AnyRecord | undefined,
): TraceInfo | undefined {
  const eventTrace = asRecord(eventRecord?.trace);
  const ctxTrace = asRecord(ctxRecord?.trace);
  const traceId =
    readString(eventRecord?.traceId) ??
    readString(ctxRecord?.traceId) ??
    readString(eventTrace?.traceId) ??
    readString(ctxTrace?.traceId);
  const spanId =
    readString(eventRecord?.spanId) ??
    readString(ctxRecord?.spanId) ??
    readString(eventTrace?.spanId) ??
    readString(ctxTrace?.spanId);
  const parentSpanId =
    readString(eventRecord?.parentSpanId) ??
    readString(ctxRecord?.parentSpanId) ??
    readString(eventTrace?.parentSpanId) ??
    readString(ctxTrace?.parentSpanId);
  const traceparent =
    readString(eventTrace?.traceparent) ??
    readString(ctxTrace?.traceparent) ??
    makeTraceparent(traceId, spanId);

  if (!traceId && !spanId && !parentSpanId && !traceparent) {
    return undefined;
  }

  return removeUndefined({
    traceId,
    spanId,
    parentSpanId,
    traceparent,
  });
}

function makeTraceparent(
  traceId: string | undefined,
  spanId: string | undefined,
): string | undefined {
  if (!traceId || !spanId) {
    return undefined;
  }

  const validTraceId = /^[0-9a-f]{32}$/i.test(traceId);
  const validSpanId = /^[0-9a-f]{16}$/i.test(spanId);
  return validTraceId && validSpanId ? `00-${traceId}-${spanId}-01` : undefined;
}

function contextWindowMetadata(event: unknown): Record<string, unknown> {
  const eventRecord = asRecord(event);

  return removeUndefined({
    contextWindowSource: eventRecord?.contextWindowSource,
    contextWindowReferenceTokens: eventRecord?.contextWindowReferenceTokens,
  });
}

function normalizeUsage(usage: unknown): NormalizedUsage | undefined {
  const usageRecord = asRecord(usage);
  if (!usageRecord) {
    return undefined;
  }

  const inputTokens = pickNumber(
    usageRecord,
    "input",
    "input_tokens",
    "inputTokens",
    "prompt_tokens",
    "promptTokens",
  );
  const outputTokens = pickNumber(
    usageRecord,
    "output",
    "output_tokens",
    "outputTokens",
    "completion_tokens",
    "completionTokens",
  );
  const cacheReadTokens = pickNumber(
    usageRecord,
    "cacheRead",
    "cache_read_tokens",
    "cacheReadTokens",
  );
  const cacheWriteTokens = pickNumber(
    usageRecord,
    "cacheWrite",
    "cache_write_tokens",
    "cacheWriteTokens",
  );
  const totalTokens = pickNumber(usageRecord, "total", "total_tokens", "totalTokens");
  const estimatedCostUsd = pickNumber(
    usageRecord,
    "estimated_cost_usd",
    "estimatedCostUsd",
  );

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    cacheReadTokens === undefined &&
    cacheWriteTokens === undefined &&
    totalTokens === undefined &&
    estimatedCostUsd === undefined
  ) {
    return undefined;
  }

  return removeUndefined({
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    cache_read_tokens: cacheReadTokens,
    cache_write_tokens: cacheWriteTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: estimatedCostUsd,
  });
}

function withDefaultConfig(
  config: NormalizerOptions["config"],
): Pick<
  ResolvedTelemetryConfig,
  "includeMessageText" | "includeToolParams" | "includeToolResults"
> {
  return {
    ...DEFAULT_NORMALIZER_CONFIG,
    ...config,
  };
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      delete value[key];
    }
  }
  return value;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readOutcome(value: unknown): "completed" | "error" | undefined {
  return value === "completed" || value === "error" ? value : undefined;
}

function readTargetKind(value: unknown): "subagent" | "acp" | undefined {
  return value === "subagent" || value === "acp" ? value : undefined;
}

function readArrayLength(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

function readStringLength(value: unknown): number | undefined {
  return typeof value === "string" ? value.length : undefined;
}

function pickNumber(
  record: AnyRecord | undefined,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = readNumber(record?.[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function describeModel(provider: string | undefined, model: string | undefined): string {
  return [provider, model].filter(Boolean).join("/") || "unknown model";
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}
