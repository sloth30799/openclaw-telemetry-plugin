import { describe, expect, it } from "vitest";

import {
  normalizeAfterToolCall,
  normalizeAgentEnd,
  normalizeLlmOutput,
  normalizeModelCallEnded,
  normalizeSubagentEnded,
} from "../normalize.js";

const now = () => new Date("2026-06-29T08:00:00.000Z");

describe("telemetry normalizers", () => {
  it("strips raw final message content from agent_end events", () => {
    const event = normalizeAgentEnd(
      {
        runId: "run-1",
        success: true,
        durationMs: 200,
        messages: [
          {
            role: "assistant",
            content: "DO_NOT_SERIALIZE_THIS_FINAL_MESSAGE",
          },
        ],
      },
      {
        runId: "run-1",
        sessionKey: "agent:main:main",
        agentId: "main",
      },
      {
        now,
        createId: () => "event-1",
      },
    );

    expect(event.kind).toBe("agent_ended");
    expect(event.metadata?.messageCount).toBe(1);
    expect(JSON.stringify(event)).not.toContain(
      "DO_NOT_SERIALIZE_THIS_FINAL_MESSAGE",
    );
  });

  it("keeps model optional byte and TTFB fields absent-safe", () => {
    const event = normalizeModelCallEnded(
      {
        runId: "run-1",
        callId: "call-1",
        provider: "openai",
        model: "gpt-test",
        durationMs: 123,
        outcome: "completed",
      },
      undefined,
      {
        now,
        createId: () => "event-2",
      },
    );

    expect(event.model?.requestPayloadBytes).toBeUndefined();
    expect(event.model?.responseStreamBytes).toBeUndefined();
    expect(event.model?.timeToFirstByteMs).toBeUndefined();
  });

  it("preserves run, job, session, and trace correlation when provided", () => {
    const event = normalizeModelCallEnded(
      {
        runId: "event-run",
        callId: "call-1",
        provider: "openai",
        model: "gpt-test",
        durationMs: 123,
        outcome: "completed",
      },
      {
        runId: "ctx-run",
        jobId: "cron-job-1",
        sessionKey: "agent:main:main",
        trace: {
          traceId: "0123456789abcdef0123456789abcdef",
          spanId: "0123456789abcdef",
          parentSpanId: "fedcba9876543210",
        },
      },
      {
        now,
        createId: () => "event-3",
      },
    );

    expect(event.runId).toBe("event-run");
    expect(event.jobId).toBe("cron-job-1");
    expect(event.sessionKey).toBe("agent:main:main");
    expect(event.trace?.traceId).toBe("0123456789abcdef0123456789abcdef");
    expect(event.trace?.spanId).toBe("0123456789abcdef");
    expect(event.trace?.parentSpanId).toBe("fedcba9876543210");
    expect(event.trace?.traceparent).toBe(
      "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    );
    expect(event.correlation?.source).toBe("cron_job");
  });

  it("normalizes llm_output usage without prompt or assistant content", () => {
    const event = normalizeLlmOutput(
      {
        runId: "event-run",
        sessionId: "session-1",
        provider: "openai",
        model: "gpt-test",
        resolvedRef: "openai/gpt-test",
        harnessId: "test-harness",
        prompt: "DO_NOT_SERIALIZE_THIS_PROMPT",
        assistantTexts: ["DO_NOT_SERIALIZE_THIS_ASSISTANT_TEXT"],
        lastAssistant: {
          content: "DO_NOT_SERIALIZE_THIS_LAST_ASSISTANT",
        },
        usage: {
          input: 10,
          output: 5,
          cacheRead: 3,
          cacheWrite: 2,
          total: 15,
        },
      },
      {
        agentId: "main",
        sessionKey: "agent:main:main",
      },
      {
        now,
        createId: () => "event-usage",
      },
    );

    expect(event.kind).toBe("llm_output");
    expect(event.runId).toBe("event-run");
    expect(event.sessionId).toBe("session-1");
    expect(event.sessionKey).toBe("agent:main:main");
    expect(event.openclawAgentId).toBe("main");
    expect(event.correlation?.runId).toBe("event-run");
    expect(event.correlation?.sessionKey).toBe("agent:main:main");
    expect(event.model?.usage).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      prompt_tokens: 10,
      completion_tokens: 5,
      cache_read_tokens: 3,
      cache_write_tokens: 2,
      total_tokens: 15,
    });
    expect(JSON.stringify(event)).not.toContain("DO_NOT_SERIALIZE");
  });

  it("summarizes tool params and results by default without raw values", () => {
    const event = normalizeAfterToolCall(
      {
        toolName: "web_search",
        params: {
          query: "DO_NOT_SERIALIZE_THIS_QUERY",
        },
        result: {
          text: "DO_NOT_SERIALIZE_THIS_RESULT",
        },
        durationMs: 50,
      },
      {
        toolName: "web_search",
        sessionKey: "agent:main:main",
      },
      {
        now,
        createId: () => "event-4",
      },
    );

    expect(event.tool?.paramsSummary?.keys).toContain("query");
    expect(JSON.stringify(event)).not.toContain("DO_NOT_SERIALIZE_THIS_QUERY");
    expect(JSON.stringify(event)).not.toContain("DO_NOT_SERIALIZE_THIS_RESULT");
  });

  it("correlates subagent completion by targetSessionKey", () => {
    const event = normalizeSubagentEnded(
      {
        targetSessionKey: "agent:main:subagent:reviewer",
        targetKind: "subagent",
        reason: "completed",
        runId: "run-1",
        outcome: "ok",
      },
      undefined,
      {
        now,
        createId: () => "event-5",
      },
    );

    expect(event.subagent?.targetSessionKey).toBe(
      "agent:main:subagent:reviewer",
    );
    expect(event.subagent?.outcome).toBe("ok");
  });
});
