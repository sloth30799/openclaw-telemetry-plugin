# Mission Control Telemetry Bridge

Mission Control Telemetry Bridge is an OpenClaw plugin that sends sanitized
runtime telemetry to a receiver API such as Mission Control.

- Plugin id: `mission-control-telemetry-bridge`
- Package version: `0.0.1`
- OpenClaw plugin API: `>=2026.6.9`
- Minimum OpenClaw Gateway version: `2026.6.9`

The bridge has one responsibility: collect OpenClaw events, sanitize and
normalize them, queue them briefly, and POST event batches to the configured
receiver. It does not own storage, dashboards, database schema, read APIs, or
Gateway restarts.

## Quick Start

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

`pnpm build` compiles the plugin into `dist/`.

To build and copy the compiled plugin into the local OpenClaw plugin runtime:

```bash
pnpm build:runtime
```

By default, runtime sync writes to:

```text
~/.openclaw/workspace/mission-control-telemetry-bridge
```

Override the runtime sync target when needed:

```bash
OPENCLAW_PLUGIN_RUNTIME_DIR=/path/to/plugin/runtime pnpm build:runtime
```

After config or runtime files change, reload OpenClaw manually. In Han's setup,
Gateway reloads and restarts are Han-owned.

## Configure The Receiver

Copy the example env file:

```bash
cp .env.example .env
```

Mission Control receiver setup:

```bash
MISSION_CONTROL_RECEIVER_ENDPOINT=http://localhost:3000/api/openclaw/plugin/events
# Optional for local/private use. Set this for hosted or shared environments.
MISSION_CONTROL_PLUGIN_TOKEN=replace-with-a-strong-random-token
```

Hosted Mission Control setup should use the hosted full URL:

```bash
MISSION_CONTROL_RECEIVER_ENDPOINT=https://<host>/api/openclaw/plugin/events
```

For a custom receiver, use your own env names:

```bash
OPENCLAW_TELEMETRY_ENDPOINT=https://your-app.example.com/api/openclaw/events
# Optional for local/private use. Set this for hosted or shared environments.
OPENCLAW_TELEMETRY_TOKEN=replace-with-a-strong-random-token
```

If no endpoint env value is available, the plugin falls back to the local test
receiver:

```text
http://localhost:4319/events
```

## Plugin Config

Mission Control config:

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

Custom receiver config:

```json
{
  "endpointEnv": "OPENCLAW_TELEMETRY_ENDPOINT",
  "tokenEnv": "OPENCLAW_TELEMETRY_TOKEN",
  "tokenHeader": "x-openclaw-telemetry-token",
  "batchSize": 20
}
```

Config fields:

- `endpointEnv`: env var that contains the receiver API URL.
- `endpoint`: direct receiver URL override. Usually use `endpointEnv`.
- `tokenEnv`: env var that contains the optional shared write token.
- `tokenHeader`: HTTP header used to send the token when configured.
- `bypassTokenEnv`: optional Vercel Protection Bypass for Automation token env
  var. Defaults to `MISSION_CONTROL_VERCEL_BYPASS_TOKEN`.
- `batchSize`: how many events to send at once.
- `flushIntervalMs`: how often to send queued events.
- `maxRetries`: how many times to retry a failed send.
- `maxQueueSize`: max events kept in memory.
- `includeMessageText`: send user and assistant message text.
- `includeToolParams`: send tool input params.
- `includeToolResults`: send tool result data.
- `enableDiagnosticEvents`: send diagnostic events for local mapping/debugging.

## Privacy Defaults

By default, the plugin sends:

- event id and event type
- timestamps
- session, run, job, and agent ids when available
- tool names and model names
- success/failure status
- token usage when available

By default, the plugin does not send:

- user message text
- assistant output text
- tool input params
- tool result data
- diagnostic events

Only enable private text, params, results, or diagnostics when the receiver is
private and you explicitly want to store that data.

## OpenClaw Compatibility

This package declares:

```json
{
  "openclaw": {
    "compat": {
      "pluginApi": ">=2026.6.9",
      "minGatewayVersion": "2026.6.9"
    }
  }
}
```

OpenClaw event fields can change between versions. The plugin reads known
fields safely, skips missing optional fields, and keeps sending events when a
field is unavailable.

If a field is missing in the current OpenClaw version, that field will not
appear in the receiver payload. Event delivery still works.

Turn on `enableDiagnosticEvents` locally when you need to map a new OpenClaw
event shape.

## Receiver Request Contract

The plugin sends event batches to the configured receiver URL:

```text
POST <receiver-url>
content-type: application/json
<tokenHeader>: <token>                  # only when a token is configured
x-vercel-protection-bypass: <token>     # only when bypassTokenEnv is configured
```

Example body:

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

The receiver should return a `2xx` response when the batch is accepted. If the
receiver returns a non-`2xx` response, the plugin treats the send as failed and
retries according to `maxRetries`.

## Local Test Receiver

This repo includes a small local receiver for plugin development.

Start it:

```bash
pnpm build
pnpm receiver
```

Send one test event:

```bash
MISSION_CONTROL_RECEIVER_ENDPOINT=http://localhost:4319/events pnpm smoke
```

The receiver listens on port `4319` by default. Override it with
`MISSION_CONTROL_RECEIVER_PORT`.

## Vercel Protection

If Vercel Deployment Protection blocks plugin requests, set the default bypass
token env:

```bash
MISSION_CONTROL_VERCEL_BYPASS_TOKEN=replace-with-vercel-bypass-token
```

The default config reads that env name automatically. For a custom env name,
set:

```json
{
  "bypassTokenEnv": "MISSION_CONTROL_VERCEL_BYPASS_TOKEN"
}
```

The plugin sends it as:

```text
x-vercel-protection-bypass: <token>
```

Avoid putting bypass tokens in URLs. URLs can leak through logs, browser
history, copied links, and proxies.

## Common Problems

- Missing endpoint env: plugin sends to the local test receiver.
- Wrong token: the receiver should return `401` when token auth is enabled.
- Receiver API is down: plugin retries, then drops the batch after
  `maxRetries`.
- Vercel blocks requests: set `MISSION_CONTROL_VERCEL_BYPASS_TOKEN`.
- Config changed but behavior did not: reload OpenClaw manually.
- Expected fields are missing: confirm OpenClaw version compatibility and use
  diagnostic events locally if the upstream event shape changed.

## Security Notes

- Keep receiver URLs private unless the app is meant to be public.
- Use a strong random token for hosted writes.
- Protect any UI or read APIs that expose telemetry.
- Do not commit real tokens, bypass secrets, or secret URLs.
- Leave private text/tool data disabled unless you really need it.

See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
