const REDACTED = "[redacted]";
const SENSITIVE_KEY = /(api[_-]?key|authorization|bearer|cookie|password|secret|token)/i;
const MAX_STRING_LENGTH = 500;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function summarizeRecordShape(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      type: Array.isArray(value) ? "array" : typeof value,
      present: value !== undefined,
    };
  }

  const keys = Object.keys(value).sort();
  return {
    type: "object",
    keyCount: keys.length,
    keys: keys.slice(0, 50),
  };
}

export function sanitizeJsonValue(value: unknown, depth = 2): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}...`
      : value;
  }

  if (Array.isArray(value)) {
    if (depth <= 0) {
      return { type: "array", length: value.length };
    }

    return value.slice(0, 10).map((item) => sanitizeJsonValue(item, depth - 1));
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (depth <= 0) {
    return summarizeRecordShape(value);
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value).slice(0, 50)) {
    output[key] = SENSITIVE_KEY.test(key)
      ? REDACTED
      : sanitizeJsonValue(entry, depth - 1);
  }
  return output;
}

export function summarizeToolParams(
  params: unknown,
  includeToolParams: boolean,
): Record<string, unknown> {
  return includeToolParams
    ? (sanitizeJsonValue(params, 3) as Record<string, unknown>)
    : summarizeRecordShape(params);
}

export function summarizeToolResult(
  result: unknown,
  includeToolResults: boolean,
): Record<string, unknown> {
  if (includeToolResults) {
    return {
      included: true,
      value: sanitizeJsonValue(result, 3),
    };
  }

  return {
    included: false,
    summary: summarizeRecordShape(result),
  };
}

export function compactError(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}...`
    : value;
}
