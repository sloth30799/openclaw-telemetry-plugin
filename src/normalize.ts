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
  return buildBaseEvent("session_started", "OpenClaw session started", event, ctx, options, {
    summary: event.resumedFrom
      ? `Session resumed from ${event.resumedFrom}`
      : "Session opened",
    metadata: {
      resumedFrom: event.resumedFrom,
    },
  });
}

export function normalizeSessionEnd(
  event: PluginHookSessionEndEvent,
  ctx?: PluginHookSessionContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  return buildBaseEvent("session_ended", "OpenClaw session ended", event, ctx, options, {
    summary: `Session ended: ${event.reason ?? "unknown"}`,
    metadata: {
      reason: event.reason,
      durationMs: event.durationMs,
      messageCount: event.messageCount,
      transcriptArchived: event.transcriptArchived,
      nextSessionId: event.nextSessionId,
      nextSessionKey: event.nextSessionKey,
    },
  });
}

export function normalizeModelCallStarted(
  event: PluginHookModelCallStartedEvent,
  ctx?: PluginHookAgentContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  return buildBaseEvent(
    "model_call_started",
    `Model call started: ${event.provider}/${event.model}`,
    event,
    ctx,
    options,
    {
      model: {
        provider: event.provider,
        model: event.model,
        api: event.api,
        transport: event.transport,
        contextTokenBudget: event.contextTokenBudget,
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
  return buildBaseEvent(
    "model_call_ended",
    `Model call ${event.outcome}: ${event.provider}/${event.model}`,
    event,
    ctx,
    options,
    {
      model: {
        provider: event.provider,
        model: event.model,
        api: event.api,
        transport: event.transport,
        durationMs: event.durationMs,
        outcome: event.outcome,
        errorCategory: event.errorCategory,
        failureKind: event.failureKind,
        requestPayloadBytes: readNumber(event.requestPayloadBytes),
        responseStreamBytes: readNumber(event.responseStreamBytes),
        timeToFirstByteMs: readNumber(event.timeToFirstByteMs),
        upstreamRequestIdHash: event.upstreamRequestIdHash,
        contextTokenBudget: event.contextTokenBudget,
      },
      summary: `Duration ${event.durationMs}ms`,
      metadata: contextWindowMetadata(event),
    },
  );
}

export function normalizeLlmOutput(
  event: PluginHookLlmOutputEvent,
  ctx?: PluginHookAgentContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  return buildBaseEvent(
    "llm_output",
    `LLM output: ${event.provider}/${event.model}`,
    event,
    ctx,
    options,
    {
      model: {
        provider: event.provider,
        model: event.model,
        resolvedRef: event.resolvedRef,
        harnessId: event.harnessId,
        contextTokenBudget: event.contextTokenBudget,
        usage: normalizeUsage(event.usage),
      },
      metadata: {
        ...contextWindowMetadata(event),
        reasoningEffort: event.reasoningEffort,
        fastMode: event.fastMode,
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
  const outcome = event.error ? "error" : "completed";

  return buildBaseEvent(
    "tool_call_completed",
    `Tool call ${outcome}: ${event.toolName}`,
    event,
    ctx,
    options,
    {
      tool: {
        name: event.toolName,
        callId: event.toolCallId ?? ctx?.toolCallId,
        durationMs: event.durationMs,
        outcome,
        error: compactError(event.error),
        paramsSummary: summarizeToolParams(event.params, config.includeToolParams),
      },
      metadata: {
        toolKind: ctx?.toolKind,
        toolInputKind: ctx?.toolInputKind,
        resultSummary:
          event.result === undefined
            ? undefined
            : summarizeToolResult(event.result, config.includeToolResults),
      },
    },
  );
}

export function normalizeAgentEnd(
  event: PluginHookAgentEndEvent,
  ctx?: PluginHookAgentContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  return buildBaseEvent(
    "agent_ended",
    event.success ? "Agent run completed" : "Agent run failed",
    event,
    ctx,
    options,
    {
      summary: event.success ? "Run completed" : "Run failed",
      metadata: {
        success: event.success,
        error: compactError(event.error),
        durationMs: event.durationMs,
        messageCount: event.messages.length,
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

  return buildBaseEvent("message_received", "Message received", event, ctx, options, {
    message: {
      direction: "inbound",
      provider: event.from,
      channelId: ctx?.channelId,
      chatId: ctx?.conversationId,
      senderId: event.senderId ?? ctx?.senderId,
    },
    metadata: {
      messageId: event.messageId ?? ctx?.messageId,
      threadId: event.threadId,
      hasContent: event.content.length > 0,
      contentLength: event.content.length,
      content: config.includeMessageText ? event.content : undefined,
      metadata: sanitizeJsonValue(event.metadata, 2),
    },
  });
}

export function normalizeMessageSent(
  event: PluginHookMessageSentEvent,
  ctx?: PluginHookMessageContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  const config = withDefaultConfig(options.config);

  return buildBaseEvent(
    "message_sent",
    event.success ? "Message sent" : "Message send failed",
    event,
    ctx,
    options,
    {
      message: {
        direction: "outbound",
        provider: event.to,
        channelId: ctx?.channelId,
        chatId: ctx?.conversationId,
        senderId: ctx?.senderId,
        success: event.success,
      },
      metadata: {
        messageId: event.messageId,
        error: compactError(event.error),
        hasContent: event.content.length > 0,
        contentLength: event.content.length,
        content: config.includeMessageText ? event.content : undefined,
      },
    },
  );
}

export function normalizeSubagentSpawned(
  event: PluginHookSubagentSpawnedEvent,
  ctx?: PluginHookSubagentContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  return buildBaseEvent(
    "subagent_spawned",
    `Subagent spawned: ${event.label ?? event.agentId}`,
    event,
    ctx,
    options,
    {
      openclawAgentId: event.agentId,
      subagent: {
        childSessionKey: event.childSessionKey,
        label: event.label,
        resolvedModel: event.resolvedModel,
        resolvedProvider: event.resolvedProvider,
      },
      metadata: {
        mode: event.mode,
        threadRequested: event.threadRequested,
        requester: sanitizeJsonValue(event.requester, 2),
      },
    },
  );
}

export function normalizeSubagentEnded(
  event: PluginHookSubagentEndedEvent,
  ctx?: PluginHookSubagentContext,
  options: NormalizerOptions = {},
): MissionControlTelemetryEvent {
  return buildBaseEvent(
    "subagent_ended",
    `Subagent ended: ${event.targetSessionKey}`,
    event,
    ctx,
    options,
    {
      subagent: {
        targetSessionKey: event.targetSessionKey,
        targetKind: event.targetKind,
        outcome: event.outcome,
        error: compactError(event.error),
      },
      metadata: {
        reason: event.reason,
        sendFarewell: event.sendFarewell,
        accountId: event.accountId,
        endedAt: event.endedAt,
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

function contextWindowMetadata(event: {
  contextWindowSource?: unknown;
  contextWindowReferenceTokens?: unknown;
}): Record<string, unknown> {
  return removeUndefined({
    contextWindowSource: event.contextWindowSource,
    contextWindowReferenceTokens: event.contextWindowReferenceTokens,
  });
}

function normalizeUsage(
  usage:
    | {
        input?: number;
        output?: number;
        cacheRead?: number;
        cacheWrite?: number;
        total?: number;
      }
    | undefined,
): NormalizedUsage | undefined {
  if (!usage) {
    return undefined;
  }

  const inputTokens = readNumber(usage.input);
  const outputTokens = readNumber(usage.output);
  const cacheReadTokens = readNumber(usage.cacheRead);
  const cacheWriteTokens = readNumber(usage.cacheWrite);
  const totalTokens = readNumber(usage.total);

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    cacheReadTokens === undefined &&
    cacheWriteTokens === undefined &&
    totalTokens === undefined
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
