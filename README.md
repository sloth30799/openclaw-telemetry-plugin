# Mission Control Telemetry Bridge

OpenClaw plugin id: `mission-control-telemetry-bridge`

Mission Control Telemetry Bridge streams sanitized OpenClaw runtime telemetry
into Mission Control, turning agent sessions, model usage, tool activity, and
workflow status into structured events for a live operator dashboard.

It ships as a standalone OpenClaw plugin with production-minded defaults:
private text is off by default, receiver authentication is configurable, queue
behavior is controlled, and the dashboard API owns durable event recording.

## Lifecycle Split

The plugin has two sides:

- Before event streaming: configure OpenClaw, privacy defaults, endpoint envs,
  auth headers, and queue behavior.
- After event streaming: receive POST batches at an API endpoint, authenticate
  them, validate the event body, and record events for dashboard reads.

That distinction matters because the plugin owns telemetry delivery, while the
receiver API owns storage, indexes, derived status rows, dashboard reads, and
app-specific schema.

## Before Event Streaming: OpenClaw Setup

### What The Plugin Sends

Included by default:

- event identifiers and kinds
- timestamps
- session, run, job, and agent correlation fields when available
- tool and model names
- duration and outcome fields
- token usage counters when available

Excluded by default:

- user message text
- assistant output text
- tool params
- tool results
- diagnostic events

Only enable text, params, results, or diagnostic events if the receiver is
private and the operator explicitly wants that telemetry stored.

### Install And Build

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

`pnpm build` only compiles TypeScript to `dist/`.

To copy the built plugin into an OpenClaw runtime directory, run:

```bash
pnpm build:runtime
```

Set `OPENCLAW_PLUGIN_RUNTIME_DIR` to choose the sync destination. If unset, the
sync script uses a local OpenClaw workspace path under the current user's home
directory.

Optional local env scaffold:

```bash
cp .env.example .env
```

### OpenClaw Plugin Config

Default Mission Control-compatible config:

```json
{
  "endpointEnv": "MISSION_CONTROL_RECEIVER_ENDPOINT",
  "tokenEnv": "MISSION_CONTROL_PLUGIN_TOKEN",
  "tokenHeader": "x-mission-control-plugin-token",
  "bypassTokenEnv": "MISSION_CONTROL_VERCEL_BYPASS_TOKEN",
  "batchSize": 20,
  "flushIntervalMs": 1000,
  "maxRetries": 3,
  "maxQueueSize": 1000,
  "includeMessageText": false,
  "includeToolParams": false,
  "includeToolResults": false,
  "enableDiagnosticEvents": false
}
```

Generic receiver example:

```json
{
  "endpointEnv": "OPENCLAW_TELEMETRY_ENDPOINT",
  "tokenEnv": "OPENCLAW_TELEMETRY_TOKEN",
  "tokenHeader": "x-openclaw-telemetry-token",
  "batchSize": 20
}
```

Fields:

- `endpointEnv` - env var containing the full receiver URL. Default:
  `MISSION_CONTROL_RECEIVER_ENDPOINT`.
- `endpoint` - explicit endpoint override for tests/local experiments. Prefer
  `endpointEnv` for normal runtime config.
- `tokenEnv` - env var containing the receiver token. Default:
  `MISSION_CONTROL_PLUGIN_TOKEN`.
- `tokenHeader` - HTTP header used to send the receiver token. Default:
  `x-mission-control-plugin-token`.
- `bypassTokenEnv` - optional env var containing a Vercel Protection Bypass for
  Automation token.
- `batchSize` - max events per flush.
- `flushIntervalMs` - queue flush interval.
- `maxRetries` - retry count before dropping a queued event.
- `maxQueueSize` - max queued events.
- `includeMessageText` - include message text only if explicitly enabled.
- `includeToolParams` - include tool params only if explicitly enabled.
- `includeToolResults` - include tool results only if explicitly enabled.
- `enableDiagnosticEvents` - include diagnostic events only if explicitly
  enabled.

If `endpointEnv` is missing or points at an unset env var, the plugin falls back
to `http://localhost:4319/events` for local receiver compatibility.

### Local Receiver Smoke Test

The repo includes a small JSONL receiver for smoke testing before wiring a real
dashboard API.

```bash
pnpm build
pnpm receiver
```

Send one smoke event:

```bash
MISSION_CONTROL_RECEIVER_ENDPOINT=http://localhost:4319/events pnpm smoke
```

## After Event Streaming: Receiver API And Recording

### Receiver API Contract

After OpenClaw starts emitting hook events, the plugin batches normalized events
and sends them to the configured receiver API:

```text
POST <receiver-url>
content-type: application/json
<tokenHeader>: <token>                  # only when token is configured
x-vercel-protection-bypass: <token>     # only when bypassTokenEnv is configured
```

Batch body:

```json
{
  "source": "openclaw",
  "pluginId": "mission-control-telemetry-bridge",
  "version": 1,
  "events": [
    {
      "id": "evt_123",
      "kind": "llm_output",
      "occurredAt": "2026-07-04T20:00:00.000Z",
      "sessionKey": "agent:main:main",
      "openclawAgentId": "main",
      "title": "LLM output captured",
      "model": {
        "provider": "openai",
        "model": "gpt-5",
        "usage": {
          "input_tokens": 1200,
          "output_tokens": 450,
          "total_tokens": 1650
        }
      }
    }
  ]
}
```

A receiver should:

- authenticate the configured token header when present
- validate `source`, `pluginId`, `version`, and `events`
- write accepted events to durable storage
- derive dashboard state from recorded events as needed
- return a 2xx response when the batch is accepted

Non-2xx responses are treated as failures and retried according to queue
settings.

### Mission Control Recording API

Mission Control's default recording endpoint is:

```text
POST /api/openclaw/plugin/events
```

Legacy compatibility route:

```text
POST /api/openclaw/events
```

For a hosted Mission Control instance:

```bash
MISSION_CONTROL_RECEIVER_ENDPOINT=https://mission-control.example.com/api/openclaw/plugin/events
MISSION_CONTROL_PLUGIN_TOKEN=replace-with-a-strong-random-token
```

In Mission Control, the receiver API is responsible for recording normalized
rows and updating dashboard read models. For example, it can store raw event
rows first, then update current agent status, append status snapshots, and add
activity feed records.

If Vercel Deployment Protection blocks plugin POSTs, use the header path with
`bypassTokenEnv`:

```json
{
  "bypassTokenEnv": "MISSION_CONTROL_VERCEL_BYPASS_TOKEN"
}
```

Query-string bypass is a last resort only:

```text
https://mission-control.example.com/api/openclaw/plugin/events?x-vercel-protection-bypass=<secret>
```

That is secret-in-URL and can leak through config, logs, copied links, browser
history, or proxies. Prefer the header.

## Security Notes

- Keep receiver URLs private unless the receiver is designed for public access.
- Use a strong random token for write access.
- Keep the dashboard/read APIs behind authentication or platform protection.
- Do not commit real receiver URLs containing secrets, plugin tokens, or Vercel
  bypass tokens.
- Keep `includeMessageText`, `includeToolParams`, `includeToolResults`, and
  `enableDiagnosticEvents` disabled unless the operator accepts the privacy
  impact.

See [SECURITY.md](SECURITY.md) for reporting and handling guidance.

## Failure Modes

- Missing endpoint env: plugin falls back to the local JSONL receiver.
- Token missing or mismatch: receiver should return `401`.
- Endpoint unreachable: plugin retries up to `maxRetries`, then drops the batch.
- Protection bypass missing: configure `bypassTokenEnv` and set the named env
  var.
- Runtime config changed but plugin still uses old settings: reload OpenClaw in
  the way your installation expects.

## License

MIT. See [LICENSE](LICENSE).
