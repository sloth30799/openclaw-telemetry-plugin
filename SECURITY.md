# Security Policy

This plugin forwards OpenClaw runtime telemetry to a configured receiver. Treat
that receiver as sensitive infrastructure: telemetry can reveal project names,
tool names, model names, timing, usage, and workflow structure even when private
message text is disabled.

## Supported Use

- Keep receiver write endpoints protected with a strong random token.
- Keep dashboard/read APIs behind authentication or platform protection.
- Keep text, tool params, tool results, and diagnostics disabled unless the
  operator intentionally accepts the privacy impact.
- Do not put tokens or Vercel bypass secrets in URLs except as a last-resort
  temporary workaround.

## Reporting

If you find a vulnerability or a privacy leak, do not open a public issue with
secrets, logs, or real telemetry. Contact the maintainer privately, or open a
minimal issue that describes the class of problem without sensitive details.

## Not Secrets

The default env var names, route examples, and header names in this repo are not
secrets. Real receiver URLs, plugin tokens, Vercel bypass tokens, and telemetry
payloads from a private installation are secrets.
